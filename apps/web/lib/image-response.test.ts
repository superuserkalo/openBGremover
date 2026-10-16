import { describe, expect, it } from "vitest";
import { readImageResponse } from "./image-response";

describe("image response delivery", () => {
  it("preserves a result larger than 10 MiB across chunk boundaries", async () => {
    const source = new Uint8Array(11 * 1024 * 1024 + 19);

    for (let index = 0; index < source.length; index++) source[index] = index % 251;

    let offset = 0;

    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === source.length) {
          controller.close();

          return;
        }

        const end = Math.min(offset + 65537, source.length);

        controller.enqueue(source.slice(offset, end));
        offset = end;
      },
    }), { headers: { "Content-Type": "image/png" } });

    const image = await readImageResponse(response);

    expect(image.type).toBe("image/png");
    expect(Buffer.from(await image.arrayBuffer()).equals(source)).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  it("cancels oversized responses without returning partial data", async () => {
    let cancelled = false;

    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    }));

    await expect(readImageResponse(response)).rejects.toThrow("size limit");
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  it("propagates a failed download and rejects an empty result", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error("Connection interrupted")); },
    }));

    await expect(readImageResponse(response)).rejects.toThrow("Connection interrupted");
    expect(response.body?.locked).toBe(false);
    await expect(readImageResponse(new Response())).rejects.toThrow("empty");
    await expect(readImageResponse(new Response(new Uint8Array()))).rejects.toThrow("empty");
  });
});
