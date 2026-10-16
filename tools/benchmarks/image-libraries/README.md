# Pillow versus libvips benchmark

This compares complete bytes-in/bytes-out compression and conversion on static
8-bit images. It does not import or change the production worker. The benchmark
dependencies are separate from production dependencies.

The cloud comparison uses one Beam CPU core, 8 GiB RAM, no GPU, five measured
repetitions after a separately timed first operation, and codec/libvips
concurrency settings of one. Helper threads may still run.
Every engine/case runs in a fresh Python process. libvips operation caching is
disabled. Input reads, output writes, process launch, and quality scoring are
outside the processing timer. Import time and raw `ru_maxrss` are separate.
On the measured Linux run, inherited high-water floors made `ru_maxrss`
unsuitable for comparing library memory consumption.
This is not an HTTP latency or serverless cold-start benchmark.

## Prepare fixtures

Use Python 3.12 and a new ignored directory. Example from the repository root:

```sh
mkdir -p artifacts/benchmarks/image-libraries/sources
python3.12 -m venv artifacts/benchmarks/image-libraries/venv
artifacts/benchmarks/image-libraries/venv/bin/python -m pip install -r tools/benchmarks/image-libraries/requirements.txt
curl -L --fail https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg -o artifacts/benchmarks/image-libraries/sources/landscape.jpg
curl -L --fail https://upload.wikimedia.org/wikipedia/commons/9/9a/Gull_portrait_ca_usa.jpg -o artifacts/benchmarks/image-libraries/sources/bird.jpg
artifacts/benchmarks/image-libraries/venv/bin/python tools/benchmarks/image-libraries/bench.py prepare --root artifacts/benchmarks/image-libraries
artifacts/benchmarks/image-libraries/venv/bin/python tools/benchmarks/image-libraries/bench.py run --root artifacts/benchmarks/image-libraries --smoke
```

Attribution applies to downloaded photographs and derivatives:

- [Fronalpstock big](https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg),
  Hannes Röst, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
  The fixture crops and resizes the original photograph; retain this attribution
  and the same license when distributing its derivatives.
- [Gull portrait ca usa](https://commons.wikimedia.org/wiki/File:Gull_portrait_ca_usa.jpg),
  Dschwen, [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/).
  The fixture crops and resizes the original photograph. Its 12 MP version is
  upsampled and is a pixel-count stress test, not native 12 MP detail.

Text and soft-alpha fixtures are generated at their target resolution. The
manifest records fixture dimensions, input sizes, hashes, formats, and the
upsampled-source flag. There are 28 inputs and 136 paired cases. GIF inputs are
single-frame; animated output, ICC conversion, and HDR are outside this test.

## Run on Beam

Use an already authenticated Beam client. Stage only the following files into a
fresh ignored directory so uploading the working directory cannot include
credentials or unrelated work:

```sh
mkdir -p artifacts/benchmarks/image-libraries/cloud
cp tools/benchmarks/image-libraries/bench.py tools/benchmarks/image-libraries/cloud.py tools/benchmarks/image-libraries/requirements.txt artifacts/benchmarks/image-libraries/cloud/
cp artifacts/benchmarks/image-libraries/manifest.json artifacts/benchmarks/image-libraries/cloud/
cp -R artifacts/benchmarks/image-libraries/fixtures artifacts/benchmarks/image-libraries/cloud/
cd artifacts/benchmarks/image-libraries/cloud
/absolute/path/to/beam-enabled-python cloud.py > ../beam-private.log 2>&1
```

This starts a paid, temporary function with automatic retries disabled and a
30-minute timeout. At the rate checked on 15 October 2026, 30 minutes of task
compute at this allocation is about $0.053. Initialization and other occupied
time are additional. The function does not deploy an HTTP endpoint. Treat Beam
logs as private because provider tooling may emit credentials.

The client saves `result-bundle.zip`. Extract it into a fresh results directory,
then run `python tools/benchmarks/image-libraries/summarize.py RESULTS_DIRECTORY`.
The summary also writes `measurements.csv`. The bundle includes raw timings,
hashes, quality metrics, environment information, and twelve review sheets.
Confirm the temporary function has stopped using Beam's container inventory.

For a full local run, omit `--smoke`. Use a fresh results directory or remove
only that run's old `results.jsonl` first; JSONL output is append-only, while
`results.json` contains just the latest run. Local and cloud measurements must
be reported separately.

## Interpret the results

Main profiles cover PNG levels 3 and 6, JPEG quality 80 with 4:2:0 chroma and
optimized entropy coding, WebP quality 80 and lossless WebP at effort 4, and
AVIF quality 50 at speed 6 with AOM and 4:2:0 chroma. Medium inputs add quality
sweeps and JPEG/PNG/WebP/AVIF/GIF decode-to-PNG cases.

Compare output bytes alongside full-resolution RGB PSNR, exact RGBA equality,
alpha error, and SSIM averaged over three fixed full-resolution 384-pixel
crops. RGB scores use a white composite. SSIM is not a whole-image score.
Equal quality numbers alone do not imply equivalent quality. Pillow and
libvips use their distributed codec builds; this tests deployable packages,
not a controlled experiment with every codec dependency rebuilt identically.

The original decision rule was to prefer Pillow's smaller integration unless
libvips saved at least 25% and 50 ms on a relevant workload without a material
quality or size penalty, or fixed a correctness/memory limitation. Inspect
individual cases and output formats before applying that rule.
