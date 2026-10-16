# Beam startup and infrastructure costs

Historical analysis. Production now uses checkpoints and a 60-second idle
window. Read the [14 October sizing review](beam-resource-sizing.md) for current
allocation, pricing, resource metrics, and smaller configurations to test.

Researched 2026-10-13. USD list prices, before tax and account-specific credits or discounts. This is a cost model, not an invoice audit. The pricing investigation was read-only. A separate temporary checkpoint deployment was subsequently tested and stopped; see [measured results](beam-benchmark.md). Production configuration was unchanged.

## Findings

At the time of this investigation, the expensive part of sparse traffic was the five-minute paid idle window. The worker cached weights on a persistent volume and loaded the model once per container, with checkpointing disabled. The initial experiment confirmed checkpoint capture, restore and identical output, but did not establish consistently faster complete-image responses. Later controlled tests supported the checkpoint rollout linked above.

The old Cloud Run compatibility API also has one minimum instance configured. It is not currently configured to scale to zero.

## Beam rates and billable time

| Allocated resource | Published rate | Current allocation cost per second |
| --- | ---: | ---: |
| RTX 4090 | $0.000192 / GPU-second | $0.000192 |
| GPU-attached CPU | $0.000105 / core-second | $0.000210 for 2 cores |
| GPU-attached RAM | $0.0000055 / GiB-second | $0.000044 for 8 GiB |
| Total | | **$0.000446/s, about $1.61/hour** |

