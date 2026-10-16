# Pillow versus libvips for image compression and conversion

Measured 15 October 2026. This is an isolated CPU benchmark for the proposed
compression/conversion operations. No production endpoint, GPU worker,
dependency lockfile, credit accounting, or customer traffic was changed.

## Recommendation

Use Pillow for the first general-purpose compression/conversion implementation.
It is already a worker dependency, JPEG quality/size is effectively tied, all
40 paired WebP outputs are byte-identical, and AVIF does not favor libvips in
this test. This recommendation assumes a mixed workload rather than a service
primarily converting large photographs to PNG.

There is a material exception: **libvips wins PNG latency**. It meets the
predeclared improvement threshold for both 1.92 MP photo fixtures and every
12 MP fixture, at both PNG levels. If fast large-image PNG conversion is a
launch requirement, use libvips for that operation. Calling the two libraries
equivalent would conceal a real difference. Choosing Pillow initially accepts
that slower PNG path in exchange for reusing the existing dependency.

At PNG level 6, a 12 MP photograph took 3.53 seconds with Pillow versus 1.06
seconds with libvips; the other photograph took 3.30 versus 1.37 seconds. Both
preserved every pixel. For the 1.92 MP text and transparent graphics, the savings
were only 18 and 25 ms. Those differences matter when choosing which workload
to optimize. The JPEG speed improvement at 12 MP is also real, but saves about
57–115 ms in the three cases meeting the threshold, with effectively unchanged
files.

Start with JPEG, PNG, and WebP using explicit format-specific options. Offer
AVIF as a slower compression option if needed, with a separate transparency
policy. Keep the encoder choice in the Python image-handling code, behind the
same authenticated HTTP API. A new provider framework is unnecessary. Run
these operations on CPU compute rather than invoking the background-removal
model solely to encode files.

Revisit libvips when representative customer images show PNG encoding dominates
latency, when large PNG jobs are common, or when resizing/concurrency becomes
the bottleneck. The latter two need their own measurements. This experiment
does not justify replacing the existing imagecodecs PNG optimization.

## Measured latency and output size

All 136 paired cases completed: **272 engine/case results and 1,632 image
transformations, zero processing failures, zero dimension failures, and stable
output hashes across all six operations in each engine/case**.

Each table value is the median across the four content fixtures. Each latency
first takes the median of five repetitions for that fixture. These are a
balanced synthetic mix, not an estimate of the actual customer mix. KiB means
1,024 bytes. Lossy quality settings differ between formats, so the table must
not be used to rank formats at equal quality.

| Output | MP | Pillow ms | libvips ms | Pillow KiB | libvips KiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| PNG level 3 | 0.20 | 14.2 | 9.6 | 146.7 | 144.4 |
| PNG level 3 | 1.92 | 137.7 | 76.1 | 1,339.5 | 1,309.8 |
| PNG level 3 | 12.00 | 773.7 | 425.7 | 6,114.1 | 5,882.4 |
| PNG level 6 | 0.20 | 25.1 | 13.3 | 137.1 | 139.1 |
| PNG level 6 | 1.92 | 267.5 | 115.6 | 1,253.1 | 1,271.1 |
| PNG level 6 | 12.00 | 1,883.9 | 680.6 | 5,466.3 | 5,503.3 |
| JPEG | 0.20 | 2.9 | 3.5 | 27.7 | 27.7 |
| JPEG | 1.92 | 21.6 | 19.5 | 182.0 | 181.9 |
| JPEG | 12.00 | 143.8 | 95.0 | 779.0 | 779.0 |
| WebP | 0.20 | 17.9 | 20.7 | 23.8 | 23.8 |
| WebP | 1.92 | 146.4 | 160.0 | 94.4 | 94.4 |
| WebP | 12.00 | 889.7 | 960.1 | 329.1 | 329.1 |
| WebP lossless | 0.20 | 77.9 | 94.1 | 84.0 | 84.0 |
| WebP lossless | 1.92 | 592.9 | 612.1 | 881.1 | 881.1 |
| WebP lossless | 12.00 | 4,328.6 | 4,250.5 | 3,563.2 | 3,563.2 |
| AVIF | 0.20 | 98.1 | 104.3 | 4.8 | 10.7 |
| AVIF | 1.92 | 626.6 | 666.8 | 29.1 | 49.2 |
| AVIF | 12.00 | 2,997.5 | 3,123.7 | 151.8 | 215.4 |

