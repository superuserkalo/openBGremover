export const apiExample = String.raw`curl -X POST "$OPENBG_API_URL/api/v1/remove-background" \
  -H "Authorization: Bearer $OPENBG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"image_data":"BASE64_IMAGE","format":"png"}'

# Response (image data abbreviated)
{
  "success": true,
  "result_image": "BASE64_PNG",
  "processing_time_ms": 1234,
  "metadata": { "format": "png" }
}`;
