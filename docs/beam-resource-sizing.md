# Beam resource sizing

Reviewed 14 October 2026. The original review below read production configuration,
hardware availability, and historical metrics. The subsequent
[one-core versus two-core benchmark](beam-cpu-comparison.md) tested its CPU
recommendation with 68 completed image requests, without changing production
during that comparison. An additional
[forty cold requests and a v11 trial](beam-one-core-rollout.md) subsequently
passed the controlled check. The initial rollback relied on too few production
samples collected under different conditions; the final decision is one core
and 8 GiB. Dollar amounts are USD list-price calculations before tax, credits,
or discounts, not an invoice audit.

## Recommendation

Use one CPU core, RTX 4090, and 8 GiB host RAM. Cold-start latency takes priority
over warm throughput. The [controlled cold comparison](beam-one-core-rollout.md)
found no material regression at the predefined margin. The benchmark kept the
model, checkpoint warmup,
60-second idle window, concurrency, and API path equivalent. One core added
62 ms to the median warm static-image handler and 68 ms to the broader Beam
task interval, while reducing the running rate by 23.5%. The modeled reference
task component was 16.9% cheaper. Large/mask, animation, and queue checks also
passed with identical output. See the benchmark for failures and timing limits.

Do not reduce RAM to 6 or 4 GiB: the benchmark measured a process RSS high-water
mark of 6.153 GiB, before accounting for other container processes. The 1.67 GiB
checkpoint archive is compressed saved state, not a measure of the RAM needed
to run inference.

## Baseline deployment and usage before the change

The original live configuration for `bg-removal` v10, deployment
`69afce53-7a54-4af5-8e31-5b99546d1a80`, contains:

- One RTX 4090, 2,000 CPU millicores, and 8,192 MiB host RAM.
- Checkpoints enabled, the warmed model loader, and `keep_warm_seconds=60`.
- Minimum zero and maximum one container, one worker, one concurrent request.

The container API returned zero running containers during this review. Beam's
metrics query at 10:58 UTC returned seven historical one-minute buckets from
10:30 through 10:36 UTC, covering the earlier rollout. It marked its latest
sample stale. That historical `now` field showing one container does not mean
a container was still running at query time.

| Observation | What it establishes |
| --- | --- |
| Highest host-memory bucket: 4,615.7 in `memory_mb`, versus an 8,192 limit | About 4.5 GiB on the configured limit's MiB scale; 4 GiB lacks headroom even for the measured small-image workload |
| Highest GPU-memory bucket: 10,251 in `gpu_memory_mb`, versus 24,564 total | Roughly 10 GiB reported GPU memory; this is not a model-weights-only measurement |
| CPU buckets during setup/requests: about 68%, 89%, and 118% of the configured limit | CPU was busy; the above-limit reading is coarse provider telemetry, not a reliable instantaneous utilization measurement |
| Later CPU buckets: roughly 2% to 15% | Idle time lowers average utilization; it does not establish that fewer cores preserve request latency |