The PNG advantage was consistent within the measured repetitions. For the
12 MP landscape at level 6, Pillow's five samples were 3,521–3,538 ms, versus
1,048–1,068 ms for libvips. The first operations were 3,579 and 1,057 ms,
respectively. This is much larger than the observed short-run timing variation.

Input format also matters. Decoding each medium input format and writing PNG
level 6 produced these medians over the same four content categories:

| Input → PNG | Pillow ms | libvips ms |
| --- | ---: | ---: |
| JPEG | 340.6 | 143.8 |
| PNG | 327.9 | 122.7 |
| WebP | 325.9 | 161.0 |
| AVIF | 351.9 | 254.9 |
| GIF, one frame | 199.8 | 99.7 |

These are complete conversion times, not isolated decoder benchmarks. The
native-input table and this table use different input encodings for some
content, so their PNG medians are not interchangeable.

## Quality findings

- All 72 main-profile PNG and lossless WebP results preserved exact RGBA pixels.
  For lossy WebP, alpha was also exact on every test, even when RGB was lossy.
- All 40 WebP pairs, including quality sweeps and lossless profiles, produced
  identical files. The library choice therefore did not affect size or quality
  for these cases.
- Across 28 JPEG pairs, output sizes differed by at most 0.26%; the largest
  absolute SSIM difference was 0.000107. Non-alpha fixtures had identical
  quality scores. Small alpha-flattening differences account for the remaining
  measured fidelity differences. Files themselves were not byte-identical.
- PNG level 6 was not universally smaller in either library. For the 1.92 MP
  photographs, libvips was 0.6% smaller on one and 1.7% larger on the other.
  Its speed benefit did not require losing pixels. Converting a JPEG photograph
  to PNG can greatly increase file size with either library.
- AVIF results depended on content and codec implementation. At quality 50,
  the medium text image was 12,560 bytes in Pillow and 59,312 bytes in libvips.
  Their crop SSIM was 0.992609 and 0.991677; PSNR was 36.04 and 36.81 dB.
  Neither metric alone explains human preference, but the larger file offers
  no clear visual justification in the inspected text crop.
- The AVIF text difference survives the quality sweep. At quality 40, both
  reached 34.90 dB PSNR, with crop SSIM 0.992481/0.992874, yet files were
  11,907/52,136 bytes for Pillow/libvips. The full sweep is retained in the CSV.
  This is evidence about these packages and settings, not an intrinsic AVIF
  limitation or a proof about every libvips build.
- Lossy AVIF changed alpha. At the main quality setting, maximum alpha error
  was 13/255 on the small fixture, 5/255 on medium, and 3/255 versus 4/255 on
  large for Pillow/libvips. Prefer PNG or lossless WebP when exact soft alpha
  is required.
- libvips decoding of the four AVIF inputs differed slightly from Pillow's
  canonical decode before PNG encoding. Crop SSIM against that reference was
  0.998733–0.999998. This is a decoder/conversion difference, not lossy PNG.

Visual inspection covered all twelve medium review sheets at original pixel
scale. JPEG and WebP library outputs showed no meaningful visible difference.
AVIF at the selected lower-size setting visibly smoothed fine photographic
texture in both libraries. The alpha review sheet covers the central color
gradient; whole-image alpha error comes from the numeric check, not that crop.
This was an inspection, not a blinded human-quality study.

Four outputs exceeded the existing 12 MiB binary-result cap: the large
landscape at both PNG levels in both libraries. They were retained to measure
the encoder, but a production route must reject or otherwise handle them
before delivery. Do not promise that conversion always reduces size.

## Measurement design

