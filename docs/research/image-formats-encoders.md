# Image formats, best encoders, and full option sets

Researched 16 October 2026 for issue #11 (part of map #2). This is a
primary-source review with a small local measurement. Nothing was deployed,
no dependency or lockfile changed, and no production traffic was touched.
Licenses are covered only briefly; a separate ticket covers them in depth.

Standing decision (the `CONTEXT.md` glossary in the working tree): callers
choose a **format** and set per-format **options**. The platform chooses the
**encoder** and reports it. "Squoosh-level" granularity is the target.

## Recommendation

1. **Use libvips (pyvips + `pyvips-binary`) as the pipeline core.** It handles
   decode, orientation, ICC, resize, and alpha. Add per-format encoder adapters
   only where a specialist encoder wins. The bundled build already ships
   MozJPEG, libwebp 1.6.0, aom 3.15.1 (AVIF), cgif, libimagequant, libpng,
   libtiff, librsvg and libuhdr. It does **not** ship JPEG XL, HEVC, RAW, PDF,
   or JPEG 2000. Bundled versions are from
   [libvips-packaging `versions.properties`](https://github.com/kleisauke/libvips-packaging/blob/main/versions.properties)
   and a runtime probe (below).
2. **Write these formats in the first expansion:** JPEG, PNG, WebP (still and
   animated), AVIF (still), GIF (animated), and JPEG XL.
   **Second tier:** QOI, TIFF, ICO, BMP.
   **Do not write:** HEIC, WebP 2, JPEG 2000, or APNG (APNG can wait for a
   concrete request). HEIC is patent-encumbered, Apple-centric, and the only
   Python encoder path bundles GPL x265. WebP 2 is explicitly unstable, with
   no browser support.
3. **Read** everything above, plus HEIC/HEIF (through pillow-heif), APNG,
   animated WebP/GIF/AVIF, and SVG (rasterized, with external references
   blocked). Defer RAW and PDF to a separate ticket on document and camera
   input.
4. **Choose these encoders per format:**

   | Format | Encoder | Driven by |
   | --- | --- | --- |
   | JPEG | MozJPEG with trellis | libvips |
   | PNG | libvips/libpng for speed, then OxiPNG for an optional optimization pass. Lossy palette reduction uses libimagequant. | pyvips, pyoxipng |
   | WebP | libwebp | libvips |
   | AVIF | libavif + aom with tune=iq | Pillow |
   | JPEG XL | libjxl | imagecodecs, or a pinned `cjxl` binary for the full option set |
   | GIF | cgif | libvips |
   | QOI | reference QOI | imagecodecs or Pillow |
   | TIFF | libtiff | libvips |
   | ICO, BMP | Pillow | Pillow |

   Keep **jpegli** as a measured JPEG challenger. It nearly matches MozJPEG's
   size at about 1/10 the encode time. The only Python binding, however, is a
   one-maintainer package exposing quality alone.
5. **Expose the full Squoosh option set where an in-process encoder supports
   it, and list the remainder explicitly as not exposed.** No single in-process
   Python path reaches every Squoosh MozJPEG and WebP knob. Some knobs
   (separate chroma quality, smoothing, trellis loop count and multipass,
   WebP filter, segment and SNS internals) require direct libjpeg/libwebp API
   calls or the reference CLIs (`cjpeg`, `cwebp`). Add those only when a
   representative test shows a size or quality benefit. Squoosh itself hides
   most of them under Advanced settings.

The JPEG measurement below supports a MozJPEG change. At equal SSIMULACRA2
quality, MozJPEG (trellis, quant table 3) made photographs 10–30% smaller than
the current Pillow/libjpeg-turbo output. It was neutral on a text graphic, and
the encode cost was 10–20× higher (89–168 ms versus 7–9 ms for 1.9 MP on one
core). JPEG is a cheap format, so this is affordable, but it is not free.

## Evidence classes

| Evidence | What it establishes |
| --- | --- |
| Squoosh source at commit `e8d35e0` (2024-08-19), files cited inline | Squoosh's exact option names, ranges, defaults, and how its UI maps them to encoder calls |
| Runtime probe in a `python:3.12-slim` container, **linux/amd64** | Formats, savers, and codecs actually present in the pinned wheels on Linux x86_64, the Beam CPU architecture |
| Encoder measurement in a `python:3.12-slim` container, **linux/arm64 on an Apple M3, `--cpus=1`, 8 GiB** | Relative bytes at equal SSIMULACRA2 and relative encode time. **Not** Beam latency; absolute ms will differ on x86_64. |
| Upstream docs (libvips, libwebp, libavif, libjxl, MozJPEG, OxiPNG, Pillow) | Option semantics, ranges, and defaults |

Measurement inputs: four 1600×1200 (1.92 MP) lossless PNG fixtures from the
earlier Pillow/libvips benchmark: landscape photo, bird photo, synthetic text,
and alpha graphic. Their attribution is in that benchmark's documentation;
the photos are CC BY-SA 3.0 and CC BY 2.5 Wikimedia images. Three warm
repetitions were run, reporting the median. Quality was measured with
SSIMULACRA2 (`ssimulacra2` 0.3.0, a Python implementation) on RGB against the
lossless source. Sizes at a target score are linearly interpolated between
measured quality settings. With three content images, these numbers rank
encoders on these fixtures only; they are not a universal ranking or a
human-preference study.

## Formats: read and write

| Format | Read | Write | Why |
| --- | --- | --- | --- |
| JPEG | Yes | **Yes** | Universal. MozJPEG output is ordinary baseline/progressive JPEG. |
| PNG | Yes | **Yes** | Lossless with soft alpha. The current API already offers it. |
| WebP | Yes (incl. animated) | **Yes** (still + animated) | Universal browser support; lossy and lossless modes; alpha. |
| AVIF | Yes (incl. sequences) | **Yes** (still) | Best lossy size among broadly supported formats in this test. Animated AVIF output can wait. |
| JPEG XL | Yes | **Yes** | Best lossless and high-fidelity results in this test. Chrome announced decoding from Chrome 155 ([Chrome blog, 2026-10-06](https://developer.chrome.com/blog/jpeg-xl-in-chrome)); Safari has supported it since 17 ([WebKit](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)). Stable Firefox support was not found. Offer it, but do not make it a default anywhere. |
| GIF | Yes (animated) | **Yes** (animated) | Legacy compatibility for animation. libvips `gifsave` uses cgif + libimagequant. |
| QOI | Yes | Tier 2 | Fast lossless format with no options. Niche: no browser support, no ICC profile, and in this test it was larger than PNG on every fixture. |
| TIFF | Yes | Tier 2 | Print/archive. Many compression modes; libvips writes them. |
| ICO | Yes | Tier 2 | Favicons; Pillow writes multi-size ICO. |
| BMP | Yes | Tier 2 | Legacy; Pillow. No options worth exposing. |
| APNG | Yes | Later | Pillow can write it; OxiPNG only partially optimizes APNG ([OxiPNG README](https://github.com/oxipng/oxipng)). Animated WebP covers most needs. |
| HEIC/HEIF (HEVC) | **Yes, via pillow-heif** | No | Uploads from iPhones need decode support. pyvips-binary cannot decode HEVC (probe: "Support for this compression format has not been built in: HEVC"). pillow-heif 1.8.1 bundles libde265 to decode and x265 to encode. Writing HEIC adds HEVC patent exposure and a GPL encoder for little web benefit. |
| SVG | Yes, rasterize | No | libvips/librsvg rasterizes (`svgload` present). Treat SVG as untrusted: enforce byte/pixel limits before rendering, load from a buffer with no base URI, and add a test proving external `file://`/`http` references are not fetched. The probe did not verify that. |
| RAW (DNG/CR2/…) | Defer | No | libraw is not in pyvips-binary. rawpy (0.27.1) is available but adds an undecided camera-pipeline policy (demosaic, white balance). |
| PDF | Defer | No | No PDFium/Poppler in pyvips-binary. Belongs to document handling. |
| JPEG 2000 | Optional (Pillow reads) | No | Little web demand; OpenJPEG is absent from pyvips-binary but present in Pillow. |
| WebP 2 | No | No | Squoosh labels it "WebP v2 (unstable)" (`src/features/encoders/wp2/shared/meta.ts`); no browser support or stable bitstream. |
| Ultra HDR JPEG | Later | Later | libvips 8.18 bundles libuhdr (`uhdrload`/`uhdrsave` present). Worth a dedicated HDR policy later. |

## Encoder choice per output format

### JPEG: MozJPEG (via libvips), with jpegli as challenger

Size at equal SSIMULACRA2. All 4:2:0, 1.92 MP, one core on an arm64 container.
Values are KiB, interpolated:

| Image | Encoder | @70 | @80 | @85 | ms @80 |
| --- | --- | ---: | ---: | ---: | ---: |
| bird | libjpeg-turbo (Pillow, `optimize`) — **current** | 92.2 | 181.0 | 275.5 | 7 |
| bird | MozJPEG: trellis + deringing + optimize_scans + quant_table 3 + progressive | **64.7** | **145.7** | **219.0** | 89 |
| bird | MozJPEG: trellis, quant_table 0 (Annex K) | 82.5 | 170.0 | 274.2 | 70 |
| bird | jpegli (pyjpegli defaults) | 76.2 | 148.6 | 241.2 | 11 |
| landscape | libjpeg-turbo — **current** | 241.8 | 389.8 | 552.9 | 9 |
| landscape | MozJPEG, cjpeg-like | **206.2** | **352.0** | **506.4** | 168 |
| landscape | MozJPEG, Annex K | 222.9 | 365.5 | 521.7 | 118 |
| landscape | jpegli | 210.7 | 368.4 | 532.2 | 11 |
| text | libjpeg-turbo — **current** | 167.9 | 221.0 | 286.5 | 5 |
| text | MozJPEG, cjpeg-like | 154.3 | 223.5 | 291.1 | 133 |
| text | MozJPEG, Annex K | 160.9 | **215.2** | **283.4** | 88 |
| text | jpegli | 186.2 | 243.8 | 321.8 | 11 |

Findings:

- At SSIMULACRA2 80, MozJPEG's cjpeg-like settings saved 19.5% (bird) and
  9.7% (landscape) over the current encoder; jpegli saved 17.9% and 5.5%.
  On the text graphic, neither beat libjpeg-turbo meaningfully, and jpegli was
  10% larger. Use WebP/PNG for graphics.
- **libvips with MozJPEG but only `Q` set produced byte-identical files to
  libjpeg-turbo** (same bytes at every Q in the first run). The MozJPEG gain
  exists only when `trellis_quant`/`quant_table`/`optimize_scans` are set.
  The adapter must set them explicitly. Merely linking MozJPEG is not enough.
- **libvips disables chroma subsampling at Q ≥ 90 unless `subsample_mode` is
  set** ([jpegsave docs](https://www.libvips.org/API/current/method.Image.jpegsave.html)).
  In the first run this doubled the bytes between Q 80 and 90. Make
  subsampling an explicit, reported option rather than an implicit Q
  threshold.
- jpegli's speed and size are attractive. The Python binding `pyjpegli` 0.3.2
  (BSD-3, first published October 2026, one maintainer) exposes only
  `quality`. Revisit jpegli when a maintained binding exposes distance, XYB,
  and subsampling, or when we are willing to call `cjpegli`.
  [jpegli](https://github.com/google/jpegli) is libjpeg62 ABI-compatible.
  A libvips build linked against it would be a cleaner path, but no published
  wheel does this.

### PNG: libvips/libpng, plus optional OxiPNG; lossy palette reduction separate

Lossless bytes and encode ms. Every result decoded to exactly the source pixels:

| Encoder | alpha KiB / ms | bird KiB / ms | landscape KiB / ms | text KiB / ms |
| --- | --- | --- | --- | --- |
| Pillow zlib level 6 (**current default**) | 103.1 / 50 | 2,403.6 / 609 | 3,026.1 / 428 | 200.2 / 36 |
| Pillow level 9 + `optimize` | 87.3 / 285 | 2,317.9 / 1,270 | 2,925.4 / 1,336 | 196.1 / 149 |
| libvips `compression=6, filter=all` | 100.1 / 39 | 2,402.8 / 130 | 2,983.0 / 118 | 197.0 / 20 |
| libvips `compression=9, filter=all` | 74.8 / 169 | 2,323.7 / 641 | 2,932.6 / 525 | 195.3 / 100 |
| libvips `compression=6` with default `filter` (none) | 2,153.9 / 26 | 3,610.2 / 63 | 4,194.6 / 67 | 180.7 / 6 |
| OxiPNG level 2 (pyoxipng 9.1.1) | 79.0 / 975 | 2,249.1 / 1,196 | 2,852.8 / 955 | 79.4 / 187 |
| OxiPNG level 4 | 67.5 / 5,541 | 2,234.4 / 3,171 | 2,852.4 / 3,157 | 78.2 / 1,217 |
| *WebP lossless (q80, m4)* | 57.0 / 426 | 1,808.4 / 818 | 2,381.6 / 746 | 4.5 / 26 |
| *JPEG XL lossless (e7)* | 50.4 / 683 | 1,628.7 / 1,207 | 2,218.8 / 1,692 | 101.5 / 265 |
| *QOI (Pillow)* | 3,976.1 / 787 | 2,720.8 / 1,171 | 3,550.7 / 1,373 | 249.0 / 385 |

- **libvips' default PNG row filter is "none"**
  ([pngsave docs](https://www.libvips.org/API/current/method.Image.pngsave.html)).
  It produced files up to 21× larger on the alpha graphic. The adapter must
  pass `filter=all` (or adaptive filtering), or the libvips switch regresses
  sizes. The earlier libvips benchmark
  (`docs/pillow-libvips-benchmark-2026-10-15.md` in the working tree)
  reported Pillow-like sizes, so any adapter must set the filter explicitly.
- With `filter=all`, libvips level 6 matches Pillow level 6 bytes at 3–5× the
  speed on photos.
- OxiPNG compresses better, chiefly on graphics: the text image is 60% smaller
  than Pillow's best. It costs 1–5 s even at its default level 2. Offer it as
  an explicit `optimize` effort option with a time bound, not as the default
  path for large photos.
- In Squoosh, OxiPNG runs with `optimize_alpha = true`
  (`codecs/oxipng/src/lib.rs`). That rewrites the RGB values of fully
  transparent pixels, which is lossy for hidden RGB. The platform currently
  guarantees that PNG preserves hidden RGB samples, so keep
  `optimize_alpha` off unless a caller opts in. The table above preserves
  hidden RGB.
- Palette reduction (pngquant-style) is lossy and a separate step. libvips
  `pngsave(palette=True, Q, dither, effort, bitdepth)` uses the bundled
  libimagequant 2.4.1 fork, which is **BSD-2**. Upstream libimagequant v4 and
  pngquant are GPL-3.0-or-later.

### WebP: libwebp via libvips

libwebp is the only serious WebP encoder, so there is no encoder choice. The
API reach is the question (see options). Pillow and libvips share libwebp
1.6.0; the earlier benchmark found byte-identical outputs. At SSIMULACRA2 80,
lossy WebP (m4) was 397 KiB on landscape versus 352 KiB for tuned MozJPEG. It
did not reach 80 on the bird photo at q ≤ 90. WebP lossy is not a size win
over tuned JPEG for photos on these fixtures. Its value is alpha, animation,
and lossless graphics (the text image is 4.5 KiB lossless).

### AVIF: libavif + aom via Pillow (tune=iq)

| Image | aom speed 6 KiB @80 / ms | aom speed 4 KiB @80 / ms |
| --- | --- | --- |
| bird | 141.1 / 750 | 123.2 / 6,520 |
| landscape | 281.5 / 1,554 | 268.3 / 12,102 |
| text | 11.7 / 809 | 7.8 / 6,506 |

- Pillow 12.3.0 wheels bundle libavif 1.4.2 with aom 3.14.1 as the only
  encoder and dav1d 1.5.3 as decoder (probe: `_avif.codec_versions()`).
  libavif ≥ 1.4.0 with aom ≥ 3.13 defaults still images to **tune=iq**, an
  SSIMULACRA2-guided mode
  ([libavif #2830](https://github.com/AOMediaCodec/libavif/commit/9688dcf260f9aa442cfdb5e1dac6dfc6240bcfe4),
  [libaom 3.12 notes](https://aomedia.org/blog%20posts/Libaom-3_12_0-Now-Available-from-Codec-Working-Group/)).
  libvips' `heifsave` drives aom through libheif, not libavif. It exposes a
  `tune` string; its default was not verified. This plausibly explains why the
  earlier benchmark found libvips AVIF files 1.4–2.2× larger than Pillow's at
  the same nominal quality. Prefer Pillow for AVIF encoding until libvips is
  shown to match with `tune=iq`.
- pyvips-binary contains only aom. libvips accepted `encoder=rav1e`,
  `svt`, and `x265` without error, but those encoders are not bundled
  ([THIRD-PARTY-NOTICES](https://github.com/kleisauke/libvips-packaging/blob/main/THIRD-PARTY-NOTICES.md)).
  Report the real encoder; do not trust the request parameter.
- AVIF beat tuned JPEG by 20% (landscape) to 3% (bird) at speed 6. It cost
  about 8–9× tuned MozJPEG's encode time and about 100× libjpeg-turbo's. Speed 4 saves another 5–13% for 8× more time. Keep
  default speed 6, and cap `effort` by pixel count before reserving credits.

### JPEG XL: libjxl via imagecodecs (or pinned `cjxl`)

JPEG XL (libjxl 0.12.0, effort 7) was smallest for both lossy photos at
SSIMULACRA2 80: 98.5 KiB bird and 268.8 KiB landscape, against 141.1/281.5
for AVIF s6 and 145.7/352.0 for tuned MozJPEG. It was also smallest lossless
except on the palette-like text image. It took about 600–700 ms. Effort 5 was
nearly identical in size at half the time, so 5–7 is the sensible default
range. Python paths:

- `imagecodecs` 2026.10.10: BSD-3, bundles libjxl 0.12.0. Its
  `jpegxl_encode` exposes `level`/`distance`, `effort`, `lossless`,
  `decodingspeed`, bit depth, and color metadata, but not `progressive`,
  `epf`, `photon_noise_iso`, or `modular`. The wheel is 28 MB because it
  bundles many unrelated codecs.
- `pillow-jxl-plugin` 1.3.8 exposes fewer options and is **GPL-3.0**.
- The libjxl `cjxl` binary (BSD-3) exposes every Squoosh JXL option (and
  more). It costs a subprocess and a PNG/PPM pipe per request.

### GIF, QOI, TIFF, ICO, BMP

- **GIF**: libvips `gifsave` (cgif 0.5.4 + libimagequant): `dither`, `effort`
  1–10, `bitdepth` 1–8, `interframe_maxerror`, `interpalette_maxerror`,
  `reuse`, `interlace`, `keep_duplicate_frames`
  ([gifsave docs](https://www.libvips.org/API/current/method.Image.gifsave.html)).
  gifski produces higher-quality GIFs but is **AGPL-3.0** (compatible with
  this AGPL project, though it adds a Rust binary). Only consider it if GIF
  quality becomes a product concern.
- **QOI**: no options exist in Squoosh (`defaultOptions: {}`) or the format.
  The Pillow 12.3 writer was slow in this test (0.4–1.4 s). Prefer
  `imagecodecs.qoi_encode` if QOI is offered. QOI stores only 8-bit RGB/RGBA
  with a colorspace flag, without ICC.
- **TIFF**: libvips `tiffsave`. Expose `compression` (none, deflate, lzw, zstd,
  jpeg, webp), `Q` for lossy modes, `predictor`, `bitdepth`, and `tile`.
  Pyramid and BigTIFF options are out of scope.
- **ICO**: Pillow `sizes` (default 16–256 px set). **BMP**: no options.

## Squoosh option inventories and the proposed platform mapping

Squoosh option sets are taken from each encoder's `shared/meta.ts` defaults,
`client/index.tsx` UI ranges and labels, and the codec bindings under
`codecs/*/enc`. Squoosh bundles old encoder versions: MozJPEG 3.3.1,
libavif 1.0.1 with libaom 3.7.0, pinned libwebp (`d2e245e`) and libjxl
(`9f54464`) commits, OxiPNG 9.0, and libimagequant 2.12.1 (per
`codecs/*/Makefile` and `Cargo.toml`). Our server encoders are newer, so
quality numbers do not carry over.

"Reach" says how the platform can set the option in-process: **V** = libvips
saver argument, **P** = Pillow save argument, **IC** = imagecodecs,
**OX** = pyoxipng, **CLI** = only through a reference binary or direct C API.
Proposed API names are suggestions; the API contract ticket settles naming.

### MozJPEG (Squoosh `mozJPEG`)

| Squoosh option (UI label) | Range | Squoosh default | Reach | Proposed |
| --- | --- | --- | --- | --- |
| `quality` (Quality) | 0–100 | 75 | V `Q` | `quality`, default 75 |
| `color_space` (Channels: Grayscale / RGB / YCbCr) | enum | YCbCr | V partially (convert to `b-w` before save for grayscale); RGB JPEG: CLI | `channels: ycbcr \| grayscale` |
| `auto_subsample` (Auto subsample chroma) | bool | true | V `subsample_mode=auto` | `chroma_subsampling: auto \| 4:2:0 \| 4:4:4`, default **4:2:0** (avoid libvips' Q≥90 jump) |
| `chroma_subsample` (Subsample chroma by) | 1–4 (factor H=V) | 2 | V only 1 or 2; 3–4: CLI `-sample` | covered above |
| `separate_chroma_quality` + `chroma_quality` | bool; 0–100 | false; 75 | CLI (`-quality L,C`) | not exposed initially |
| `baseline` ("Pointless spec compliance") | bool | false | CLI `-quant-baseline` (clamps tables to 8-bit) | not exposed |
| `progressive` (Progressive rendering) | bool | true | V `interlace` | `progressive`, default true |
| `optimize_coding` (Optimize Huffman table; shown only with baseline) | bool | true | V | always on (not an option) |
| `smoothing` (Smoothing) | 0–100 | 0 | CLI `-smooth` | not exposed |
| `quant_table` (Quantization) | 0 JPEG Annex K, 1 Flat, 2 MSSIM-tuned Kodak, 3 ImageMagick, 4 PSNR-HVS-M-tuned Kodak, 5 Klein et al, 6 Watson et al, 7 Ahumada et al, 8 Peterson et al | 3 | V `quant_table` 0–8 | `quantization_table` enum, default `imagemagick` (3) |
| `trellis_multipass` (Trellis multipass) | bool | false | C API only (`JBOOLEAN_USE_SCANS_IN_TRELLIS`) | not exposed |
| `trellis_opt_zero` (Optimize zero block runs) | bool | false | C API only (`JBOOLEAN_TRELLIS_EOB_OPT`) | not exposed |
| `trellis_opt_table` (Optimize after trellis quantization) | bool | false | C API only (`JBOOLEAN_TRELLIS_Q_OPT`) | not exposed |
| `trellis_loops` (Trellis quantization passes) | 1–50 | 1 | C API only (`JINT_TRELLIS_NUM_LOOPS`) | not exposed |
| `arithmetic` (no UI) | bool | false | CLI `-arithmetic` | never (poor decoder support) |
| — (libvips extras) | | | V `trellis_quant`, `overshoot_deringing`, `optimize_scans`, `restart_interval` | `trellis` default true; `deringing` default true; `optimize_scans` default true |

Squoosh's binding calls `jpeg_c_set_*_param` directly
(`codecs/mozjpeg/enc/mozjpeg_enc.cpp`). That is why it can set trellis
internals that neither libvips nor `cjpeg` exposes: the `cjpeg` help text
has `-notrellis`, `-trellis-dc`, `-tune-*`, `-quant-table`, `-sample`, and
`-smooth`, but no trellis-loop or multipass switch
([cjpeg.c](https://github.com/mozilla/mozjpeg/blob/master/cjpeg.c)).
Full parity therefore means a small C extension against MozJPEG. That is a
maintenance cost to accept only after measuring benefit.

### OxiPNG (Squoosh `oxiPNG`) and PNG generally

| Squoosh option | Range | Default | Reach | Proposed |
| --- | --- | --- | --- | --- |
| `level` (Effort) | 0–6 (OxiPNG preset) | 2 | OX `level` | `effort` 0–6; omitted = no OxiPNG pass, libvips level 6 + `filter=all` |
| `interlace` (Interlace) | bool | false | V `interlace`, OX `interlace` | `interlace`, default false |
| (hard-coded) `optimize_alpha` | | true | OX `optimize_alpha` | `clean_transparent_pixels`, default **false** |

Extras worth exposing: `compression_level` 0–9 (existing API), `bit_depth`
(1/2/4/8/16; V `bitdepth`), `strip_metadata`. OxiPNG also has `--zopfli`
(slow, uncertain gain), `--fast`, filters, and reductions. Leave them to the
effort preset. OxiPNG upstream is 10.0.0; pyoxipng wraps 9.1.

### Reduce palette (Squoosh `quantize` processor)

| Squoosh option | Range | Default | Reach | Proposed |
| --- | --- | --- | --- | --- |
| `maxNumColors` (Colors) | 2–256 | 256 | V `pngsave(palette=True, bitdepth)`; GIF via `gifsave` | `palette.colors` 2–256 |
| `dither` (Dithering) | 0–1, step 0.01 | 1.0 | V `dither` | `palette.dither` 0–1, default 1.0 |
| `zx` (Type: Standard / ZX) | 0/1 | 0 | none (ZX Spectrum novelty) | not exposed |
| — | | | V `Q` (quantisation quality 0–100), `effort` 1–10 (default 7) | `palette.quality`, `palette.effort` |

libvips derives palette size from `bitdepth` (≤ 8 bits ⇒ ≤ 256 colors), not an
arbitrary color count. An exact `colors=37` needs libimagequant's
`max_colors`, which libvips does not expose for PNG. Either round up to a
power of two and report it, or call libimagequant directly. Palette reduction
applies to PNG (and GIF, which is always palettized). Expose it as an explicit
lossy option, never a hidden default.

### WebP (Squoosh `webP`)

Squoosh defaults come from libwebp's `WebPConfig`
(`src/features/encoders/webP/shared/meta.ts`). Lossless effort 0–9 maps to
libwebp's `kLosslessPresets` `[method, quality]` pairs: `[0,0] [1,20] [2,25]
[3,30] [3,50] [4,50] [4,75] [4,90] [5,90] [6,100]`, default index 6. This is
the same as `cwebp -z`.

| Squoosh option (UI label) | Range | Default | Reach | Proposed |
| --- | --- | --- | --- | --- |
| `lossless` (Lossless) | bool | false | V, P | `lossless` (existing) |
| `quality` (Quality) | 0–100 step 0.1 | 75 | V `Q` (int), P | `quality` int 0–100, default 80 (existing) |
| `method` (Effort, lossy) | 0–6 | 4 | V `effort`, P `method` | `effort` 0–6, default 4 |
| lossless preset (Effort, lossless) | 0–9 | 6 | V `effort` + `Q` (map preset) | `effort` 0–9 when lossless |
| `near_lossless` (Slight loss) | 0–100 (UI shows 100−value) | 100 (off) | V `near_lossless` bool + `Q` only; exact level: CLI | `near_lossless` 0–100 (map to Q) |
| `image_hint` (Discrete tone image) | default/picture/photo/graph | default | V `preset` (drawing/icon/text ≈ graph) | `preset: default \| photo \| picture \| drawing \| icon \| text` |
| `exact` (Preserve transparent data) | bool | false | V, P | `preserve_transparent_rgb`, default **true for lossless** (current platform guarantee) |
| `alpha_compression` (Compress alpha) | 0/1 | 1 | CLI `-alpha_method` | not exposed |
| `alpha_quality` (Alpha quality) | 0–100 | 100 | V `alpha_q`, P `alpha_quality` | `alpha_quality`, default 100 |
| `alpha_filtering` (Alpha filter quality) | 0–2 | 1 | CLI `-alpha_filter` | not exposed |
| `autofilter` (Auto adjust filter strength) | bool | false | V `smart_deblock` | `auto_filter`, default false |
| `filter_strength` (Filter strength) | 0–100 | 60 | CLI `-f` | not exposed |
| `filter_type` (Strong filter) | 0/1 | 1 | CLI `-strong/-nostrong` | not exposed |
| `filter_sharpness` (Filter sharpness) | 0–7 | 0 | CLI `-sharpness` | not exposed |
| `use_sharp_yuv` (Sharp YUV) | bool | false | V `smart_subsample` | `sharp_yuv`, default false |
| `pass` (Passes) | 1–10 | 1 | V `passes` | `passes`, only with `target_size` |
| `sns_strength` (Spatial noise shaping) | 0–100 | 50 | CLI `-sns` | not exposed |
| `preprocessing` (None / Segment smooth / Pseudo-random dithering) | 0–2 | 0 | CLI `-pre` | not exposed |
| `segments` (Segments) | 1–4 | 4 | CLI `-segments` | not exposed |
| `partitions` (Partitions) | 0–3 | 0 | CLI `-partition_limit` (approximate) | not exposed |
| `target_size`, `target_PSNR` (no UI) | bytes; dB | 0 | V `target_size`; PSNR: CLI | `target_bytes` belongs to a separate bounded-search feature |
| animation (no Squoosh UI) | — | — | V `kmin`, `kmax`, `min_size`, `mixed`; P `duration`, `loop`, `minimize_size`, `allow_mixed` | `animation.*` group |

### AVIF (Squoosh `avif`)

Squoosh shows **Effort** 0–10 and stores `speed = 10 − effort`
(`src/features/encoders/avif/client/index.tsx`). Lossless means quality 100,
alpha quality 100, 4:4:4, and identity matrix (`codecs/avif/enc/avif_enc.cpp`).
With `tune: auto`, Squoosh uses SSIM tuning for quality ≥ 50 and PSNR below.

| Squoosh option (UI label) | Range | Default | Reach | Proposed |
| --- | --- | --- | --- | --- |
| Lossless | bool | false | P `quality=100` + 4:4:4 (+ `advanced`) | `lossless` |
| `quality` (Quality) | 0–99 (100 = lossless) | 50 | P `quality` (Pillow default 75); V `Q` (default 50) | `quality`; default to be chosen on the representative set because tune=iq changes the scale |
| `qualityAlpha` (Separate alpha quality) | −1 = same, 0–99 | −1 | avifenc `--qalpha`; libavif `qualityAlpha` not in Pillow API | `alpha_quality` — needs Pillow `advanced` "alpha:" keys or `avifenc`; verify before exposing |
| `subsample` (Subsample chroma) | 4:0:0 / 4:2:0 / 4:2:2 / 4:4:4 | 4:2:0 | P `subsampling`; V `subsample_mode` (on/off only) | `chroma_subsampling`, default 4:2:0 |
| `enableSharpYUV` (Sharp YUV Downsampling) | bool | false | avifenc `--sharpyuv`; not a Pillow argument | not exposed initially |
| `chromaDeltaQ` (Extra chroma compression) | bool | false | P `advanced={"enable-chroma-deltaq":"1"}` | not exposed (tune=iq already enables chroma delta-q) |
| `sharpness` (Sharpness) | 0–7 | 0 | P `advanced={"sharpness":…}` | `sharpness` 0–7, default 0 |
| `denoiseLevel` (Noise synthesis) | 0–50 | 0 | P `advanced={"denoise-noise-level":…}` | `noise_synthesis` 0–50, default 0 |
| `tune` (Tuning: Auto / PSNR / SSIM) | enum | auto | P `advanced={"tune":…}` | `tune: auto \| iq \| ssim \| psnr`, default auto (= iq for lossy stills) |
| `tileRowsLog2`, `tileColsLog2` | 0–6 | 0 | P `tile_rows`, `tile_cols`, `autotiling` | not exposed (server decides by size) |
| `speed` (via Effort) | 0–10 | 6 | P `speed`; V `effort` 0–9 | `effort` 0–10, default 4 (= speed 6), capped by pixel count |
| — (libavif extras) | | | P `range`, bit depth via 16-bit input mode, `alpha_premultiplied` | `bit_depth: 8 \| 10 \| 12` later, with an HDR policy |

### JPEG XL (Squoosh `jxl`)

Squoosh maps quality to Butteraugli distance:
`d = 0.1 + (100 − q) × 0.09` for q ≥ 30, otherwise
`6.4 + 2.5^((30 − q)/5) / 6.25`. It switches to modular mode for q = 100 or
"Alternative lossy mode", and forces modular below quality 7. Speed tier is
`10 − effort` (`codecs/jxl/enc/jxl_enc.cpp`). libjxl now offers
`JxlEncoderDistanceFromQuality`, which should replace this hand mapping.

| Squoosh option (UI label) | Range | Default | Reach | Proposed |
| --- | --- | --- | --- | --- |
| Lossless | bool (= quality 100) | false | IC `lossless`; CLI `-d 0` | `lossless` |
| `lossyPalette` (Slight loss, lossless only) | bool | false | CLI (`--lossy-palette`, modular) | not exposed initially |
| `quality` (Quality) | 0–99.9 step 0.1 | 75 | IC `level`/`distance`; CLI `-q`/`-d` | `quality` 0–100 (default 75) **or** `distance` 0–25 (mutually exclusive) |
| `lossyModular` (Alternative lossy mode) | bool | false | CLI `--modular=1` | not exposed initially |
| `epf` (Auto edge filter / Edge preserving filter) | −1 auto, 0–3 | −1 | CLI `--epf` | not exposed initially |
| `decodingSpeedTier` (Optimise for decoding speed) | 0–4 | 0 | IC `decodingspeed`; CLI `--faster_decoding` | `decoding_speed` 0–4, default 0 |
| `photonNoiseIso` (Noise equivalent to ISO) | 0–50000 step 100 | 0 | CLI `--photon_noise_iso` | `photon_noise_iso`, default 0 (needs CLI) |
| `progressive` (Progressive rendering) | bool | false | CLI `-p`/`--progressive_dc` | `progressive` (needs CLI) |
| `effort` (Effort) | 1–9 in Squoosh; libjxl 1–10 | 7 | IC `effort`; CLI `-e` | `effort` 1–10, default 7, capped by pixel count |
| — | | | CLI `--lossless_jpeg` (reversible JPEG recompression) | `jpeg_recompression` for JPEG inputs — a distinct, attractive lossless option |

Effort semantics: [libjxl encode_effort.md](https://github.com/libjxl/libjxl/blob/main/doc/encode_effort.md).

### WebP v2 (Squoosh `wp2`): do not offer

Recorded for completeness: `quality` 0–95 (step 0.1, > 95 is lossless with
"slight loss" 0–5), `alpha_quality` 0–100 (75), `effort` 0–9 (5), `pass` 1–10
(1), `sns` 0–100 (50), `error_diffusion` 0–100 (0), `uv_mode`
(Auto / Vary / Half / Off), `csp_type` (YCoCg / YCbCr / YIQ), and
`use_random_matrix`. Squoosh pins an unreleased libwebp2 commit. There is no
stable Python path.

### QOI (Squoosh `qoi`)

No options (`defaultOptions: {}`). Pillow accepts only `colorspace`.

### Browser encoders in Squoosh

`browserJPEG` (`quality` 0–1, default 0.75), `browserPNG` and `browserGIF`
(no options) use the canvas encoder. They have no server equivalent and are
irrelevant here.

## Resize (Squoosh `resize` processor) and rotate

| Squoosh option | Values | Default | libvips equivalent | Proposed |
| --- | --- | --- | --- | --- |
| `method` | triangle, catrom, mitchell, lanczos3, hqx (pixel art, integer 1–4× factor), browser-pixelated/low/medium/high, vector (SVG input) | lanczos3 (vector for SVG) | `resize(kernel=nearest\|linear\|cubic\|mitchell\|lanczos2\|lanczos3\|mks2013\|mks2021)`; SVG re-rasterization at target size via `svgload(scale)` | `resize.method: lanczos3 \| mitchell \| cubic(catrom) \| linear(triangle) \| nearest`, default lanczos3; hqx not offered |
| Preset | 25%, 33.33%, 50%, 100%, 200%, 300%, 400%, Custom | — | — | client-side convenience only; the API takes dimensions |
| `width`, `height` | ≥ 1 | image size | `thumbnail_image(width, height=…)` | `resize.width`, `resize.height` (either or both) |
| Maintain aspect ratio | bool (UI) | true | `thumbnail` keeps aspect ratio | `resize.fit: contain \| cover \| fill`, default contain |
| `fitMethod` | stretch / contain | stretch | `fill` = `size=force`; contain/cover = `crop` | covered by `fit` |
| `premultiply` (Premultiply alpha channel) | bool | true | `thumbnail` premultiplies automatically; for `resize` call `premultiply()`/`unpremultiply()` | always premultiply (correctness, not an option) |
| `linearRGB` (Linear RGB) | bool | true | `thumbnail(linear=True)` | `resize.linear_light`, default true (slower; measure) |
| `rotate` (rotate preprocessor) | 0/90/180/270 | 0 | `rot` | `rotate`; EXIF auto-orient stays on |

Add `without_enlargement` (libvips `size=down`). Upscaling with Lanczos is
not super-resolution; model upscaling is a different operation.

## Feature support by output format and chosen encoder

| Format / encoder | Alpha | Animation | ICC | Bit depth | Notes |
| --- | --- | --- | --- | --- | --- |
| JPEG / MozJPEG | No (flatten; existing white policy) | No | Yes (`profile`, `keep`) | 8 (12-bit and lossless JPEG exist but are not web formats) | Ultra HDR gain-map JPEG via libuhdr later |
| PNG / libpng + OxiPNG | Yes, soft | APNG read; write later | Yes (iCCP) | 1/2/4/8/16 | OxiPNG `optimize_alpha` must stay off for hidden-RGB guarantee |
| WebP / libwebp | Yes (lossless exact or lossy alpha) | Yes | Yes | 8 only | Lossy is 4:2:0 only; `sharp_yuv` mitigates |
| AVIF / libavif+aom | Yes (separate alpha plane) | Yes (write later) | Yes (ICC or CICP) | 8/10/12 | 4:0:0/4:2:0/4:2:2/4:4:4; HDR via CICP PQ/HLG |
| JPEG XL / libjxl | Yes | Yes | Yes (ICC or enum) | 8–16 int, 16/32 float | Lossless JPEG recompression; best HDR story |
| GIF / cgif | 1-bit only | Yes | No | ≤ 8 bpp palette | Soft alpha cannot be preserved; must report thresholding |
| QOI | Yes | No | No (sRGB/linear flag) | 8 | |
| TIFF / libtiff | Yes | Multi-page | Yes | 1–16, float | |
| ICO / Pillow | Yes | No | No | 8 (PNG-in-ICO) | Max 256×256 |

Every lossy-alpha or alpha-dropping path (JPEG, GIF, lossy WebP/AVIF alpha
quality < 100) must be reported in metadata, consistent with the current
"transparency becomes white" disclosure.

## Driving the encoders from Python on a CPU Linux worker

Pinned wheel facts (manylinux x86_64, Python 3.12, sizes from PyPI):

| Package | Version | Wheel | Provides | License |
| --- | --- | --- | --- | --- |
| pyvips + pyvips-binary | 3.2.0 / 8.18.7 | 8.1 MB | libvips 8.18.7 with MozJPEG `0826579` (reports "mozjpeg version 5.0.0"), libwebp 1.6.0, aom 3.15.1 (via libheif 1.23.5), libpng 1.6.58, cgif 0.5.4, libimagequant 2.4.1 (BSD fork), libtiff 4.7.2, librsvg 2.63.2, libuhdr 2.0.2, lcms 2.19.1, libexif, highway | MIT binding; LGPL-3.0 libvips; bundled libs per [notices](https://github.com/kleisauke/libvips-packaging/blob/main/THIRD-PARTY-NOTICES.md) |
| pillow | 12.3.0 | 6.9 MB | libjpeg-turbo, libpng, libwebp 1.6.0, libavif 1.4.2 (aom 3.14.1 enc, dav1d 1.5.3 dec), OpenJPEG, libtiff, lcms2. No libimagequant in wheel. | MIT-CMU |
| pillow-heif | 1.8.1 | 5.7 MB | libheif 1.23.6, libde265 1.1.3 (HEVC decode), x265 4.3 (HEVC encode). No AVIF codec. | BSD-3 binding; libheif/libde265 LGPL-3; **x265 GPL-2** |
| imagecodecs | 2026.10.10 | 28.4 MB | libjxl 0.12.0, libavif 1.4.2, QOI, libwebp, libpng/APNG, libspng, zopfli, libultrahdr, and many scientific codecs. **No MozJPEG.** | BSD-3 + bundled |
| pyoxipng | 9.1.1 | 0.7 MB | OxiPNG 9.1 (Rust), in-memory, raw RGBA input | MIT |
| pyjpegli | 0.3.2 | 0.3 MB | jpegli, `quality` only | BSD-3 (single maintainer, new) |
| pillow-jxl-plugin | 1.3.8 | 2.5 MB | libjxl via Rust | **GPL-3.0** |

Runtime probe (amd64) confirmed: `jxlsave`, `jp2ksave`, `magicksave`, and
`pdfload` are absent from pyvips-binary. `heifsave` works only for AV1, and
HEVC decode fails. `uhdrsave`, `svgload`, and `gifsave` are present. MozJPEG
extension parameters are accepted by `jpegsave`.

Build implications:

- **No compiler needed for the recommended set.** Everything above ships
  manylinux x86_64 and aarch64 wheels. Over the existing Pillow, the
  new wheels total about 15 MB compressed (pyvips-binary, pillow-heif,
  pyoxipng), or about 43 MB with imagecodecs. Installed size is larger.
- **imagecodecs is heavy for one codec.** If JPEG XL is the only reason to add
  it, a pinned `cjxl` static binary from a libjxl release (BSD-3) is smaller
  and exposes every option. The cost is a subprocess (a few ms) and a
  temporary PNG/PPM per request. Decide by whether the JXL options listed as
  "needs CLI" are wanted at launch.
- **Full Squoosh MozJPEG/WebP parity needs native code**: a small CFFI/C
  extension against MozJPEG and libwebp, or the reference CLIs. Building
  MozJPEG/libwebp from source adds a CMake toolchain stage. That is a real
  maintenance cost for a one- or two-person team. Defer it until measurements
  show the hidden knobs matter.
- **Do not build a custom libvips** (for libjxl, HEVC, or jpegli) unless a
  measured need appears. pyvips-binary wheels track libvips releases; a
  custom build makes us the security patcher for every bundled codec.
- **Two libavif/libwebp copies** (Pillow and pyvips-binary bundle their own)
  are fine in one process because each wheel vendors renamed shared objects
  (`libavif-8a7f9d56.so`). Report the version of the copy that encoded.
- Cap effort-heavy encoders (AVIF speed ≤ 4, JXL effort ≥ 8, OxiPNG ≥ 3,
  WebP lossless effort 9) by pixel count before reserving credits. The
  current 60-second task timeout is otherwise reachable: AVIF speed 4 took
  12 s on a 1.9 MP image on one core, and 25 MP is allowed.

## Licenses (brief; see the dedicated ticket)

The recommended set is permissive or LGPL (dynamic, vendored in wheels):
MozJPEG (IJG/BSD-3/zlib), libwebp (BSD-3), libavif (BSD-2), aom (BSD-2 +
AOM patent license), libjxl (BSD-3), cgif (MIT), libimagequant 2.4.1 fork
(BSD-2), OxiPNG (MIT), QOI (MIT), libvips/libheif/librsvg (LGPL-3).
Flags for that ticket:

- x265, bundled in pillow-heif, is GPL-2. That wheel is needed for HEIC
  *decode* only. Check whether a decode-only build is required.
- HEVC patents affect HEIC.
- pillow-jxl-plugin is GPL-3.
- Upstream libimagequant v4 and pngquant are GPL-3.
- gifski is AGPL-3.0.

Squoosh is Apache-2.0. Its WASM builds are not used.

## Risks and what would change these choices

- **Small fixture set.** Three content images cannot settle JPEG/AVIF/JXL
  defaults. Before changing production defaults, rerun on x86_64 Beam CPU
  with representative customer-like images (product photos, screenshots,
  portraits, alpha cutouts) and report cost per 1,000 images.
- **SSIMULACRA2 implementation.** The Python `ssimulacra2` package is not
  the libjxl reference tool. Recheck winners with the reference
  `ssimulacra2` binary or Butteraugli before publishing quality claims.
- **jpegli** becomes the JPEG encoder if a maintained binding or
  libvips-on-jpegli build appears and wins on the representative set. It was
  about 10× faster than tuned MozJPEG here at similar size on photos.
- **libvips AVIF** becomes acceptable if `heifsave(tune="iq")` matches
  Pillow's bytes at equal score. That would remove the second AVIF copy.
- **JXL default status** changes if Firefox ships decoding. Until then JXL is
  opt-in.

## Reproduction

Probe and measurement used `python:3.12-slim` images with `pyvips==3.2.0
pyvips-binary==8.18.7 pillow==12.3.0 pillow-heif==1.8.1
imagecodecs==2026.10.10 pillow-jxl-plugin==1.3.8 pyoxipng==9.1.1
pyjpegli==0.3.2 ssimulacra2==0.3.0 numpy`. The probe ran under
`--platform linux/amd64`. Measurements ran natively on linux/arm64 with
`docker run --cpus=1 --memory=8g`. The quality sweeps were:

| Encoder | Setting swept |
| --- | --- |
| JPEG | Q 50–95 in steps of 5, 4:2:0 forced |
| WebP | q 50–90 |
| AVIF | q 30–80 |
| JXL | distance 3.0–0.5 |

Raw JSON and logs were kept in the session scratchpad, not committed. Rerun
before relying on exact numbers.

## Sources

- Squoosh source, commit `e8d35e0`: [encoders](https://github.com/GoogleChromeLabs/squoosh/tree/dev/src/features/encoders),
  [processors](https://github.com/GoogleChromeLabs/squoosh/tree/dev/src/features/processors),
  [codec bindings](https://github.com/GoogleChromeLabs/squoosh/tree/dev/codecs)
- libvips: [jpegsave](https://www.libvips.org/API/current/method.Image.jpegsave.html),
  [pngsave](https://www.libvips.org/API/current/method.Image.pngsave.html),
  [webpsave](https://www.libvips.org/API/current/method.Image.webpsave.html),
  [heifsave](https://www.libvips.org/API/current/method.Image.heifsave.html),
  [gifsave](https://www.libvips.org/API/current/method.Image.gifsave.html);
  [libvips-packaging versions](https://github.com/kleisauke/libvips-packaging/blob/main/versions.properties)
- [MozJPEG cjpeg.c](https://github.com/mozilla/mozjpeg/blob/master/cjpeg.c),
  [jpegli](https://github.com/google/jpegli),
  [cwebp](https://developers.google.com/speed/webp/docs/cwebp),
  [avifenc](https://github.com/AOMediaCodec/libavif/blob/main/doc/avifenc.1.md),
  [libjxl effort](https://github.com/libjxl/libjxl/blob/main/doc/encode_effort.md),
  [OxiPNG](https://github.com/oxipng/oxipng),
  [Pillow formats](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html)
- AVIF tune=iq: [libaom 3.12](https://aomedia.org/blog%20posts/Libaom-3_12_0-Now-Available-from-Codec-Working-Group/),
  [libavif 1.4.0](https://aomedia.org/blog%20posts/Libavif_v1_4_0-Boasts-Major-Updates-to-Encoder-Technology/)
- [JPEG XL in Chrome](https://developer.chrome.com/blog/jpeg-xl-in-chrome)
- License files: [gifski](https://github.com/ImageOptim/gifski/blob/main/LICENSE),
  [libimagequant](https://github.com/ImageOptim/libimagequant/blob/main/COPYRIGHT)
