# Background removal pipeline investigation

14 October 2026. The original-resolution fix precedes this comparison. The
baseline here preserves the same original input and output dimensions; the
comparison does not obtain speed by restoring the old 1400px downscale.

## Changes under test

- The API requests a binary image from Beam for ordinary image requests. Beam
  returns the already encoded image with a small metadata header. This removes
  base64 expansion, a large JSON serialization/parse, and decoding that image
  back into bytes on the trial path. The default public API JSON contract and
  legacy GPU JSON contract remain supported. Mask requests retain JSON.
- The API accepts original raw image uploads and an explicit `Accept: image/*`
  response. The trial proxy forwards ordinary multipart files and raw uploads
  as original binary bytes, preserving its server-only service credential.
  Explicit JSON format, quality, mask, and resize options remain available.
- The image pipeline performs EXIF orientation once, reuses RGB model input,
  and skips full-image/mask copies when their dimensions already match.
- Binary PNG output uses lossless compression level 5. If that exceeds the
  existing equivalent 12 MiB binary allowance, it falls back to level 6. Neither
  setting changes decoded pixels or alpha. Legacy JSON output retains level 6.
- The legacy JSON-to-image fallback replaces `Uint8Array.from` over a string
  with an allocated byte buffer and indexed copy. The native binary path needs
  neither conversion.
- API `Server-Timing` exposes the wait for Beam headers and response body. Worker
  logs separately time image decoding and image encoding alongside inference.
  No image payload, authorization header, or signed URL is logged.

The model revision, FP16, 2048x2048 model input, source output dimensions,
soft-alpha composition, one CPU core, RTX 4090, 8 GiB RAM, warmed checkpoint,
60-second idle window, and scale-to-zero are unchanged. No additional storage
service, queue, automatic inference retry, or always-warm allocation is added.

The website is being redesigned concurrently. Its new component already uses a
blob download instead of the old canvas re-encode. The pipeline work preserves
that implementation and supports both multipart and raw uploads, so it does not
rely on a particular UI version to avoid base64 encoding in the proxy.

## What the 58-second observation establishes

The earlier direct 4K request took 68.102 seconds. Beam marked its task complete
approximately 58 seconds before the local client finished. Local replay of that
same 15.6 MB response through the API processor took 67-77 ms. The historical
request lacks first-header/first-chunk/last-chunk timings, so its exact provider
versus network split cannot be recovered. It bypassed Next.js and Cloudflare.

Three new direct traces against the unchanged v11 worker took 15.171, 9.275,
and 10.781 seconds through the complete response body. Header waits were 7.187,
6.535, and 6.643 seconds; body transfers therefore took 7.984, 2.740, and 4.138
seconds. All returned the same 11,711,149-byte PNG wrapped in 15,615,178 bytes
of uncompressed JSON. The 58-second delivery interval did not recur in these
three traces. This localizes a reproducible overhead to large-response delivery,
but does not prove a particular network fault caused the original outlier.

A preliminary binary-only comparison had eleven successful image requests and
one Mac `EADDRNOTAVAIL` network failure while receiving a control response. That
pilot is retained separately and was not merged into the final comparison. It
shows that local network failures also occurred during this work; it is not
proof that the original request had the same failure.

The final API traces additionally measure Beam-to-Cloudflare body transfer,
separately from the Mac's download. These can reveal upstream delivery delay
without attributing every delay to the user's connection.

## Encoding and local CPU evidence

The binary-only 4K preflight had a 4.961-second image handler, including 3.992
seconds encoding PNG. With lossless level 5, the 4K preflight handler took 3.156
seconds, including 2.203 seconds encoding. This is a pair of setup observations,
not the cold/warm distribution. Checkpoint capture was excluded from both.

The level-5 output is 12,100,978 bytes, 3.3% larger than the original PNG but
22.5% smaller than its original JSON envelope. A full decoded RGBA comparison
is identical, including all RGB values under transparency and soft alpha.
The 4096x4096 RGBA SHA-256 is
`d911cc1bac4a798712ac3d2bc5458757ce2e6461c9a0fc46115f5648be385285`.

