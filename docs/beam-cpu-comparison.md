# Beam CPU comparison

Measured 14 October 2026. The candidate has one Beam CPU core and 8 GiB host
RAM; the control matches the previous production allocation of two cores and
8 GiB. Both use an RTX 4090,
the same warmed checkpoint loader, and a 60-second idle window.

The later [cold-only validation and v11 trial](beam-one-core-rollout.md)
added twenty cold requests per configuration and passed the controlled check.
The initial production rollback over-weighted three responses collected under
different conditions. The final decision accepts one core. This page preserves
the earlier comparison and its cleanup state.

**Use one core and 8 GiB.** The measured processing slowdown is smaller than
the price reduction, and the subsequent controlled comparison supports the
user's cold-latency requirement. See the linked production decision and rollout.
Production was not switched during this original comparison.

## Repeated static-image results

Six cold starts per configuration, each followed by three sequential warm
requests. Every cold request followed an observed zero-container state. These
are medians of successful requests, with failures accounted for below.

| Measurement | 2 cores / 8 GiB | 1 core / 8 GiB |
| --- | ---: | ---: |
| Cold complete image response, n=6 | 5.879 s | 5.155 s |
| Cold response range | 4.997–6.223 s | 4.700–5.906 s |
| Warm complete image response, n=18 | 2.247 s | 2.156 s |
| Warm response range | 1.879–9.564 s | 1.961–3.024 s |
| Cold API execution | 5.602 s | 4.891 s |
| Warm API execution | 1.941 s | 1.953 s |
| Cold image handler | 626.5 ms | 718.5 ms |
| Warm image handler | 546 ms | 608 ms |
| Warm Beam task, execution start to completion | 778.5 ms | 846.4 ms |

The repeatable CPU-sensitive difference is about **62 ms / 11.4% more warm
image-processing time** on one core. API execution is nearly unchanged at the
median. The lower one-core cold response median does not establish that fewer
cores make startup faster: these use separate deployments and physical hosts
were not pinned. Restore, dispatch, and network variability affect the result.

The two-core warm response outlier of 9.564 seconds is retained. Its API timer
was only about two seconds. The local Mac later showed a load average above
200, and some later large/animation responses had substantial delay outside
the API timer. Client response times are recorded faithfully, but are weak
evidence for attributing small differences to CPU allocation. Handler timings
come from the worker's monotonic clock; API timings come from Cloudflare.

## Other workloads and correctness

Each large/animation row has one cold and two sequential warm requests per
configuration. Timings below are warm medians; the queue row is one burst of
three simultaneous requests, measured until all three responses finish.

| Workload / timing | 2 cores | 1 core |
| --- | ---: | ---: |
| 4K input → 2K output plus mask: handler | 2.236 s | 2.365 s |
| Same workload: API execution | 11.078 s | 8.898 s |
| Same workload: complete response | 17.421 s | 22.082 s |
| Eight-frame animation: handler | 3.681 s | 4.283 s |
| Same animation: API execution | 5.846 s | 6.489 s |
| Same animation: complete response | 11.552 s | 14.685 s |
| Three-request warm queue: entire burst | 6.283 s | 5.153 s |

The warm handler slowdown is 5.8% for the large/mask fixture and 16.4% for the
animation. Both remain below the 30.8% financial break-even increase. The queue
checks passed without losing requests; one burst cannot establish throughput
or show that one core queues faster. Large-image response/transfer variability
also prevents interpreting its API or client difference as a CPU effect.

The additional cold complete-response checks were 13.797 / 11.487 seconds for
large images, 9.108 / 20.608 seconds for animation, and 5.737 / 5.272 seconds
before queueing, in two-core / one-core order. The one-core cold animation spent
8.962 seconds inside the API and 4.314 seconds inside the image handler; most
of its 20.608-second client duration was outside those timers.

All **68 requests in the completed 18 batches** returned HTTP 200 and identical
output hashes between CPU configurations. This comprises 48 reference images,
six large images with masks, six animations, and eight queue-test images.
There were nine naturally cold containers per configuration in these batches.
Beam task records matched every batch's container and expected request count,
and all 68 tasks were complete.

Reference and queue output is the same 499,201-byte, 512×512 RGBA PNG as the
production checkpoint verification. Large output is a 2,969,056-byte, 2048×2048
RGBA PNG with a matching grayscale mask. Both RGBA fixtures retain alpha
extrema 0–255. Animated output is a 490,558-byte, 512×512 GIF with all eight
frames. Equality establishes that CPU sizing did not change these outputs;
it is not an independent model-quality evaluation.

## Memory and CPU observations

The highest process RSS was **6.153 GiB** on one core and **6.152 GiB** on two
cores. These process-lifetime high-water readings include checkpoint
initialization, not just the current request. They do not measure the whole
container's memory, so they are a lower bound on its required host memory.
**Keep 8 GiB; 6 GiB would already be below the measured process peak.**

