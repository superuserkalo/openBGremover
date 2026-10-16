---
name: openbg
description: Connect openBGremover to an app or coding agent and remove image backgrounds through its authenticated media API. Use for setup, processing images, and handling API errors.
---

# openBGremover

## Connect

1. Reuse `OPENBG_API_KEY` from the server environment. If absent, ask the user
   to sign in on this website and create a key in `/dashboard`. Store the key
   in an ignored environment file or secret store, accessible only to server code.
2. Set `OPENBG_API_URL` to `https://openbg-api.gantchevkaloyan.workers.dev`
   unless the user provides a self-hosted deployment.
3. Use the HTTP contract below. In a checkout of
   `https://github.com/superuserkalo/openBGremover`, the Node client is in
   `packages/sdk` and the Python client is in `packages/python-sdk`.
   Read `docs/sdks.md` there for source installation. These packages are not
   published to npm or PyPI yet.
4. When the user authorizes a processing test, send one image, decode the output,
   and verify its dimensions and format before reporting success. A successful
   processing request consumes a credit. Report setup separately from processing
   if a test image or credentials are missing.

## HTTP contract

`POST /api/v1/remove-background`

Headers: `Authorization: Bearer <OPENBG_API_KEY>` and
`Content-Type: application/json`.

Body:

```json
{
  "image_data": "BASE64_IMAGE_BYTES",
  "format": "png",
  "quality": "auto"
}
```

Send the original image bytes encoded as base64, without a data URL prefix.
Keep uploads at or below 10 MB and 25 megapixels. PNG and WebP output preserve
transparency. JPEG output uses a white background. Read `/docs` on this site
for output format and input constraints.

On success, the response contains `success: true`, `result_image` (base64),
`processing_time_ms`, and `metadata`. Decode `result_image` into a file. Use
`metadata.format` for the actual output format.

On failure, check the HTTP status and `error` and `error_code` fields. Show the
error without exposing credentials or image payloads. For 401, check the key.
For 402, ask the user to check credits. For 429, report the rate limit.

Send each processing request once. The synchronous API has no idempotency
contract, so retrying after a timeout could charge and process the image twice.
Report a timeout as an unknown processing outcome, not a confirmed failure.

Background removal is the current processing endpoint. Discover supported
endpoints from the API docs rather than deriving routes from website tool names.
