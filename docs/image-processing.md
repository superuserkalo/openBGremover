# Image compression and conversion

The authenticated API implements two static-image operations on a CPU-only
Beam worker. libvips (pyvips 3.2.0, pyvips-binary 8.18.7) decodes JPEG, PNG,
WebP, and AVIF, applies orientation and colour management, and encodes JPEG
(MozJPEG), PNG (libpng), and WebP (libwebp). Standalone pillow-heif 1.8.1
decodes HEIC, which libvips cannot. Pillow 12.3.0 encodes AVIF (libavif),
because libvips disables aom's intra block copy and makes AVIF text and
graphics four to five times larger. The reasoning is in
[the Pillow and libvips research](https://github.com/superuserkalo/openBGremover/blob/research/pillow-libvips-pipeline/docs/research/pillow-libvips-pipeline.md):

| Endpoint | Behavior |
| --- | --- |
| `POST /api/v1/compress-image` | Keep the input format. Return the original bytes if re-encoding would not reduce size. |
| `POST /api/v1/convert-image` | Produce the requested JPEG, PNG, WebP, or AVIF format, even if it increases size. HEIC input converts to any of them. |

These routes require `IMAGE_PROCESSING_ENDPOINT_URL` to be configured. An empty
value returns 503 before credit reservation, and `/api/info` omits the two
operations. Both operations are deployed and verified in production as of
15 October 2026. See the [rollout and live verification record](image-processing-rollout-2026-10-15.md).

## Requests

### Website

The playground exposes **Compress** and **Convert** alongside background
removal. Both require sign-in and use the same authenticated API and image
credits. The dashboard links to the playground through **Open image tools**.

Compression keeps the source format. Conversion offers JPEG, PNG, WebP, and
AVIF, and accepts HEIC uploads; the compress tool explains that HEIC must be
converted. Collapsed **Advanced settings** expose optional JPEG/WebP/AVIF quality, lossy or
lossless WebP, and PNG compression level. In lossless WebP mode, quality is
labeled compression effort. Blank settings use server defaults; opening or
closing Advanced settings does not change them. **Reset to recommended** clears
all overrides. The conversion target stays visible outside Advanced settings.
JPEG conversion explains that transparency becomes white. Successful
requests show a comparison preview, input/output sizes, and a download with
the actual output extension. Changing the file, tool, or settings clears the
previous result. Requests are submitted once, without automatic retries.

See the [website verification record](image-processing-ui-2026-10-15.md) for
local build and live API evidence; this does not establish website deployment.

### HTTP

Use an owner API key or Supabase session in `Authorization: Bearer ...`.
The internal trial key remains restricted to background removal.

Compression accepts JSON:

```json
{
  "image_data": "<base64 JPEG>",
  "quality": 80
}
```

It also accepts original bytes with `Content-Type: image/jpeg`, `image/png`,
`image/webp`, or `application/octet-stream`. Raw requests use default encoding
settings. The file signature determines its format. Compression has no `format`
option; use conversion to change formats.

Conversion requires JSON and a target format:

```json
{
  "image_data": "<base64 image>",
  "format": "webp",
  "quality": 80,
  "lossless": false
}
```

| Option | Allowed values | Applies to | Default |
| --- | --- | --- | --- |
| `format` | `jpeg`, `jpg`, `png`, `webp`, `avif` | Conversion only; required | None |
| `quality` | Integer 1–100 | JPEG/WebP/AVIF output | 80; 60 for AVIF |
| `lossless` | Boolean | WebP output | `false` |
| `compression_level` | Integer 0–9 | PNG output | 6 |

All encoding options are optional. Defaults are resolved in the CPU worker;
the website and SDKs omit untouched options. Explicit `false` and `0` remain
overrides. Conversion still requires a target format. Both SDKs expose every
encoding option; see [client examples](sdks.md). `null` is not an API default
sentinel: omit the property instead (Python `None` is omitted by the SDK).

PNG is lossless at every compression level and uses adaptive row filtering
(libvips' default is none, which makes photos much larger). A higher level
changes encoding effort and file size, not pixel quality. WebP uses effort 4;
when lossless is true, quality controls compression effort rather than lossy
visual quality. JPEG uses MozJPEG with trellis quantisation, overshoot
deringing, optimised progressive scans, quant table 3, and explicit 4:2:0
chroma subsampling (libvips would otherwise switch it off at quality 90 and
above). AVIF uses aom speed 6 and 4:2:0. `jpg` is an alias; output metadata and
content type use `jpeg`. Metadata reports the selected `encoder`.

AVIF's default quality is 60, chosen on 19 October 2026 by PSNR against the
JPEG default on three images (12 MP landscape photo, bird photo, text graphic):
JPEG quality 80 gave 38.19, 39.88, and 33.45 dB; AVIF quality 60 gave 38.23,
39.81, and 37.00 dB at 31%, 32%, and 93% smaller files. PSNR is a proxy, not a
visual study. Revisit with SSIMULACRA2 on a representative set.

MozJPEG makes the same 12 MP photo 22% smaller than the previous Pillow
libjpeg-turbo encoder at quality 80 (1.24 versus 1.58 MiB) and takes about four
times as long locally (605 versus 156 ms); WebP and PNG sizes were unchanged.

Unknown options and options for the wrong output format return 400. The new
operations do not accept the background-removal model's named `quality`
presets, masks, or resize options. Base64 data URLs are accepted as on the
existing removal route.

## Responses

The default is JSON, using the existing image-response layout:

```json
{
  "success": true,
  "result_image": "<base64 result>",
  "processing_time_ms": 125,
  "metadata": {
    "operation": "compress-image",
    "format": "jpeg",
    "original_size": [1600, 1200],
    "output_size": [1600, 1200],
    "input_bytes": 300000,
    "output_bytes": 180000,
    "bytes_saved": 120000,
    "retained_original": false,
    "quality_used": "80",
    "processing_time_ms": 22,
    "device": "cpu",
    "is_animated": false,
    "frame_count": 1
  }
}
```

These numbers illustrate the response structure, not an SLA. Top-level timing
covers the worker round trip and delivery; metadata timing covers the Python
operation. `bytes_saved` can be negative for conversion. Compression returning
the original reports `retained_original: true`, zero bytes saved, and omits
encoder-setting metadata because it did not select the new encoding.

Send `Accept: image/*` for the encoded bytes and their actual `Content-Type`.
The same metadata is in `X-Image-Metadata`, exposed through the existing CORS
policy. Provider file URLs and provider credentials never reach the caller.

```sh
curl "$API_URL/api/v1/compress-image" \
  -H "Authorization: Bearer $OPENBG_API_KEY" \
  -H 'Content-Type: image/jpeg' \
  -H 'Accept: image/*' \
  --data-binary @input.jpg \
  --output compressed.jpg
```

## Image behavior and limits

- Inputs are JPEG, PNG, WebP, AVIF, and HEIC, at most 10 MiB and 25 million
  pixels. The pixel limit is checked from the header, before decoding.
  Outputs are bounded at 12 MiB. Conversion can exceed that limit even when
  the compressed input fits, and returns an error instead of an oversized file.
- Only single-frame images are supported. Animated PNG/WebP/AVIF, GIF, HEIC
  burst sequences, and 16-bit PNG/JPEG/WebP are rejected. Frames are never
  silently discarded. 10- and 12-bit HEIC and AVIF convert to 8-bit.
- HEIC uses only the primary image; depth maps, HDR gain maps, and thumbnails
  are never decoded. PQ/HLG HDR HEIC is rejected. libheif has already applied
  rotation, so EXIF orientation is never applied again. HEIC can be converted
  but not compressed, because there is no HEIC output.
- PNG and lossless WebP preserve soft alpha and hidden RGB samples. JPEG
  flattens transparency onto white. Lossy WebP and AVIF preserve alpha while
  compressing RGB.
- Re-encoding applies EXIF orientation and omits EXIF and text metadata. RGB
  ICC profiles are preserved. CMYK and profiled grayscale images convert
  through LittleCMS to sRGB; unprofiled CMYK uses libvips' built-in CMYK
  profile. HEIC that signals Display P3 only through nclx converts to sRGB.
  If compression retains the original, its original metadata and orientation
  tag remain intact, and output dimensions describe those original bytes.
- A compressed result is not guaranteed to be smaller; it is guaranteed not
  to be larger. Conversion has no size-reduction guarantee. PNG/WebP lossless
  encoding cannot restore detail already lost in an input JPEG.

## Accounting and failures

Each successful request consumes one existing image credit, including a
compression request that returns the original. Both operations share the
current row-locked free-then-bulk reservation and usage recording. Usage totals
combine all image operations; the existing activity table has no per-operation
column. There is no database migration or new payment mechanism.

The API validates authorization, wire format, byte limits, and options before
reserving a credit. The CPU worker validates decoding, dimensions, and frame
count before encoding. Worker failures refund the reservation and record failed
usage, including a structurally plausible but undecodable upload. Typical
statuses are 400 for invalid input/options, 401/403 for authentication/scope,
402 for insufficient credits, 413 for an oversized body, 502 for worker or
delivery failures, and 503 when the CPU endpoint is unconfigured.

No automatic retries are added. The existing synchronous accounting caveats
still apply, including the lack of durable reservations and idempotency. See
[the migration guide](migration.md#current-limits). A caller should not blindly
retry a request whose outcome is unknown.

## Configure and verify a deployment

The CPU worker is `workers/image-processing/app.py:process_image`. It uses one
CPU core, 8 GiB RAM, a 60-second idle window, a 60-second task timeout, no GPU,
provider authentication, zero automatic retries, and Beam's zero-minimum /
one-maximum-container default. It does not load or change the background model.

1. Deploy from `workers/image-processing` using the pinned Beam deployment
   environment: `../../.venv/bin/beam deploy app.py:process_image`. Capture
   provider output privately; it may include authorization headers.
2. Set `IMAGE_PROCESSING_ENDPOINT_URL` in the API's Wrangler config to that
   endpoint. Keep `BEAM_ENDPOINT_URL` for background removal. The new CPU
   endpoint uses the existing `BEAM_API_KEY` and approved file-output prefix.
3. Generate bindings with `npm run types -w @openbg/api`. Run the local checks,
   then deploy to a temporary API target first. Do not route production
   requests until the live check passes.
4. Set the ignored `.env.deployment` file's `E2E_API_URL` to that test API.
   Run `E2E_IMAGE_OPERATIONS=1 npm run test:e2e`. This extends the existing
   opt-in runner with three conversions, three compressions, invalid options,
   a real CPU decoder failure/refund, and exact credit/activity checks. It
   also retains background-removal regression checks and account cleanup.
   The temporary account needs at least nine signup credits.
5. Inspect the saved result files and cleanup report. Stop temporary Beam
   deployments, delete temporary API Workers, and verify cleanup before release.

Local verification:

```sh
python -m pip install -r workers/image-processing/requirements.txt
python -m unittest discover -s workers/image-processing -p test_imaging.py -v
IMAGE_TEST_PYTHON=/absolute/path/to/python npm run check
npm run build:api
```

`IMAGE_TEST_PYTHON` opts into a local integration test using the real worker
pipeline through the API handlers and PGlite accounting. It exercises every
JPEG/PNG/WebP/AVIF conversion pair, compression in each format, HEIC conversion,
and an actual decoder failure.
It does not establish deployed Supabase/Hyperdrive/Beam behavior.

Verification recorded on 15 October 2026: strict TypeScript and Oxlint passed;
all 60 TypeScript tests passed with the real-Pillow integration enabled; all
11 CPU image tests and nine existing background-image tests passed. Wrangler
binding generation and the API dry-run build passed. The Beam deployment
definition imported successfully with the pinned deployment client. Local
documentation links, Python syntax, and `git diff --check` passed.

After explicit deployment authorization, temporary and production deployments
passed the live suite, including authentication, all three formats, exact credit
charges, decoder-failure refunds, key revocation, and account cleanup. The
[rollout record](image-processing-rollout-2026-10-15.md) distinguishes live
checks from local coverage and records the temporary-resource cleanup.