Peak PyTorch GPU allocation was 5.006 GiB and reservation was 9.547 GiB on both
configurations. Those allocator figures exclude other CUDA/runtime allocations
and do not justify selecting a GPU by model-weight size alone. Restored PyTorch
thread counts were one and two respectively. The cgroup CPU/memory counter
files were unavailable, so this experiment did not measure CPU throttling or a
whole-container instantaneous memory peak.

## Cost model

At the published GPU-attached rates, total allocation costs are:

| Component | 2 cores / 8 GiB | 1 core / 8 GiB |
| --- | ---: | ---: |
| RTX 4090 per second | $0.000192 | $0.000192 |
| CPU per second | $0.000210 | $0.000105 |
| RAM per second | $0.000044 | $0.000044 |
| Total per running second | **$0.000446** | **$0.000341** |
| Total per running hour | **$1.6056** | **$1.2276** |
| Configured 60-second idle tail | **$0.02676** | **$0.02046** |

This is a **23.5% reduction in the running rate**. Multiplying the measured
warm reference Beam task medians by the rates gives $0.000347 versus $0.000289
per successful task: **16.9% less despite 8.7% longer task execution**. The
handler-only calculation gives 14.9% less. For animation, the wider task interval
was 3.908 versus 4.727 seconds; its modeled task component was still 7.5% less.

One reference task plus a 60-second idle tail models $0.02711 versus $0.02075,
about 23.5% less. This component calculation excludes initialization, restore,
other occupied time, and shutdown delay. Beam task timestamps cover more than
the image handler but are not billing records. These are not complete invoices
or measured per-request charges; full client response time was not multiplied
by the compute rate to invent a bill.

For sparse traffic, the paid idle tail dominates these components. At 60
isolated bursts per month, the idle component alone falls from $1.6056 to
$1.2276: **about $0.38/month saved**. At 100 running hours, the allocation-rate
difference is $37.80 before any change in duration. Those are scenarios, not
claims about current traffic or monthly spend.

