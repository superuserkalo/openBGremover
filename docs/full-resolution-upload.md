# Original-resolution uploads and latency

Measured 14 October 2026, before deployment of these changes. The follow-up
[pipeline report](pipeline-latency.md) records the release status. The model
remains pinned BiRefNet HR-matting.

## Changes

The homepage now sends the original file instead of resizing its longest side
to 1400 pixels and converting it to PNG. The trial proxy no longer adds an
implicit 1400-pixel output resize to multipart or raw-image uploads. Explicit
JSON resize requests remain supported. The model still preprocesses inputs to
2048 × 2048; output RGB and the resized alpha mask use the source dimensions.

The demo rejects uploads above 10 MiB, displays processing/upload failures, and
provides a way to choose another image after failure. The old claim that warm
requests are instantaneous has been removed. Server-side byte/pixel/frame
limits and server-only trial credentials remain enforced.

Removing the output resize exposed a separate API bug: generated PNGs were
checked against the smaller base64 upload allowance, even after passing the
16 MiB worker-response bound. The API now validates output against that existing
response bound. The upload allowance is unchanged, and the **complete** worker
response, including both image and optional mask, must still fit within 16 MiB.
This permits some larger results; it does not make output size unlimited.

Changed code:

- [Homepage upload](../apps/web/components/background-removal-demo.tsx)
- Trial proxy: `apps/web/app/api/trial/run/route.ts` at the time; now [`/api/trial/[operation]`](../apps/web/app/api/trial/%5Boperation%5D/route.ts)
- [Output validation](../apps/api/src/media.ts)
- [Output-size and accounting regression tests](../apps/api/test/api.test.ts)

## Controlled timing comparison

The live configuration changed during setup through concurrent work. The first
six exploratory requests in `baseline-a` and `original-a` used v11, although the
runner had been told to observe v10 containers. Those cold labels are invalid;
all six are excluded from the comparison below. Their reports are retained.

The comparison was restarted after verifying the deployed Cloudflare binding
and Beam configuration. All 16 comparison requests matched v11 task records.
The allocation was one RTX 4090, one CPU core, 8 GiB host RAM, warmed checkpoints,
a 60-second idle window, zero minimum/one maximum container, and one request at
a time. The CPU/endpoint promotion was separate work, not part of this fix.

- Fixed API version: `ba5850d3-c0a1-405f-be0a-4725f49b95b8`.
- Beam v11 deployment: `2459b1e8-8559-4fb2-970c-43b71094bdb7`.
- Model revision: `5d6b6f8adcb5b417c871b1d84ceaae9871355b7f`.
- Order: 1400, original, original, 1400. Each batch began after an observed zero
  container inventory, then ran one cold and three sequential warm requests.
- The same scene was used throughout. A 2048 × 2048 JPEG was prepared from the
  existing 4096-pixel benchmark fixture. The baseline is that JPEG resized to
  1400 × 1400 and encoded as PNG, emulating the old upload path. Pillow LANCZOS
  was used rather than a browser canvas, so this is a workload comparison, not
  proof of pixel-identical old-browser preprocessing or model quality.
- Measurements include the complete response body from the live Cloudflare API
  to the Mac. They exclude browser preparation and the hosted Next.js proxy.
  Neither API nor GPU code was redeployed for these measurements.

| Measurement | Old 1400px PNG preparation | Original 2048px JPEG |
| --- | ---: | ---: |
| Upload bytes before JSON/base64 | 2,181,180 | 742,300 |
| Returned PNG bytes | 2,511,843 | 4,224,297 |
| Cold complete responses, n=2 | 12.486 s, 11.237 s | 8.260 s, 9.922 s |
| Cold median | 11.862 s | 9.091 s |
| Warm complete-response median, n=6 | 7.638 s | 5.190 s |
| Warm complete-response range | 4.425–9.953 s | 4.319–6.717 s |
| Warm image-handler median | 1.365 s | 1.860 s |
| Warm inference-stage median | 220.5 ms | 226.5 ms |
| Checkpoint restore, n=2 | 2.498 s, 2.703 s | 3.434 s, 2.719 s |
| Successful comparison requests | 8/8 | 8/8 |

