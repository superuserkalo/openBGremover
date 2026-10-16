# Cold-first CPU validation and production decision

Measured 14 October 2026. Use one-core v11 with 8 GiB RAM, the warmed checkpoint,
and the 60-second idle window. Twenty cold requests per configuration passed
the predefined practical comparison, and output correctness also passed for
larger images, masks, animation, and queued requests in the earlier benchmark.

The first production trial was briefly rolled back after three higher timings.
That decision gave too much weight to a comparison across environments and
times. The two-core rollback response overlapped the one-core range, and the
samples do not establish a CPU regression. The final decision uses the stronger
controlled comparison. The historical rollback and all measurements remain
below; final promotion verification is recorded at the end.

## Twenty new cold starts per configuration

These results are separate from the earlier
[CPU comparison](beam-cpu-comparison.md). Each request followed a fresh Beam
container inventory showing zero containers for that deployment. No forced
stops, GUI prewarming, warm requests, or image retries were used. The order
alternated within twenty pairs, and only one inference request ran at a time.

| Cold-path measurement | 2 cores / 8 GiB | 1 core / 8 GiB |
| --- | ---: | ---: |
| Complete response median | 5.315 s | 5.113 s |
| Observed 90th percentile | 6.638 s | 5.893 s |
| Complete response range | 4.792–8.429 s | 4.666–6.238 s |
| API execution median | 5.012 s | 4.781 s |
| Checkpoint restore median | 2.689 s | 2.476 s |
| Beam accepted → task started median | 3.026 s | 2.813 s |
| First-image handler median | 631 ms | 731 ms |
| Successful requests | 20/20 | 20/20 |

All forty images matched the reference 499,201-byte PNG, SHA-256
`a3c3ac706e7c88abb7e87b9b82408639014520c8fb3d796cf684fc43df58d25c`.
Task records and successful checkpoint-restore logs matched all forty distinct
containers. The model, dependency image, 2048×2048 model preprocessing, GPU,
memory, checkpoint loader, autoscaler, and real API path were unchanged.

One core does not inherently make startup faster. It landed more often on the
faster host in this sample. Comparing restore times within the same machines
gives the more useful CPU-specific observation:

| Beam host suffix | 2-core samples / restore median | 1-core samples / restore median |
| --- | ---: | ---: |
| `30db93e8` | 11 / 2.470 s | 16 / 2.439 s |
| `f134543e` | 6 / 3.324 s | 3 / 3.309 s |
| `106cf7e0` | 3 / 2.779 s | 1 / 2.848 s |

The well-sampled hosts show nearly equal restore duration. The image handler
itself was about 100 ms slower on one core, including the first image after a
restore. This is a small processing tradeoff, not a demonstrated startup
improvement. Host placement, dispatch, and transport account for larger swings.
Both final-round responses had extra delay outside the API timer; they remain
in the reported distribution.

## Decision and uncertainty

Before the new measurements, acceptance required twenty successful pairs, no
candidate failures, a candidate median and observed p90 no worse than the
control, and a paired-bootstrap upper bound below 250 ms for the difference in
median complete-response time. All checks passed.

The observed median difference, one core minus two, was **−202.5 ms**. Resampling
the twenty pairs 30,000 times with seed `20261014` gave an approximate 95%
percentile interval of **−1,112.5 to +195 ms** for the difference in medians.
This supports a practical no-material-regression decision at the stated margin.
It does **not** prove exactly zero latency cost, a guaranteed improvement, or a
future latency SLA. Host allocation was not controlled, the host mix differed,
and this is a short measurement window with one static input. The observed p90
is a sample statistic, not a reliable service-wide tail guarantee.

The initial rollback treated three production responses as evidence against
this comparison. That was overly conservative: there was no contemporaneous
production control, and host placement and transport differed. The final
decision accepts one core on the controlled evidence. This is a practical
resource choice, not proof that every future request will be equally fast.

