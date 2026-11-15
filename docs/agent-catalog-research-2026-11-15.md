# Catalog for agents: engines, backups and licences

Research for [#28](https://github.com/superuserkalo/openBGremover/issues/28), November 15, 2026. It names a first-choice engine and a backup for every operation in the catalog, with the licence of each and where it would run. Nothing here is built, and no speed, cost or quality was measured.

## How to read this

**How it was checked.** Nine research agents ran in one workflow: five read licence files and model cards from GitHub and Hugging Face, and four re-checked the first four domains independently, trying to refute each claim. Of 76 re-checked claims, 73 were confirmed, 2 corrected and 1 could not be verified. The formats domain was read once and not re-checked. Raw results are in the ignored `artifacts/research/agent-catalog-2026-11-15/`.

**This is still not a licence clearance.** AGENTS.md requires the licence file and model card to be pinned and kept when an operation is built. Commit and revision ids for each engine are in the raw results.

Licence status:

| Mark | Meaning |
| --- | --- |
| **V** | Read from the primary source by one agent and re-checked by a second |
| **R** | Read from the primary source by one agent, not re-checked |
| **D** | Read today from the provider's own documentation |
| **A** | Already in the licence matrix ([#10](https://github.com/superuserkalo/openBGremover/issues/10)) or an earlier research doc |

**The licence rule** (set by the owner on November 15, 2026):

- Permissive, LGPL, MPL, GPL and AGPL code is usable; the project is AGPL-3.0.
- A model that allows commercial hosted use today is usable, including under a custom licence, and gets a named backup.
- If the backup is as good or better, the backup is used.
- Noncommercial weights, revenue-capped weights and tools we cannot run under their terms are excluded.
- Credits a licence requires go in a notices file in the repository and one credits page in the docs.

Where it runs (from `docs/compute-placement-measurements-2026-11-15.md`): **Small** is a Cloudflare Container per job; **CPU** is a Beam CPU worker; **GPU** is the Beam GPU worker; **Browser** is Cloudflare Browser Run; **Workers AI** is a model Cloudflare hosts.

Readiness: **Ready** can go to a spec. **Evaluate** needs a quality comparison on reference files first. **Blocked** has no usable engine yet.

## Understand a file

| Operation | First choice | Backup | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- | --- |
| Facts (`inspect`) | ffprobe, libvips, PDFium, libmagic | — | A; libmagic BSD-2 (R) | Small | Ready |
| Plain text from files that have a text layer | PDFium; MarkItDown for Office files; Pandoc for HTML and EPUB | Docling | MarkItDown MIT (V); Pandoc GPL-2.0+ (V) | Small | Ready |
| Text with headings, reading order and tables, from files that have a text layer | Docling | PaddleOCR-VL on the GPU | Code MIT; weights Apache-2.0 and CDLA-Permissive-2.0 (V) | CPU | Evaluate |
| Text and tables from scans and complex pages | PaddleOCR-VL 1.6 | GLM-OCR | Both Apache-2.0 (V); GLM-OCR code Apache-2.0, weights MIT (V) | GPU | Evaluate |
| Tables as CSV or JSON from born-digital PDFs | pdfplumber, Camelot | Docling's table model | MIT (V) | Small | Ready |
| OCR on CPU | Tesseract 5 | PaddleOCR PP-OCRv5 | Apache-2.0 (V) | CPU | Ready |
| Speech to text, English | Parakeet TDT 0.6B v2 | Whisper large-v3-turbo | Code Apache-2.0, weights CC-BY-4.0 (V); Whisper MIT (V) | GPU | Evaluate |
| Speech to text, many languages | Qwen3-ASR-1.7B (30 languages) | Whisper large-v3 (99 languages) | Apache-2.0 (V); Whisper weights Apache-2.0 (V) | GPU | Evaluate |
| Speaker labels | pyannote Community-1 | NVIDIA Streaming Sortformer v2 (at most 4 speakers) | Code MIT, weights CC-BY-4.0 (V); Sortformer weights CC-BY-4.0 (V) | GPU | Evaluate |
| Language detection | Whisper for audio; lingua for text | GlotLID | lingua Apache-2.0 (R) | GPU; Small | Ready |
| Translation of text and subtitles | MADLAD-400 | M2M100 | Apache-2.0 (V); M2M100 MIT (V) | GPU | Evaluate |
| Watch a video: transcript, key frames, scenes | Speech to text, PySceneDetect, FFmpeg | FFmpeg's scene filter | PySceneDetect BSD-3 (R) | CPU and GPU | Evaluate |
| Listen: silence, loudness, speech or music | FFmpeg; Silero VAD; YAMNet | PANNs CNN14 | Silero MIT (V); YAMNet Apache-2.0 (V); PANNs weights CC-BY-4.0 (V) | CPU | Ready |
| Describe an image | Qwen3-VL-8B | Moondream 2, pinned to its 2025-06-21 revision | Both Apache-2.0 (V) | GPU | Evaluate |
| Short captions and text-prompted boxes, cheaply | Florence-2 | Moondream 2 | MIT (V) | GPU or CPU | Evaluate |
| Find faces | YuNet | MediaPipe BlazeFace | MIT (V); Apache-2.0 (V) | Small | Ready |
| Find everyday objects | RF-DETR (Nano to Large sizes only) | D-FINE | Both Apache-2.0 (V) | GPU | Evaluate |
| Read barcodes and QR codes | zxing-cpp | — | Apache-2.0 (V) | Small | Ready |
| Detect adult content | A decision model (see below) | Marqo nsfw-image-detection-384; Falconsai | Apache-2.0 (V) | Workers AI; Small | Evaluate |
| Colours and palette | libvips plus our own code | — | A | Small | Ready |
| Fingerprints and near-duplicates | imagehash; Chromaprint for audio | — | BSD-2 (R); MIT code built on LGPL-2.1 (V) | Small | Ready |
| Metadata: EXIF, XMP, ID3, PDF properties | ExifTool; mutagen; pikepdf | Exiv2 | Artistic or GPL (R); GPL-2.0+ (R); MPL-2.0 (R) | Small | Ready |
| Content credentials, read and verify | c2pa-rs | — | MIT or Apache-2.0 (R) | Small | Ready |
| PDF form fields as data | pikepdf or PyMuPDF | — | A | Small | Ready |

## Change a file

| Operation | First choice | Backup | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- | --- |
| Compress, convert, resize, crop, rotate, watermark (images) | libvips, as today | — | A | Small | Ready |
| Compress, convert, trim, merge, mute, speed, loudness (video, audio) | FFmpeg | — | A; patents in #20 | CPU | Ready |
| PDF page toolkit | qpdf, PDFium, Ghostscript | — | A | Small or CPU | Ready |
| Office and document conversion | LibreOffice, Pandoc | — | A; Pandoc GPL-2.0+ (V) | CPU | Ready |
| Smart crop that keeps the subject | libvips' built-in smart crop | — | A | Small | Ready |
| Reframe video for vertical formats | YuNet or RF-DETR tracking, then an FFmpeg crop | — | As above | CPU and GPU | Evaluate |
| Blur faces in images and video | YuNet, then blur | MediaPipe BlazeFace | MIT (V) | CPU | Ready |
| Blur number plates | The open-image-models detector used by fast-alpr | Our own small detector trained on open data | Code MIT; weights ship in the MIT repository, training data undocumented (V) | Small | Evaluate |
| Remove personal data from PDFs | Presidio and GLiNER to find it; PyMuPDF redaction to delete it | Turn pages into images, then OCR | MIT (V); Apache-2.0 (V); AGPL-3.0 (V) | CPU | Evaluate |
| Strip metadata | ExifTool, qpdf, FFmpeg | — | As above | Small | Ready |
| Remove or replace an image background | BiRefNet, live today | — | MIT (V) | GPU | Ready |
| Remove a video background | Robust Video Matting (people only) | BiRefNet on each frame | Code GPL-3.0; weights have no stated licence of their own (V, corrected) | GPU | Evaluate |
| Remove an object named in words | SAM 3 to select; LaMa to fill | SAM 2.1 with boxes from Florence-2 | SAM 3: Meta's own licence, commercial use allowed (V); SAM 2.1 Apache-2.0 (V); LaMa Apache-2.0 (V) | GPU | Evaluate |
| Remove an object marked by a point or box | SAM 2.1; LaMa to fill | BiRefNet for the main subject | Apache-2.0 (V) | GPU | Evaluate |
| Upscale images and video | Real-ESRGAN | Plain resize | BSD-3 (V) | GPU | Evaluate |
| Restore faces in old photos | None usable | Our own model | GFPGAN and CodeFormer both carry noncommercial terms (V) | — | Blocked |
| Clean speech | DeepFilterNet 3 | RNNoise | MIT or Apache-2.0 (V); BSD-3 (V) | CPU | Evaluate |
| Separate voice from music | None usable | Our own model, trained on licensed recordings | Demucs's author says the weights' licence is unclear (V) | — | Blocked |
| Cut silences | FFmpeg, Silero VAD | — | A; MIT (V) | CPU | Ready |
| Subtitles from speech | Speech to text, then our own formatter | — | As above | GPU | Evaluate |
| Convert and re-time subtitles | pysubs2; ffsubsync | Word timings from speech to text | MIT (R) | Small | Ready |
| Burn in subtitles | FFmpeg with libass | — | A; ISC (R) | CPU | Ready |
| Fill and flatten PDF forms | pikepdf or PyMuPDF | — | A | Small | Ready |
| Add a searchable text layer to a scan | OCRmyPDF | — | MPL-2.0 (V) | CPU | Ready |
| Convert to PDF/A | Ghostscript | — | A | CPU | Ready |
| Bookmarks, stamps, page numbers, crop margins | pikepdf or PyMuPDF | — | A | Small | Ready |
| Prepare a PDF for fast web viewing | qpdf | — | A | Small | Ready |
| Edit metadata | ExifTool, pikepdf, FFmpeg | — | As above | Small | Ready |
| Sign content credentials | c2pa-rs plus a certificate | — | MIT or Apache-2.0 (R) | Small | Blocked on the certificate |
| Repair a PDF | qpdf, then Ghostscript | — | A | Small or CPU | Ready |
| Repair a video that won't play | FFmpeg remux; untrunc for cut-off MP4 files | — | GPL-2.0+ (R) | CPU | Evaluate |

## Make a file

| Operation | First choice | Backup | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- | --- |
| Render HTML, Markdown or a web address to PDF or image | Cloudflare Browser Run | Chromium in a container | Hosted service (D) | Browser | Ready |
| Fill a DOCX, PPTX or XLSX template from JSON | docxtpl, python-pptx, openpyxl | LibreOffice; XlsxWriter | LGPL-2.1; MIT; MIT (R) | Small | Ready |
| Markdown to DOCX, PPTX and EPUB | Pandoc | — | GPL-2.0+ (V) | Small | Ready |
| Image sets: icons, responsive widths, social sizes | libvips | — | A | Small | Ready |
| Video from images and audio, joins, overlays, GIF | FFmpeg | — | A | CPU | Ready |
| Contact sheet, sprite sheet, collage, waveform image | libvips, FFmpeg | — | A | Small or CPU | Ready |
| QR codes and barcodes | segno; python-barcode | zint | BSD-3; MIT (R) | Small | Ready |
| Speech from text | Kokoro-82M | Chatterbox, with voice cloning switched off | Apache-2.0 weights (V); MIT (V) | CPU or GPU | Evaluate |

- **Template safety:** docxtpl runs a template language. Customer templates must run in a restricted mode.
- **Browser Run cost** (Cloudflare docs): Workers Paid includes 10 browser hours a month; more costs $0.09 per hour. A 3-second render costs under a hundredth of a cent. Rendering a web address fetches a page on someone's behalf, so the URL rules in #6 apply.
- **Voice cloning:** Chatterbox can copy a voice from a sample. That input stays off.

## Check a result

| Operation | First choice | Backup | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- | --- |
| Preview and output facts | libvips, FFmpeg, PDFium | — | A | Small | Ready |
| Compare two images | SSIMULACRA2 (the copy inside libjxl) plus a difference image | — | BSD-3 (R) | Small | Ready |
| Compare two videos | VMAF in FFmpeg | — | BSD-2-Clause-Patent (R) | CPU | Ready |
| Compare two PDFs or documents | Text difference plus rendered-page difference | — | A | Small | Ready |
| Compare two audio files | ViSQOL for quality; Chromaprint for "same recording" | STOI for speech | Apache-2.0 (V) | CPU | Evaluate |
| Does this result look right | A decision model (see below) | A small language model | D | Workers AI | Evaluate |
| Is this a valid file of its type | ffprobe, libvips, `qpdf --check` | — | A | Small | Ready |
| Is it PDF/A; does it carry accessibility tags | veraPDF | — | GPL-3.0+ or MPL-2.0 (V) | CPU | Ready |
| Will it play in browsers | Our own rules over ffprobe's output | — | A | Small | Ready |

## More formats

| Formats | First choice | Backup | Licence | Runs on | Readiness |
| --- | --- | --- | --- | --- | --- |
| CSV, XLSX, JSON, Parquet | DuckDB, pyarrow, openpyxl | XlsxWriter | MIT; Apache-2.0; MIT (R) | Small | Ready |
| EPUB, MOBI, AZW3 | Calibre's `ebook-convert` | Pandoc for EPUB | GPL-3.0 (R) | CPU | Ready |
| SVG to and from PDF, EPS and PNG; optimise SVG | resvg, Ghostscript, svgo | librsvg | Apache-2.0 or MIT; MIT (R) | Small | Ready |
| Trace an image to SVG | VTracer | potrace | MIT (R) | Small | Ready |
| Fonts: TTF, OTF, WOFF2, subsetting | fontTools | — | MIT (R) | Small | Ready |
| Camera raw | LibRaw through rawpy | — | LGPL-2.1 or CDDL; MIT (R) | Small | Ready |
| PSD | psd-tools | — | MIT (R) | Small | Ready |
| Archives: zip, tar, 7z; reading RAR | libarchive; 7-Zip for RAR | — | BSD-2; LGPL-2.1+ with a rule against creating RAR (R) | Small | Ready |
| Email: EML and MSG to PDF, attachments out | Python's email library; extract-msg; Browser Run | — | GPL-3.0 (R) | Small and Browser | Ready |
| PDF to Word | pdf2docx | LibreOffice's PDF import | MIT (V); it depends on PyMuPDF, AGPL-3.0 | CPU | Evaluate |
| 3D: glTF, OBJ, STL, USDZ, thumbnails | assimp; Blender for thumbnails; OpenUSD | — | BSD-3; GPL-2.0+; a permissive Pixar licence (R) | CPU | Evaluate |
| CAD: DWG, DXF | LibreDWG with ezdxf | libdxfrw | GPL-3.0+; MIT (R) | CPU | Evaluate |

- **DuckDB:** customer SQL runs with outside access and extension loading switched off.
- **RAR:** it can be read, never created.
- **DWG:** LibreDWG's own README says it reads every DWG version but skips "some very advanced" objects from 2010 on. ezdxf's add-on for a proprietary converter is not used.
- **Hostile files:** ExifTool, Calibre, Blender, LibreDWG, untrunc, 7-Zip and assimp run as separate programs inside the #18 wall. assimp and LibreDWG have a history of memory-safety bugs.

## Decision models

A decision model takes a situation and a set of typed questions and returns typed answers with probabilities: yes or no, one choice from a list, or a score against a rubric. It writes no text. The owner asked where these fit.

### What exists

| Model | Reads | Price per million input tokens | Weights | Status |
| --- | --- | --- | --- | --- |
| Clef-flash (Cloudflare) | Text, images | $0.038 | Open, Apache-2.0 per Cloudflare | D |
| Clef (Cloudflare) | Text, images | $0.24 | Open, Apache-2.0 per Cloudflare | D |
| Clef-omni (Cloudflare) | Text, images, audio, video | $0.15 | Open per its model page | D |
| Clairic (Cloudflare) | Text; returns typed values such as a total or a date | $0.10 | Not yet released; preview | D |
| Jev (TypeSafe) | Text; images that TypeSafe itself calls not production quality | $0.042 | Closed, hosted only | V |
| Decisions (OpenAI) | Text, images | $0.10 | Closed | D |

- Output is free on all of them.
- Clef accepts up to 4 images and 64 questions per request, and each image costs at most 1,024 tokens. A yes-or-no question about one image costs about $0.00004 on Clef-flash.
- Clef uses the same request format as Jev, so one adapter serves both.
- Cloudflare's hosted Clef models keep no data. Clef's licence file and its accuracy were not checked; its speed and benchmark claims are Cloudflare's own.

### What was verified about Jev

- **Accuracy:** in TypeSafe's own test it scored 67.8%, against 74.1% and 73.1% for two frontier language models. One independent test found 326 of 332 confident answers correct, with 52 left unsure. A trained small classifier beat it by 12 points on a fixed-label banking test.
- **Weak spots:** text written to steer it, literal reading, numbers and dates, and large distracting inputs. In one evaluation planted text changed 147 of 200 answers.
- **Terms:** its customer agreement forbids offering it "as a standalone service" and forbids training a model on its answers. It is in early access with no service guarantee, and sign-ups were reported paused.

### Decisions

- **Clef is the first choice and Jev is the backup,** behind one adapter with a timeout. Clef reads media, runs on the provider we already use, and has open weights. A small language model (Claude Haiku 5.5) is the second backup.
- **A `classify` operation for agents is built on Clef, not Jev.** Jev's terms forbid it.
- **Our own decision model means fine-tuning Clef's open weights,** not training from scratch. Jev's answers can never be training data.
- **Training data cannot come from customer files.** The privacy promise in #6 says we never look at them. It comes from our reference files, public datasets, and customers who opt in.

### Where a decision model fits

| Use | Fit | Why |
| --- | --- | --- |
| Judging free-text results in the #25 test suite | Strong | Offline, no customer data, and consistent between runs |
| Sorting the feedback agents send us | Strong | A fixed set of destinations; the result must never grant anything, because the text is untrusted |
| What kind of file is this (invoice, contract, screenshot, photo of a page) | Strong with Clef, which sees the image | Fixed choices plus "none of these" |
| Adult-content signals | Worth testing against the small classifiers above | Returns a probability to act on |
| Does this result look right (a clean cutout, a readable page) | Worth testing | A rubric score on the preview image |
| `classify` as a catalog operation | Strong with Clef | An agent asks typed questions about its file for a fraction of a cent |
| Which path a document takes | Tie-breaker only | Rules decide most files: is there a text layer, how much text per page |
| Personal data | Weak alone | It can say yes or no, but cannot mark where; GLiNER and rules do that |
| Text aimed at manipulating an agent | Weak alone | The text it reads can steer it; pair it with a dedicated classifier and the labelled-fields rule |
| Abuse and fraud | Weak | The signals are mostly numbers and behaviour |
| Choosing compression settings | Wrong tool | A numeric choice; rules and measured tables do it |

### How to test it

For the first three uses, build 300 to 500 labelled items each from our own reference files, including some with planted instructions. Run Clef-flash, Clef, Jev and Claude Haiku 5.5 on the same items. Compare accuracy, how well the probabilities match reality, accuracy when it is allowed to abstain, stability when the choices are reordered, speed from the API Worker, and cost per thousand decisions. Keep a model only where it matches or beats the backup. A cost or speed win does not justify an accuracy loss on a decision that matters.

## Where our own models are realistic

| Model | Why | Data that could be used |
| --- | --- | --- |
| Number-plate detector | The one found has undocumented training data | CCPD (MIT, Chinese plates) plus the plate class in Open Images; Open Images' licence was not checked |
| Voice and music separation | No model with a clear licence | Licensed multitrack recordings, bought or commissioned; Demucs's code is MIT and reusable |
| Face restoration | Both known models carry noncommercial terms | Not researched |
| Decision model for our own questions | Cheaper and more accurate than a general one on fixed labels | Our reference files and opt-in data; fine-tune Clef or a small Apache-2.0 encoder |
| Document model tuned to our files | Fine-tuning a 0.9B model fits one 24 GB GPU | DocLayNet, PubTables-1M, FinTabNet, PubLayNet (CDLA-Permissive; check each) |
| Adult-content classifier | The open ones were trained on undisclosed data | Our own labelled set |

Training a speech recogniser, a translator, an image describer or a segmenter from scratch is not realistic at this size.

## Excluded

| Engine or model | Why | Status |
| --- | --- | --- |
| InsightFace models, including the SCRFD face detector | Weights are for noncommercial research only | V |
| CodeFormer | Noncommercial licence | V |
| GFPGAN | Bundles code under noncommercial terms | V |
| NLLB-200 | Weights are CC-BY-NC | V |
| Marker and Surya weights | Free only under $5M in funding or revenue; some cards say CC-BY-NC-SA | V |
| MinerU's code | A paid licence is required above $20M monthly revenue or 100M monthly users, and services must display its name | V |
| Moondream 3 | Its licence forbids selling hosted access to the model | V |
| NVIDIA Sortformer v1 | CC-BY-NC | V |
| Demucs weights | The author states the licence is not clear | V |
| RF-DETR's smallest and largest sizes, and the `rfdetr[plus]` package | A separate licence that needs a paid add-on for commercial self-hosting | V |
| MatAnyone, SUPIR, HYPIR | Noncommercial | A |
| `libfdk_aac` and nonfree FFmpeg builds | Not redistributable | A |
| ODA's DWG converter | Proprietary | R |

## Decisions made in this pass

- **Faces are found and blurred, never identified.** No operation recognises or matches a person.
- **Gated weights are mirrored.** pyannote's weights are CC-BY-4.0, which allows keeping and redistributing a copy. We accept the download terms once, mirror the files to our storage with their checksum, and credit them. The text of its model card sits behind the login and still has to be read.
- **SAM 3 is used for text prompts, with SAM 2.1 as the working backup.** Its licence allows commercial hosted use, bars military, weapons and espionage uses, and lets Meta change the terms at any time. Its weights stay out of the public repository, and point or box requests go straight to SAM 2.1.
- **Text out of documents takes one of three routes, chosen from the file.** Files with a text layer are read directly. When headings and tables are wanted from such a file, Docling runs on the CPU. Scans and complex pages go to PaddleOCR-VL on the GPU. The caller can force a route, and the result says which ran.
- **Hosted model APIs are allowed for internal decisions** when their terms permit our use, each with a backup.

## What blocks what

- **Restoring faces and separating voice from music:** no usable model. Both are candidates for our own.
- **Signing content credentials:** needs a certificate from an authority on the C2PA trust list, and from 2026 the signing product must pass C2PA's conformance programme first. One authority offers free first-level certificates to conformant products. Reading and verifying credentials is not blocked.
- **Patents (#20):** H.264, HEVC and AAC outputs.
- **Quality evaluations:** each Evaluate row needs reference files and a comparison before its engine is fixed. The same files serve #25.

## Still unread or unverified

- pyannote Community-1's model card text, behind a login.
- LaMa's weights sit on a third-party account with only a licence tag; the terms of the Places2 training data were not read.
- The number-plate detector's training data and method.
- Open Images' and WIDER Face's licences.
- The Gemma terms for TranslateGemma were read by the checker; it is a second backup only.
- Clef's licence file, accuracy and limits beyond Cloudflare's documentation.
- Whether rawpy's packaged build includes GPL parts of LibRaw.
- GPU memory figures for every model are estimates.

## Counts

Of 84 rows: 54 Ready, 27 Evaluate, 3 Blocked.