The original JPEG upload is about 66% smaller than the old downscaled PNG for
this scene. Its output is about 68% larger. The extra native-resolution image
work adds 495 ms at the handler median. The inference stage changes little,
consistent with the unchanged 2048-pixel tensor; that timer also includes the
prediction's transfer to CPU. The remaining handler time includes preprocessing,
mask resizing, image encoding, and serialization rather than only GPU inference.

The original path was faster end to end in this sample. Network, dispatch, and
provider timing varied substantially, and checkpoint restore was actually slower
for the original batches. These results do not establish a general speedup,
prove exactly unchanged latency, or support a p95 claim. Larger originals,
different compression/content, and slower client connections can behave
differently. The removal of lossy preprocessing is the reason for the change.

All outputs decoded as RGBA PNGs, had their expected 1400 or 2048 dimensions,
and contained alpha from 0 to 255. Hashes were stable across repeated requests
within each variant. This checks output correctness and repeatability, not
whether hair, transparency, or subject selection is visually better.

## Size limits and remaining delivery constraints

The corrected local Next.js route, connected to the live production API,
returned the full 2048-pixel PNG in 5.601 seconds. A subsequent 4096-pixel upload
returned `INVALID_WORKER_RESPONSE` after 25.104 seconds through the still-deployed
API. These were smoke checks with unclassified temperature, not extra cold or
warm samples. This reproduces the output-validation bug addressed in the local
API change.

The updated local API processor then accepted one real result directly from
the same production Beam v11. It decoded as a 4096 × 4096 RGBA PNG, with alpha
0–255 and 11,711,149 output bytes. Its base64 payload is 15,614,868 bytes: above
the erroneous 14 MiB upload allowance but inside the existing 16 MiB response
bound. SHA-256 is
`2f49bff8af3271735c1f072a00b54d0b838f88ea511d477def5c87d2ecee541c`.
The handler took 4.867 seconds; the complete direct request took 68.102 seconds.
This is one unclassified smoke sample with a different network path from the
Cloudflare comparison. It verifies the fix against real inference and shows why
large-result transfer deserves separate measurement; it is not a cold/warm
estimate for 4K uploads. The deployed API still needs this patch.

