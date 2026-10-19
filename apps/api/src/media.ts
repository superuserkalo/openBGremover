import { Effect, Schema } from "effect";
import { ImageMetadata, RemoveBackgroundRequest, WorkerFileDelivery, type RemoveBackgroundResponse, type ImageTransformJob } from "@openbg/contracts";
import { ApiError, attempt } from "./errors";
import { readBytes, readText } from "./body";
import type { Database } from "./database";

export type Identity =
  | { kind: "user"; userId: string; keyId: number | null; source: "api" | "ui" }
  | { kind: "trial" };

const WorkerSuccess = Schema.Struct({
  success: Schema.Literal(true),
  image: Schema.String,
  mask: Schema.optionalKey(Schema.String),
  metadata: ImageMetadata,
});

export interface MediaConfig { endpoint: string; apiKey: string; outputUrlPrefix: string }

const MAX_WORKER_RESPONSE_BYTES = 16 * 1024 * 1024;

const MAX_BINARY_RESULT_BYTES = 12 * 1024 * 1024;

interface ProcessingTimings { headers: number; body: number; validation: number }

export type ProcessedImage = (
  | { kind: "json"; value: RemoveBackgroundResponse }
  | { kind: "binary"; image: Uint8Array<ArrayBuffer>; metadata: typeof ImageMetadata.Type; milliseconds: number }
) & { timings: ProcessingTimings };

export function imageBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));

  return btoa(chunks.join(""));
}

export function imageBytes(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);

  return bytes;
}

export function imageFormat(prefix: string) {
  if (prefix.startsWith("\x89PNG\r\n\x1a\n")) return "png";

  if (prefix.startsWith("\xff\xd8\xff")) return "jpeg";

  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "gif";

  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") return "webp";

  throw new Error("Unsupported image");
}

const HEIC_BRANDS = ["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"];

/** HEIC and AVIF are ISO-BMFF files: brands in the leading ftyp box name the codec. */
export function heifFormat(prefix: string): "heic" | "avif" | undefined {
  if (prefix.slice(4, 8) !== "ftyp") return undefined;

  // Major brand, then compatible brands after the 4-byte minor version.
  const brands = [prefix.slice(8, 12)];

  for (let offset = 16; offset + 4 <= prefix.length; offset += 4) brands.push(prefix.slice(offset, offset + 4));

  if (brands.some((brand) => brand === "avif" || brand === "avis")) return "avif";

  if (brands.some((brand) => HEIC_BRANDS.includes(brand))) return "heic";

  return undefined;
}

export function decodeImageData(input: string, maximum = 14 * 1024 * 1024, sniff: (prefix: string) => string = imageFormat): string {
  const data = input.replace(/^data:image\/[\w.+-]+;base64,/, "");

  if (!data || data.length > maximum || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw new Error("Invalid base64 image");
  }

  const prefix = atob(data.slice(0, 32));

  sniff(prefix);

  return data;
}

export async function readImageRequest(request: Request): Promise<RemoveBackgroundRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/") && !contentType.startsWith("application/octet-stream")) return decodeImageRequest(await readText(request));

  const bytes = await readBytes(request, 10 * 1024 * 1024);

  try {
    imageFormat(String.fromCharCode(...bytes.subarray(0, 32)));

    return { image_data: imageBase64(bytes), format: "png" };
  } catch {
    throw new ApiError({ code: "INVALID_REQUEST", message: "Provide a valid image", status: 400 });
  }
}

export function decodeImageRequest(text: string): RemoveBackgroundRequest {
  try {
    const request = Schema.decodeUnknownSync(RemoveBackgroundRequest)(JSON.parse(text));
    const data = decodeImageData(request.image_data);

    const resize = request.resize_options;

    if (resize) {
      for (const size of [resize.width, resize.height, resize.max_width, resize.max_height]) {
        if (size !== undefined && (!Number.isInteger(size) || size < 1 || size > 8192)) throw new Error("Invalid resize dimensions");
      }

      if ((resize.width === undefined) !== (resize.height === undefined)) throw new Error("Width and height must be provided together");
    }

    return { ...request, image_data: data };
  } catch {
    throw new ApiError({ code: "INVALID_REQUEST", message: "Provide a valid image, format, quality, and resize dimensions", status: 400 });
  }
}

interface BackgroundWorkerRequest {
  image: string;
  format: string;
  quality: string;
  return_mask: boolean;
  resize: RemoveBackgroundRequest["resize_options"];
  response_format: "file";
}

export function createProcessor(config: MediaConfig, fetcher: typeof fetch = fetch) {
  const process = createWorkerProcessor(config, fetcher);

  return (request: RemoveBackgroundRequest) => process({
    image: request.image_data, format: request.format ?? "png", quality: request.quality ?? "auto",
    return_mask: request.return_mask ?? false, resize: request.resize_options, response_format: "file",
  }, request.return_mask ?? false);
}

