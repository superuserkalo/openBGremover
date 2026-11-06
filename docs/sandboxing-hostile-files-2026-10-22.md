# Sandboxing hostile files

Decided in [#18](https://github.com/superuserkalo/openBGremover/issues/18). The measurements were taken on October 22, 2026 with one-off Beam functions (`beam-client` 0.2.189). No deployment was created or left behind. None of this is built yet. This document holds the design and the evidence it rests on.

## Problem

Every input file is untrusted. LibreOffice, Ghostscript, FFmpeg, PDF libraries and image decoders all have a history of exploitable parser bugs:

- **Ghostscript:** CVE-2024-29510 was exploited in the wild to escape `-dSAFER`.
- **LibreOffice:** many CVEs from 2023 to 2026 involve fetching linked content when a document opens. Gotenberg 8.34.0 had to block linked content because documents could make LibreOffice fetch URLs and read local files.
- **libwebp:** CVE-2023-4863, a heap overflow in WebP decoding, was exploited against Chrome and iOS. Our image worker includes libwebp.

A parser bug must not give an attacker the network, other customers' files, our credentials, or a place to stay for the next job.

## Decision

1. **Four layers.**
   1. Beam's gVisor, the outer layer, which Beam provides.
   2. A per-job wall around every process that opens an untrusted file.
   3. Safe settings for each tool.
   4. Limits on time, memory and disk.
2. **Network.** The tool inside the wall has no network. Our worker code outside the wall downloads the input, starts the tool and uploads the result.
   - We do not use Beam's endpoint-level `block_network`, because it would also block R2.
   - We do not use `allow_list`, because R2 shares Cloudflare's address ranges with millions of other sites, so it would protect very little.
3. **No long-lived secrets in workers.** For each job, the API passes three things that expire within minutes: a presigned input download URL, a presigned output upload URL, and a callback token scoped to that job. A fully compromised worker reaches only its current job. This refines the signed callbacks in #5.
4. **What gets walled:**
   - every document, PDF, audio and video tool;
   - every image decode, in both the image worker and the GPU worker.

   Image decoding uses a **single-use decoder started ahead of time**:
   - While the worker is idle, it starts the next walled decoder, which waits for a job.
   - The decoder opens one job's input, hands back the decoded pixels, and is then discarded.
   - If no decoder is ready, the worker starts one on demand, so a job is never blocked.
   - The job folder lives in memory (`/dev/shm`).
   - Encoding the result stays outside the wall, because by then the pixels are our own.
5. **LibreOffice starts fresh for each job,** with a new profile and no shared unoserver. A shared process could carry a compromise from one document into later jobs.
6. **Limits** (launch values, revisited after #19's measurements):
   - **Memory:** 6 GiB for the tool, leaving room for the worker process on the 8 GiB host.
   - **Time:** each operation sets its own wall-clock limit, default 120 s and never more than 170 s, so the worker can still report before Beam's 180 s timeout.
   - **Disk:** `RLIMIT_FSIZE` caps any single file at the media type's output cap, and a watchdog kills the job if the job folder passes 4 GiB. Beam's root filesystem is a large shared mount.
   - **When a limit is hit,** the job fails as `INPUT_TOO_COMPLEX` with no charge (the #5 rule that charging follows fault).
7. **Tool settings:**
   - **Ghostscript:** always `-dSAFER`.
   - **LibreOffice:** macros disabled, linked content blocked (`BlockUntrustedRefererLinks`), Java off.
   - **FFmpeg:** `-protocol_whitelist file`.
   - **Output PDFs:** JavaScript, launch actions and embedded files are removed before we return them.
8. **Current, pinned tool versions** from upstream releases, not distribution packages. The Python 3.12 Beam image installed LibreOffice 7.3.7 and libvips 8.12.1, both years old. Each job's `applied` field (#8) records the version. A weekly scheduled check opens an issue when a newer security release exists; later an agent could turn that issue into the upgrade pull request.
9. **Restart the container after a crash.** When a tool crashes or is killed for a limit, the worker reports the result and then exits, so Beam replaces the container.
10. **Self-hosting.** Docker's standard seccomp profile blocks the user namespaces the wall needs.
    - The shipped Compose file recommends gVisor (`runtime: runsc`), or includes a seccomp profile that allows the wall.
    - At start-up the worker checks that the wall works. If it doesn't, the worker refuses untrusted files unless the operator sets `UNSAFE_NO_SANDBOX=1`. This is the same approach as Chrome's `--no-sandbox`.
    - The rest of the setup belongs to #9.
11. **A separate `documents` Beam CPU worker** for LibreOffice, Ghostscript, qpdf and PDFium. LibreOffice alone is 225 MB, which would slow the image worker's cold start. FFmpeg's home is decided in #19.

## The wall

The wall is `unshare -rn` followed by bubblewrap:

```sh
unshare -rn bwrap \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
  --ro-bind /etc /etc --proc /proc --dev /dev --tmpfs /tmp --bind "$JOB_DIR" /work \
  --unshare-pid --unshare-ipc --unshare-uts --die-with-parent --new-session --clearenv \
  --chdir /work <tool> ...
```

`unshare -rn` creates the user and network namespaces. Inside gVisor, bubblewrap's own `--unshare-net` fails: it can't set up loopback (`RTM_NEWADDR`), and run alone it can't create the namespace at all. Python tools also need their interpreter and site-packages bound read-only. Memory and file-size limits are set with `prlimit`, and the time limit is a parent-side kill.

## Evidence

### What Beam containers allow

| Check | Result |
| --- | --- |
| Kernel | `4.19.0-gvisor`, so containers run in gVisor |
| User | root, with seccomp off inside gVisor |
| `unshare -n` without a user namespace | `Operation not permitted` |
| `unshare -rn` | works; `curl https://example.com` fails to resolve (exit 6) |
| `bwrap --unshare-net` | fails (loopback setup) |
| `unshare -rn` + bubblewrap | works: sees only `/usr`, `/etc`, `/work` and its own PID 1; `/root` is absent; no network; reads and writes the job folder; environment cleared |
| Memory cap (`prlimit --as=256M`, 512 MB allocation) | `MemoryError` |
| Time limit (`timeout -s KILL 2`, busy loop) | killed, exit 137 |
| Landlock | not available (syscall returns -1) |
| Root filesystem | 9p mount, 21 TB shared |
| Wall start-up (`/bin/true`) | median 39 ms |

### Tools inside the wall (1 CPU, 8 GiB)

| Run | Time |
| --- | --- |
| LibreOffice text → PDF, fresh profile, walled (3 runs) | 2.43 s, 2.23 s, 1.73 s |
| LibreOffice, same conversion without the wall | 1.52 s |
| Ghostscript `pdfwrite /ebook`, walled | 0.17 s |
| FFmpeg 2 s 360p H.264 encode, walled | 0.35 s |
| FFmpeg with an `https://` input and `-protocol_whitelist file` | refused: "Protocol 'https' not on whitelist" |

### Image decoding

Setup:
- Beam, 1 CPU, 8 GiB.
- pyvips 3.2.0 with libvips 8.18.7, Pillow 12.3.0, pillow-heif 1.8.1; `VIPS_CONCURRENCY=1`, one HEIC decode thread.
- 20 runs per cell, taking turns in each round so drift affects every approach equally.
- Times include handing the decoded pixels back to the worker process.
- Inputs were synthetic Gaussian-noise images, which are harder to decode than typical photos.

| Input | No wall (today) | Wall started per job | Wall started ahead |
| --- | --- | --- | --- |
| 1.2 MP JPEG, 1.5 MB | 43 ms | 272 ms (+229) | 83 ms (+41) |
| 12 MP JPEG, 17 MB | 267 ms | 527 ms (+260) | 323 ms (+56) |
| 12 MP PNG, 32 MB | 378 ms | 718 ms (+340) | 557 ms (+179) |
| 12 MP WebP, 7.8 MB | 894 ms | 1,159 ms (+265) | 969 ms (+75) |
| 12 MP HEIC, 15.5 MB | 1,382 ms | 1,633 ms (+251) | 1,508 ms (+126) |

All figures are medians; p90 stayed within about 10% of the median. A fresh decoder took 180 ms to become ready (median; p90 205 ms, max 224 ms, n = 100).

Notes on these numbers:
- The "started ahead" times include copying the input into the job folder. In production the worker downloads straight into that folder, so large inputs like the 32 MB PNG should cost less than shown.
- An earlier run tried the `vips` command-line tool (the libvips 8.12.1 package) inside the wall. It was slower than walled Python on every input, because of plugin loading and older decoders, so we dropped it.

## Open checks before rollout

- A controlled cold-start comparison with observed zero containers, as AGENTS.md requires, including whether a decoder started before a Beam checkpoint survives restore. If it doesn't, start the decoder after restore.
- Repeat the decode benchmark on representative real photos, with the job folder on `/dev/shm`, and with jobs arriving back to back. On one core, starting the next decoder competes with the current job.
- Measure LibreOffice with a prepared profile copied into each job, to cut its fresh-start time.

## Revisit when

- The cold-start comparison shows a regression we can't remove. Then keep the wall and start it per job.
- Beam offers a per-task fresh container at a comparable cold start.
- A self-hosting report shows the start-up wall check failing on a common platform.
