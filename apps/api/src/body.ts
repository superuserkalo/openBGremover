import { ApiError } from "./errors";

export const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Bound both declared and streamed payloads before decoding JSON or base64. */
async function* readChunks(body: Request | Response, maximum: number) {
  const declaredSize = Number(body.headers.get("content-length") ?? 0);

  if (declaredSize > maximum) {
    await body.body?.cancel();
    throw new ApiError({ code: "REQUEST_TOO_LARGE", message: "Image exceeds the size limit", status: 413 });
  }

  if (!body.body) return;

  const reader = body.body.getReader();
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      size += value.byteLength;

      if (size > maximum) {
        await reader.cancel();
        throw new ApiError({ code: "REQUEST_TOO_LARGE", message: "Image exceeds the size limit", status: 413 });
      }

      yield value;
    }
  } finally {
    reader.releaseLock();
  }

}

export async function readText(body: Request | Response, maximum = MAX_BODY_BYTES): Promise<string> {
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  for await (const chunk of readChunks(body, maximum)) chunks.push(decoder.decode(chunk, { stream: true }));

  chunks.push(decoder.decode());

  return chunks.join("");
}

export async function readBytes(body: Request | Response, maximum = MAX_BODY_BYTES): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let length = 0;

  for await (const chunk of readChunks(body, maximum)) {
    chunks.push(chunk);
    length += chunk.byteLength;
  }

  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}
