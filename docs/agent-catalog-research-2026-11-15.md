# Catalog for agents: engines and licences, first pass

Research for [#28](https://github.com/superuserkalo/openBGremover/issues/28), November 15, 2026. It names a first-choice engine for every operation in the catalog, says what is known about its licence, and says where it would run. Nothing here is built or measured.

## How to read this

**This is not a licence clearance.** AGENTS.md requires the licence file and model card to be read, pinned and kept when an operation is built. This pass sorts the list so that work can start in the right order.

Licence status:

| Mark | Meaning |
| --- | --- |
| **A** | Already in the licence matrix ([#10](https://github.com/superuserkalo/openBGremover/issues/10)) or an earlier research doc in `docs/` |
| **B** | A publisher's page or a secondary source seen today through web search; the licence file itself was not opened |
| **C** | From memory; confirm before any work starts |

Licence rules applied (from #10 and the map): the project is AGPL-3.0, so permissive, LGPL, MPL, GPL and AGPL engines are all usable. Noncommercial weights, weights with revenue or usage conditions, and proprietary tools are excluded.

Where it runs (from `docs/compute-placement-measurements-2026-11-15.md`):

| Mark | Meaning |
| --- | --- |
| **Small** | Cloudflare Containers, one fresh container per job |
| **CPU** | Beam CPU worker on the Shared tier |
| **GPU** | Beam GPU worker |
| **Browser** | Cloudflare Browser Run |

Readiness:

| Mark | Meaning |
| --- | --- |
| **Ready** | Engine known, licence clear in #10; can go to a spec |
| **Confirm** | Engine known; licence must be read from the source first |
| **Evaluate** | Needs a quality comparison on reference files before an engine is chosen |
| **Blocked** | No usable engine found yet |

## Understand a file

| Operation | First-choice engine | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- |
| Facts (`inspect`) | ffprobe, libvips, PDFium, libmagic | A; libmagic C (BSD) | Small | Ready |
| Text and Markdown from born-digital PDFs and Office files | PDFium text; MarkItDown; Pandoc for HTML and EPUB | PDFium A; MarkItDown B (MIT); Pandoc C (GPL-2+) | Small | Confirm |
| Text and Markdown with layout, headings and reading order | Docling; PaddleOCR-VL for scans | Docling B (MIT code; its models' licences not checked); PaddleOCR-VL A | GPU | Evaluate |
| Tables as CSV or JSON | Docling's table model; pdfplumber for born-digital PDFs | Docling B; pdfplumber C (MIT) | Small or GPU | Evaluate |
| OCR for images and scanned PDFs | PaddleOCR-VL against OvisOCR2, as in the OCR doc; Tesseract as the CPU fallback | A | GPU; CPU | Evaluate |
| Speech to text with timestamps | The candidates in the audio doc (Whisper large-v3, Parakeet) | A | GPU | Evaluate |
| Speaker labels | pyannote Community-1 | B: code MIT, weights CC-BY-4.0 (attribution), download is gated | GPU | Confirm |
| Language detection | Whisper for audio; lingua for text | Whisper A; lingua C (Apache-2.0) | GPU; Small | Confirm |
| Translation of text and subtitles | MADLAD-400 | B (Apache-2.0 on the model card) | GPU | Evaluate |
| Watch a video: transcript, key frames, scene list | Speech to text, PySceneDetect, FFmpeg frames | PySceneDetect C (BSD-3); others A | CPU and GPU | Confirm |
| Listen: silence, loudness, speech or music | FFmpeg `silencedetect` and `ebur128`; Silero VAD; YAMNet | FFmpeg A; Silero C (MIT); YAMNet C (Apache-2.0) | CPU | Confirm |
| Describe an image | Florence-2; Moondream 2 | B (MIT; Apache-2.0), from an aggregator | GPU | Evaluate |
| Find faces | YuNet from the OpenCV model zoo | B (MIT, per the model's own README) | Small | Confirm |
| Find objects | RT-DETR or D-FINE | B (Apache-2.0), from an aggregator | GPU or CPU | Evaluate |
| Find text regions | PaddleOCR detection | A | GPU or CPU | Ready |
| Read barcodes and QR codes | zxing-cpp | C (Apache-2.0) | Small | Confirm |
| Detect adult content | A classifier still to be chosen | Not checked | GPU or CPU | Evaluate |
| Colours and palette | libvips plus our own code | A | Small | Ready |
| Fingerprints and near-duplicates | imagehash for images; frame hashes for video; Chromaprint for audio | C (BSD; LGPL-2.1+) | Small; CPU | Confirm |
| Metadata: EXIF, XMP, ID3, PDF properties | ExifTool; pikepdf for PDF | ExifTool C (GPL or Artistic); pikepdf A | Small | Confirm |
| Content credentials (C2PA), read and verify | c2pa-rs | C (MIT or Apache-2.0) | Small | Confirm |
| PDF form fields as data | pikepdf or PyMuPDF | A | Small | Ready |

## Change a file

| Operation | First-choice engine | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- |
| Compress, convert, resize, crop, rotate, watermark (images) | libvips, as today | A | Small | Ready |
| Compress, convert, trim, merge, mute, speed, loudness (video and audio) | FFmpeg | A; patents in #20 | CPU | Ready |
| PDF page toolkit | qpdf, PDFium, Ghostscript | A | Small or CPU | Ready |
| Office and document conversion | LibreOffice, Pandoc | LibreOffice A; Pandoc C | CPU | Ready |
| Smart crop that keeps the subject | libvips' built-in smart crop | A | Small | Ready |
| Reframe video for vertical formats | Face or object tracking, then an FFmpeg crop | As the detectors above | CPU and GPU | Evaluate |
| Blur faces in images and video | YuNet, then blur | B | CPU | Confirm |
| Blur number plates | None found with a licence that could be verified | — | — | Blocked |
| Remove personal data from PDFs | Presidio to find it; PyMuPDF redaction to remove it | Presidio C (MIT); PyMuPDF A (AGPL) | CPU | Evaluate |
| Strip metadata | ExifTool, qpdf, FFmpeg | As above | Small | Confirm |
| Remove or replace an image background | BiRefNet, live today | A | GPU | Ready |
| Remove a video background | Robust Video Matting (people only) | A (GPL-3.0) | GPU | Evaluate |
| Remove an object | SAM 2 to select; LaMa to fill | SAM 2 B (Apache-2.0); LaMa C (Apache-2.0) | GPU | Evaluate |
| Upscale images and video | Real-ESRGAN first, as in the upscaling doc | A | GPU | Evaluate |
| Restore faces in old photos | GFPGAN | B (Apache-2.0 with exceptions for bundled parts) | GPU | Confirm |
| Clean speech | DeepFilterNet | A | CPU or GPU | Evaluate |
| Separate voice from music | Demucs | B (MIT; the original repository is archived, a maintained copy exists) | GPU | Confirm |
| Cut silences | FFmpeg | A | CPU | Ready |
| Subtitles from speech | Speech to text, then our own formatter | A | GPU | Evaluate |
| Convert and re-time subtitles | pysubs2; ffsubsync | C (MIT) | Small | Confirm |
| Burn in subtitles | FFmpeg with libass | A; libass C (ISC) | CPU | Ready |
| Fill and flatten PDF forms | pikepdf or PyMuPDF | A | Small | Ready |
| Add a searchable text layer to a scan | OCRmyPDF | B (MPL-2.0; it needs Ghostscript and Tesseract, both A) | CPU | Confirm |
| Convert to PDF/A | Ghostscript | A | CPU | Ready |
| Bookmarks, stamps, page numbers, crop margins | pikepdf or PyMuPDF | A | Small | Ready |
| Prepare a PDF for fast web viewing | qpdf | A | Small | Ready |
| Edit metadata | ExifTool, pikepdf, FFmpeg | As above | Small | Confirm |
| Sign content credentials | c2pa-rs plus a signing certificate | C | Small | Blocked on the certificate |
| Repair a PDF | qpdf, then Ghostscript | A | Small or CPU | Ready |
| Repair a video that won't play | FFmpeg remux; untrunc for truncated MP4 | FFmpeg A; untrunc C (GPL) | CPU | Evaluate |

## Make a file

| Operation | First-choice engine | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- |
| Render HTML, Markdown or a web address to PDF or image | Cloudflare Browser Run | A hosted service on the plan we have | Browser | Ready |
| Fill a DOCX, PPTX or XLSX template from JSON | docxtpl, python-pptx, openpyxl | C (LGPL-2.1; MIT; MIT) | Small | Confirm |
| Fill an HTML template from JSON | Our own templating, then Browser Run | — | Browser | Ready |
| Markdown to DOCX, PPTX and EPUB | Pandoc | C (GPL-2+) | Small | Confirm |
| Image sets: icons, responsive widths, social sizes | libvips | A | Small | Ready |
| Video from images and audio, joins, overlays, GIF | FFmpeg | A | CPU | Ready |
| Contact sheet, sprite sheet, collage, waveform image | libvips, FFmpeg | A | Small or CPU | Ready |
| QR codes and barcodes | segno; python-barcode | C (BSD; MIT) | Small | Confirm |
| Speech from text | Kokoro-82M | B (weights Apache-2.0 on the model card; depends on espeak-ng, GPL-3.0) | GPU or CPU | Evaluate |

**Browser Run cost** (Cloudflare docs, read today): Workers Paid includes 10 browser hours a month; more costs $0.09 per hour. The single-call PDF and screenshot endpoints allow 30 requests per second and bill browser time only. A 3-second render costs under a hundredth of a cent. Rendering a web address fetches a page on someone's behalf, so the URL rules in #6 apply.

## Check a result

| Operation | First-choice engine | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- |
| Preview and output facts | libvips, FFmpeg, PDFium | A | Small | Ready |
| Compare two images | SSIMULACRA2 score plus a difference image from libvips | SSIMULACRA2 C (BSD, from the libjxl project) | Small | Confirm |
| Compare two videos | VMAF in FFmpeg, as used in the #19 measurements | C (BSD plus a patent grant) | CPU | Confirm |
| Compare two PDFs or documents | Text difference plus rendered-page difference | A | Small | Ready |
| Compare two audio files | Not chosen | — | CPU | Evaluate |
| Quality score for a lossy result | SSIMULACRA2 for images; VMAF for video | As above | Small; CPU | Confirm |
| Is this a valid file of its type | ffprobe, libvips, `qpdf --check` | A | Small | Ready |
| Is it PDF/A; does it carry accessibility tags | veraPDF | B (GPL or MPL, from a 2020 source) | CPU | Confirm |
| Will it play in browsers | Our own rules over ffprobe's output | A | Small | Ready |

## More formats

| Formats | First-choice engine | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- |
| CSV, XLSX, JSON, Parquet | DuckDB, pyarrow, openpyxl | C (MIT; Apache-2.0; MIT) | Small | Confirm |
| EPUB, MOBI, AZW3 | Calibre's `ebook-convert`; Pandoc for EPUB | C (GPL-3.0; GPL-2+) | CPU | Confirm |
| SVG to and from PDF, EPS and PNG; optimise SVG | libvips with librsvg, Ghostscript, svgo | A; svgo C (MIT) | Small | Confirm |
| Trace an image to SVG | VTracer | C (MIT) | Small | Confirm |
| Fonts: TTF, OTF, WOFF2, subsetting | fontTools | C (MIT) | Small | Confirm |
| Camera raw | LibRaw through rawpy | C (LGPL-2.1 or CDDL; MIT) | Small | Confirm |
| PSD | psd-tools | C (MIT) | Small | Confirm |
| Archives: zip, tar, 7z; reading RAR | libarchive | C (BSD) | Small | Confirm |
| Email: EML and MSG to PDF, attachments out | Python's email library; extract-msg; Browser Run to render | extract-msg C (GPL-3.0) | Small and Browser | Confirm |
| PDF to Word and other Office formats | pdf2docx; LibreOffice's PDF import | pdf2docx B (AGPL or commercial, per its docs); LibreOffice A | CPU | Evaluate |
| 3D: glTF, OBJ, STL, USDZ, thumbnails | assimp; Blender for thumbnails | C (BSD-3; GPL) | CPU | Evaluate |
| CAD: DWG, DXF | LibreDWG; ezdxf | C (GPL-3.0; MIT) | CPU | Evaluate |

## Excluded

| Engine or model | Why | Status |
| --- | --- | --- |
| InsightFace models, including the SCRFD face detector | Weights are for noncommercial research only | B |
| CodeFormer | S-Lab licence restricts commercial use | B |
| NLLB-200 | Weights are CC-BY-NC | B |
| Marker and Surya weights | Paid licence required above a revenue threshold | B |
| MinerU | Moved to its own licence with conditions on large services and required attribution | B |
| SAM 3 | Meta's own licence, with use restrictions, and Meta can change it; SAM 2 is Apache-2.0 | B |
| MatAnyone, SUPIR, HYPIR | Noncommercial | A |
| `libfdk_aac` and nonfree FFmpeg builds | Not redistributable | A |
| ODA's DWG libraries | Proprietary | C |

## Decisions made in this pass

- **Faces are found and blurred, never identified.** No operation recognises or matches a person.
- **Gated weights are mirrored.** pyannote's weights need an account to download. We accept the terms once, mirror the files to our storage with their checksum, and show the attribution CC-BY-4.0 requires.
- **Custom licences count as excluded** even when they allow commercial use today, because their terms can change.
- **Two paths for text out of documents.** A fast path with no model for born-digital files, and a layout path on the GPU for scans and complex pages. The caller's option picks; the default is the fast path when the file has a text layer.

## What blocks what

- **Number plates:** no model with a licence that could be verified. Either one is found, or a small detector is trained on openly licensed data. Until then the operation is not listed.
- **Signing content credentials:** needs a signing certificate, which has a cost and an identity check. Reading and verifying credentials does not.
- **Patents (#20):** H.264, HEVC and AAC outputs in every video and audio operation.
- **Quality evaluations:** 21 rows are marked Evaluate. Each needs reference files and a comparison before an engine is fixed. The reference files are the same ones #25 requires, so building them serves both.

## Counts

Of 82 rows: 26 Ready, 33 Confirm, 21 Evaluate, 2 Blocked.

## Sources

Licence statements marked B came from these pages, through web search summaries:
- [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/README.md)
- [OpenCV model zoo, YuNet](https://huggingface.co/opencv/opencv_zoo/blob/d33294bfaec5f2386dab1783e1a4031330645f57/models/face_detection_yunet/README.md)
- [pyannote Community-1](https://huggingface.co/pyannote/speaker-diarization-community-1) and [pyannote's blog](https://www.pyannote.ai/blog/build-vs.-buy-the-real-cost-of-self-hosting-diarization)
- [MADLAD-400 model card](https://huggingface.co/google/madlad400-3b-mt)
- [InsightFace licensing](https://www.insightface.ai/solutions/face-recognition-licensing)
- [SAM 3 licence summary](https://roboflow.com/model-licenses/segment-anything-3) and [SAM 2](https://roboflow.com/model-licenses/segment-anything-2)
- [Florence-2 and Moondream comparison](https://playground.roboflow.com/models/compare/florence-2-vs-moondream-2), [D-FINE](https://playground.roboflow.com/models/ustc/d-fine)
- [pdf2docx licence](https://pdf2docx.readthedocs.io/en/latest/license.html), [OCRmyPDF introduction](https://ocrmypdf.readthedocs.io/en/stable/introduction.html)
- [GFPGAN licence file](https://huggingface.co/TencentARC/GFPGANv1/blame/main/License_GFPGAN.txt)
- [Document parser comparison](https://jimmysong.io/blog/pdf-to-markdown-open-source-deep-dive/) for Docling, MarkItDown, MinerU and Marker
- [Cloudflare Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/) and [limits](https://developers.cloudflare.com/browser-run/limits/)
