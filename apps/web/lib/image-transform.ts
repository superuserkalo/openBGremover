import { Schema } from "effect";
import { CompressImageRequest, ConvertImageRequest, ImageTransformMetadata, type ImageOperation } from "@openbg/contracts";
import { readImageResponse } from "./image-response";

export type TransformOptions = {
  operation: ImageOperation;
  format: "jpeg" | "png" | "webp" | "avif";
  quality: number | undefined;
  lossless: boolean | undefined;
  compressionLevel: number | undefined;
};

/** HEIC is accepted for conversion only; the API has no HEIC output. */
export function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name);
}

export function sourceImageFormat(file: File): TransformOptions["format"] {
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return "png";

  if (file.type === "image/webp" || /\.webp$/i.test(file.name)) return "webp";

  if (file.type === "image/avif" || /\.avif$/i.test(file.name)) return "avif";

  return "jpeg";
}

/** Keep original pixels; the API validates the actual file format and image limits. */
export async function imageTransformBody(file: File, options: TransformOptions): Promise<string> {
  if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error("Choose an image up to 10 MiB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }

  const format = options.operation === "compress-image" ? sourceImageFormat(file) : options.format;

  let input: CompressImageRequest = { image_data: btoa(chunks.join("")) };

  if (format === "png") {
    if (options.compressionLevel !== undefined) input = { ...input, compression_level: options.compressionLevel };
  } else {
    if (options.quality !== undefined) input = { ...input, quality: options.quality };

    if (format === "webp" && options.lossless !== undefined) input = { ...input, lossless: options.lossless };
  }

  return options.operation === "compress-image"
    ? JSON.stringify(Schema.decodeUnknownSync(CompressImageRequest)(input))
    : JSON.stringify(Schema.decodeUnknownSync(ConvertImageRequest)({ ...input, format }));
}

export async function readTransformResponse(response: Response, operation: ImageOperation) {
  const metadata = Schema.decodeUnknownSync(ImageTransformMetadata)(JSON.parse(response.headers.get("x-image-metadata") ?? "null"));
  const extension = metadata.format === "jpg" ? "jpeg" : metadata.format;

  if (metadata.operation !== operation || response.headers.get("content-type") !== `image/${extension}`) {
    throw new Error("The server returned an unexpected image format.");
  }

  const blob = await readImageResponse(response);

  if (blob.size !== metadata.output_bytes) throw new Error("The image download is incomplete.");

  return { blob, extension, metadata };
}
