import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenBG, OpenBGError } from "../src/index.js";

const success = {
  success: true,
  result_image: "aW1hZ2U=",
  processing_time_ms: 12,
  metadata: { format: "png" },
};

describe("OpenBG client", () => {
  it("loads a file, sends authenticated original bytes and saves decoded output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "openbg-sdk-"));

    try {
      const input = join(directory, "input.png");
      const output = join(directory, "output.png");
      await writeFile(input, "source");

      const app = new OpenBG({
        apiKey: "bg-test",
        fetch: async (url, init) => {
          expect(String(url)).toBe(
            "https://openbg-api.gantchevkaloyan.workers.dev/api/v1/remove-background",
          );
          expect(init?.headers).toEqual({
            Authorization: "Bearer bg-test",
            "Content-Type": "application/json",
          });
          expect(init?.body).toBe(
            JSON.stringify({ image_data: "c291cmNl", format: "webp" }),
          );
          expect(init?.redirect).toBe("error");

          return Response.json(success);
        },
      });

      const result = await app.removeBackground(input, { format: "webp" });
      await result.save(output);
      expect(await readFile(output, "utf8")).toBe("image");
      expect(result.metadata.format).toBe("png");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves HTTP errors and never retries processing", async () => {
    let calls = 0;

    const app = new OpenBG({
      apiKey: "test",
      fetch: async () => {
        calls++;

        return Response.json(
          { error: "No credits", error_code: "INSUFFICIENT_CREDITS" },
          { status: 402 },
        );
      },
    });

    await expect(
      app.removeBackground(new Uint8Array([1])),
    ).rejects.toMatchObject({ status: 402, code: "INSUFFICIENT_CREDITS" });
    expect(calls).toBe(1);
  });

  it("rejects malformed successful responses", async () => {
    const app = new OpenBG({
      apiKey: "test",
      fetch: async () => Response.json({ success: true }),
    });

    await expect(
      app.removeBackground(new Uint8Array([1])),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("bounds inputs before sending a request", async () => {
    const app = new OpenBG({
      apiKey: "test",
      fetch: async () => {
        throw new Error("Must not send");
      },
    });

    await expect(app.removeBackground(new Uint8Array())).rejects.toBeInstanceOf(
      OpenBGError,
    );
    await expect(
      app.removeBackground(new Uint8Array(10 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE_SIZE" });
  });

  it("passes cancellation through without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;

    const app = new OpenBG({
      apiKey: "test",
      fetch: async (_url, init) => {
        calls++;
        init?.signal?.throwIfAborted();

        return Response.json(success);
      },
    });

    await expect(
      app.removeBackground(new Uint8Array([1]), {}, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(1);
  });
  it("rejects invalid base64 instead of silently saving corrupt bytes", async () => {
    const app = new OpenBG({
      apiKey: "test",
      fetch: async () =>
        Response.json({ ...success, result_image: "not base64!" }),
    });

    await expect(
      app.removeBackground(new Uint8Array([1])),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("times out a stalled transport once", async () => {
    let calls = 0;

    const app = new OpenBG({
      apiKey: "test",
      timeoutMs: 10,
      fetch: async (_url, init) => {
        calls++;
        const signal = init?.signal;

        if (!signal) throw new Error("Missing timeout signal");
        signal.throwIfAborted();

        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });

    await expect(
      app.removeBackground(new Uint8Array([1])),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(calls).toBe(1);
  });
});

function transformSuccess(operation: "compress-image" | "convert-image") {
  return {
    ...success,
    metadata: {
      operation, format: "webp", original_size: [2, 2], output_size: [2, 2],
      input_bytes: 10, output_bytes: 5, bytes_saved: 5, retained_original: false,
      quality_used: "73", lossless: false,
    },
  };
}

describe("image transform clients", () => {
  it("omits defaults, forwards all explicit overrides including zero/false, and exposes metadata", async () => {
    const requests: string[] = [];

    const app = new OpenBG({ apiKey: "test", fetch: async (url, init) => {
      const operation = String(url).endsWith("/compress-image") ? "compress-image" : "convert-image";

      expect(init?.redirect).toBe("error");
      requests.push(await new Response(init?.body).text());

      return Response.json(transformSuccess(operation));
    } });

    const input = new Uint8Array([1]);

    const compressed = await app.compressImage(input);

    expect(compressed.image.toString()).toBe("image");
    expect(compressed.metadata.bytes_saved).toBe(5);
    await app.convertImage(input, { format: "webp" });
    await app.convertImage(input, { format: "webp", quality: 73, lossless: false });
    await app.compressImage(input, { quality: 90, lossless: true });
    await app.convertImage(input, { format: "png", compression_level: 0 });
    await app.compressImage(input, { compression_level: 9 });
    expect(requests.map(body => JSON.parse(body))).toEqual([
      { image_data: "AQ==" }, { image_data: "AQ==", format: "webp" },
      { image_data: "AQ==", format: "webp", quality: 73, lossless: false },
      { image_data: "AQ==", quality: 90, lossless: true },
      { image_data: "AQ==", format: "png", compression_level: 0 },
      { image_data: "AQ==", compression_level: 9 },
    ]);
  });

  it("validates overrides before submitting", async () => {
    let calls = 0;

    const app = new OpenBG({ apiKey: "test", fetch: async () => {
      calls++;

      return Response.json(success);
    } });

    await expect(app.compressImage(new Uint8Array([1]), { quality: 101 })).rejects.toThrow();
    await expect(app.convertImage(new Uint8Array([1]), { format: "png", compression_level: -1 })).rejects.toThrow();
    await expect(app.compressImage(new Uint8Array())).rejects.toMatchObject({ code: "INVALID_IMAGE_SIZE" });
    expect(calls).toBe(0);
  });

  it("rejects mismatched, truncated, or malformed transform responses", async () => {
    const correct = transformSuccess("convert-image");

    for (const payload of [success, transformSuccess("compress-image"), { ...correct, result_image: "eA==" }]) {
      const app = new OpenBG({ apiKey: "test", fetch: async () => Response.json(payload) });

      await expect(app.convertImage(new Uint8Array([1]), { format: "webp" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("preserves errors and cancellation without retrying either operation", async () => {
    let calls = 0;

    const app = new OpenBG({ apiKey: "test", fetch: async (_url, init) => {
      calls++;
      init?.signal?.throwIfAborted();

      return Response.json({ error: "No credits", error_code: "INSUFFICIENT_CREDITS" }, { status: 402 });
    } });

    await expect(app.compressImage(new Uint8Array([1]))).rejects.toMatchObject({ status: 402 });
    await expect(app.convertImage(new Uint8Array([1]), { format: "png" })).rejects.toMatchObject({ status: 402 });
    const controller = new AbortController();

    controller.abort();
    await expect(app.compressImage(new Uint8Array([1]), {}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(3);
  });
});