One core reduces the running allocation rate from $1.6056 to $1.2276 per hour,
23.5%, at the published [Beam rates](https://www.beam.cloud/pricing). Actual
spend still depends on running duration and traffic. The 60-second idle window
and 8 GiB RAM were retained. The earlier process RSS peak of 6.153 GiB remains
the reason not to cut RAM to 6 GiB.

## One-core versions tested before rollback

| Component | Version |
| --- | --- |
| Beam app | `bg-removal` v11 |
| Beam deployment | `2459b1e8-8559-4fb2-970c-43b71094bdb7` |
| Beam stub | `b01638f3-0e8f-4212-b7ac-e100d11d6646` |
| Beam URL | `https://bg-removal-f6823e6-v11.app.beam.cloud` |
| Cloudflare API version | `0ac2d5ff-3ae6-453d-af4f-085eca997d31` |
| Cloud Run compatibility revision | `openbgremover-00040-vgt` |

During the trial, live readback confirmed that both APIs referenced v11. It has one RTX
4090, 1,000 CPU millicores, 8,192 MiB RAM, checkpoints enabled, the warmed model
loader, a 60-second idle window, minimum zero / maximum one container, one
worker, and one concurrent request.

The new 1.67 GiB checkpoint was captured successfully before customer traffic
switched. Its upload took 38.7 seconds. The first direct call returned success,
but the local verifier initially expected the public API's `result_image` /
`mask_image` names instead of Beam's `image` / `mask`; that verifier error is
retained in the evidence. After correcting it, direct preflight verified the
reference image and grayscale mask. No worker failure or model change was
hidden by that correction.

The live production E2E test passed login, JWT verification, signup credits,
key creation and scope enforcement, real CUDA processing and masks, charging
one credit, invalid-input rejection, refunding a real worker failure, persisted
usage, immediate key revocation, and temporary-account deletion. Local checks
passed strict TypeScript, Oxlint, all thirteen API tests, five Python image
tests, Python compilation, and the API dry-run build.

The website upload and compatibility API also returned the expected PNG,
in 5.708 and 5.152 seconds respectively. Three later requests through the
production Cloudflare API each followed observed natural scale-to-zero:

| Production v11 cold request | Complete response | Beam round trip | Image handler |
| --- | ---: | ---: | ---: |
| 1 | 6.969 s | 5.713 s | 734 ms |
| 2 | 7.703 s | 6.703 s | 721 ms |
| 3 | 6.101 s | 5.544 s | 748 ms |

All three succeeded with matching output, but the 6.969-second median did not
reproduce the temporary one-core API's 5.113-second median. The earlier v10
production check had returned 6.111 and 5.991 seconds. Those are small samples
from different times, so this does not prove CPU reduction caused a regression.
The first two v11 restores took 2.665 and 3.795 seconds on different hosts;
task and transport overhead also varied. The cause remains unresolved.

The initial response to these timings was to reverse the rollout. On review,
this was not a sound basis for rejecting the controlled comparison. The higher
timings and local preflight-verifier error remain in the artifacts; no failed
or unfavorable result was removed.

## Evidence and historical rollback

The cold comparison's temporary Beam deployments were stopped after natural
scale-to-zero, both temporary Cloudflare APIs were deleted, and all forty test
identities were confirmed absent. Raw evidence is ignored under
`artifacts/benchmarks/cpu-cold-validation/`: the predefined plan, forty reports,
output images, live configuration, lifecycle logs, task records, bootstrap
analysis, and cleanup readback. Rollout evidence is under
`artifacts/deployments/cpu-one/`.

The rollback target is two-core v10 deployment
`69afce53-7a54-4af5-8e31-5b99546d1a80`, endpoint
`https://bg-removal-f6823e6-v10.app.beam.cloud`. It remained available throughout
the trial. Both APIs and `apps/api/wrangler.jsonc` were restored to that endpoint,
`app.py` was restored to two cores, and Worker types were regenerated. The
shared model-cache volume is retained.

Live rollback readback confirmed:

| Component | Restored version |
| --- | --- |
| Beam | `bg-removal` v10, two cores / 8 GiB |
| Cloudflare API | `f2d8e450-dbea-474c-a67f-457e5fd50e3c` |
| Cloud Run compatibility API | `openbgremover-00041-vzt`, 100% traffic |

A fresh public API request after observed scale-to-zero returned the correct
PNG in **6.372 seconds**, with a 5.780-second Beam round trip and a 656 ms
image handler. This overlaps the one-core production range and reinforces that
these few production samples cannot isolate a CPU effect. The website upload
and compatibility route also returned the correct image after rollback,
in 7.748 and 2.732 seconds; these route checks were sequential and are not a
paired cold comparison.

The rollback readback at 12:50 UTC confirmed that v11 was stopped, v10 was the only
active Beam deployment, and there were zero running GPU containers. Its live
configuration still had two cores, 8 GiB RAM, RTX 4090, warmed checkpoints,
the 60-second idle window, and minimum zero / maximum one container. API health
returned HTTP 200. Both additional latency-test identities were confirmed
absent, and the live E2E runner had already verified deletion of its account.
The forty comparison identities and temporary APIs were also cleaned up.

At rollback, source files matched the prior production configuration and
regenerated Worker types passed TypeScript checking. The report preserves
trial results separately from rollback results. Nothing was committed or pushed.

## Final one-core promotion

The tested v11 deployment was restarted with its existing checkpoint. Live
configuration readback confirmed one core, 8 GiB RAM, RTX 4090, the warmed
loader, checkpoints enabled, a 60-second idle window, and minimum zero / maximum
one container. A direct preflight after observed zero containers returned the
reference image and mask in 6.431 seconds. Logs confirmed a successful
3.682-second checkpoint restore; no new checkpoint capture was required.

Both APIs were then switched to v11 and their configuration read back:

| Component | Final version |
| --- | --- |
| Beam | `bg-removal` v11, deployment `2459b1e8-8559-4fb2-970c-43b71094bdb7` |
| Beam URL | `https://bg-removal-f6823e6-v11.app.beam.cloud` |
| Cloudflare API | `ba5850d3-c0a1-405f-be0a-4725f49b95b8` |
| Cloud Run compatibility API | `openbgremover-00042-dx4`, 100% traffic |

A fresh public API check waited for natural scale-to-zero while other requests
kept the deployment active. It then returned the reference PNG in **5.239
seconds cold**, followed by **2.064 seconds warm**. Beam round trips were 4.649
and 1.617 seconds; image handlers were 717 and 616 ms. This is a rollout smoke
check, not a new comparative benchmark or a guarantee of future latency.

The full live E2E test passed authentication, key scopes, real image and mask
processing, one-credit charging, invalid-input rejection, refunding a real
worker failure, persisted usage, key revocation, and test-account deletion.
Website upload and compatibility API checks returned the reference image in
3.848 and 3.155 seconds. Strict TypeScript, Oxlint, all thirteen API tests,
the API dry-run build, and Python compilation passed.

Source configuration and generated Worker types now select v11 and one core.
Final-promotion evidence is separate from the earlier trial and rollback under
ignored `artifacts/deployments/cpu-one-final/`.

Final readback at 13:11 UTC confirmed that v11 was the only active Beam
deployment, v10 was stopped, API health returned HTTP 200, and no GPU containers
were running after natural scale-to-zero. The latency-test identity was also
confirmed absent through Supabase admin readback. V10's deployment record and
the shared model cache remain available for rollback. No commit or push was made.