One core can take about 30.8% longer in total billable duration before its rate
advantage disappears. Beam bills initialization, application work, and warm
idle time; provisioning and container-image pulls are excluded. Actual billing
boundaries were not audited. Sources checked 14 October 2026:
[Beam pricing](https://www.beam.cloud/pricing) and
[billing rules](https://docs.beam.cloud/v2/resources/pricing-and-billing).

## Failures and limits

The successful-request medians do not include these separately retained
failures. No failed request was silently treated as a successful sample:

- One two-core reference request returned HTTP 502 after 128.537 seconds,
  although its Beam handler finished successfully in 636 ms. The old runner did
  not capture its response body, so the exact API/transport failure is unresolved.
  It is an additional failed control attempt, not evidence of one-core failure.
- Two attempts to return an unrestricted 4096×4096 image plus mask failed with
  HTTP 502, about 37.6 seconds each, on the two-core API. A direct Beam call
  succeeded with an 11,711,149-byte PNG. Its base64 image was 15,614,868
  characters, above the API's 14 MiB base64 validation ceiling. The complete
  15,977,936-byte worker response was below the separate 16 MiB response cap.
  `apps/api/src/media.ts` reuses the input-image size check for output, so it
  rejects this valid result. This is an existing API output-limit issue,
  independent of the CPU allocation. The comparable large-image test therefore
  explicitly requests a 2048×2048 output from the same 4096×4096 input. The
  production limit has not been changed by this experiment.
- Early temporary-API setup produced two key-creation 404s, one response without
  the expected endpoint header, and one response identifying the other endpoint
  after an API config switch. These failed setup/identity checks were rejected.
  An earlier successful four-image shared-API batch was also kept separate.
  The final comparison uses two fixed APIs and checks endpoint identity on every
  image request. URLs have a unique query parameter to avoid stale routing.
- Beam CLI status checks timed out/disconnected during a one-core large-image
  batch and a two-core queue setup. The former had already returned the correct
  cold image; the latter sent no image. Both accounts were cleaned up and their
  partial reports retained. A subsequent REST adapter initially rejected numeric
  timestamps after a successful two-core cold request; its adapter was corrected
  before rerunning the queue batch. A health-check timeout during resume also
  occurred before creating an account or sending an image.

The final queue batches use Beam's REST container inventory, with Unix timestamps
converted to the runner's CLI-shaped schema. Both mechanisms identify the same
deployment stub and require an actual empty container list before a cold request.
The main repeated comparison uses the original CLI inventory throughout.

Six cold starts and eighteen warm reference requests per allocation are enough
for this sizing decision, not for a p95/p99 latency or availability guarantee.
Large images, animation, and queueing are small functional checks with one cold
start per allocation, not a representative workload distribution. The API 502
and oversized-output issue need separate investigation before reliability claims.

## Cleanup and validation

Both test deployments scaled naturally to zero before being stopped. The
one-core deployment `6db974ab-52aa-44db-bb09-470ae6578ea9` and two-core deployment
`1b52c2f6-05ee-41b1-a329-278d2990482a` are stopped. All three temporary Cloudflare
Workers were deleted: `openbg-api-cpu-benchmark`, `openbg-cpu-one-1014`, and
`openbg-cpu-two-1014`. All 29 test identities, including setup and partial-run
accounts, were rechecked and returned auth HTTP 404.

Final readback at 12:00 UTC showed only production `bg-removal` v10 active,
still at two cores, 8 GiB, checkpoints enabled, and a 60-second idle window.
No GPU containers were running, and the production API health endpoint returned
HTTP 200. Production API routes and the shared model-cache volume were unchanged.

Strict TypeScript, Oxlint with the anti-slop rules, all 13 API tests, the five
Python image-pipeline tests, Python compilation, the API dry-run build, and
`git diff --check` passed. The test-only runner now supports masks, animation
validation, bounded output resizing, simultaneous requests, endpoint identity
checks, and recorded HTTP failure bodies. No production resource or output-limit
change is included in the source patch.

## Method and reproducibility

- The control is a temporary clone of production v10, not production traffic.
  The candidate changes CPU from 2,000 to 1,000 millicores. Both have 8,192 MiB
  RAM, one RTX 4090, minimum zero / maximum one container, one worker, and one
  concurrent task. Live configuration confirmed the same dependency image
  `7f6893b407e3776c` and `app:load_warmed_model` loader.
- Both import the production image handler. The pinned model is
  `ZhengPeng7/BiRefNet_HR-matting`, revision
  `5d6b6f8adcb5b417c871b1d84ceaae9871355b7f`, using FP16 and 2048×2048 model
  input. There is no quality/resolution shortcut in the CPU candidate.
- Each deployment prepared its own 1.67 GiB checkpoint before timing restores.
  Direct preparation plus its first image took 37.826 seconds on one core and
  51.029 seconds on two cores, excluded from the restore comparison. Those
  single preparation observations include variable checkpoint upload time.
- Separate fixed temporary Cloudflare Workers call the real API handler with
  the same Supabase authentication, Hyperdrive, credit reservation, processing,
  and usage path. A test-only wrapper adds endpoint identity and timing headers.
  Every result must identify the intended Beam endpoint.
- Reference rounds alternate order: two/one, one/two, repeated three times.
  Each round starts from natural scale-to-zero and has one cold plus three warm
  requests. Containers were not forcibly stopped to create cold samples.
- The reference is a 791,555-byte, 512×512 astronaut PNG. The large fixture is
  a 1,344,591-byte, 4096×4096 JPEG with output explicitly resized to 2048×2048
  and a requested mask. Animation uses an eight-frame 512×512 GIF. The queue
  test sends three reference requests concurrently to each single-task worker.
- The runner times the entire response body and validates schemas, device,
  model, format, PNG/GIF signatures, and requested masks. Post-analysis checks
  dimensions, frame count, alpha, and output/mask hashes across configurations.
  These fixtures test functionality and resource behavior, not general model
  quality or sustained-load reliability.

Deploy `benchmark_cpu.py:one_core` and `benchmark_cpu.py:two_cores` from
`workers/background-removal` with the project's Beam CLI. Initialize their
checkpoints directly, then create two temporary Wrangler configs using
`apps/api/scripts/benchmark-worker.ts`, distinct Worker names/rate-limit
namespaces, and fixed `BEAM_ENDPOINT_URL` values. Do not switch one API back
and forth between variants during measurement.

Run each batch from the repository root:

```sh
E2E_API_URL=https://YOUR-TEMPORARY-API.workers.dev \
E2E_IMAGE_PATH=artifacts/e2e/input.png \
BENCHMARK_STUB_ID=YOUR-TEST-STUB \
BENCHMARK_ENDPOINT_URL=https://YOUR-TEST-VERSION.app.beam.cloud \
BENCHMARK_OUTPUT=artifacts/benchmarks/your-cpu-variant \
BENCHMARK_CYCLES=1 BENCHMARK_WARM_REQUESTS=3 \
  node --env-file=.env.deployment apps/api/scripts/benchmark.ts
```

Use `BENCHMARK_RETURN_MASK=true BENCHMARK_MAX_DIMENSION=2048` for the large
fixture and `BENCHMARK_CONCURRENCY=3 BENCHMARK_WARM_REQUESTS=1` for the queued
burst. The runner removes its temporary account and verifies auth deletion.
Stop test Beam deployments and delete temporary APIs after collecting evidence.

Ignored raw evidence is in `artifacts/benchmarks/cpu-sizing/`: per-batch reports
and images, failed/preliminary attempts, initialization logs, selected live
configuration, task records, resource logs, analysis, and cleanup records.