Developer costs $0/month plus usage; Team costs $89/month plus usage. Developer allows five concurrent GPU containers. Beam includes storage through 1 TB, then charges $0.021/GB-month; snapshots and bandwidth/egress are included. The current pricing page does not promise recurring free compute credits, so none are deducted here. [Beam pricing](https://www.beam.cloud/pricing).

`cpu=2` means two Beam cores: the SDK converts it to 2,000 millicores without halving it. Beam's price page describes its billed core as a physical core, equivalent to two vCPUs. Use two billed cores in this estimate. Host memory is separate from GPU VRAM. [Resource units](https://docs.beam.cloud/v2/environment/resources), [SDK conversion](https://github.com/beam-cloud/beta9/blob/main/sdk/src/beta9/abstractions/base/runner.py).

Billing includes application initialization (`on_start`), inference, and idle `keep_warm_seconds`. Machine provisioning and container image pull are excluded. Therefore user-visible cold latency is not identical to billable startup time. Weight downloads executed by application code are billable. A stopped container has no compute charge; retaining its volume does not keep compute running. [Billing rules](https://docs.beam.cloud/v2/resources/pricing-and-billing).

The 60-second warm window was deployed on 14 October; see the [controlled comparison](beam-checkpoint-comparison.md). The 300-second scenarios below are historical comparisons.

## Calculated scenarios

These are our arithmetic using the rates above, not measured bills. Let `r = $0.000446/s`, `L = billed startup seconds`, `T = occupied processing seconds`, and `I = actual idle seconds across all containers`:

`Beam compute cost = r × (L + T + I)`

Overlapping requests share a warm interval; do not add five minutes to every request when traffic keeps the same container active. Concurrent containers multiply occupied time.

| Scenario | Calculated Beam compute cost |
| --- | ---: |
| 30 seconds of idle warmth after a burst | $0.01338 |
| 60 seconds of idle warmth after a burst | $0.02676 |
| Previous 300 seconds of idle warmth after a burst | **$0.13380** |
| 1,000 images in one continuous burst, assuming 2s/image, one 300s tail | $1.03 plus startup |
| 1,000 isolated images, assuming 2s/image, each with a 300s tail | $134.69 plus 1,000 startups |
| One serverless container kept warm 24/7, 730-hour month | **$1,172.09** |
| One serverless container warm 8h/day, 30 days | $385.34 plus any extra tail/startup |

The 2s processing duration is an illustrative assumption; substitute the measured handler time from the benchmark. HTTP elapsed time includes transport and queueing and should not be blindly multiplied by the GPU rate. Visitors are not uploads, and the reported 80 visitors has no stated time period, so it cannot establish a monthly GPU budget.

Beam advertises a whole RTX 4090 machine from $0.44/hour including CPU/RAM/NVMe: about $321.20 for 730 hours. Compared with this serverless shape, a continuously reserved machine becomes cheaper at roughly 200 serverless running hours/month (27% occupancy), before other differences. Availability, location and exact reservation price require a live offer. [Beam RTX 4090 pricing](https://www.beam.cloud/blog/nvidia-rtx-4090-pricing).

Reserved machines are billed until released, including when apps stop; leases may renew beyond their initial TTL. A reservation's `--max-spend` is not a continuing monthly budget cap. This option needs deliberate lifecycle management. [Compute pools and reservation billing](https://docs.beam.cloud/v2/scaling/pools).

## Startup options

| Option | Current state / next step |
| --- | --- |
| Install Python dependencies in the image | Already configured in `workers/background-removal/app.py`. |
| Persistent model cache | Already mounts `model_cache` and passes it to `from_pretrained`. Verify logs distinguish cache reads from network downloads. |
| Load once | Already uses `on_start=load_model`; a warm request reuses the model. |
| Memory/GPU checkpoint restore | Not enabled. Test `checkpoint_enabled=True` on a separate deployment with the exact production model/runtime. |
| Shorter idle window | Test 30–60s after checkpoint validation; compare cold frequency and actual occupied time. |
| Always-warm minimum | `min_containers=1` buys baseline readiness, at the continuous cost above; excess traffic can still cold-start. |
| Prewarm | Server-side POST to the protected Beam `/warmup` route before a known session. Avoid waking GPUs for every page visitor. |

Beam recommends image dependencies, volume caching and one-time initialization. Its checkpoint flag captures after `on_start`; support depends on runtime and workload, and capture/restore must be checked in lifecycle logs. External connections may need reconnecting after restore. [Cold-start guidance](https://docs.beam.cloud/v2/topics/cold-start), [checkpoint SDK contract](https://docs.beam.cloud/v2/reference/py-sdk#endpoint).

Beam describes GPU checkpointing as restoring the model already loaded into VRAM. That supports an experiment with this CUDA/PyTorch workload, but the reviewed docs do not give a compatibility guarantee for our exact Python 3.12, PyTorch 2.14.1, Gunicorn 26.2.0 and BiRefNet combination. Keep the volume for weights even when testing checkpoints; a persistent filesystem cache and a running-memory snapshot solve different startup steps. Do not promise a sub-second full image response based on platform marketing. [Beam explanation of GPU checkpointing](https://www.beam.cloud/blog/cold-start-serverless-gpu-inference).

The `/warmup` route and `min_containers` are documented for endpoints. Warm time remains billable. A scheduled CPU function could call `/warmup` shortly before known demand; repeated calls throughout the day effectively buy continuous warmth. Beam schedules use UTC, so a Vienna business-hours schedule must account for daylight saving. No schedule was created. [Warm-container controls](https://docs.beam.cloud/v2/endpoint/keep-warm), [scheduled jobs](https://docs.beam.cloud/v2/function/scheduled-job).

For agents, an asynchronous job API with status/retry information can make cold starts tolerable without buying a permanent GPU. This is a product recommendation, not a latency reduction. For interactive uploads, show honest progress based on measured ranges rather than the current unverified 20–30s copy.

## Rest of the stack

| Component | Published baseline and marginal charges |
| --- | --- |
| Cloudflare Workers | Free: 100k requests/day, 10ms CPU/request. Paid: minimum $5/account/month, 10M requests and 30M CPU-ms included; excess $0.30/M requests and $0.02/M CPU-ms. No duration or egress charge. Waiting for Beam does not become GPU-sized Worker compute cost. [Pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Hyperdrive | Included: 100k queries/day on Free; unlimited on Workers Paid. No separate pooling/cache/egress charge. Supabase remains separately billed. [Pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) |
| Supabase | Free: 50k MAU, 500MB database, 5GB egress, 1GB file storage; may pause after inactivity. Pro: $25/month including $10 compute credit, enough for one Micro; 100k MAU, 8GB database, 250GB egress. Beyond allowance: $0.00325/MAU, $0.125/GB database, $0.09/GB uncached egress. Additional Micro projects start around $10/month. [Pricing](https://supabase.com/pricing) |
| Vercel | Pro $20/month per developer seat with $20 included usage credit; existing account plan was not inspected. Commercial service budgeting should use Pro, since Hobby is for personal noncommercial use. [Pricing](https://vercel.com/pricing), [Hobby terms](https://vercel.com/docs/plans/hobby) |

Vercel Fluid functions charge active CPU and memory occupied while requests are in flight. Waiting for Beam pauses CPU billing but not memory. US `iad1`/`cle1` rates are $0.128/CPU-hour and $0.0106/GB-hour; Frankfurt is $0.184 and $0.0152. Invocations are $0.60/M. For illustration, a 2GB function waiting 60s costs $0.000353 in memory at the US rate, before credits, CPU, requests and transfer. Actual function memory, region and billing mode must be checked for an exact figure. [Fluid pricing](https://vercel.com/docs/functions/usage-and-pricing).

Vercel's optional Flat Rate CDN includes 1M CDN requests and 1TB transfer in the lowest Pro tier. Do not assume it is enabled or suitable for a media-delivery-heavy workload: its eligibility excludes certain large-scale media/file distribution. Without it, regional CDN rates apply; the reference page shows $0.15/GB fast transfer, $0.06/GB origin transfer and $2/M CDN requests. [Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn), [transfer pricing](https://vercel.com/docs/manage-cdn-usage).

At low usage, a new account budget with Workers Paid + Supabase Pro + one Vercel Pro seat is roughly **$50/month before Beam**, usage overages, taxes and the compatibility API. This is an example configuration, not the project's confirmed subscription total. Shared existing subscriptions can reduce incremental cost.

## Cloud Run compatibility API

Read-only `gcloud run services describe openbgremover --project gen-lang-client-0136445627 --region europe-west4` inspection found:

- Service minimum instances: 1 (`run.googleapis.com/minScale`).
- Revision minimum instances: 1 (`autoscaling.knative.dev/minScale`).
- Allocation: 1 vCPU, 512MiB; maximum 10 instances; concurrency 80.
- No CPU-throttling override, so request-based billing is inferred from the documented default.

Netherlands is Tier 1. Request-billed rates are $0.000024/vCPU-second active, $0.0000025/vCPU-second for idle minimum instances, $0.0000025/GiB-second memory, and $0.40/M requests. Monthly free allowances are 180k vCPU-seconds, 360k GiB-seconds and 2M requests, shared according to Google billing rules. Before those credits, one idle 1vCPU/0.5GiB minimum instance costs approximately **$9.86/month at 730h**. Active processing, outbound traffic, image registry storage and logs can add cost. [Cloud Run pricing](https://cloud.google.com/run/pricing), [billing default](https://docs.cloud.google.com/run/docs/configuring/billing-settings).

Recommendation: set both minimum-instance settings to zero if the remaining compatibility clients can accept an extra startup delay. No Cloud Run setting was changed here.

## Decision

Preserve scale-to-zero on Beam and choose the idle window from observed request spacing. Use the [benchmark results](beam-benchmark.md) to distinguish tested behavior from the options described above. Do not enable a permanent serverless GPU for the current sparse traffic. If sustained demand later justifies an always-ready GPU, compare a dedicated Beam pool with the serverless occupancy cost before buying continuous serverless warmth. Check provider billing dashboards before turning these estimates into product margins.