The production website identifies as Vercel. Its documented request-body limit
is 4.5 MB, below the application's 10 MiB allowance. Preserving original files
means more uploads may encounter that existing hosting limit. The new error
state makes the failure visible; this change does not bypass the host's limit.
Supporting larger trial uploads requires a separate authenticated upload path.
Vercel documents streaming as an exception for large **responses**, and the
trial route already forwards the response stream; response streaming does not
remove the inbound request limit.
[Vercel limits](https://vercel.com/docs/functions/limitations),
[request versus streaming-response guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).

## Cost and memory

The verified one-core allocation costs an estimated $0.000341 per running
second at the published rates: GPU $0.000192, CPU $0.000105, and 8 GiB RAM at
$0.0000055/GiB/second. Its configured 60-second idle tail alone is $0.02046 per
isolated burst. The additional 495 ms of measured handler time corresponds to
about $0.000169 at that rate. This is one cost component, not a measured bill or
a complete cost-per-image estimate. Initialization, task/transport lifetime,
warm idle, and shutdown also matter. Full client response time is not a billing
timer. [Beam rates](https://www.beam.cloud/pricing),
[billing rules](https://docs.beam.cloud/v2/resources/pricing-and-billing).

The model shape, weights, GPU allocation, and warmup are unchanged. Native-size
decoded images, masks, and outputs require more host/browser memory. This run
did not instrument peak RAM or VRAM, and does not justify reducing the retained
8 GiB allocation. The follow-up [pipeline comparison](pipeline-latency.md)
records the retained allocation and measured cost per workload.

## Pipeline diagnosis

A follow-up source and saved-log review on 14 October identified avoidable image
handling. The trial path is browser → Next.js proxy → Cloudflare API → Beam and
back. Next.js buffers the upload and converts it to base64 JSON. The API buffers,
parses, validates, and serializes JSON to Beam. Beam returns the encoded image
as base64 JSON, which the API buffers and decodes for the trial response. The
proxy forwards that final binary response as a stream. Base64 expands the
uncompressed representation by roughly one third; actual wire overhead depends
on transport compression, which this review did not measure.

The browser's download handler also decodes the returned PNG into a canvas and
encodes another PNG. This is unnecessary for the homepage's PNG response, but
occurs on download, so it does not explain the measured processing latency. The
API's `pg` client remains open across inference and response validation. This
is a connection-lifetime concern; no measurement here attributes significant
latency to it, and Hyperdrive's backend pooling was not profiled.

Matching each original-image warm request to its inference logs gives these
medians over six samples:

| Stage | Median |
| --- | ---: |
| Handler start to inference start, including preprocessing | 231.5 ms |
| Inference stage | 226.5 ms |
| Inference finish to handler finish | 1,405.5 ms |
| Complete handler | 1,860 ms |
| Complete API response | 5,189.5 ms |
| Per-request time outside the handler | 3,329.5 ms |

These are separately calculated medians and need not add exactly. The
post-inference stage includes alpha processing, output resizing/copying, PNG
encoding, and base64 encoding. It does not isolate PNG compression. The complete
response measurements bypass Next.js, so that proxy cannot explain their gap.

For the one 4K direct-to-Beam smoke request, provider task
`20953bba-602d-4df8-b43a-d7cf8dd74176` ended at 13:18:31.888 UTC. The local client
completed at 13:19:29.929 UTC, approximately 58 seconds later. This comparison
uses provider and client wall clocks rather than a distributed monotonic trace.
The task's image handler took 4.867 seconds, including a 226 ms inference stage.
Neither Cloudflare nor Next.js was in this request path.

A local replay passed the saved real 4K output through the actual API processor
with an injected in-memory response, delivered in 16 KiB chunks. Three runs took
77, 67, and 70 ms for response reading, JSON/schema processing, and base64
validation. This Mac/Node result is not a Cloudflare CPU benchmark, but does
not reproduce the long live delay. Delivery from Beam to the client remains the
leading area to investigate; the exact split between provider delivery, network,
and client scheduling is unmeasured. One request is insufficient to establish a
4K latency distribution.

The next controlled experiment should time response headers, first body chunk,
last body chunk, and validation separately, and correlate those with provider
task completion. Profile image encoding separately inside the handler. Compare
binary or file-based result delivery against the current JSON transport before
choosing an implementation. Keep original pixels, authentication, accounting,
and scale-to-zero intact. A faster model can save only its measured inference
share; model-quality comparisons remain a separate requirement.

Raw evidence is in `pipeline-diagnosis.json` and `local-response-profile.json`
under the ignored full-resolution benchmark directory. The local replay is
reproducible without credentials or GPU requests:

```sh
node node_modules/vitest/vitest.mjs run --config artifacts/benchmarks/full-resolution/vitest.profile.config.mjs
```

## Verification and evidence

- Strict TypeScript, Oxlint, and 15 API/auth/accounting tests passed. The new
  regression first reproduced the 502 on an allowed output. Tests now verify
  successful larger results, unchanged upload rejection, and refunds when the
  complete worker response exceeds its existing limit.
- Webpack production web build and Cloudflare API dry-run build passed.
  Turbopack could not bind its CSS helper's port in this environment; Webpack
  was used without changing the project's default build command.
- Local HTTP checks against the built Next.js route verified byte-identical
  original forwarding for multipart/raw requests, unchanged 2048-pixel output,
  explicit JSON resizing, oversized uploads, and missing/malformed requests.
- The opt-in live E2E runner passed with the 2048 JPEG: authentication, API keys,
  inference and mask output, charging, failed-processing refunds, revocation,
  and temporary-account cleanup. It exercised the deployed API, not a deployment
  of this patch.
- A separate opt-in live check passed the updated API processor against the real
  4096-pixel Beam output. No complete deployment of the updated API was tested.
- This task created no GPU deployments, changed no production routes, and made
  no model-quality acceptance claim. No browser click-through test was run.

Raw reports, scripts, task/log matches, generated inputs, and output hashes are
under ignored `artifacts/benchmarks/full-resolution/`. All six temporary
benchmark accounts, including the excluded exploratory batches, were deleted
by their runners and deletion was verified. The E2E account was also removed.
A final provider inventory confirmed zero GPU containers after natural idle
scale-down; no containers were forcibly stopped.

For the model shortlist and evidence gaps, see
[background-removal quality research](background-removal-quality-research.md).