These are bucketed averages, not transient peaks. The rollout primarily used
one 512x512 image, while the model preprocesses to 2048x2048. The application
also accepts much larger images and animations. Decoding, resizing, encoding,
model loading, and retained animation frames use CPU and host RAM.
[Beam resource guidance](https://docs.beam.cloud/v2/environment/resources) and
[metric semantics](https://docs.beam.cloud/v2/operations/observability).

## Current running rate at one core

| Resource | Allocation | USD/hour while running | Share |
| --- | ---: | ---: | ---: |
| RTX 4090 | 1 GPU | $0.6912 | 56.3% |
| GPU-attached CPU | 1 physical core | $0.3780 | 30.8% |
| Host RAM | 8 GiB | $0.1584 | 12.9% |
| Total | | **$1.2276** | 100% |

The calculation uses $0.000192/GPU-second, $0.000105/core-second, and
$0.0000055/GiB-second. Beam describes one billed CPU core as two vCPU equivalents.
GPU-attached CPU/RAM rates are higher than its CPU-only rates; use the former
for this worker. [Current pricing](https://www.beam.cloud/pricing).

## Configuration comparison

Every row keeps the same RTX 4090 and 60-second idle window. Savings assume equal
billable duration, so these are allocation-rate savings rather than measured
cost-per-image savings.

| CPU cores | Host RAM | USD/running hour | 60-second idle tail | Rate reduction | Assessment |
| ---: | ---: | ---: | ---: | ---: | --- |
| 2 | 8 GiB | $1.6056 | $0.02676 | Baseline | Prior v10 configuration; retained rollback record |
| 1 | 8 GiB | $1.2276 | $0.02046 | 23.5% | Selected v11 configuration after controlled tests |
| 1 | 6 GiB | $1.1880 | $0.01980 | 26.0% | Reject: measured process peak exceeds 6 GiB |
| 2 | 4 GiB | $1.5264 | $0.02544 | 4.9% | Reject for now; observed host memory exceeds the limit |

Reducing RAM from 8 to 6 GiB saves only $0.0396 per running hour. Halving CPU
saves $0.3780 per running hour. Avoid trading reliability for the smaller RAM
saving without evidence.

For an illustrative 60 isolated bursts per month, each with five billable
startup/processing seconds and a 60-second idle tail, the two-core allocation
costs $1.74 versus $1.33 at one core and 8 GiB. Those five seconds are an
assumption, not a conversion of observed end-to-end latency into billable time.
At 100 running hours, the respective totals are $160.56 and $122.76. Actual
traffic, errors, deployment preparation, and extra containers change the bill.

With one core and 8 GiB, total occupied time can increase by about 30.8% before
the rate saving disappears. For sparse bursts with a fixed 60-second tail,
that comparison includes the tail; for sustained traffic, processing time and
queueing matter more. Product latency can become unacceptable before the
financial break-even point.

Beam bills application initialization, processing, and the idle window. It
excludes machine provisioning and image pulling. Stopped containers have no
compute charge. Snapshots are included. These estimates cover this Beam worker,
not Supabase, Cloudflare, Vercel, or the legacy Cloud Run service.
[Billing rules](https://docs.beam.cloud/v2/resources/pricing-and-billing).

## GPU alternatives

The RTX 4090 is the cheapest GPU with a published serverless price on the
current pricing page. The other listed rates are RTX 5090 at $0.000303/second
and H100 at $0.000972/second. Their higher rates require a workload-specific
speed advantage to reduce cost. Reducing `memory` changes host RAM, not VRAM.

The live `beam machine list --no-offers --format json` inventory showed 4090
and 5090 as ready, A10G as available, and T4/L4 as unavailable. Inventory can
change. The public price page did not provide an A10G serverless rate, so this
review does not assume it is cheaper. SDK support for a GPU name does not
guarantee current serverless capacity.
[GPU availability](https://docs.beam.cloud/v2/environment/gpu).

The advertised RTX 4090 machine from $0.44/hour includes host CPU/RAM but is a
separate on-demand offering, not the rate for our serverless endpoint. Reserved
machines are billed until released, including idle periods. At the advertised
starting rate, 730 reserved hours would cost $321.20. That does not fit today's
sparse traffic; revisit it for sustained usage using an actual offer.
[Pricing](https://www.beam.cloud/pricing) and
[reservation billing](https://docs.beam.cloud/v2/resources/pricing-and-billing).

## Benchmark and future rollout acceptance

The [completed CPU comparison](beam-cpu-comparison.md) covers the requirements
below. The subsequent [cold validation and rollout](beam-one-core-rollout.md)
records v11's production checks, initial rollback, and final promotion. Future
production changes still need their own checkpoint preparation and E2E verification.

Before promoting a smaller allocation, run a temporary candidate through the
same API path as a contemporaneous two-core control. Capture a fresh checkpoint
for each resource configuration. Separate its preparation from restored cold
requests and confirm zero containers before each cold sample.

Include repeated cold and warm requests, large inputs within the existing
limits, animations, requested masks, and a short queued burst. Record complete
response time, handler time, output correctness, failures, peak host RAM, GPU
allocated/reserved memory, and CPU throttling if available. Preserve the model
and input resolution. Clean up test accounts/deployments and verify scale-down.
Choose using cost per successful workload and latency, not hourly rate alone.

Raw read-only evidence is ignored under
`artifacts/research/beam-sizing-2026-10-14/`: deployment configuration,
container inventory, hardware inventory, and the historical metrics response.
Prior measured production results and rollout instructions are in
[checkpoint-production-rollout.md](checkpoint-production-rollout.md).
