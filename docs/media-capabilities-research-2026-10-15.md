# Media capabilities: libraries, models, and rollout

Researched 15 October 2026. This is a primary-source review and a proposed
implementation/evaluation plan. No new library or model was installed, no
benchmark was run, and no production configuration was changed. Published
scores and hardware claims belong to their publishers unless stated otherwise.

## Recommendation

Keep one authenticated API and choose execution tools by workload:

- **Image conversion/compression:** evaluate libvips through pyvips as the new
  CPU worker's default, with the existing Pillow implementation as the baseline.
  Keep Pillow around inference where it already fits. Introduce specialist
  encoders only for a measured size/quality advantage.
- **Video/audio conversion and compression:** FFmpeg plus ffprobe in a bounded
  CPU job worker. Test hardware encoding only after selecting the required
  output quality and compatibility.
- **Image/video upscaling and video matting:** dedicated, pinned model runtimes.
  Image and video quality need different acceptance tests.
- **OCR:** conventional detection/recognition for image text, a document VLM for
  layout-rich parsing, and native text extraction before either for suitable
  digital documents. Route by task; do not run every model on every input.
- **Audio understanding:** transcription first. Treat denoising and generative
  restoration as separate operations with separate quality expectations.

The accompanying investigations contain model comparisons, licenses, and
benchmark evidence:

- [OCR and document/video text](ocr-options-research-2026-10-15.md)
- [Image/video upscaling and video background removal](upscaling-video-research-2026-10-15.md)
- [Audio codecs, enhancement, and transcription](audio-options-research-2026-10-15.md)

The first model experiments should be small and specific:

| Operation | First comparison | Why this is a shortlist rather than a winner |
| --- | --- | --- |
| Image super-resolution | Real-ESRGAN, SwinIR, HAT | Real-world photos, text, alpha, and synthetic downsampling reward different behavior. |
| Video super-resolution | RealBasicVSR, FlashVSR v1.1; SeedVR2 as a heavier comparison | Temporal stability and compute footprint must be tested on clips. FlashVSR+ is a newly released additional candidate with an author-reported RTX 4090 result. |
| Image OCR | PP-OCRv6 against Tesseract | Actual scripts, small text, image quality, and region recall matter. |
| Document parsing | PaddleOCR-VL-1.6 against OvisOCR2; managed Mistral OCR 4.1 baseline | TeleOCR leads the inspected OmniDocBench table but its pipeline-code license needs resolution. Other benchmark names measure different tasks. |
| Portrait video matting | RVM first | GPL terms and selected weight provenance need recording; attractive MatAnyone2 results do not remove its noncommercial restriction. |
| Transcription | Parakeet v3 against Whisper large-v3/faster-whisper | Add Qwen3-ASR or Granite Speech 5.0 for their supported-language workloads. No fresh universal WER ranking was established. |
| Speech cleanup | DeepFilterNet against RNNoise | Listening tests must catch removed consonants and speech damage. Generative bandwidth extension is a later option. |

