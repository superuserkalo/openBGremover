# Where CPU work runs: Beam tiers and Cloudflare Containers

Measured on November 15, 2026 for [#19](https://github.com/superuserkalo/openBGremover/issues/19) and [#26](https://github.com/superuserkalo/openBGremover/issues/26). Everything ran as one-off Beam functions (`beam-client` 0.2.240) and one temporary Cloudflare Worker with containers. Both were removed afterwards and the removal was checked. Nothing here is built into the product yet.

## Problem

Three questions were open:

1. What does CPU work cost on Beam? The #19 costs used the wrong rate.
2. Would moving CPU work to Cloudflare Containers save money?
3. Can a small image job come back in under one second, including a cold start?

## Decision

1. **Heavy CPU work stays on Beam,** with the CPU tier set explicitly on every worker.
   - **Shared** is the default tier.
   - **Spot** is for work that is safe to retry: pieces of a split video and batch items.
   - **Performance** is for jobs where moving the file takes longer than the work, such as today's image endpoint. Its processors are slower and it costs 4.5 times as much per vCPU, but its network was about five times faster.
2. **Today's image worker stays on its current tier.** A Shared-tier copy was slower end to end, cold and warm.
3. **Small and interactive jobs run on Cloudflare Containers:** small images, `inspect`, dry runs and previews. Each job gets a fresh container that is destroyed afterwards.
4. **Cloudflare Containers is also the overflow** when Beam's 30 concurrent vCPUs are in use, and the fallback when Beam is down. It costs more per minute of work, so it is not the first choice for long jobs.
5. **No image work inside the API Worker.** WebAssembly codecs fail above about 4 megapixels.
6. **GPU work stays on Beam.** Cloudflare Containers has no GPU.
7. **Video defaults:** x264 `medium` for H.264 and SVT-AV1 preset 8 for AV1.

Moving off Beam would not save money. For the same encode, Cloudflare Containers cost 8 times as much as Beam Shared and 22 times as much as Beam Spot.

## Prices used

Read from the providers' pricing pages on November 15, 2026.

| | Per vCPU-hour | Per GiB-hour of memory | Notes |
| --- | --- | --- | --- |
| Beam Performance | $0.05 | $0.01 | Default for new accounts |
| Beam Shared | $0.011 | $0.0055 | At most 8 vCPU and 16 GiB per workload |
| Beam Spot | $0.0063 | $0.00135 | Can be interrupted with 30 s notice; interrupted functions are retried within their retry limit |
| Beam CPU attached to a GPU | $0.18972 | $0.0198 | The rate #19 used by mistake |
| Cloudflare Containers | $0.072 | $0.009 | CPU billed only while in use; memory and disk ($0.00025 per GB-hour) billed while the instance is awake |

- Beam bills per millisecond. Keep-warm time is billed. Waiting for a machine and pulling the image are not.
- Beam's Developer plan allows 30 vCPUs and 5 GPUs at once. Cloudflare allows 15,000 vCPUs at once, with at most 4 vCPU and 12 GiB per instance.
- Choosing a tier needs `beam-client` 0.2.236 or newer and the parameter `cpu_tier="shared"`, `"spot"` or `"performance"`.
- The account's own default tier is not confirmed. Beam's docs say an existing account keeps "its default" without naming it. Setting the tier explicitly makes the rate certain, so this no longer blocks anything.

## Evidence

### What one Beam `cpu` unit is

`cpu=1` gives the work of one vCPU. A hashing test with 1, 2, 4 and 8 processes stayed flat on a one-`cpu` container (1,566 to 1,612 MB/s) and rose with the vCPU count on larger ones (about 3,000 MB/s on two, 5,400 to 6,300 MB/s on four Performance vCPUs). The #19 costs were therefore 3.8 times too high, not 7.6 times.

### Encode speed on the same FFmpeg binary

Setup: 4 vCPU; 8 GiB on Beam and 12 GiB on Cloudflare (`standard-4`). The same static FFmpeg build ran on every host (SHA-256 `0ce90f5f…a2a6e5`). Input was a 10-second 1080p30 H.264 clip (Big Buck Bunny, 300 frames), with 4 threads. Each cell is the faster of 2 runs, in frames per second.

| Host | x264 medium | x264 veryfast | SVT-AV1 preset 8 | SVT-AV1 preset 10 |
| --- | --- | --- | --- | --- |
| Beam Performance | 36.1 | 77.7 | 45.6 | 70.7 |
| Beam Shared | 54.3 | 114.7 | 63.6 | 104.3 |
| Beam Spot | 60.5 | 125.1 | 70.0 | 112.7 |
| Cloudflare `standard-4` | 30.1 | 73.8 | 38.3 | 64.3 |

Cost of one minute of this 1080p30 video at x264 medium:

| Host | Seconds of compute | Cost |
| --- | --- | --- |
| Beam Spot | 29.8 | $0.0003 |
| Beam Shared | 33.1 | $0.0008 |
| Beam Performance | 49.9 | $0.0039 |
| Cloudflare `standard-4` | 59.8 | $0.0067 |

### Beam tiers, repeated

Setup: the Ubuntu package of FFmpeg (4.4), x264 medium, the same clip, threads equal to vCPUs. Figures are frames per second.

| Size and tier | Runs | Lowest | Median | Highest |
| --- | --- | --- | --- | --- |
| 4 vCPU Performance | 4 | 21.5 | 23.1 | 25.3 |
| 4 vCPU Shared | 4 | 42.1 | 44.3 | 44.7 |
| 4 vCPU Spot | 4 | 41.1 | 42.8 | 44.5 |
| 4 vCPU account default | 1 | 19.7 | | |
| 8 vCPU Performance | 1 | 38.8 | | |
| 8 vCPU Shared | 3 | 77.9 | 81.8 | 81.9 |
| 8 vCPU Spot | 1 | 82.0 | | |

- x264 scaled in step with vCPUs from 4 to 8 on Shared.
- No Spot run was interrupted. There were 7 runs, each under two minutes, so this says nothing about how often interruptions happen.

### Why the dearer tier is slower

The tiers run on different processors. A second round on the same day read each container's processor details and timed it alone and with five others. Setup: 4 vCPU, 8 GiB, the static FFmpeg build, the same clip, 3 containers per tier alone and 6 at once, 3 passes in each container.

| | Performance | Shared | Spot |
| --- | --- | --- | --- |
| Processor | Intel Xeon, family 6 model 207 (a 2023 server chip) | AMD, model 68, reported at 5.4 to 5.8 GHz | Same as Shared |
| Logical CPUs on the host | 64 | 32 | 32 |
| Reported clock speed | 3.0 to 3.6 GHz | 5.4 to 5.8 GHz | 4.9 to 5.8 GHz |
| x264 on one thread, alone | 12.5 fps | 21.5 fps | 21.5 fps |
| x264 on four threads, alone | 24.6 fps (21.6 to 26.1) | 45.1 fps (43.4 to 45.3) | 45.2 fps (44.9 to 45.7) |
| x264 on four threads, six containers at once | 22.2 fps (17.1 to 24.1) | 31.9 fps (27.4 to 41.2) | 32.2 fps (26.9 to 39.5) |
| SVT-AV1 preset 8, alone | 44.3 fps | 71.7 fps | 71.3 fps |
| SVT-AV1 preset 8, six at once | 39.6 fps | 46.9 fps | 50.4 fps |
| Memory copy, alone | 1.6 GB/s | 3.4 GB/s | 3.4 GB/s |

Figures are medians, with the range in brackets.

- **Shared and Spot sit on much faster cores.** Each thread did 1.7 times the work of a Performance thread. gVisor hides the processor's name. The model number, the 32 logical CPUs and the clock speed fit a 16-core desktop-class AMD chip; that last step is an inference.
- **What Performance buys is a steady share, not speed.** Its vCPUs are not shared with other workloads. With six of our containers running at once it lost about 10%. Shared and Spot lost about 30%, and the slowest pass lost about 40%.
- **Shared still won under load.** At its slowest it encoded 27 fps against Performance's median of 22, at under a third of the hourly price.
- **Six containers is our own load.** Other customers' load on the same hosts was not controlled and could push Shared lower than this.
- **Performance also varied between runs.** The same binary encoded at 36 fps in the first round and 22 to 26 fps in this one.

Plan capacity with the loaded figures: a split video's pieces run about 30% slower than one piece alone.

**The network differs too.** Every benchmark container downloaded the same 30 MB clip:

| Tier | Containers | Download time |
| --- | --- | --- |
| Performance and account default | 9 | 0.16 to 0.97 s, median 0.33 s |
| Shared | 9 | 1.2 to 2.0 s, median 1.53 s |
| Spot | 7 | 1.2 to 1.7 s, median 1.38 s |

That is about 20 MB per second on Shared and Spot. A 2 GB video would take around 100 seconds to arrive, which is small beside its encode but large for an image.

### The production image worker on Shared

The owner approved moving the image worker to Shared if a controlled comparison held up. It did not, so production stays on v3.

Setup: `image-processing` v3 (current, account default tier) against v4 (the same code and image with `cpu_tier="shared"`, deployed with `beam-client` 0.2.240). Both have 1 vCPU, 8 GiB and a 60-second idle window. Each cold sample followed two observations of zero running containers. The order alternated each cycle. The timed span is the whole response as the API sees it: the worker call plus the result download. Requests came from a laptop, not from the API. Six cycles, 84 requests, no failures.

| Request | v3, current | v4, Shared |
| --- | --- | --- |
| Cold, 12 MP JPEG compress (6 each) | 6.9 s median (5.2 to 14.8) | 10.6 s median (5.9 to 13.3) |
| Warm, 12 MP JPEG compress (18 each) | 4.2 s median (3.9 to 6.1) | 4.9 s median (4.6 to 12.2) |
| Warm, 4 MP JPEG to WebP (18 each) | 2.9 s median (2.3 to 5.7) | 3.1 s median (2.6 to 6.7) |

- Outputs were byte-identical between the two versions for both requests.
- The image work itself takes a few tenths of a second. The rest is the 6.4 MB upload, saving the result and downloading it, and that is where Shared's slower network costs more than its faster processor saves.
- v4 is stopped and its record kept (deployment `ce99e383-78b4-4570-a03f-831305cb617d`). v3 stayed active throughout and no API setting changed.
- Raw results are in the ignored `artifacts/deployments/shared-tier-2026-11-15/`.

The warm figures also show that today's image path spends most of its time moving the file through base64 and Beam's file output. Direct uploads to R2 (#6) and the Cloudflare Containers path remove most of that.

### Presets: size, quality and speed

Setup: Beam Shared, 4 vCPU, 8 GiB, the static FFmpeg build above. Each clip was cut to 10 seconds and encoded from a lossless copy. Quality is VMAF against that copy, sampled every fifth frame. One run per cell.

Speed in frames per second:

| Clip | x264 medium | x264 veryfast | SVT-AV1 preset 6 | preset 8 | preset 10 |
| --- | --- | --- | --- | --- | --- |
| Action, 1080p50 | 32 | 82 | 32 | 45 | 71 |
| Game, 1080p60 | 138 | 250 | 74 | 109 | 190 |
| Phone, 1080p30 | 54 | 94 | 43 | 62 | 101 |

(x264 at CRF 23; SVT-AV1 at CRF 35.)

What the faster presets cost in file size at about the same quality:

| Comparison | Action | Game | Phone |
| --- | --- | --- | --- |
| x264 veryfast (CRF 20) against medium (CRF 23) | 34.2 MB against 26.1 MB, VMAF 96.6 and 96.7 | 3.61 MB against 3.32 MB, VMAF 93.2 and 94.5 | 6.44 MB against 4.82 MB, VMAF 96.2 and 96.2 |
| SVT-AV1 preset 8 against preset 6 (CRF 35) | 34.6 MB against 32.7 MB, VMAF 98.2 and 98.4 | 3.58 MB against 3.50 MB, VMAF 96.1 and 96.3 | 2.61 MB against 2.25 MB, VMAF 94.6 and 95.5 |
| SVT-AV1 preset 10 against preset 6 (CRF 35) | 39.6 MB against 32.7 MB, VMAF 97.5 and 98.4 | 3.63 MB against 3.50 MB, VMAF 95.2 and 96.3 | 2.59 MB against 2.25 MB, VMAF 92.1 and 95.5 |

- **x264 veryfast** needs about 30% more bytes for the same quality and runs 1.7 to 2.6 times faster.
- **x264 fast** matched medium on size and quality within about 10% and was at most 12% faster, so it is not worth offering as a default.
- **SVT-AV1 preset 8** costs 2 to 16% more bytes than preset 6 and runs about 1.4 times faster.
- **SVT-AV1 preset 10** costs up to 21% more bytes and up to 3.4 VMAF points, and runs 2.2 to 2.6 times faster than preset 6.

Cost per minute of source video on Beam Shared at the chosen defaults (4 vCPU, 8 GiB, $0.088 per hour):

| Clip | H.264, x264 medium | AV1, SVT-AV1 preset 8 |
| --- | --- | --- |
| Action, 1080p50 | $0.0023 | $0.0016 |
| Game, 1080p60 | $0.0006 | $0.0008 |
| Phone, 1080p30 | $0.0008 | $0.0007 |

The #19 estimate for HD was $0.023 to $0.031 per minute.

**4K.** The 4K phone clip (3840 × 2160, 50 frames per second, 250 frames) ran out of memory in this test at 8 GiB. The test holds a lossless 4K copy and runs VMAF alongside the encoder, so this does not show that a 4K encode alone needs more. It finished at 16 GiB, 4 vCPU, Shared:

| Encoder and setting | Speed | Size | VMAF |
| --- | --- | --- | --- |
| x264 medium, CRF 23 | 16.6 fps | 9.49 MB | 88.8 |
| x264 veryfast, CRF 20 | 26.7 fps | 15.33 MB | 87.5 |
| SVT-AV1 preset 8, CRF 35 | 22.9 fps | 6.67 MB | 89.0 |
| SVT-AV1 preset 10, CRF 35 | 30.1 fps | 5.22 MB | 87.1 |

- At the same quality, AV1 at preset 8 was 30% smaller than H.264 at medium on this clip.
- At $0.132 per hour (4 vCPU, 16 GiB, Shared), one minute of 4K at 50 frames per second costs $0.0066 as H.264 and $0.0048 as AV1. At 30 frames per second that is $0.0040 and $0.0029. The #19 estimate for 4K was $0.15 to $0.21.

### Small image jobs

Pillow 12.0.0 on one thread, a 12-megapixel noise JPEG (7.6 MB), median of 5 runs, in milliseconds:

| Host | Decode | To 2048 px WebP | Recompress JPEG | To 1024 px JPEG |
| --- | --- | --- | --- | --- |
| Beam Performance, 1 vCPU | 99 | 524 | 282 | 89 |
| Beam Shared, 1 vCPU | 57 | 355 | 170 | 55 |
| Cloudflare `standard-4` | 106 | 626 | 291 | 109 |

A whole job on Cloudflare Containers. Setup: `standard-2` (1 vCPU, 6 GiB), started from a 328 MB snapshot holding Python, Pillow, FFmpeg, libvips and bubblewrap. The job starts a new Python process, opens a real 12-megapixel photo (4.8 MB) and writes a 1024 px JPEG. Times are measured inside the Worker.

| Measurement | Runs | Result |
| --- | --- | --- |
| Cold start to first command, Cloudflare's own Debian image | 12 | 48 to 153 ms |
| Cold start to first command, our snapshot, first 16 starts | 16 | 11 took 90 to 174 ms; 5 took 3.8 to 6.5 s |
| Cold start to first command, our snapshot, next 14 starts | 14 | 97 to 175 ms |
| Cold start plus the job inside the sandbox wall | 8 | 421 to 497 ms |
| Warm job, no wall | 4 | 214 to 237 ms |
| Warm job inside the wall | 5 | 233 to 254 ms |

- From a laptop the cold job took 729 to 864 ms in total, including a new TLS connection each time.
- All five slow starts came soon after the snapshot was made. Two of them were the only starts on the smaller `standard-1` size. Later starts were all fast.
- The comparable Beam figure for the CPU image worker was not measured here. The GPU worker's recorded cold response is 4.6 s (one sample, `docs/libvips-and-cutout-rollout-2026-10-19.md`).

### Image work inside the API Worker

WebAssembly builds of MozJPEG, libwebp and a resizer (jSquash) ran inside a Worker.

| Input | Result |
| --- | --- |
| 4 MP JPEG to 1024 px WebP or JPEG | Worked; 0.65 to 1.2 s longer than a request that only reads the upload (7 runs) |
| 12 MP JPEG, any output | Failed 3 of 3: the Worker exceeded its memory limit (error 1102) |
| 16.8 MP JPEG | Failed 2 of 2: one memory-limit error, one WebAssembly trap |

A container did the larger 12 MP job in under 0.5 s from cold, so the Worker path is dropped.

### The sandbox wall on both hosts

| Check | Beam (gVisor) | Cloudflare Containers (its own small VM per instance) |
| --- | --- | --- |
| `unshare -rn` plus bubblewrap: only `/usr`, `/etc` and the job folder visible, no network | Works | Works |
| Wall start-up, median of 9 | 24 ms | 7 ms |
| FFmpeg encode inside the wall | Works | Works |
| A system-call filter set by the process (socket creation blocked) | Enforced | Enforced |
| Network namespace without a user namespace | Refused | Works |

On Cloudflare every process in the container has root's capabilities, whatever user it runs as. The wall and a fresh container per job are what separate jobs there, not Linux users.

### 500-megapixel images

Setup: Beam, account default tier, 2 vCPU, 8 GiB, the libvips 8.12.1 command-line tool, a 25,000 × 20,000 noise JPEG (242 MB). One run each.

| Operation | Time | Peak memory |
| --- | --- | --- |
| Shrink to 4096 px WebP | 5.7 s | 1.3 GiB |
| Recompress as JPEG, read in strips | 9.5 s | 2.6 GiB |
| Halve the size, read in strips | 8.0 s | 2.0 GiB |
| Rotate 90°, which cannot be read in strips | 33.9 s | 1.2 GiB |

All four finished inside 8 GiB, so the 500-megapixel target in #6 is feasible for these operations.

## Not measured, and failures

- **A Cloudflare image built from a Dockerfile.** Docker would not start on the test machine, so a snapshot of a prepared container stood in for it. Snapshots and the scheduling mode used are in public beta, and snapshot pricing is not announced.
- **Two containers stopped without a known cause.** Both stopped while the Worker carried the WebAssembly test: one around its deploy and one while requests were exceeding the memory limit. A later container survived a redeploy, a background job, and five minutes with no requests. Long jobs should not depend on a Cloudflare container until this is understood.
- **Cloudflare with internet access off.** Every container here had it on.
- **Spot interruptions,** their rate and the retry behaviour.
- **Shared-tier slowdowns caused by other customers.** Our own six containers slowed each other by about 30%. Load from others was not controlled.
- **Reading and writing R2** from each Beam tier and from Cloudflare. Shared and Spot downloaded a public file at about 20 MB per second; their speed to R2 is unknown.

## Revisit when

- Spot interrupts often enough that retried pieces cost more than Shared.
- Shared runs noticeably slower at busy times.
- Beam changes tier prices. A deployment keeps the prices from its first run; a new deployment takes current prices.
- Cloudflare Containers gains GPUs or larger instances, or its CPU price falls below Beam Shared.
