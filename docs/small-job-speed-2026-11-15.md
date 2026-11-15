# Small-job speed: what was measured and what follows

Measured on November 15, 2026 for [#26](https://github.com/superuserkalo/openBGremover/issues/26). It finishes the list left open in `docs/compute-placement-measurements-2026-11-15.md`. Everything ran on temporary resources: one Cloudflare Worker with a container image built from a Dockerfile, two R2 buckets, and two Beam deployments. All were deleted afterwards and the deletion was checked. Raw results are in the ignored `artifacts/benchmarks/small-job-speed-2026-11-15/`.

All requests came from one laptop in Europe and entered Cloudflare in Vienna.

## Problem

The job contract in #5 sends every job through a queue. Nobody had measured what that costs a one-second image job, or whether a faster path exists. The target is a small image job back in under one second.

## Decision

1. **Small jobs run on Cloudflare Containers, one fresh container per job, with internet access off.** The Worker reads the input from R2, streams it into the container, and streams the result out.
2. **The caller gets a small result before it is stored.** For a caller who is waiting and a result up to 10 MB, the bytes go back as soon as the tool finishes, and the R2 write runs alongside. Storing the result was the slowest and least predictable step.
3. **`inspect` and dry runs run inside the API,** reading only the start or end of the file from R2.
4. **A Durable Object passes on the "job done" signal.** It took 12 ms.
5. **Code that talks to the database runs near Frankfurt,** where the database is. One round trip cost 5 ms from there and 117 to 189 ms from other continents.
6. **Every Beam job goes through a task queue.** The queue added about 0.1 s. This unblocks building #5.
7. **Beam is not used for small jobs.** Its floor for a half-second job was 1.0 to 1.4 s warm and 3.5 to 8.5 s cold.
8. **A new container image is warmed before it takes traffic.** Its first start took 15 s and two of the next twelve took 3.5 s; after that every start took under 0.3 s.
9. **A lost container is an ordinary failure.** The job is retried. Small jobs are safe to retry.
10. **One bucket, and callers never choose a region.** The EU-only setting made no measurable difference to speed.

### Which path a job takes

| Path | Jobs | Time limit |
| --- | --- | --- |
| Inside the API | `inspect` without `deep`, dry runs, the catalog | 10 s |
| Cloudflare Container | Images up to 50 megapixels and 50 MB; PDF page operations up to 200 pages and 50 MB; operations that only read facts | 60 s |
| Beam task queue | Everything else: video, audio, large files, LibreOffice, OCR, GPU models | Set per operation; 15 minutes unless its spec says otherwise |

The API decides from the header-only inspection, before any charge. A job that hits the 60 s limit on the small path is retried once on Beam. This settles the per-path limit that the #18 amendments left to this ticket.

## Evidence

### Containers from our own image

Setup: an image built from a Dockerfile (Debian, Python, Pillow, FFmpeg, libvips, bubblewrap; 250 MB as stored), `standard-2` instances (1 vCPU, 6 GiB), internet access off. Times are measured inside the Worker.

| Measurement | Runs | Result |
| --- | --- | --- |
| First start after the image was published | 1 | 15.0 s |
| The next 12 cold starts | 12 | 10 took 99 to 163 ms; the 1st and 3rd took 3.5 and 3.6 s |
| 20 further cold starts | 20 | 84 to 262 ms |
| Cold start plus a sandboxed 12 MP resize, photo already in the image | 10 | 385 to 574 ms |
| Reaching the internet from inside | 1 | Blocked, as intended |
| The #18 wall with internet access off | 12 | Works |

### The whole small-job path

A 12-megapixel JPEG (4.8 MB) is read from R2, streamed into the container, resized to 1024 px inside the wall by a newly started Python process, streamed out, and written to R2 (138 KB).

| Case | Runs | Total | Steps, typical |
| --- | --- | --- | --- |
| Cold: container started for this job | 8 | 0.60 to 1.43 s, median 0.82 s; 7 of 8 under 1 s | R2 read 36–118 ms; start and copy in 61–772 ms; tool 249–464 ms; copy out 6–10 ms; R2 write 137–351 ms |
| Warm: container reused | 8 | 0.33 to 2.56 s, median 0.64 s | R2 read 25–74 ms; copy in 29–154 ms; tool 145–272 ms; copy out 3–6 ms; R2 write 118–2,259 ms |
| Warm, 4 MP JPEG (0.7 MB) | 3 | 0.24 to 0.38 s | Tool 65–68 ms |

- Without the R2 write, the warm job takes about 0.21 to 0.42 s.
- A reused container runs the tool in about 147 ms; a fresh one takes 250 ms or more, because nothing is cached yet. Fresh containers are kept anyway, for isolation.
- Copying 30 MB through a `standard-4` container ran at 76 to 135 MB per second in and 73 to 83 MB per second out.

### Reading facts inside the API

Range requests to R2 from the Worker, with no container. Five runs each.

| File | Reads | Median | Range |
| --- | --- | --- | --- |
| 12 MP JPEG | 1 | 51 ms | 32–220 |
| 4 MP PNG | 1 | 57 ms | 47–208 |
| 30 MB MP4, index at the start | 2 | 86 ms | 75–335 |
| 30 MB MP4, index at the end | 3 | 174 ms | 107–948 |
| 120-page PDF | 2 | 74 ms | 65–193 |

The slowest run of each file was its first. Width, height, duration and page count were all correct.

### R2 reads and writes

Written and read back from the Worker, two rounds, against an EU-only bucket and a standard one.

| Size | EU-only write, median | Standard write, median | Read, median |
| --- | --- | --- | --- |
| 138 KB (10 per round) | 203, 206 ms | 152, 163 ms | 84–132 ms |
| 4.8 MB (10 per round) | 335, 317 ms | 394, 444 ms | 135–530 ms |
| 30 MB (5 per round) | 763, 1,430 ms | 1,472, 1,770 ms | 410–2,569 ms |

- **The EU-only setting costs nothing measurable.** Neither bucket was consistently faster.
- **Writes have a long tail in both.** 18 of 100 writes took more than three times the median for their size. The worst were 13.6 s (EU-only) and 36.7 s (standard) for 30 MB.
- Result writes therefore need a time limit and a retry, and should not sit between the tool finishing and the caller's answer.

### Beam and R2

Each Beam tier downloaded from and uploaded to R2 through the temporary Worker. One container per tier, four runs each. A presigned upload straight to R2 was not tested.

| Tier | 30 MB download | 30 MB upload | 4.8 MB download | 4.8 MB upload |
| --- | --- | --- | --- | --- |
| Performance | 35–70 MB/s | 0.5–20 MB/s | 8–22 MB/s | 0.5–4.8 MB/s |
| Shared | 11–23 MB/s | 5–17 MB/s | 1–11 MB/s | 0.3–6.6 MB/s |
| Spot | 11–21 MB/s | 3–11 MB/s | 3–10 MB/s | 1.8–5.6 MB/s |

Downloads match the earlier finding that Shared and Spot have a slower network. Uploads were slow and uneven on every tier, which fits the R2 write tail above.

### The database, by where the code runs

`select 1` through the production Hyperdrive binding, from a Durable Object placed in each region. 15 queries on one connection, and 5 calls that each opened a new connection as the API does today.

| Runs in | One query, median | New connection, query and close |
| --- | --- | --- |
| Frankfurt | 5 ms | 7–15 ms |
| Warsaw (no placement hint) | 25 ms | 27–66 ms |
| Madrid | 35 ms | 35–72 ms |
| Chicago | 117 ms | 126–147 ms |
| Dallas | 143 ms | 129–148 ms |
| Hong Kong | 189 ms | 190–198 ms |

- Opening a connection through Hyperdrive took 1 to 9 ms, so a connection per request is fine.
- Distance is the cost. An API call with three round trips takes about 15 ms from Frankfurt and over 400 ms from Dallas.
- Cloudflare's own "run near the database" setting was not tested; a placement hint was used instead.

### The "job done" signal

One request waits on a Durable Object; another signals it. 30 runs: the waiter was woken 11 to 15 ms after the signal, median 12 ms. The database checks in #5 would have reported the same event up to 200 ms late in the first three seconds and up to 2 s late after that.

### Beam: queued against direct

Setup: the same job behind a task queue with a callback and behind an endpoint. 1 vCPU, Performance tier, 30-second idle window. The job builds a 12 MP image and resizes it, about 0.55 s of work. Timed from the laptop; each cold sample followed two observations of zero containers; order alternated.

| Case | Direct | Queued |
| --- | --- | --- |
| Warm (24 each) | 1.31 s median (0.97–4.27) | 1.42 s median (1.26–1.51) |
| Cold (4 each) | 3.6, 3.7, 5.1, 5.4 s | 3.5, 3.6, 6.2, 8.5 s |

The queue added about 0.1 s warm and was steadier. Cold starts dominate both.

### Spot interruptions

Six 4-vCPU jobs of 15 minutes each ran on Spot at once. All six finished. None was interrupted, and each started within 5.3 s. That is 1.5 hours of running time, too little to state a rate.

### The two containers that stopped earlier

Two containers stopped without a known cause in the first round. Four attempts to reproduce it failed: a container survived a redeploy, five minutes with no requests, a long background job, and 17 Worker requests that exceeded the memory limit. About 70 containers were started in this round and none stopped unexpectedly. The cause stays unknown.

## Cost of a small job

From Cloudflare's list prices, not measured on a bill: a `standard-2` container awake for half a second with 0.2 s of CPU costs about $0.00001, before the monthly allowance. That is roughly 100,000 small jobs per dollar.

## Not measured

- Callers outside Europe. The bucket and the database are in Europe, so their R2 and database legs are longer.
- Cloudflare's "run near the database" setting.
- Many containers starting at once.
- The production image code. The test used Pillow; production uses libvips.
- A presigned upload from Beam straight to R2.
- Starting the next container ahead of time, to avoid the cold tool run.

## Notes for the build

- `docker login` to Cloudflare's registry hung in a shell with no screen, waiting on the macOS keychain. A build machine needs a file-based Docker configuration.
- One image push failed on a network error and succeeded on retry.

## Revisit when

- More than a few percent of container starts take over a second in production.
- R2 write times improve enough that waiting for the write costs little.
- Callers outside Europe see slow small jobs; then a second bucket and database placement per region are the next step.