Primary evidence and license details for each entry are in the linked reports.
For digitally generated PDFs, first inspect whether native text extraction
already satisfies the requested output. Scans and flawed existing OCR layers
need a different path; a text layer alone is not proof of correctness.
[pypdf's extraction/OCR distinction](https://pypdf.readthedocs.io/en/stable/user/extract-text.html#ocr-vs-text-extraction).

## Compression and decompression depend on the format

A library presents a common interface but dispatches to different decoders and
encoders. Decode the source, apply the requested transform, then encode in the
destination format. Some changes can avoid decoding entirely, notably compatible
audio/video stream copying. Decompression reconstructs what the compressed file
contains; it does not recover information already discarded by lossy compression.
[FFmpeg processing model](https://ffmpeg.org/ffmpeg.html),
[WebP compression description](https://developers.google.com/speed/webp/docs/compression).

| Format/workload | What compression controls | Consequence for our product |
| --- | --- | --- |
| JPEG photos | Encoder, quality, chroma subsampling, entropy optimization, progressive layout | Lossy re-encoding can change pixels. A quality value is specific to its encoder, not a cross-format quality score. |
| PNG graphics/alpha | Lossless filtering and compression effort; optional palette reduction is a separate choice | Slower encoding can reduce size without changing decoded samples. Reducing colors can lose information and must be explicit. |
| WebP | Separate lossy/lossless modes, encoding effort, alpha settings | Choose the mode deliberately; lossless output from a JPEG can grow while preserving only the already degraded image. |
| AVIF | Quality, effort/speed, bit depth, chroma settings, codec implementation | Evaluate encode cost and color preservation along with output size. Actual capabilities depend on the built library. |
| Video | Codec, rate control, encoding preset, dimensions, frame rate, audio and subtitle streams | Container extension alone does not identify compression or playback compatibility. |
| Audio | Lossy codec/bitrate or lossless codec; sample rate, channels and bit depth | A WAV container can contain different encodings. Increasing rate or bit depth cannot restore missing detail. |

Sources: [Pillow format options](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html),
[Sharp encoder controls](https://sharp.pixelplumbing.com/api-output/),
[WebP encoder controls](https://developers.google.com/speed/webp/docs/cwebp),
[WebP FAQ](https://developers.google.com/speed/webp/faq),
[FFmpeg codecs](https://ffmpeg.org/ffmpeg-codecs.html).

For an API, distinguish `lossless`, `balanced`, and an explicitly lossy mode.
Map these to format-specific, versioned encoder settings internally. Optional
`target_bytes` requires a bounded search and a clear outcome when the target
cannot be reached at the minimum allowed quality/dimensions. Never silently
resize or discard alpha to satisfy a byte target. Return original/output bytes,
dimensions, actual format, and whether meaningful savings were achieved. An
already optimized file may not get smaller.

## Image libraries: where each fits

| Tool | Strength | Limitation and recommendation |
| --- | --- | --- |
| Pillow | Simple Python image manipulation; already used in this repository; good integration with Python models | Suitable first implementation for existing formats. Being convenient does not establish best compression, memory use, color handling, or throughput. Keep as the comparison baseline. |
| libvips / pyvips | Demand-driven processing, many formats and operations, Python bindings | My preferred candidate for a dedicated image transform worker. Native codec builds still determine formats and behavior. Measure against Pillow on our bounded uploads. |
| Sharp | Node binding using libvips with a convenient image API and explicit codec controls | Strong choice for a Node processing container. Using pyvips avoids adding a Node runtime to our Python processing tier. This does not imply Sharp runs unchanged inside Cloudflare Workers. |
| ImageMagick | Broad image formats and composition/conversion operations, with delegate integrations | Useful for a specific format or operation the primary engine cannot cover. Breadth adds configuration and dependency work; do not enable every delegate for arbitrary uploads. |
| FFmpeg | Strong audio/video stream, timing, filter and codec orchestration; can also process image sequences | Use for audiovisual media and model video input/output. It need not replace the image engine for still-image transforms. |

Sources: [Pillow handbook](https://pillow.readthedocs.io/en/stable/handbook/),
[libvips](https://www.libvips.org/), [pyvips](https://github.com/libvips/pyvips),
[Sharp](https://sharp.pixelplumbing.com/),
[ImageMagick delegates](https://usage.imagemagick.org/files/),
[FFmpeg](https://ffmpeg.org/ffmpeg.html).

Sharp's published benchmark is useful implementation evidence, but it tests
particular workloads, versions and environments. It is not proof of a universal
speedup over our current Pillow build. Its own documentation says codec I/O
often determines throughput. Our decision must include startup and transfer,
not just in-process resize time.
[Benchmark and methodology](https://sharp.pixelplumbing.com/performance/).

Specialist encoders deserve a second-stage comparison:

- **libjpeg-turbo** is a speed-oriented JPEG baseline; **MozJPEG** and **Jpegli**
  are useful challengers when the goal is a smaller JPEG at acceptable quality.
  Jpegli has published human-preference evidence, but the reported comparison
  does not establish gains for our photos or current encoder build.
  [libjpeg-turbo tests](https://libjpeg-turbo.org/About/Performance),
  [MozJPEG](https://github.com/mozilla/mozjpeg),
  [Jpegli](https://github.com/google/jpegli),
  [Jpegli study](https://arxiv.org/abs/2403.18589).
- **OxiPNG** is a dedicated lossless PNG/APNG optimizer. **pngquant** reduces
  colors and is lossy; it is not an interchangeable implementation of lossless
  PNG compression. Time-bound expensive optimization and compare saved bytes
  against paid compute. [OxiPNG](https://github.com/oxipng/oxipng),
  [pngquant](https://pngquant.org/).

Conversion also needs a feature policy: alpha flattening color, ICC profiles,
EXIF orientation, animation/frame timing, bit depth, HDR, and metadata retention.
Changing the suffix or dropping all metadata is not sufficient. A PDF-to-PNG
render is different from preserving searchable text or editable document
structure; ImageMagick delegates do not make those equivalent.
[Pillow format behavior](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html),
[ImageMagick file/delegate handling](https://usage.imagemagick.org/files/).

This refines the earlier Pillow recommendation: Pillow was the smallest extension
of the current code. For a broader dedicated image product, libvips deserves the
first implementation comparison. No rewrite of the working matting pipeline is
needed to run that experiment.

## Is FFmpeg the best video/audio tool?

For this product's uploaded-file jobs, **FFmpeg is my default recommendation**.
The real quality decision is the encoder and its settings. FFmpeg orchestrates
them; selecting it alone does not select the best size/quality/latency tradeoff.

Use ffprobe to inspect the actual streams and metadata. An MP4 containing H.264
video can sometimes move to MKV through stream copying, with no video re-encode.
Changing H.264 to AV1 requires decoding and encoding. Keep compatible audio and
subtitle streams when requested, and report unsupported combinations rather
than silently dropping them.
[ffprobe](https://ffmpeg.org/ffprobe.html),
[Stream copying and transcoding](https://ffmpeg.org/ffmpeg.html).

Proposed output profiles:

| Profile | Candidate | Decision to measure |
| --- | --- | --- |
| Broad video delivery | H.264/AAC in MP4 | Compatibility on actual target clients, quality, runtime, size |
| Smaller video where clients support it | AV1 through SVT-AV1 or hardware AV1; HEVC where required | Matched visual quality, encode cost, decode support, HDR/bit depth |
| Fast turnaround | Hardware encoding such as NVENC | Provisioning plus transfer plus encode time; quality at equal bytes |
| Audio delivery/archive | Opus/AAC/MP3 and FLAC profiles | Listening quality, target client support, size and preservation |

FFmpeg documents software codec controls; NVIDIA documents hardware encoding
and its quality/performance modes. GPU generation and provider exposure matter.
Do not infer that our GPU inference deployment exposes a usable hardware encoder
just because its card supports one.
[FFmpeg encoder options](https://ffmpeg.org/ffmpeg-codecs.html),
[NVIDIA Video Codec SDK](https://developer.nvidia.com/video-codec-sdk).

**GStreamer** is the alternative to revisit for live capture, real-time streams,
and long-lived connected media graphs. Its streaming framework is broader than
the one-file-in/one-result-out workload we need initially. Choosing FFmpeg now
is an application-fit decision, not a claim that GStreamer is inferior.
[GStreamer introduction](https://gstreamer.freedesktop.org/documentation/application-development/introduction/gstreamer.html).

Managed alternatives can serve as an outsourcing and acceptance-test baseline:
**Transloadit** for assembled media jobs, **Cloudinary** for transformation plus
delivery, and **AWS MediaConvert** for file-based video transcoding. These reduce
some operational responsibility but add provider-specific behavior and billing.
There is no measured cost advantage for either buying or hosting in this report.
[Transloadit video encoding](https://transloadit.com/docs/robots/video-encode/),
[Cloudinary transformations](https://cloudinary.com/documentation/video_manipulation_and_delivery),
[MediaConvert formats](https://docs.aws.amazon.com/mediaconvert/latest/ug/reference-codecs-containers.html).

## Deployment and product sequencing

Retain HTTP/auth/validation/accounting in `apps/api`, schemas in
`packages/contracts`, Supabase ownership records, and Beam processing. Share
worker code for deterministic transforms where useful; isolate model runtimes
with different dependency, memory or latency needs. Split CPU image and long
video execution when scheduling/resource requirements justify it. An operation
does not automatically need its own service, database, or provider abstraction.

The current synchronous API has no durable reservation ledger or idempotency
guarantee. Before public long-running video/audio/document jobs, implement
private source/result objects, durable job state, idempotent submission,
transactional reservation and settlement, worker claim/lease handling, and
reconciliation of ambiguous provider outcomes. Queue redelivery must not launch
duplicate paid inference. A client timeout alone is not evidence that processing
failed. Add polling first; callbacks can follow an actual integration need.
[Current limitations](migration.md#current-limits).

Suggested stages, subject to the first paying workflow:

1. Image conversion/compression and bounded image OCR. Compare Pillow/libvips,
   select explicit supported formats, and preserve existing background removal.
2. Durable job/storage/accounting support, then video/audio conversion,
   compression, and transcription. Reuse transcription on extracted video audio.
3. Image upscaling and structured document OCR after quality evaluation.
4. Short-video background removal, upscaling, and timestamped visual text
   extraction as separately qualified capabilities.
5. Audio enhancement or generative restoration only after listening tests show
   a concrete customer benefit.

Keep a typed operation result rather than one bag of optional fields: transformed
media, text with regions, document structure, or transcript with timestamps.
Store source time coordinates for video/audio results. Bill using bounded work
units suited to the operation, such as pixels, output-frame pixels, pages, or
audio duration. Prices remain hypotheses until measured cost per successful
job includes initialization, idle time, transfer, storage, and failures.

## Verification before selecting an engine

For still images, assemble photos, screenshots/small text, gradients, soft alpha,
large inputs, rotated JPEGs, ICC profiles, animation, and 16-bit inputs. Compare
exact decoded pixels for promised lossless modes, human preference and artifact
inspection for lossy modes, output bytes, cold/warm response latency, memory,
failure rate and cost. Compare quality at matched bytes as well as bytes at
matched quality; quality=80 in two codecs is not a fair benchmark.

For video, include scene cuts, motion, scrolling text, grain, low light, variable
frame rate, HDR, and sound/subtitle preservation. Measure full response and
processing time, synchronization, frame drops, temporary disk and memory, and
cost per successful input minute at a stated resolution/frame rate. Add VMAF
where appropriate plus human review. VMAF targets perceptual video quality and
has documented limitations; it cannot certify correct text, identities, or
generatively reconstructed detail.
[VMAF methodology and limitations](https://github.com/Netflix/vmaf/blob/master/resource/doc/faq.md).

Model-specific tests are in the linked reports. Published throughput on an
A100/H100 does not predict a cold Beam job on our RTX 4090. Preserve the current
8 GiB host-RAM and checkpoint policy for the existing background-removal worker;
new workloads require their own sizing evidence. Our most recent PNG experiment
also illustrates why a faster encode stage does not prove a faster complete
browser workflow. [PNG experiment](png-encoding-browser-validation.md),
[Resource sizing](beam-resource-sizing.md).

## License and build record

Record library/codec versions, enabled delegates, model and weight revisions,
licenses, preprocessing, and output settings with each accepted configuration.
libvips is LGPL-2.1-or-later; ImageMagick has its own permissive license. FFmpeg's
effective license depends on its enabled components; GPL components and nonfree
build flags have distinct implications. Codec patent questions are separate
from source licenses. pngquant offers GPL/commercial terms. Commercial hosting
and distributing bundled client binaries must not be treated as the same case.
[libvips license](https://www.libvips.org/),
[ImageMagick license](https://imagemagick.org/license/),
[FFmpeg licensing](https://ffmpeg.org/legal.html),
[pngquant terms](https://pngquant.org/licensing.html).

If ImageMagick is used, explicitly allow required formats/delegates and set
resource limits. Its documented policy supports those controls; broad default
format support is not a suitable product allowlist.
[ImageMagick security policy](https://imagemagick.org/security-policy/).
