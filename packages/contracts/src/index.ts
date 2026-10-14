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
});

/** Internal GPU delivery envelope; the signed URL never reaches API clients. */
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
