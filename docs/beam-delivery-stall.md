# Removing the large-response delivery stall

Investigated 14–15 October 2026 (Europe/Vienna). Raw measurements are under
ignored `artifacts/benchmarks/stall-1014/`. The previous pipeline work and its
unresolved 15.763-second production body transfer are recorded in
[pipeline-latency.md](pipeline-latency.md).

## Cause and change

The reproduced delay occurs while receiving an already processed image from
Beam's synchronous response relay. GPU inference and image encoding finish
well before the delayed body reaches Cloudflare. The exact internal provider
network fault is not established; the measurements do establish a delivery
path that avoids it.

The worker now persists the already encoded result with Beam's existing
[Output facility](https://docs.beam.cloud/v2/data/output) and returns a small
HTTP-200 envelope. The central API downloads that result, validates it, and
returns the existing public response. Image-only requests use the same binary
bytes; image-and-mask requests retain their JSON payload. No model inference
is repeated, and no image is re-encoded for storage.

The envelope uses `application/vnd.openbg.file+json` and the shared
`WorkerFileDelivery` schema. Downloads are restricted to the configured HTTPS
workspace prefix, carry no Beam authorization header, and reject redirects.
The API bounds the envelope at 64 KiB, image bytes at 12 MiB and JSON at 16 MiB.
Inference and download share the original 180-second deadline. A failed,
expired, malformed or oversized download fails processing and refunds the
reservation; there is no automatic inference retry.

Signed links expire after 120 seconds and remain internal to the API. The
result returned to the caller has the existing `no-store` policy. Beam manages
the persisted output lifecycle. Link expiration and physical object deletion
are different properties; this rollout does not independently establish when
Beam removes the underlying storage object.

`BEAM_OUTPUT_URL_PREFIX` must identify the deployment's managed output
workspace. Current production uses the existing `s3.wasabisys.com` workspace
prefix configured in `apps/api/wrangler.jsonc`. Another account must use its own
prefix; validation fails closed for a different host or workspace.

## Alternatives tested

All probes used the public scikit-image NASA astronaut fixture, enlarged to
4096×4096 with the same reproducible JPEG encoding as the earlier pipeline
benchmark. Every successful image-only response matched the same 12,100,978-byte
PNG, SHA-256
`2fd315f87a3ad7e1c8903214be31922ee3d3f21572ad033edcf3ce8f7bc75d89`.
These are transport and pixel-equivalence checks, not a new model-quality study.

- Chunked responses did not fix the problem: seven of eight alias-route bodies
  took over two seconds, reaching 14.242 seconds.
- A canonical versioned URL initially looked better, but an alternating check
  on the production v14 deployment reproduced an 11.077-second body transfer
  there too. The URL-only change was rejected. That experiment stopped after
  ten responses, with both observed-zero cold requests and every completed
  response retained in its report.
- Managed file delivery avoided the large relay body. In the final alternating
  v16 diagnostic, all eight file downloads completed in 15–305 ms. Full request
  time, including image processing and file persistence, was 4.489–5.260 seconds
  (median 4.808 seconds). The seven warm direct responses took 10.744–20.244
  seconds (median 17.423 seconds). A separate first direct response after restore
  took 30.612 seconds and is not counted as warm.

The earlier 24-response comparison contained eight samples per delivery mode
and no direct-body stall; it remains separate. Both that batch and the next
16-response chunking batch used one confirmed container. The subsequent file
comparison used a restored container. This variability is why a small fast
sample alone was insufficient to accept a fix.

Beam rejected an initial HTTP-303 implementation with HTTP 502, despite
successful inference and persistence. The production implementation therefore
uses the tested HTTP-200 envelope. The failed candidate's E2E account was removed
and the failure is retained in the evidence. A second integration issue was a
Cloudflare runtime rejection of `redirect: "error"`, despite the [documented modes](https://developers.cloudflare.com/workers/runtime-apis/request/). The final adapter uses `manual` and rejects non-success statuses itself;
the same redirect restriction is preserved. Temporary diagnostics logged only
status, content type and error category, and are excluded from the release.
The 120-second test link subsequently returned HTTP 403 after expiration.

## Allocation and costs

The pinned `ZhengPeng7/BiRefNet_HR-matting` revision
`5d6b6f8adcb5b417c871b1d84ceaae9871355b7f`, 2048×2048 model preprocessing,
original output dimensions, soft alpha, encoding, one-core RTX 4090, 8 GiB RAM,
warmed checkpoint, 60-second idle window and scale-to-zero are unchanged.

The [live Beam price page](https://www.beam.cloud/pricing) still lists a combined
allocation rate of $1.2276 per running hour for this GPU/CPU/RAM combination.
The unchanged 60-second paid idle tail alone is approximately $0.02046 per
isolated request. File persistence adds some worker time; the reduction in
response latency is not evidence of an equal reduction in GPU billing. No new
storage service or permanently warm capacity is provisioned. Cost per successful
request still depends on traffic spacing, file persistence, failures and idle
allocation, rather than inference duration alone.

## Final full-API comparison

The final comparison ran the actual authenticated production and candidate API
handlers through one Cloudflare diagnostic's service bindings. Its timer includes
input handling, authentication, processing, file delivery and receipt of the
complete image. It excludes public Internet ingress and the Mac's download.
Variant order alternated across three cycles; each cold request followed observed
natural scale-to-zero and was followed by three warm requests. No inference was
retried. Task IDs, container reuse and checkpoint-restore logs were checked.

| Complete 4096px API response | Before: direct v14 | After: file v18 |
| --- | ---: | ---: |
| Cold median, 3 each | 7.788 s | 8.162 s |
| Cold range | 7.768–8.208 s | 8.101–9.020 s |
| Warm median, 9 each | 4.653 s | 6.268 s |
| Warm range | 4.083–5.478 s | 5.499–7.153 s |
| Candidate file-read time, all 12 | — | 0.239–0.627 s |
| Successful, exact-hash outputs | 12/12 | 12/12 |

This window did not reproduce the baseline's stall. File persistence therefore
added 374 ms to the observed cold median and 1.615 seconds to the warm median.
The initial plan's requirement for lower complete-response medians was **not
met**. Do not describe these results as a general processing-speed improvement.

The release decision targets the demonstrated long delivery pauses: the
interleaved stalled-path experiment above reduced warm complete-response median
from 17.423 to 4.808 seconds, and the final candidate's body transfers remained
below 0.627 seconds. The tradeoff is extra persistence time when direct delivery
would have been healthy. This is a bounded set of observations, not a latency
SLA or proof that storage/network stalls can never occur. Revisit this choice if
Beam's direct delivery is repaired and a repeated comparison removes its long
pauses, or if managed-file persistence becomes the dominant delay.

Local verification passed strict TypeScript, Oxlint, all 21 API/auth tests
(28 tests across the local workspace, including three new delivery/accounting cases), seven Python image tests and the API build.
The final live candidate E2E passed login, API-key scopes, image and mask output,
raw binary and default JSON output, byte equality, exactly three successful
charges, failed-processing refunds, usage recording, immediate key revocation
and verified temporary-account deletion.

## Production rollout

Both API configurations were switched and read back at 22:21 UTC on 14 October
(00:21 Vienna time on 15 October):

| Component | Released version |
| --- | --- |
| Beam | v18, `e0a2747a-637d-41f9-865e-d86e25474016` |
| Beam endpoint | `https://app.beam.cloud/endpoint/bg-removal/v18` |
| Cloudflare API | `34ec2d7f-4985-4277-b73e-9e36e58ca37d` |
| Cloud Run compatibility API | `openbgremover-00044-gw6`, 100% traffic |

A cloud-side check then exercised the deployed website's multipart upload route
through Vercel and the production API, including the entire returned PNG:

| Website 4096px smoke check | Cold, n=1 | Warm, n=3 |
| --- | ---: | ---: |
| Complete response | 14.358 s | 7.277–8.066 s; median 7.753 s |
| Beam response-header wait | 10.614 s | 4.517–5.074 s |
| API download of finished file | 0.296 s | 0.295–0.644 s |
| Final website response-body transfer to cloud client | 0.869 s | 0.878–0.963 s |

All four outputs were the same 4096×4096, 12,100,978-byte PNG with the exact
reference hash. The first followed observed zero containers and a successful
2.422-second checkpoint restore; subsequent checks reused that container.
The larger cold website result is retained. These smoke checks are distinct
from the controlled API comparison and exclude the Mac's download; no browser
click-through timing or universal five-second promise is implied.

The production E2E passed the same authentication, key, three-charge, refund,
byte-equality, usage, revocation and account-deletion checks as the candidate.
The compatibility API returned the exact expected 512px PNG through the
established direct client. Its old JSON transport is retained for compatibility;
the new managed-file path is used by the central TypeScript API. A temporary
cloud diagnostic failed to parse the legacy response; that diagnostic failure
is retained separately from the successful direct route check.

V14 is stopped after verification, with its deployment record/checkpoint retained
for rollback. The v16 experiment and rejected v17 prototype were stopped and
deleted. The temporary candidate API and cloud probe were removed. No diagnostic
code, fixture images or secrets are part of the release commit. The existing
model-cache volume is retained.

Rollback requires restarting and preflighting v14, restoring the prior Cloudflare
API version `f1f45cd3-dbca-485b-84f4-b6663220dfc9`, and restoring the compatibility
service's v14 binding. This also restores direct response delivery and its known
intermittent stalls.

Final readback at 22:26 UTC confirmed HTTP 200 API health, v18 active, v14
inactive, both experimental deployments absent (HTTP 404), both temporary Workers
absent (Cloudflare error 10007), and zero running GPU containers after natural
scale-to-zero. One core, 8 GiB RAM, RTX 4090, checkpoints and the 60-second idle
window were read back from the live production deployment.
