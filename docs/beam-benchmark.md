# Beam latency and cost measurements

Historical measurements from overnight on 13 and 14 October 2026, Europe/Vienna. This experiment used BiRefNet v8 and a 300-second warm window. The later [controlled checkpoint comparison](beam-checkpoint-comparison.md) supersedes the deployment state and recommendation below; the subsequent [production rollout](checkpoint-production-rollout.md) enabled checkpoints and inference warmup with a 60-second window.

## Results

The production API returned a complete PNG in **20.38 and 20.48 seconds from cold**. Ten warm requests had a **4.21-second median**, ranging from 3.35 to 6.46 seconds. The worker's own image-processing code took a median **0.521 seconds** when warm. That includes decoding, preprocessing, inference, and encoding; it excludes application startup and HTTP transport.

| Route / state | Samples | Median | Range |
| --- | ---: | ---: | ---: |
| Production Cloudflare API, cold | 2 | 20.43s | 20.38–20.48s |
| Production Cloudflare API, warm | 10 | 4.21s | 3.35–6.46s |
| Website upload route, warm | 3 | 4.96s | 4.78–5.79s |
| Normal Beam endpoint directly from the laptop, warm control | 3 | 13.33s | 5.25–20.47s |
| Checkpoint endpoint directly from the laptop, after scale-to-zero | 2 | 15.27s | 13.27–17.27s |

The production API's measured Beam round trip was 16.50–18.03 seconds cold and 1.84–2.41 seconds warm. Local upload/download, authentication, database work, and the remaining API path account for the difference from total client time. The API's `processing_time_ms` measures the Beam round trip; `metadata.processing_time_ms` measures the image handler. They are different metrics.

The first production container's logs show about 8.49 seconds between worker boot and entry into `load_model`, then 3.04 seconds inside that loader. Its first image took 1.78 seconds inside the handler; later images took approximately 0.5 seconds. Startup and first-inference setup matter more than steady-state inference here.

## Method

- Same 512×512 public-domain astronaut PNG, 791,555 bytes, returned as a transparent PNG. The model internally resizes input to 2048×2048.
- Same production RTX 4090 allocation: two Beam CPU cores, 8 GiB host RAM, FP16 BiRefNet HR matting. Model revision `5d6b6f8adcb5b417c871b1d84ceaae9871355b7f`.
- Each production cold sample followed a read-only Beam container listing proving zero containers for the deployment. The second waited for the existing 300-second idle policy to expire naturally. No container was forcibly stopped to manufacture a production cold start.
- Each cold request was followed by five sequential authenticated API requests. Beam task records confirm each batch used a single container, and the two batches used different containers.
- A temporary Supabase account and API key exercised real authentication, credit reservation, usage recording, and processing. Account, key, and usage data were removed afterward and auth deletion was verified.
- Timers measured elapsed time through receipt of the complete response body. Website measurements used the deployed multipart upload route, excluding browser image preparation and rendering.
- Some checkpoint requests overlapped the second production batch on a separate deployment. This was a small live-system benchmark, not an isolated saturation or throughput test. Two cold samples do not establish a percentile or SLA.
- These are cold containers with an existing persistent model cache. Empty caches, image pulls, unavailable capacity, larger inputs, animation and simultaneous customers need separate measurements.

## Checkpoint experiment

A separate authenticated endpoint used the same model and image-processing function with `checkpoint_enabled=True`, a 15-second idle window, and at most one container. It made nine successful requests across three containers.

Lifecycle logs confirmed a 1.03 GiB checkpoint was created and two later containers restored it in **2.28s and 1.824s**. The first request during checkpoint creation took 53.57 seconds. The two complete requests after restore took 17.27s and 13.27s. Every checkpoint output matched the normal output byte for byte.

The four warm requests on restored containers took 7.31–24.63 seconds despite approximately 0.55–0.59 seconds in the image handler. The normal endpoint's direct-call control also varied widely, while the Cloudflare and website paths stayed much faster. We cannot attribute that variance to checkpointing or claim a controlled end-to-end improvement. The raw task records show time before handler execution, but do not isolate upload transport, dispatch, or runtime readiness as its cause.

