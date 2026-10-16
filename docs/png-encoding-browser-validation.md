# Lossless PNG encoding and browser delivery validation

Measured 15 October 2026. **Not promoted.** Production remains on Beam v18.
The acceptance run encountered provider failures before six pairs completed;
server encoding gains alone do not meet the release gate.

## Changes under test

The candidate uses pinned `imagecodecs==2026.10.10` with libpng UP filtering and
compression level 3 for the binary PNG path. The model, weights, original output
dimensions, alpha, and RGB samples remain unchanged. Images carrying ICC, EXIF,
or transparency metadata retain Pillow encoding. If the fast output exceeds
the existing 12 MiB allowance, the original level-6 encoder remains the fallback.
JSON/mask encoding and other output formats are unchanged.

The new dependency is BSD-3-Clause licensed; primary project and release evidence:
[imagecodecs](https://github.com/cgohlke/imagecodecs),
[release](https://pypi.org/project/imagecodecs/2026.10.10/).
The Linux wheel supports the deployed Python 3.12 runtime. This adds a dependency
and a slightly larger checkpoint, so cold restoration is part of acceptance.

For the 4096 × 4096 fixture, the production PNG is 12,100,978 bytes; the candidate
is 11,678,292 bytes. Decoded RGBA is exactly equal, including soft alpha and RGB
under transparent pixels. The RGBA SHA-256 is
`d911cc1bac4a798712ac3d2bc5458757ce2e6461c9a0fc46115f5648be385285`.
Candidate preparation encoded the PNG in 516 ms; a later browser-triggered
request took 556 ms. These are individual worker-stage observations, not browser
latency claims.

## Browser delivery failure and correction

The original UI's `Response.blob()` failed during the full-size download in the
Codex in-app browser. Both baseline and candidate returned HTTP 200 and valid
server timings before the body read failed. Three failed image requests are
retained in `artifacts/benchmarks/png-1015/browser-failures.json`.

A transfer-only endpoint removed inference from the diagnosis. Reading 11 MiB
through `ReadableStream.getReader()` succeeded for POST/octet-stream, POST/PNG,
and GET/PNG. Reading the same generated responses with `Response.blob()` failed
in all three cases. Constructing a Blob from bounded stream chunks succeeded
in all three cases, then successfully displayed the actual 4096 × 4096 result
with its expected PNG hash. This establishes the failing API path in this browser;
it does not establish the browser's internal cause or claim all browsers fail.

The proposed client reader limits the response to the API's existing 12 MiB
allowance, cancels oversize streams, propagates download errors, rejects empty
results, and releases the reader lock. It does not re-encode or resize the image.
The three focused tests cover a result over 10 MiB, exact byte preservation,
oversize cancellation, interrupted delivery, and empty responses.

## Controlled comparison protocol

All main samples use one instrumented preview of the committed frontend, with
the same bounded reader for both encoder variants. This isolates encoder latency
conservatively. The original failing UI has no successful full-size before time;
its failures are reported separately. Early manual runs and the first automated
candidate block remain pilot observations because they span preview hostnames
and different manual gaps. They are not mixed into the controlled comparison.

Six alternating pairs are planned. Each variant gets six cold and eighteen warm
requests, using the same original 4096 × 4096 JPEG. Each cold request must follow
an observed zero-container inventory and be correlated with provider task and
checkpoint logs. Each block runs one cold request followed by three sequential
warm requests. No paid inference request is retried automatically.

Timing starts at the existing file handler and ends after processed-image load
and two animation frames. It includes upload, Vercel proxying, Cloudflare, Beam,
the entire PNG download, decode, and a paint opportunity. It excludes fixture
preloading and the file picker. Hashing is outside the timed completion point.
This is a browser measurement on an instrumented preview, not a claim that the
unmodified production UI was measured successfully.

Keep one CPU, 8 GiB RAM, RTX 4090, prepared checkpoints, inference warmup,
60-second idle window, and scale-to-zero. Production baseline is v18
(`e0a2747a-637d-41f9-865e-d86e25474016`); isolated candidate is v19
(`8d161a47-46b5-455c-8447-f5bad77fb813`). The candidate API is separate from
customer traffic. Raw inputs, measurements, logs, and the dated acceptance plan
are under ignored `artifacts/benchmarks/png-1015/`.

## Checks

Nine Python image-pipeline tests pass, including exact decoded samples and the
real oversize-encoding fallback. Root strict type checking, Oxlint, and 52 tests
pass. Candidate live E2E passes login, key scopes, PNG/mask processing, binary/JSON
compatibility, accounting, invalid input, real-worker failure refunds, revocation,
and temporary-account cleanup.

The isolated committed-frontend preview with the proposed reader builds on
Vercel. The full dirty local frontend's Turbopack build is blocked by local port
binding permissions; webpack mode then fails on unrelated existing WGSL imports
that only have a Turbopack loader. Those frontend redesign files are not part of
this change and must not be included in its commit or deployment.

## Results and release decision

Only one complete matched pair finished before the provider failures. Both
variants in this table use the same fixed client reader and original 4096 × 4096
input. These are actual browser handler-to-display measurements, not a claim
that the old failing `Response.blob()` path completed.

| First complete matched pair | Current encoder + fixed reader | Candidate encoder + fixed reader |
| --- | ---: | ---: |
| Cold, one sample each | 14.134 s | 14.625 s |
| Warm median, three samples each | 13.031 s | 10.305 s |

The first pair shows a warm improvement but a cold regression. It is too small
to estimate a reliable distribution or establish a cold benefit. No bootstrap
acceptance claim is made from the incomplete run.

The next candidate block completed one cold request in 14.617 s and two warm
requests in 10.168 s and 10.388 s. Its third warm request returned HTTP 502 after
6.748 s. The API message identifies a non-2xx response from the Beam invocation
endpoint. No corresponding task or inference-start event appears in the
retrieved provider records. The exact upstream status was discarded by the old
API code and cannot be recovered from these records. Status-only logging has
been added to the proposed API change, without image data or credentials.

The corresponding baseline cold request then failed after **126.615 s**.
Beam task `564cd219-312c-4ed3-a21d-f2673dc6ac84` was created at
23:05:59.339 UTC and remained `PENDING`, with no start time or container attached
to the task. Container `endpoint-4efdb099-ccf7-4169-8ad6-2a1f0371273e-04414e86`
was also observed `PENDING`. This delay occurred before inference, not during
PNG encoding. The timed-out benchmark task was explicitly cancelled and its
orphaned pending container stopped. Production's deployment was not stopped.

The run ended with 11 successful controlled requests and two failures. The
remaining planned samples were not run, and no failed inference was retried.
All 11 completed requests matched the expected encoded PNG hash, 4096 × 4096
dimensions, and size for their variant; their task records and encoding events
were correlated. Their worker encoding medians were **2,206 ms** for baseline
(n=4) and **513 ms** for candidate (n=7), a 76.7% reduction in that stage. This
stage result does not imply the same reduction in browser latency.

**Release decision: hold.** Neither the complete cold/warm performance gate nor
the no-failures gate passed. No production configuration was changed and no
commit or push was made. The encoder, bounded reader, tests, and status logging
remain local for review and a new controlled run when provider scheduling is
healthy. Changing to permanently warm capacity or blindly retrying requests
would change the agreed behavior and was not used to make the benchmark pass.

The temporary test API and all twelve preview deployments were deleted with
readback verification. The candidate Beam deployment was stopped; its deployment
record remains for reproducible retesting. Temporary E2E account cleanup passed.
The benchmark-only log listener was stopped. Raw failure records are retained
alongside successful results; the saved plan and summary explicitly mark the
comparison as aborted and `promote: false`.

Final readback at 23:11:57 UTC showed zero containers for both tested stubs,
and the removed temporary API returned HTTP 404. The API build and final
`git diff --check` passed; HEAD remains `267dfbfb7837b3bde66936a94fd3f310b5d43af5`.
