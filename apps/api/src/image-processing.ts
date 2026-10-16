import { Schema } from "effect";
import { CompressImageRequest, ConvertImageRequest, ImageTransformMetadata, type ImageOperation, type ImageTransformJob } from "@openbg/contracts";
import { readBytes, readText } from "./body";
import { ApiError } from "./errors";
import { createWorkerProcessor, decodeImageData, imageBase64, imageBytes, imageFormat, type MediaConfig } from "./media";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Validate format-specific options and upload size before reserving a credit. */
export async function readImageTransformRequest(request: Request, operation: ImageOperation): Promise<ImageTransformJob> {
  const contentType = request.headers.get("content-type") ?? "";
  const raw = contentType.startsWith("image/") || contentType.startsWith("application/octet-stream");
  const text = raw ? undefined : await readText(request);
  const bytes = raw ? await readBytes(request, MAX_UPLOAD_BYTES) : undefined;

  try {
    if (raw && operation === "convert-image") throw new Error("Conversion needs a target format");

    const value: unknown = bytes === undefined ? JSON.parse(text ?? "") : { image_data: imageBase64(bytes) };

    const input = operation === "compress-image"
      ? { ...Schema.decodeUnknownSync(CompressImageRequest)(value, { onExcessProperty: "error" }), format: undefined }
      : Schema.decodeUnknownSync(ConvertImageRequest)(value, { onExcessProperty: "error" });

    const data = decodeImageData(input.image_data, Math.ceil(MAX_UPLOAD_BYTES / 3) * 4);
    const decoded = imageBytes(data);

    if (decoded.length > MAX_UPLOAD_BYTES) throw new Error("Upload too large");

    const source = imageFormat(String.fromCharCode(...decoded.subarray(0, 32)));

    if (source === "gif") throw new Error("Unsupported input format");

    const requested = input.format ?? source;
    const format = requested === "jpg" ? "jpeg" : requested;

    if ((input.quality !== undefined && format === "png") ||
        (input.lossless !== undefined && format !== "webp") ||
        (input.compression_level !== undefined && format !== "png")) {
      throw new Error("Options do not apply to the output format");
    }

    return { ...input, operation, image_data: data, format };
  } catch {
    throw new ApiError({ code: "INVALID_REQUEST", message: "Provide a JPEG, PNG, or WebP image up to 10 MiB. Conversion requires format. Use quality (1–100) for JPEG/WebP, lossless for WebP, or compression_level (0–9) for PNG", status: 400 });
  }
}

export function createImageProcessor(config: MediaConfig, fetcher: typeof fetch = fetch) {
  const endpoint = Schema.decodeUnknownSync(Schema.URLFromString)(config.endpoint);

  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("IMAGE_PROCESSING_ENDPOINT_URL must be an HTTPS URL without credentials or a fragment");
  }

  const process = createWorkerProcessor(config, fetcher);

  return async (request: ImageTransformJob) => {
    const result = await process(request);

    try {
      if (result.kind !== "binary") throw new Error("CPU worker must return encoded image bytes");

      const metadata = Schema.decodeUnknownSync(ImageTransformMetadata)(result.metadata);
      const inputBytes = imageBytes(request.image_data);

      if (metadata.operation !== request.operation || metadata.format !== request.format ||
          metadata.input_bytes !== inputBytes.length || metadata.output_bytes !== result.image.length ||
          metadata.bytes_saved !== inputBytes.length - result.image.length ||
          metadata.output_size[0] * metadata.output_size[1] > 25_000_000 ||
          metadata.original_size[0] * metadata.original_size[1] > 25_000_000 ||
          (request.operation === "compress-image" && metadata.bytes_saved < 0) ||
          (request.operation === "convert-image" && metadata.retained_original) ||
          (metadata.retained_original && imageBase64(result.image) !== request.image_data)) {
        throw new Error("Inconsistent image result");
      }

      return { ...result, metadata };
    } catch {
      throw new ApiError({ code: "INVALID_WORKER_RESPONSE", message: "The image worker returned an invalid result", status: 502 });
    }
  };
}

export type ImageProcessor = ReturnType<typeof createImageProcessor>;
