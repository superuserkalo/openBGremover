import { Schema } from "effect";

export const ImageFormat = Schema.Literals(["png", "webp", "gif", "jpg", "jpeg"]);

export const Quality = Schema.Literals(["auto", "quality", "portrait", "product", "speed"]);

export const Resize = Schema.Struct({
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  max_width: Schema.optionalKey(Schema.Number),
  max_height: Schema.optionalKey(Schema.Number),
  keep_aspect: Schema.optionalKey(Schema.Boolean),
});

export const RemoveBackgroundRequest = Schema.Struct({
  image_data: Schema.String,
  quality: Schema.optionalKey(Quality),
  format: Schema.optionalKey(ImageFormat),
  return_mask: Schema.optionalKey(Schema.Boolean),
  resize_options: Schema.optionalKey(Resize),
});

export type RemoveBackgroundRequest = typeof RemoveBackgroundRequest.Type;

export const StillImageFormat = Schema.Literals(["jpeg", "jpg", "png", "webp"]);

export const ImageOperation = Schema.Literals(["compress-image", "convert-image"]);

export type ImageOperation = typeof ImageOperation.Type;

const EncodingOptions = {
  quality: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  lossless: Schema.optionalKey(Schema.Boolean),
  compression_level: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 }))),
};

export const CompressImageRequest = Schema.Struct({ image_data: Schema.String, ...EncodingOptions });

export type CompressImageRequest = typeof CompressImageRequest.Type;

export const ConvertImageRequest = Schema.Struct({ image_data: Schema.String, format: StillImageFormat, ...EncodingOptions });

export type ConvertImageRequest = typeof ConvertImageRequest.Type;

/** Validated CPU worker input. Compression resolves the source format at the API boundary. */
export const ImageTransformJob = Schema.Struct({
  operation: ImageOperation, image_data: Schema.String, format: StillImageFormat, ...EncodingOptions,
});

export type ImageTransformJob = typeof ImageTransformJob.Type;

export const ImageMetadata = Schema.Struct({
  original_size: Schema.optionalKey(Schema.Array(Schema.Number)),
  output_size: Schema.optionalKey(Schema.Array(Schema.Number)),
  processing_time_ms: Schema.optionalKey(Schema.Number),
  quality_used: Schema.optionalKey(Schema.String),
  format: Schema.optionalKey(ImageFormat),
  device: Schema.optionalKey(Schema.String),
  is_animated: Schema.optionalKey(Schema.Boolean),
  frame_count: Schema.optionalKey(Schema.Number),
  model: Schema.optionalKey(Schema.String),
  model_revision: Schema.optionalKey(Schema.String),
  operation: Schema.optionalKey(ImageOperation),
  input_bytes: Schema.optionalKey(Schema.Int),
  output_bytes: Schema.optionalKey(Schema.Int),
  bytes_saved: Schema.optionalKey(Schema.Int),
  retained_original: Schema.optionalKey(Schema.Boolean),
  lossless: Schema.optionalKey(Schema.Boolean),
  compression_level: Schema.optionalKey(Schema.Int),
});

const ImageDimensions = Schema.Tuple([Schema.Int.check(Schema.isGreaterThan(0)), Schema.Int.check(Schema.isGreaterThan(0))]);

export const ImageTransformMetadata = Schema.Struct({
  ...ImageMetadata.fields,
  operation: ImageOperation,
  format: StillImageFormat,
  original_size: ImageDimensions,
  output_size: ImageDimensions,
  input_bytes: Schema.Int.check(Schema.isGreaterThan(0)),
  output_bytes: Schema.Int.check(Schema.isGreaterThan(0)),
  bytes_saved: Schema.Int,
  retained_original: Schema.Boolean,
});

/** Internal worker delivery envelope; the signed URL never reaches API clients. */
export const WorkerFileDelivery = Schema.Struct({
  url: Schema.String,
  content_type: Schema.Literals(["image/png", "image/jpeg", "image/webp", "image/gif", "application/json"]),
  metadata: ImageMetadata,
});

export const RemoveBackgroundResponse = Schema.Struct({
  success: Schema.Literal(true),
  result_image: Schema.String,
  mask_image: Schema.optionalKey(Schema.String),
  processing_time_ms: Schema.Number,
  metadata: ImageMetadata,
});

export type RemoveBackgroundResponse = typeof RemoveBackgroundResponse.Type;

export const ImageTransformResponse = Schema.Struct({
  success: Schema.Literal(true), result_image: Schema.String,
  processing_time_ms: Schema.Number, metadata: ImageTransformMetadata,
});

export type ImageTransformResponse = typeof ImageTransformResponse.Type;

export const ApiFailure = Schema.Struct({
  success: Schema.optionalKey(Schema.Literal(false)),
  error: Schema.String,
  error_code: Schema.optionalKey(Schema.String),
});

export const Success = Schema.Struct({ success: Schema.Literal(true) });

export const CreateKeyRequest = Schema.Struct({ name: Schema.String });

export const CreateKeyResponse = Schema.Struct({
  success: Schema.Literal(true), api_key: Schema.String, key_id: Schema.Number,
});

export const ApiKey = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  prefix: Schema.String,
  is_active: Schema.Boolean,
  created_at: Schema.Number,
  last_used_at: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});

export type ApiKey = typeof ApiKey.Type;

export const KeysResponse = Schema.Struct({ success: Schema.Literal(true), keys: Schema.Array(ApiKey) });

export const Activity = Schema.Struct({
  id: Schema.Number,
  source: Schema.String,
  was_successful: Schema.Boolean,
  error_message: Schema.optionalKey(Schema.NullOr(Schema.String)),
  processing_time_ms: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  credit_type: Schema.optionalKey(Schema.NullOr(Schema.String)),
  created_at: Schema.Number,
});

export type Activity = typeof Activity.Type;

export const ActivityResponse = Schema.Struct({ success: Schema.Literal(true), activities: Schema.Array(Activity) });

export const StatsResponse = Schema.Struct({
  success: Schema.Literal(true),
  api_calls_total: Schema.Number,
  images_processed: Schema.Number,
  images_this_month: Schema.Number,
  free_credits_remaining: Schema.Number,
  bulk_credits_remaining: Schema.Number,
  billing_model: Schema.String,
});

export type Stats = typeof StatsResponse.Type;
