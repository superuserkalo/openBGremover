import { Schema } from "effect";
import { ApiFailure, CompressImageRequest, ConvertImageRequest, MediaOperation, RemoveBackgroundRequest } from "@openbg/contracts";

export const runtime = "nodejs";

class TrialError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const maximum = 15 * 1024 * 1024;

  if (Number(request.headers.get("content-length")) > maximum) throw new TrialError("Image is too large", 413);

  if (!request.body) throw new TrialError("Provide an image", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      length += value.byteLength;

      if (length > maximum) {
        await reader.cancel();
        throw new TrialError("Image is too large", 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

interface ForwardedRequest { body: Uint8Array<ArrayBuffer> | string; contentType: string }

/** Compression and conversion take the same JSON body as the public API. */
async function decodeTransformRequest(request: Request, operation: "compress-image" | "convert-image"): Promise<ForwardedRequest> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) throw new TrialError("Send a JSON image request", 415);

  const value: unknown = JSON.parse(new TextDecoder().decode(await readBody(request)));
  const schema = operation === "compress-image" ? CompressImageRequest : ConvertImageRequest;
  const input = Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });

  return { body: JSON.stringify(input), contentType: "application/json" };
}

async function decodeBackgroundRequest(request: Request): Promise<ForwardedRequest> {
  const bytes = await readBody(request);
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
    const file = form.get("file");

    if (!(file instanceof File)) throw new TrialError("Provide an image file", 400);

    if (file.size > 10 * 1024 * 1024) throw new TrialError("File exceeds 10 MB", 413);

    const format = form.get("format") ?? "png";
    const quality = form.get("quality") ?? "auto";
    const image = new Uint8Array(await file.arrayBuffer());

    if (format === "png" && quality === "auto") return { body: image, contentType: "application/octet-stream" };

    const input = Schema.decodeUnknownSync(RemoveBackgroundRequest)({ image_data: Buffer.from(image).toString("base64"), format, quality });

    return { body: JSON.stringify(input), contentType: "application/json" };
  }

  if (contentType.startsWith("image/") || contentType.startsWith("application/octet-stream")) {
    if (bytes.byteLength > 10 * 1024 * 1024) throw new TrialError("File exceeds 10 MB", 413);

    return { body: bytes, contentType: "application/octet-stream" };
  }

  const input = Schema.decodeUnknownSync(RemoveBackgroundRequest)(JSON.parse(new TextDecoder().decode(bytes)));

  return { body: JSON.stringify(input), contentType: "application/json" };
}

/** One public demo route per API operation. The trial key never leaves the server. */
export async function POST(request: Request, { params }: { params: Promise<{ operation: string }> }): Promise<Response> {
  const requested = (await params).operation;

  if (!Schema.is(MediaOperation)(requested)) return Response.json({ error: "Route not found" }, { status: 404 });

  const operation = requested;
  const base = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  const key = process.env.TRIAL_INTERNAL_API_KEY;

  if (!base || !key) return Response.json({ error: "The demo is not configured yet" }, { status: 503 });

  let input: ForwardedRequest;

  try {
    input = operation === "remove-background" ? await decodeBackgroundRequest(request) : await decodeTransformRequest(request, operation);
  } catch (cause) {
    return Response.json({ error: cause instanceof TrialError ? cause.message : "Invalid image request" }, { status: cause instanceof TrialError ? cause.status : 400 });
  }

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/${operation}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": input.contentType, "X-Usage-Context": "trial", Accept: "image/*" },
      body: input.body, signal: AbortSignal.timeout(190_000), cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (response.ok && contentType.startsWith("image/")) {
      const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "no-store" });

      for (const name of ["server-timing", "x-image-metadata"]) {
        const value = response.headers.get(name);

        if (value) headers.set(name, value);
      }

      return new Response(response.body, { headers });
    }

    const error = Schema.decodeUnknownSync(ApiFailure)(await response.json());

    return Response.json(error, { status: response.ok ? 502 : response.status });
  } catch {
    return Response.json({ error: "The image service is unavailable. Please try again" }, { status: 502 });
  }
}
