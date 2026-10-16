import { readFile, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { Option, Schema } from "effect";
import {
  ApiFailure,
  CompressImageRequest,
  ConvertImageRequest,
  ImageTransformResponse,
  type ImageOperation,
  RemoveBackgroundRequest,
  RemoveBackgroundResponse,
} from "../../contracts/src/index.js";

export type RemoveBackgroundOptions = Omit<
  RemoveBackgroundRequest,
  "image_data"
>;

export type CompressImageOptions = Omit<CompressImageRequest, "image_data">;

export type ConvertImageOptions = Omit<ConvertImageRequest, "image_data">;

export type OpenBGOptions = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

/** HTTP failures expose status and the API's machine-readable error code. */
export class OpenBGError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "OpenBGError";
  }
}

export class ImageResult {
  readonly image: Buffer;
  readonly metadata: RemoveBackgroundResponse["metadata"];
  readonly processingTimeMs: number;
  readonly mask: Buffer | undefined;

  constructor(response: RemoveBackgroundResponse) {
    this.image = decodeImage(response.result_image);
    this.metadata = response.metadata;
    this.processingTimeMs = response.processing_time_ms;
    this.mask =
      response.mask_image === undefined
        ? undefined
        : decodeImage(response.mask_image);
  }

  async save(path: string): Promise<void> {
    await writeFile(path, this.image);
  }
}

/** Transform metadata includes actual output format, byte savings, and applied settings. */
export class ImageTransformResult extends ImageResult {
  readonly metadata: ImageTransformResponse["metadata"];

  constructor(response: ImageTransformResponse) {
    super(response);
    this.metadata = response.metadata;

    if (this.image.length !== this.metadata.output_bytes) {
      throw new OpenBGError("Incomplete image data in API response", 200, "INVALID_RESPONSE");
    }
  }
}

/** Server-side Node.js client. Processing requests are sent once, never retried. */
export class OpenBG {
  private readonly apiKey: string;
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: OpenBGOptions) {
    if (!options.apiKey.trim()) throw new Error("An API key is required");
    this.apiKey = options.apiKey;
    this.endpoint = new URL(
      "/",
      options.baseUrl ?? "https://openbg-api.gantchevkaloyan.workers.dev",
    );

    if (!["https:", "http:"].includes(this.endpoint.protocol))
      throw new Error("Use an HTTP or HTTPS API URL");
    this.timeoutMs = options.timeoutMs ?? 120_000;

    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error("timeoutMs must be a positive integer");
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async removeBackground(
    input: string | Uint8Array,
    options: RemoveBackgroundOptions = {},
    signal?: AbortSignal,
  ): Promise<ImageResult> {
    const body = Schema.decodeUnknownSync(RemoveBackgroundRequest)({
      ...options, image_data: await encodeInput(input),
    }, { onExcessProperty: "error" });

    const response = await this.post("remove-background", JSON.stringify(body), signal);
    const decoded = Schema.decodeUnknownOption(RemoveBackgroundResponse)(await response.json().catch(() => null));

    if (Option.isNone(decoded)) throw new OpenBGError("Invalid response from the API", response.status, "INVALID_RESPONSE");

    return new ImageResult(decoded.value);
  }

  async compressImage(
    input: string | Uint8Array,
    options: CompressImageOptions = {},
    signal?: AbortSignal,
  ): Promise<ImageTransformResult> {
    const body = Schema.decodeUnknownSync(CompressImageRequest)({
      ...options, image_data: await encodeInput(input),
    }, { onExcessProperty: "error" });

    return this.transform("compress-image", JSON.stringify(body), signal);
  }

  async convertImage(
    input: string | Uint8Array,
    options: ConvertImageOptions,
    signal?: AbortSignal,
  ): Promise<ImageTransformResult> {
    const body = Schema.decodeUnknownSync(ConvertImageRequest)({
      ...options, image_data: await encodeInput(input),
    }, { onExcessProperty: "error" });

    return this.transform("convert-image", JSON.stringify(body), signal);
  }

  private async transform(operation: ImageOperation, body: string, signal?: AbortSignal): Promise<ImageTransformResult> {
    const response = await this.post(operation, body, signal);
    const decoded = Schema.decodeUnknownOption(ImageTransformResponse)(await response.json().catch(() => null));

    if (Option.isNone(decoded) || decoded.value.metadata.operation !== operation) {
      throw new OpenBGError("Invalid response from the API", response.status, "INVALID_RESPONSE");
    }

    return new ImageTransformResult(decoded.value);
  }

  private async post(operation: "remove-background" | ImageOperation, body: string, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(this.timeoutMs);

    const response = await this.fetch(new URL(`/api/v1/${operation}`, this.endpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: "error",
    });

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);

      const failure = Schema.decodeUnknownOption(ApiFailure)(payload);

      if (Option.isSome(failure))
        throw new OpenBGError(
          failure.value.error,
          response.status,
          failure.value.error_code ?? "API_ERROR",
        );
      throw new OpenBGError(
        `Request failed (${response.status})`,
        response.status,
        "API_ERROR",
      );
    }

    return response;
  }
}

async function encodeInput(input: string | Uint8Array): Promise<string> {
  const bytes = input instanceof Uint8Array ? input : await readFile(input);

  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
    throw new OpenBGError("Image must be between 1 byte and 10 MB", 0, "INVALID_IMAGE_SIZE");
  }

  return Buffer.from(bytes).toString("base64");
}

function decodeImage(encoded: string): Buffer {
  const bytes = Buffer.from(encoded, "base64");

  if (bytes.length === 0 || bytes.toString("base64") !== encoded) {
    throw new OpenBGError(
      "Invalid image data in API response",
      200,
      "INVALID_RESPONSE",
    );
  }

  return bytes;
}
