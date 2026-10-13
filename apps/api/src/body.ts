import { ApiError } from "./errors";

export const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Bound both declared and streamed payloads before decoding JSON or base64. */
export async function readText(body: Request | Response, maximum = MAX_BODY_BYTES): Promise<string> {
  const declaredSize = Number(body.headers.get("content-length") ?? 0);

  if (declaredSize > maximum) throw new ApiError({ code: "REQUEST_TOO_LARGE", message: "Image exceeds the size limit", status: 413 });

  if (!body.body) return "";

  const reader = body.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
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

      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }

  chunks.push(decoder.decode());

  return chunks.join("");
}