The comparison uses Pillow 12.3.0 and pyvips 3.2.0 with the pyvips-binary 8.18.7
distribution. Both run on the same Beam CPU-only task configured for one CPU
core and 8 GiB RAM, on an Intel Xeon Gold 6526Y host. The benchmark sets
libvips/encoder concurrency to one and
disables libvips operation caching. Results compare the deployable packages;
the codec dependencies were not rebuilt to identical versions.

Pillow reported libjpeg-turbo 3.1.4.1, WebP 1.6.0, libavif 1.4.2, zlib-ng
2.3.3, and zlib 1.2.11. The libvips dependency bundle is pinned by its binary
distribution version; individual runtime codec versions were not extracted.
Python was 3.12.8, Linux x86_64, and pyvips used CFFI API mode.

The exposed cgroup CPU/RAM limit files reported `max`, so this run did not
independently verify hard resource enforcement. Beam defines one priced core
as two vCPU equivalents. Helper threads still ran: median process CPU/wall
ratios were 1.00 for Pillow and 1.01 for libvips, with maxima 1.34 and 1.64.
The settings do not establish that every operation used exactly one OS thread.

Median library imports were 12.4 ms for Pillow and 13.4 ms for pyvips. These
fresh-process imports are not container cold starts. The recorded `ru_maxrss`
values showed repeated identical high-water floors after the parent scored
large images, consistent with inherited accounting; they cannot isolate library
memory use. No memory winner
or RAM reduction is inferred from them.

There are 28 input files, ranging from 4,574 to 4,791,085 bytes. Every input
fits the existing 10 MiB upload bound. The four content categories are a
detailed landscape photograph, a bird photograph, generated text/graphics,
and a generated soft-alpha gradient. Each has 512x384, 1600x1200, and 4000x3000
versions, approximately 0.20, 1.92, and 12 MP. The 12 MP bird is upsampled from
a smaller source and tests pixel count rather than native photographic detail.

Photographs use JPEG input and graphics use PNG input at every size. The medium
fixtures additionally cover JPEG, PNG, lossless WebP, AVIF, and single-frame GIF
decoding. This is not an exhaustive cross-product of every input/output format.

| Output profile | Shared settings |
| --- | --- |
| PNG fast | Level 3, full color, lossless |
| PNG small | Level 6, full color, lossless |
| JPEG | Quality 80, 4:2:0, optimized entropy coding, non-progressive |
| WebP | Quality 80, effort/method 4, lossless alpha |
| WebP lossless | Lossless, effort/method 4, exact transparent RGB |
| AVIF | Quality 50, speed 6, AOM, 4:2:0, 8-bit |

Medium fixtures add JPEG/WebP quality 50, 65, 90, and 95 and AVIF quality 30,
40, 65, and 80. An identical quality parameter is not evidence of identical
visual quality, so bytes, PSNR, SSIM, and alpha error are recorded together.

Each of the 136 cases runs once per library in a fresh subprocess. The first
decode/normalize/encode operation is timed separately, followed by five timed
repetitions against the same input bytes. Case order is randomized with a fixed
seed; engine order alternates. Reported processing latency includes completed
encoding to bytes, not just a lazy image graph. It excludes input/output disk
I/O, Python startup, library import, network transfer, and quality scoring.

Quality uses the decoded input as reference. Full-resolution RGB PSNR compares
white composites; maximum alpha error and exact RGBA equality are separate.
SSIM averages three fixed 384-pixel crops at original resolution, not a resized
thumbnail or a whole-frame score. Twelve review sheets compare the reference,
Pillow, and libvips for the medium JPEG/WebP/AVIF outputs. JPEG deliberately
flattens alpha onto white; it cannot preserve transparency.

The pre-measurement decision rule prefers Pillow, already present in the
worker, unless libvips saves at least 25% and 50 ms on a relevant workload
without a material quality or size penalty, or removes a correctness/memory
limitation. Evaluate exceptions by format, not one aggregate winner.

## Cost assumptions

