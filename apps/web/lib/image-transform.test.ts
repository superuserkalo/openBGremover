import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { CompressImageRequest, ConvertImageRequest } from "@openbg/contracts";
import { imageTransformBody, readTransformResponse, type TransformOptions } from "./image-transform";

const options = { operation: "convert-image", format: "webp", quality: 72, lossless: false, compressionLevel: 8 } satisfies TransformOptions;

function imageResponse(format: "jpeg" | "png" | "webp", size = 3): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: {
      "Content-Type": `image/${format}`,
      "X-Image-Metadata": JSON.stringify({
        operation: "convert-image", format, original_size: [1, 1], output_size: [1, 1],
        input_bytes: 4, output_bytes: size, bytes_saved: 4 - size, retained_original: false,
      }),
    },
  });
}

describe("website image transforms", () => {
  it("preserves source bytes across base64 chunk boundaries and sends only relevant conversion options", async () => {
    const bytes = Uint8Array.from({ length: 20001 }, (_, index) => index % 251);
    const file = new File([bytes], "photo.png", { type: "image/png" });

    for (const format of ["jpeg", "png", "webp"] as const) {
      const input = Schema.decodeUnknownSync(ConvertImageRequest)(JSON.parse(await imageTransformBody(file, { ...options, format })));

      expect(Buffer.from(input.image_data, "base64")).toEqual(Buffer.from(bytes));
      expect(input.format).toBe(format);
      expect(input.quality).toBe(format === "png" ? undefined : 72);
      expect(input.compression_level).toBe(format === "png" ? 8 : undefined);
      expect(input.lossless).toBe(format === "webp" ? false : undefined);
    }
  });

  it("compresses in the input format regardless of the previously selected conversion format", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const file = new File([new Uint8Array([1, 2, 3])], `image.${format}`, { type: `image/${format}` });

      const input = Schema.decodeUnknownSync(CompressImageRequest)(JSON.parse(await imageTransformBody(file, {
        ...options, operation: "compress-image", format: "jpeg", lossless: true,
      })), { onExcessProperty: "error" });

      expect(input.quality).toBe(format === "png" ? undefined : 72);
      expect(input.lossless).toBe(format === "webp" ? true : undefined);
      expect(input.compression_level).toBe(format === "png" ? 8 : undefined);
    }
  });

  it("omits untouched settings for every format and operation", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const file = new File([new Uint8Array([1])], `image.${format}`, { type: `image/${format}` });

      for (const operation of ["compress-image", "convert-image"] as const) {
        const body = JSON.parse(await imageTransformBody(file, {
          operation, format, quality: undefined, lossless: undefined, compressionLevel: undefined,
        }));

        expect(body).toEqual(operation === "compress-image" ? { image_data: "AQ==" } : { image_data: "AQ==", format });
      }
    }
  });

  it("preserves explicit zero and false and rejects invalid numeric overrides", async () => {
    const file = new File([new Uint8Array([1])], "image.png", { type: "image/png" });

    expect(JSON.parse(await imageTransformBody(file, { ...options, format: "png", compressionLevel: 0 }))).toMatchObject({ compression_level: 0 });
    expect(JSON.parse(await imageTransformBody(file, { ...options, format: "webp", lossless: false }))).toMatchObject({ lossless: false });
    await expect(imageTransformBody(file, { ...options, quality: 101 })).rejects.toThrow();
    await expect(imageTransformBody(file, { ...options, format: "png", compressionLevel: 2.5 })).rejects.toThrow();
  });

  it("rejects empty or oversized files before encoding or submitting", async () => {
    await expect(imageTransformBody(new File([], "empty.png"), options)).rejects.toThrow("10 MiB");
    await expect(imageTransformBody(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png"), options)).rejects.toThrow("10 MiB");
  });

  it("uses actual response format and validates binary delivery for every download extension", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const result = await readTransformResponse(imageResponse(format), "convert-image");

      expect(result.extension).toBe(format);
      expect(result.blob.type).toBe(`image/${format}`);
      expect(result.blob.size).toBe(3);
    }
  });

  it("rejects malformed metadata, mismatched operation or MIME, and partial downloads", async () => {
    await expect(readTransformResponse(new Response("oops"), "convert-image")).rejects.toThrow();
    await expect(readTransformResponse(imageResponse("png"), "compress-image")).rejects.toThrow("unexpected");
    const wrongMime = imageResponse("png");

    wrongMime.headers.set("Content-Type", "image/jpeg");
    await expect(readTransformResponse(wrongMime, "convert-image")).rejects.toThrow("unexpected");
    await expect(readTransformResponse(imageResponse("webp", 4), "convert-image")).rejects.toThrow("incomplete");
  });
});