A local Mac/Node microbenchmark on the 11.7 MB output measured 982.6 ms for the
old per-character `Uint8Array.from` conversion and 24.7 ms for the indexed copy.
Base64 decoding itself took 6.1 ms. These are local observations, not production
Worker CPU measurements, and neither explains the historical direct request's
58-second delivery interval.

Cloudflare's clocks advance after I/O, so a zero `beam_validate` duration does
not establish zero CPU work. Read header/body timings as I/O boundary timings,
and use local profiling or provider CPU metrics for pure computation.
[Cloudflare timer semantics](https://developers.cloudflare.com/workers/runtime-apis/performance/).

## Database and transport decisions

The existing API keeps its `pg` client open during inference, but commits the
reservation before invoking Beam. Hyperdrive returns the origin connection to
its pool after each transaction. Reconnecting that client around inference is
therefore not the measured latency fix and would add connection work. Accounting
transactions and refunds are unchanged.
[Hyperdrive transaction pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/).

The binary worker response uses the existing Beam SDK's support for returning a
Starlette/FastAPI `Response`; it does not require an additional service. Current
Beam documentation also offers expiring file outputs, but persisting every
image would introduce a different storage and delivery path. That was not
selected merely on the assumption that a URL must be faster.
[Beam endpoint documentation](https://docs.beam.cloud/v2/endpoint/overview),
[Beam ephemeral outputs](https://docs.beam.cloud/v2/data/output).

The Next.js proxy remains the server-only trial credential boundary. The
previously documented Vercel inbound body limit is still a hosting constraint;
this work does not claim to bypass it. It removes resizing and redundant
encoding without weakening upload bounds or exposing the service key.

## Evidence

Ignored artifacts live under `artifacts/benchmarks/pipeline/`. `before-source/`
contains the baseline source. `trace-direct.mjs` records monotonic headers,
first chunk, body progress, body completion, and parse timings. `binary-pilot.json`
retains the initial pilot and its network failure. `benchmark.mjs` is the final
alternating comparison, with observations before every cold request and no
inference retries. `compare-pixels.py` checks every successful output against
the saved original RGBA pixels. Local fixture comparisons also cover 2048px,
4096px, explicit resize, existing transparency, and EXIF rotation.

## Controlled before/after results

The comparison ran from 15:10:36 to 15:32:58 UTC. It used the same 2048x2048
JPEG (742,300 bytes) and 4096x4096 JPEG (1,344,591 bytes), with original-size
PNG output in both versions. The control was v11 behind a temporary copy of the
baseline Cloudflare API. The candidate was v14 behind the changed API. The
trial credential and database path were the same. Variant order alternated
between cycles. Measurements include upload and the entire response body at
the Mac; they exclude the website proxy and browser rendering.

Every cold sample followed a fresh zero-container observation. Task records
and lifecycle logs confirm all twelve checkpoint restores. One intended warm
control request used a newly restored container after a long transfer; it is
reported separately, not silently counted as warm or as an observed-zero cold
sample. Every other warm request reused its cycle's container.

| Original size / state | Before median (range) | After median (range) | Samples before / after |
| --- | ---: | ---: | ---: |
| 2048px cold | 15.206s (9.919–21.390) | 11.035s (8.705–12.274) | 3 / 3 |
| 2048px warm | 15.092s (8.483–19.592) | 12.606s (9.099–60.290) | 9 / 9 |
| 4096px cold | 45.281s (25.913–75.651) | 23.874s (16.662–33.593) | 3 / 3 |
| 4096px warm | 29.566s (17.879–46.323) | 22.668s (15.217–39.824) | 8 / 9 |
| 4096px unexpected container restart | 81.429s | — | 1 / 0 |

All **48/48** requests succeeded and matched their reference's full decoded
RGBA buffer, including hidden RGB and soft alpha. There were no inference
retries. The model and model input resolution did not change. Three cold
samples per cell and two images cannot establish a service-wide tail or quality
guarantee. The 60.290-second candidate outlier is retained in the warm results.

Worker logs distinguish the image handler from delivery. Across all twelve
requests per size and variant:

| Worker stage median | 2048px before / after | 4096px before / after |
| --- | ---: | ---: |
| Complete image handler | 1.887s / 1.254s | 5.027s / 3.129s |
| GPU forward pass | 0.225s / 0.223s | 0.241s / 0.227s |
| Candidate PNG encoding | 0.736s | 2.258s |

The improvement comes mainly from image/response handling, not a faster model.
The forward-pass timer excludes CPU transform and composition work. Candidate
cold restores ranged from 2.383 to 3.597 seconds, versus 2.453 to 3.437 seconds
for the control. Allocation and checkpoint policy remain the same.

## Delivery stalls and the alternative tested

The larger comparison reproduced long delivery intervals, but not a fixed
58-second application wait. One control 4K response took 75.651 seconds, including
33.587 seconds receiving its body at the Mac. A candidate 4K request spent
19.141 seconds reading the body **inside Cloudflare from Beam**, independently
of the subsequent Mac download. A separate candidate probe measured 26.276
seconds on that same upstream body boundary after only 3.256 seconds in the
image handler. These observations show that inference completion is not result
delivery completion. They do not identify a particular congested link or explain
the precise split of the historical 58-second gap.

A temporary v15 worker compared the same encoded 12,100,978-byte PNG delivered
as a binary inference response or as a Beam-managed expiring file. Cloudflare
downloaded and hashed the full body, returning only small timing JSON to the
Mac. Three warm samples per mode used alternating order:

| Cloudflare-side measurement | Binary response | Expiring file |
| --- | ---: | ---: |
| Complete Beam call plus image delivery, median | 4.545s | 6.036s |
| Complete range | 4.352–11.399s | 5.203–11.485s |
| Body-transfer median | 0.822s | 0.152s |
| Body-transfer range | 0.799–7.193s | 0.084–0.450s |

All six outputs were byte-identical. Files moved faster after becoming available,
but writing/publishing them added another operation and the median complete
request was slower. This small probe does not justify selecting persistent
output handling or claiming that it fixes the tail. Binary delivery remains the
chosen implementation. Revisit file delivery if a larger controlled sample
shows a repeatable end-to-end or tail benefit, including its storage costs.

The experiment preserved two setup failures separately: a 502 after 70.222
seconds while the first checkpoint was still uploading, and a verifier failure
because current Beam output URLs used its Wasabi bucket instead of the host
shown in the documentation example. The origin check was corrected to that
specific managed bucket before the successful comparison. The failed setup
requests are not warm samples. The experimental files requested 120-second
expiry; actual storage deletion was not independently verified. Signed URLs
were neither exposed to clients nor written into the report.

## Cost and verification

Live configuration readback confirmed one RTX 4090, 1,000 CPU millicores,
8,192 MiB RAM, warmed checkpoints, minimum zero / maximum one container, and
60-second idle time on both variants. Published GPU-attached rates checked on
14 October remain $0.000192/GPU-second, $0.000105/core-second, and
$0.0000055/GiB-second, totaling **$0.000341/second ($1.2276/hour)**.
[Beam pricing](https://www.beam.cloud/pricing).

A workload cost model uses, per container, the interval from its first task's
creation to its last task's completion plus the 60-second idle tail. It includes
restore/dispatch and inter-request gaps, but is not invoice telemetry. Setup
captures and unrelated requests are excluded. For these 24 successful requests
per variant, it estimates $0.2966 before and $0.2728 after, or **$0.01236 versus
$0.01137 per successful image**. The control used seven containers because of
its unexpected restart; the candidate used six. Transfer variability affects
these gaps, so the estimated 8% difference is not a guaranteed billing saving.
The idle tail alone costs about $0.02046 per isolated container run. No paid
always-warm capacity was added.

Validation completed:

- Strict TypeScript, Oxlint, 18 API tests, seven Python image tests, and API and
  web builds. The isolated website build also passed with the deployed design.
- Local image comparisons cover original resolution, explicit resize, existing
  transparency, EXIF orientation, formats and animation.
- The built website proxy passed seven local HTTP checks for original bytes,
  explicit options, malformed files and upload limits.
- Live candidate E2E passed login, API keys/scopes, mask output, original binary
  upload, binary result, default JSON compatibility, three exact one-credit
  charges, failure refunds, usage, revocation and verified account deletion.
  The binary and JSON outputs were byte-identical; mask-path and binary-path
  images had identical decoded RGBA pixels.
- The isolated, locally built Next production server processed a 4096px upload
  through the candidate Cloudflare API and GPU in 21.021 seconds. Its 4096x4096
  output matched every reference pixel. This is a live HTTP integration check,
  not a Vercel deployment or browser click-through test.

The API exposes timing boundaries for future investigations without logging
image contents. Persistent delivery outliers remain an operational limitation;
this change removes measured redundant work without claiming to eliminate all
network or provider stalls.

## Release package

The tested GPU candidate is v14, deployment
`0b79b19d-586b-41d7-aa69-22072235e8bc`, stub
`b5c5924f-f32a-4961-9604-769362f8d37e`. Its checkpoint was prepared before the
comparison and restored successfully in all six candidate cold samples.

The website package is based on the currently deployed commit
`5660e1cbde8b21d16e9cba5e40d5fa8317741953`, Vercel deployment
`dpl_6yThJGURUubMm4ktMZmRnoGvu2Xa`. Of 52 build files, 50 match that revision
byte-for-byte. Only the upload proxy and upload/download component change.
The concurrent redesign and all ignored credentials are excluded. The review
patch is `artifacts/deployments/pipeline-web.patch`, with a file-hash manifest
in `artifacts/benchmarks/pipeline/web-release-manifest.json`.

## Production rollout

The user authorized commit, push and production deployment after reviewing the
comparison. V14 was restarted with its retained checkpoint. Logs confirmed a
2.633-second restore. A 512px image-and-mask preflight returned the exact
reference hashes; its handler took 687 ms, while the complete Mac response took
61.942 seconds. A separate 4K preflight completed GPU handling in 3.786 seconds
but timed out downloading the response at 180 seconds. These rollout observations
are retained separately from the 48-request comparison and reinforce the
unresolved delivery limitation. They are not evidence of a model regression.

Both production API configurations were switched and read back at 20:48 UTC:

| Component | Released version |
| --- | --- |
| Beam | v14, `0b79b19d-586b-41d7-aa69-22072235e8bc` |
| Cloudflare API | `f1f45cd3-dbca-485b-84f4-b6663220dfc9` |
| Cloud Run compatibility API | `openbgremover-00043-sm2`, 100% traffic |

The repository's one-core setting now matches the already deployed v11 baseline;
this pipeline release does not introduce a new CPU allocation. Eight GiB RAM,
the warmed checkpoint, 60-second idle window and scale-to-zero are retained.
The live production E2E passed authentication, API-key scopes, image/mask, raw
binary and default JSON output, exactly three successful credit charges, failure
refunds, usage recording, revocation and verified temporary-account deletion.
The old v11 deployment remains available until route verification completes.

The website release uses the two-file package above through the existing Vercel
Git integration. The concurrent redesign remains uncommitted. Earlier v12, v13
and v15 experiments are stopped and their temporary Cloudflare APIs were deleted.

The public test input is scikit-image's NASA astronaut fixture. Its SHA-256
matches the [official dataset registry](https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/_registry.py).
Pillow LANCZOS resizing to 4096x4096 and JPEG quality 90 reproduce the existing
large fixture byte-for-byte. The [dataset documentation](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut)
identifies it as public domain. These enlarged fixtures measure processing and
transfer behavior; they are not a representative model-quality benchmark.