The current CPU-only rate is $0.0000125 per core-second plus $0.0000021 per
GiB-second. One core and 8 GiB therefore cost $0.0000293 per occupied second,
or $0.10548 per hour. Processing-only cost per 1,000 operations is the measured
milliseconds multiplied by $0.0000293. These are USD list-price estimates,
not measured invoice charges. [Beam pricing](https://www.beam.cloud/pricing).

| 1,000 medium operations, processing only | Pillow USD | libvips USD |
| --- | ---: | ---: |
| JPEG | 0.000633 | 0.000571 |
| PNG level 3 | 0.004034 | 0.002228 |
| PNG level 6 | 0.007837 | 0.003386 |
| WebP | 0.004288 | 0.004688 |
| WebP lossless | 0.017373 | 0.017933 |
| AVIF | 0.018360 | 0.019539 |

For this balanced medium-image mix, choosing libvips for PNG level 6 saves
about $0.00445 per 1,000 encodes, or $4.45 per million, in processing time.
For the 12 MP landscape PNG case alone, the saving is about $0.072 per 1,000.
The PNG latency gain is a stronger reason to add libvips than the low-volume
compute saving.

Initialization and paid idle time are additional. For a hypothetical 60-second
idle window, add $0.001758 per isolated burst, or $1.758 per 1,000 one-image
bursts. With ten images per burst, that idle component becomes $0.1758 per
1,000 images. Actual request arrivals, retries, startup, storage, and API
overhead change total cost. This benchmark does not measure a production
endpoint's cold-response latency. [Beam billing rules](https://docs.beam.cloud/v2/resources/pricing-and-billing).

## Execution and verification

Beam task `75168db7-7f0e-4eb4-85df-e9881385ff1c` completed from
13:57:54 to 14:13:14 UTC. The measurement/scoring interval was 917.1 seconds;
it includes quality calculations, process startup, repeated work, and review
sheet generation. Its modeled compute component is about $0.027, not the cost
of serving 1,632 ordinary API requests. Automatic retries were disabled.
Container inventories were empty before the task and after completion. No
endpoint was deployed and no persistent compute remains from this experiment.

The local smoke run completed all six output profiles. All nine existing
image-pipeline unit tests passed in an isolated environment with the repository's
imagecodecs test dependency. The initial attempt in the older root virtualenv
could not import NumPy; installing the test dependency into the isolated
environment resolved that environment issue without changing project files.
Benchmark Python syntax, local documentation links, and whitespace were checked.

## Scope and reproduction

This is one cloud host, four content categories, and five warm repetitions per
case. It establishes package behavior on these fixtures, not a universal
performance ranking, human preference study, customer latency percentile, or
production acceptance. The test does not cover animation preservation, resize
performance, ICC-managed conversion, CMYK, HDR/16-bit inputs, TIFF, HEIC, JPEG XL,
malformed uploads, parallel throughput, or inputs at the full 25 MP limit.
Lossless-output fidelity is relative to the canonical Pillow decode; differences
between source decoders must not be mistaken for loss in a PNG encoder.

The working tree already contains a separate imagecodecs PNG optimization.
This experiment compares direct Pillow with direct libvips and does not
benchmark or replace that optimization.

Reproducible code, pinned requirements, fixture attribution, and commands are
in [the benchmark directory](../tools/benchmarks/image-libraries/README.md).
Raw local and cloud evidence stays under the ignored
`artifacts/benchmarks/pillow-vips-2026-10-15/` directory. The cloud results are
kept separately from the local smoke test. Input hashes are in `manifest.json`;
individual measurements are in `results.json`, `results.jsonl`, and the generated
`measurements.csv`.

Photographic sources are [Fronalpstock big by Hannes Röst, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg)
and [Gull portrait ca usa by Dschwen, CC BY 2.5](https://commons.wikimedia.org/wiki/File:Gull_portrait_ca_usa.jpg).
Both were cropped/resized; preserve their attribution and license conditions
when redistributing the fixtures or review sheets.

Encoder settings were checked against the
[Pillow format reference](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html),
[libvips PNG reference](https://www.libvips.org/API/current/method.Image.pngsave.html),
and [libvips AVIF/HEIF reference](https://www.libvips.org/API/current/method.Image.heifsave.html).
The pinned [pyvips binary distribution](https://pypi.org/project/pyvips-binary/8.18.7/)
contains its own packaged native dependencies; this matters when attributing
codec-specific differences.
