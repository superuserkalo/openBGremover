// Match the API's binary output allowance; never buffer an unbounded response.
const MAX_RESULT_BYTES = 12 * 1024 * 1024;

export async function readImageResponse(response: Response): Promise<Blob> {
  if (!response.body) throw new Error("The image response is empty");

  const reader = response.body.getReader();
  const parts: BlobPart[] = [];
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      size += value.byteLength;

      if (size > MAX_RESULT_BYTES) {
        await reader.cancel();
        throw new Error("The image response exceeds the size limit");
      }

      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (size === 0) throw new Error("The image response is empty");

  return new Blob(parts, { type: response.headers.get("content-type") ?? "application/octet-stream" });
}
