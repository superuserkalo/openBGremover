import { Effect, Schema } from "effect";
import { ImageMetadata, RemoveBackgroundRequest, type RemoveBackgroundResponse } from "@openbg/contracts";
import { ApiError, attempt } from "./errors";
import { readText } from "./body";
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

export interface MediaConfig { endpoint: string; apiKey: string }

function decodeImageData(input: string): string {
  const data = input.replace(/^data:image\/[\w.+-]+;base64,/, "");

  if (!data || data.length > 14 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw new Error("Invalid base64 image");
  }

  const prefix = atob(data.slice(0, 32));

  const valid = prefix.startsWith("\x89PNG\r\n\x1a\n") || prefix.startsWith("\xff\xd8\xff") ||
    prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a") ||
    (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP");

  if (!valid) throw new Error("Unsupported image");

  return data;
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

export function createProcessor(config: MediaConfig, fetcher: typeof fetch = fetch) {
  return async (request: RemoveBackgroundRequest): Promise<RemoveBackgroundResponse> => {
    const started = Date.now();
    let response: Response;

    try {
      response = await fetcher(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          image: request.image_data, format: request.format ?? "png", quality: request.quality ?? "auto",
          return_mask: request.return_mask ?? false, resize: request.resize_options,
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      throw new ApiError({ code: "PROCESSING_UNAVAILABLE", message: "The image worker did not respond", status: 502 });
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError({ code: "PROCESSING_FAILED", message: "The image worker could not process this image", status: 502 });
    }

    try {
      const output = Schema.decodeUnknownSync(WorkerSuccess)(JSON.parse(await readText(response, 16 * 1024 * 1024)));

      const result: RemoveBackgroundResponse = {
        success: true, result_image: decodeImageData(output.image),
        processing_time_ms: Date.now() - started, metadata: output.metadata,
      };

      return output.mask === undefined ? result : { ...result, mask_image: decodeImageData(output.mask) };
    } catch {
      throw new ApiError({ code: "INVALID_WORKER_RESPONSE", message: "The image worker returned an invalid result", status: 502 });
    }
  };
}

export type Processor = ReturnType<typeof createProcessor>;

/** Validate before reserving a credit. Failed processing refunds the reserved credit. */
export function removeBackground(request: RemoveBackgroundRequest, identity: Identity, db: Database, process: Processor) {
  return Effect.gen(function* () {
    if (identity.kind === "trial") return yield* attempt(() => process(request));

    const started = Date.now();
    const credit = yield* attempt(() => db.reserveCredit(identity.userId));

    const outcome = yield* attempt(() => process(request)).pipe(Effect.match({
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