Keep checkpointing off in production until a comparison through the same application network path proves consistent complete-image latency. A fast snapshot restore alone is insufficient. Beam also describes support as runtime/workload-dependent. [Official checkpoint guidance](https://docs.beam.cloud/v2/topics/cold-start).

## Cost model

The current allocation costs **$0.000446 per running second**, or **$1.61/hour**, at published rates: RTX 4090 $0.000192/s, two GPU-attached CPU cores $0.000210/s, and 8 GiB RAM $0.000044/s. CPU and RAM are additional to the GPU. [Beam prices](https://www.beam.cloud/pricing).

Application startup, image processing, and idle keep-warm time are billable. Machine provisioning and pulling the container image are excluded. User-visible latency is therefore not an exact billing timer. The current five-minute idle tail alone costs **$0.1338 per isolated burst**. A one-minute tail costs $0.02676. Requests within the same warm period share it. [Billing rules](https://docs.beam.cloud/v2/resources/pricing-and-billing).

The following scenarios assume isolated uploads, 30 days, 15 billable startup seconds and 2 seconds for the first image. Those last two values are conservative modeling assumptions, not an invoice measurement. They exclude subscriptions, tax and credits. Visitors do not automatically generate image jobs.

| Uploads/day | Current 300s idle window | Proposed 60s window | 30s window |
| --- | ---: | ---: | ---: |
| 1 | $4.24/month | $1.03/month | $0.63/month |
| 2 | $8.48/month | $2.06/month | $1.26/month |
| 5 | $21.21/month | $5.15/month | $3.14/month |
| 10 | $42.41/month | $10.30/month | $6.29/month |

One continuously running serverless container costs about **$1,172/month** for 730 hours. Beam advertises a complete dedicated RTX 4090 machine from $0.44/hour, about **$321/month**, subject to availability and its actual offer. Dedicated capacity becomes worth comparing at approximately 200 serverless running hours/month for this shape. Neither option is justified by the reported sporadic traffic alone. [Published rates](https://www.beam.cloud/pricing).

For the other services, a fresh paid setup with Workers at $5/month, Supabase Pro at $25/month and one Vercel Pro seat at $20/month would start around **$50/month before Beam**. Existing subscriptions and free allowances can make the incremental project cost lower. Account subscription totals were not confirmed. Provider-specific charges and sources are in [the pricing research](beam-pricing-research.md).

The existing Cloud Run compatibility API has one minimum instance set at both service and revision level, with 1 vCPU and 512 MiB. Its idle list-price floor is approximately $9.86/month before shared Google free-tier credits. This configuration was inspected but not changed. Setting both minimums to zero would remove that idle floor, while adding cold starts for remaining compatibility clients.

## Recommendation

1. Keep Beam scale-to-zero. Reduce the idle window from 300 to 60 seconds as the first cost change. It cuts the idle tail by 80%, while uploads more than a minute apart will become cold more often. At the reported sparse traffic, most separated sessions already start cold.
2. Use asynchronous jobs for the planned agent API: return a job ID, expose status/results, and let CLI clients wait or poll. This handles a 20-second first request without pretending it is instant.
3. For interactive web sessions, consider an authenticated, rate-limited warmup when the user starts an editing session. Avoid waking the GPU for every page view. Warmup shifts the delay earlier and remains billable; it does not remove the startup work. [Beam warmup controls](https://docs.beam.cloud/v2/endpoint/keep-warm).
4. Profile Python/application initialization and repeat checkpoint testing through the same proxy path before enabling checkpoints. The experiment proved compatible output and snapshot restore, but not reliable end-to-end speed.
5. Set the old Cloud Run minimum-instance settings to zero once its extra compatibility latency is acceptable. No permanent warm capacity or production tuning was enabled during this task.

## Reproduce and inspect

The repeatable production benchmark is `apps/api/scripts/benchmark.ts`. It uses the existing ignored `.env.deployment` configuration and requires a working authenticated Beam CLI. Run from the repository root:

```sh
BENCHMARK_STUB_ID=e4a999c1-fb3d-4155-a650-51744cf252df \
  node --env-file=.env.deployment apps/api/scripts/benchmark.ts
```

It waits for natural scale-to-zero rather than changing production settings. The temporary experiment definition is `workers/background-removal/benchmark_checkpoint.py`; do not deploy it as the production handler. Stop its deployment after testing.

Raw local artifacts are ignored by Git:

- `artifacts/benchmarks/summary.json`
- `artifacts/benchmarks/baseline/report.json`, `beam-tasks.json`, `beam-logs.jsonl`
- `artifacts/benchmarks/checkpoint/report.json`, `beam-tasks.json`, `beam-logs.jsonl`
- `artifacts/benchmarks/routes/report.json`
- `artifacts/benchmarks/deployments-after.json`

The saved outputs are real PNGs with alpha. The research did not measure general model quality or establish the cause of the earlier organic-traffic decline.