/** Shared bounded transport for the GPU and CPU image workers. No automatic retries. */
export function createWorkerProcessor(config: MediaConfig, fetcher: typeof fetch = fetch) {
  return async (payload: BackgroundWorkerRequest | ImageTransformJob, requireMask = false): Promise<ProcessedImage> => {
    const started = performance.now();
    const signal = AbortSignal.timeout(180_000);
    let response: Response;

    try {
      response = await fetcher(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(payload),
        signal,
        redirect: "manual",
      });
    } catch {
      throw new ApiError({ code: "PROCESSING_UNAVAILABLE", message: "The image worker did not respond", status: 502 });
    }

    if (!response.ok) {
      if ("operation" in payload && (response.status === 400 || response.status === 413)) {
        await response.body?.cancel();
        throw new ApiError({ code: "INVALID_IMAGE", message: "Use a valid static JPEG, PNG, or WebP image within the 25-megapixel and output-size limits", status: response.status });
      }

      console.error("image_worker_http_failure", { status: response.status });
      await response.body?.cancel();
      throw new ApiError({ code: "PROCESSING_FAILED", message: "The image worker could not process this image", status: 502 });
    }

    const headersAt = performance.now();
    let contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

    const metadataHeader = response.headers.get("x-image-metadata");
    let fileMetadata: typeof ImageMetadata.Type | undefined;

    try {
      if (contentType === "application/vnd.openbg.file+json") {
        const delivery = Schema.decodeUnknownSync(WorkerFileDelivery)(JSON.parse(await readText(response, 64 * 1024)));
        const url = new URL(delivery.url);
        const prefix = new URL(config.outputUrlPrefix);

        if (url.protocol !== "https:" || url.origin !== prefix.origin || !prefix.pathname.endsWith("/") || !url.pathname.startsWith(prefix.pathname) || url.username || url.password || url.hash) throw new Error("Invalid file destination");

        // The signed file URL is internal. Never forward the Beam credential or follow another redirect.
        response = await fetcher(url, { signal, redirect: "manual" });

        if (!response.ok) {
          await response.body?.cancel();
          throw new Error("Image download failed");
        }

        contentType = delivery.content_type;
        fileMetadata = delivery.metadata;
      }

      if (contentType.startsWith("image/")) {
        const metadata = fileMetadata ?? Schema.decodeUnknownSync(ImageMetadata)(JSON.parse(metadataHeader ?? "null"));

        const image = await readBytes(response, MAX_BINARY_RESULT_BYTES);
        const bodyAt = performance.now();
        const prefix = String.fromCharCode(...image.subarray(0, 32));
        const actual = heifFormat(prefix) ?? imageFormat(prefix);
        const format = metadata.format === "jpg" ? "jpeg" : metadata.format;

        if (requireMask || format !== actual || contentType !== `image/${actual}`) throw new Error("Invalid binary image response");

        const ended = performance.now();

        return { kind: "binary", image, metadata, milliseconds: Math.round(ended - started), timings: { headers: headersAt - started, body: bodyAt - headersAt, validation: ended - bodyAt } };
      }

      const text = await readText(response, MAX_WORKER_RESPONSE_BYTES);
      const bodyAt = performance.now();
      const output = Schema.decodeUnknownSync(WorkerSuccess)(JSON.parse(text));

      // Generated PNGs can exceed compressed uploads; the entire response is already bounded.
      const result: RemoveBackgroundResponse = {
        success: true, result_image: decodeImageData(output.image, MAX_WORKER_RESPONSE_BYTES),
        processing_time_ms: Math.round(performance.now() - started), metadata: output.metadata,
      };

      const value = output.mask === undefined ? result : { ...result, mask_image: decodeImageData(output.mask, MAX_WORKER_RESPONSE_BYTES) };

      return { kind: "json", value, timings: { headers: headersAt - started, body: bodyAt - headersAt, validation: performance.now() - bodyAt } };
    } catch {
      throw new ApiError({ code: "INVALID_WORKER_RESPONSE", message: "The image worker returned an invalid result", status: 502 });
    }
  };
}

export type Processor = ReturnType<typeof createProcessor>;

/** Validate before reserving a credit. Failed processing refunds the reserved credit. */
export function removeBackground(request: RemoveBackgroundRequest, identity: Identity, db: Database, process: Processor) {
  return processImage(identity, db, () => process(request));
}

export function processImage(identity: Identity, db: Database, process: () => Promise<ProcessedImage>) {
  return Effect.gen(function* () {
    if (identity.kind === "trial") return yield* attempt(process);

    const started = Date.now();
    const credit = yield* attempt(() => db.reserveCredit(identity.userId));

    const outcome = yield* attempt(process).pipe(Effect.match({
      onSuccess: (result) => ({ success: true, result }),
      onFailure: (error) => ({ success: false, error }),
    }));

    if ("error" in outcome) {
      yield* attempt(() => db.recordUsage({ ...identity, credit, success: false, error: outcome.error.message, milliseconds: Date.now() - started }));

      return yield* Effect.fail(outcome.error);
    }

    yield* attempt(() => db.recordUsage({ ...identity, credit, success: true, error: null, milliseconds: Date.now() - started }));

    return outcome.result;
  });
}
