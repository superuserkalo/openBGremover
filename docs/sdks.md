# Node.js and Python clients

Both clients use the authenticated HTTP API. They load local files, encode the
original bytes, validate responses, and save decoded output. Processing calls
are sent once. A timeout does not prove the server stopped processing.

These are source packages, not published npm or PyPI releases.

## Node.js 22+

From a repository checkout:

```sh
npm ci
npm pack ./packages/sdk
```

Install the resulting `openbg-sdk-0.1.0.tgz` in your server project with npm.
The tarball contains compiled JavaScript, declarations, and compiled shared
contracts. Effect is the only runtime dependency.

```ts
import { OpenBG } from "@openbg/sdk"

const app = new OpenBG({ apiKey: process.env.OPENBG_API_KEY ?? "" })
const result = await app.removeBackground("image.png", { format: "png" })
await result.save("output.png")

// Omit encoding settings to use server defaults.
const compressed = await app.compressImage("photo.jpg")
await compressed.save("compressed.jpg")
const converted = await app.convertImage("photo.png", { format: "webp" })
await converted.save("converted.webp")

// Optional overrides; lossless WebP quality controls compression effort.
await app.compressImage("photo.jpg", { quality: 72 })
await app.convertImage("photo.png", { format: "webp", lossless: true, quality: 90 })
await app.convertImage("photo.webp", { format: "png", compression_level: 0 })
```

`removeBackground` accepts a file path or `Uint8Array`, API options from the shared
contract, and an optional third `AbortSignal` argument. Results expose `image`,
`mask`, `metadata`, and `processingTimeMs`. HTTP errors are `OpenBGError` with
`status` and `code`. Transport and cancellation errors preserve native errors.

Set `baseUrl` for a self-hosted deployment and `timeoutMs` to override the
120-second timeout. The optional `fetch` dependency supports isolated tests.

`compressImage` and `convertImage` accept the same input and cancellation
arguments. Options derive from the shared API contracts. `ImageTransformResult`
exposes `image`, `processingTimeMs`, `save()`, and typed `metadata`, including
`format`, `input_bytes`, `output_bytes`, `bytes_saved`, `retained_original`, and
the encoder settings used when the result was re-encoded.

## Python 3.10+

Install from a repository checkout:

```sh
python -m pip install ./packages/python-sdk
```

```python
import os
from openbg import OpenBG

app = OpenBG(api_key=os.environ["OPENBG_API_KEY"])
result = app.remove_background("image.png", format="png")
result.save("output.png")

app.compress_image("photo.jpg").save("compressed.jpg")
app.convert_image("photo.png", format="webp").save("converted.webp")
app.compress_image("photo.jpg", quality=72)
app.convert_image("photo.png", format="webp", lossless=True, quality=90)
app.convert_image("photo.webp", format="png", compression_level=0)
```

`remove_background` accepts a file path, `Path`, or bytes. Options are `format`,
`quality`, `return_mask`, and `resize_options` (typed `ResizeOptions`). Optional
arguments default to `None` and are omitted from requests, including background
removal options. Results expose `image`, `mask`, `format`, and
`processing_time_ms`. HTTP errors are `OpenBGError` with `status` and `code`.
Native transport errors propagate. Override `base_url` and `timeout` (seconds)
for a self-hosted endpoint. The Python client uses only the standard library.

`compress_image` and `convert_image` accept paths or bytes and optional
`quality`, `lossless`, and `compression_level` keyword arguments. Conversion
requires `format`. They return `ImageTransformResult` with the same image,
format, timing, and save interface, plus typed `metadata` with dimensions,
byte counts, savings, retained-original status, and applied encoder settings.

## Defaults and overrides

Server-owned defaults are the same for HTTP, Node.js, Python, and the website.
Clients send only explicit overrides. JPEG/WebP quality accepts integers 1–100;
PNG compression level accepts integers 0–9 and never changes pixel quality.
`lossless` applies only to WebP. Options for another output format are rejected
by the API before charging. In compression, options apply to the actual source
format; in conversion, they apply to the requested output format.

Compression keeps the format and returns the original if encoding cannot make
it smaller. Conversion can increase size, and JPEG flattens transparency onto
white. A successful unchanged result still costs one credit. See the
[image-processing contract](image-processing.md) for limits and current defaults.

Both clients reject empty images and inputs larger than 10 MB before making a
request. Pixel limits and image decoding remain server responsibilities.
Redirects are rejected so credentials and processing requests stay on the
configured endpoint.

## Verification

```sh
npm run check
npm run build -w @openbg/sdk
PYTHONPATH=packages/python-sdk python3 -m unittest discover -s packages/python-sdk/tests
```

The Python tests use a local HTTP server. They do not call paid inference.
