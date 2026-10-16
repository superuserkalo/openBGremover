# Document conversion: scope and open-source tools

Research snapshot: 2026-10-16. Resolves [#13](https://github.com/superuserkalo/openBGremover/issues/13), part of [#2](https://github.com/superuserkalo/openBGremover/issues/2).

This is primary-source research, not a benchmark. No conversion was run, no
account was created, and no paid call was made. The competitor inventory comes
from CloudConvert's unauthenticated public catalog API and iLovePDF's published
API reference. Popularity numbers are third-party traffic estimates and are
labelled as such. Raw catalog responses were saved privately under the session
scratchpad and are not committed.

Related notes, referenced by path because they are not yet committed on
`master`: `CONTEXT.md`, `docs/media-capabilities-research-2026-10-15.md`,
`docs/ocr-options-research-2026-10-15.md`, and
`docs/agent-first-media-competitor-evidence-2026-10-15.md`.

## Recommendation

Treat "documents" as three different products with different costs and risks.

1. **PDF page operations** (merge, split, extract/remove pages, rotate, protect,
   unlock, watermark, page numbers, images to PDF, PDF to images, compress).
   These are deterministic, cheap, and permissively licensed (qpdf/pikepdf,
   PDFium). Ship these first in one CPU worker.
2. **Rendering conversions into PDF** (Office to PDF through LibreOffice, HTML/URL
   to PDF through headless Chromium, OCR'd/searchable PDF and PDF/A through
   OCRmyPDF). These have high demand but bring a large attack surface and
   font/layout-fidelity caveats. Run each in its own locked-down sandbox, with
   no network access except for URL capture.
3. **Reconstruction out of PDF** (PDF to Word/Excel/PowerPoint). This ranks among
   the most-searched tasks, but CloudConvert, which runs open-source engines
   almost everywhere else, pays for a commercial engine (Apryse/PDFTron) and
   charges 4x credits for it. No open-source tool reviewed produces comparable
   editable output. Defer this, or label it as an approximation with
   representative-document evidence. PDF to text/Markdown is a different,
   feasible task that belongs with the OCR/document-parsing work.

Leave out e-signature request workflows, CAD, Apple iWork, fonts, and archive
repacking for now. Ebooks (Calibre) are feasible later but heavy.

Following the glossary in `CONTEXT.md`, callers choose a **format** and
**options**, never an engine. CloudConvert exposes `engine` and
`engine_version` as caller parameters. We should report the engine and version
in results instead.

## What CloudConvert offers

`GET https://api.cloudconvert.com/v2/convert/formats` (public, no auth) returned
**2,156 conversion pairs** across 204 input and 104 output formats on
2026-10-16. Each row names the engine that performs the conversion, which shows
what a mature converter actually runs.

| Group | Pairs | Engines (pair count) |
| --- | ---: | --- |
| image | 708 | ImageMagick, PDFium, Poppler, vips, ... |
| audio | 355 | FFmpeg |
| document | 313 | LibreOffice 103, Microsoft Office ("office") 60, Calibre 60, ImageMagick 36, Pandoc 16, Inkscape 11, iWork 9, PDFTron pdf2word 3, Ghostscript 2, MuPDF 2, Chrome 2, plus qpdf, Poppler, pdf2htmlEX, pymupdf4llm, TeX Live, ddjvu, cadconverter |
| video | 231 | FFmpeg |
| archive | 222 | archivetool 213, 7z 9 |
| ebook | 158 | Calibre 157 |
| vector | 67 | Inkscape, vtracer, cadconverter, FontForge, MuPDF, office |
| presentation | 31 | office 15, LibreOffice 9, iWork 5, PDFTron pdf2powerpoint 2 |
| spreadsheet | 28 | LibreOffice 11, office 9, iWork 6, PDFTron pdf2excel 2 |
| font | 25 | FontForge, woff2 |
| cad | 18 | Inkscape, cadconverter, pstoedit |

The document-relevant routing in the catalog:

- **Office to PDF:** `doc/docx/docm/dot/dotx/xls/xlsx/xlsm/ppt/pptx/pptm/pot/potx/hwp`
  go through the `office` engine at 2 credits. ODF, RTF, WPS/WPD, Publisher,
  CSV, and other legacy formats go through LibreOffice (26.8.0) at 1 credit.
  CloudConvert pays more to use Microsoft's renderer for Microsoft formats.
- **PDF to Office:** `pdf → doc/docx/rtf` (pdftron-pdf2word 12.0.0),
  `pdf → xls/xlsx`, and `pdf → ppt/pptx` all use PDFTron at **4 credits**, the most
  expensive document rows in the catalog.
- **PDF to images:** jpg/png use PDFium; tiff and txt use Poppler; svg uses MuPDF;
  ps uses Ghostscript; html uses pdf2htmlEX; **md uses pymupdf4llm** 1.28.2.
- **Into PDF:** HTML through Chrome 154; Markdown through MuPDF 1.28.3; TeX through
  TeX Live; reStructuredText/txt through Pandoc; PostScript/XPS through Ghostscript;
  DjVu through ddjvu; ebooks/comics through Calibre 8.5; SVG/EPS/AI/EMF/WMF/Visio/
  CorelDRAW through Inkscape; DWG/DXF/DWF through a proprietary `cadconverter`;
  images through ImageMagick 7.1.2; Pages/Numbers/Keynote through `iwork` (2 credits).

`GET https://api.cloudconvert.com/v2/operations` lists the non-conversion tasks
and their engines:

| Operation | Engine | Options exposed |
| --- | --- | --- |
| `merge` | qpdf 12.4.0 | none |
| `pdf/split`, `pdf/extract-pages`, `pdf/rotate-pages` | qpdf | `pages`; `rotation` = `+90\|+180\|-90` |
| `pdf/encrypt` | qpdf | `set_password`, `set_owner_password`, `allow_accessibility`, `allow_extract`, `allow_modify` = `all\|annotate\|form\|assembly\|none`, `allow_print` = `full\|low\|none` |
| `pdf/decrypt` | qpdf | `password` |
| `watermark` (PDF) | qpdf | `pages`, `layer` = `above\|below`, text or image, font name/size/color/align, position, margins, opacity, rotation |
| `optimize` (PDF) | **pdftools 1.14.0** (commercial PDF Tools AG) | `profile` = `web` (default) `\|print\|archive\|mrc\|max`, `flatten_signatures` |
| `optimize` (JPEG/PNG) | MozJPEG 4.0.3 (`quality` 75) / pngquant 2.17 | |
| `pdf/ocr` | **OCRmyPDF 17.4.2** | `language` (default `["eng"]`), `auto_orient` |
| `pdf/a` | Ghostscript 9.55/10.07 | `conformance_level` = `1b\|2b\|3b` (default 2b), `zugferd_xml` |
| `pdf/x` | Ghostscript | `variant` = `1a\|3\|4`, `preserve_separation` |
| `capture-website` | Chrome 154 | as HTML→PDF, plus `headers`, `close_cookie_banners` (default true) |
| `thumbnail` | vips, LibreOffice, office, iwork, ffmpeg | width/height/fit, `count` |
| `metadata`, `metadata/write` | ExifTool 13.55 | |
| `archive`, `archive/extract` | 7z 24.09, rar 7.00, archivetool | `password` |
| `command` | ffmpeg, ImageMagick, GraphicsMagick | raw `arguments` |

Granular per-pair options, from `?include=options`:

- **docx → pdf (office):** `pages`, `optimize_print` (default true), `pdf_a`,
  `include_markup` (tracked changes/comments), `bookmarks`, `wait_time`, `password`.
- **xlsx → pdf (office):** `pages`, `pages_fit_wide`, `pages_fit_tall`,
  `decimal_separator`, `thousands_separator`, `use_print_areas`, `sheet`, `password`.
- **pptx → pdf (office):** `hidden_slides`, `output_type` = `slides|handout`,
  `slides_per_handout_page` (6), `first_slide_number`, `pdf_a`, `include_markup`.
- **odt → pdf (LibreOffice):** only `pdf_a`, `pages`, `password`.
- **html → pdf (Chrome):** `zoom`, `page_width/height`, `page_format` (letter…a6),
  `page_orientation`, four margins, `print_background` (true),
  `display_header_footer`, `header_template`, `footer_template`, `wait_until` =
  `load|domcontentloaded|networkidle0|networkidle2`, `wait_for_element`,
  `wait_time`, `css_media_type` = `print|screen`.
- **pdf → jpg (PDFium):** `width`, `height`, `pixel_density` (300), `quality`, `pages`.
- **jpg → pdf (ImageMagick):** `width`, `height`, `fit` = `max|crop|scale`, `strip`, `auto_orient`.
- **pdf → docx (PDFTron):** `connect_hyphens`, `prioritize_visual_appearance`, `images_ocr` (default true).
- **pdf → pdf (qpdf):** combines page selection, split, encryption, permissions, and image watermark.
- **dwg → pdf:** `all_layouts`, `auto_zoom`, `width`, `height`.
- **epub → pdf, pdf → md, md → pdf:** no options.

The PDF `optimize` [docs](https://cloudconvert.com/api/v2/optimize) define
`web` as downsampling plus font subsetting plus RGB, `print` as the same with
CMYK, `archive` as no downsampling, `mrc` as mixed raster content for scans, and
`max` as maximum reduction with visible quality loss. The [PDF operations
docs](https://cloudconvert.com/api/v2/pdf) list the PDF/A and PDF/X variants.

## What iLovePDF offers

The [iLovePDF homepage](https://www.ilovepdf.com/) groups its tools as follows:

- **Organize:** Merge, Split, Remove pages, Extract pages, Organize, Scan to PDF
- **Optimize:** Compress, Repair, OCR
- **Convert to PDF:** JPG, Word, PowerPoint, Excel, HTML
- **Convert from PDF:** JPG, Word, PowerPoint, Excel, PDF/A
- **Edit:** Rotate, Page numbers, Watermark, Crop, Edit, Forms (new)
- **Security:** Unlock, Protect, Sign, Redact, Compare
- **Intelligence (new):** AI Summarizer, Translate, PDF to Markdown
- **Workflows:** chain tools

It claims PDF to Word is "almost 100% accurate". That is a vendor claim and was not tested.

The developer [API reference (iLoveAPI)](https://www.iloveapi.com/docs/api-reference)
documents the options per tool. iLovePDF does not disclose its engines.

| Tool | Options (defaults) |
| --- | --- |
| all PDF tools | per-file `rotate` 0/90/180/270, `password`, `meta` (Title, Author, …); `ignore_errors` (true), `ignore_password`, `try_pdf_repair` (true), `output_filename` templates, `webhook` |
| `merge`, `officepdf`, `htmlpdf`, `repair`, `unlock`, `rotate`, `pdfmarkdown` | none |
| `split` | `split_mode` = `ranges\|fixed_range\|remove_pages\|filesize`, `ranges`, `fixed_range` (1), `remove_pages`, `merge_after` |
| `compress` | `compression_level` = `extreme\|recommended\|low` |
| `pdfocr` | `ocr_languages` (eng default; ~120 codes that match Tesseract traineddata names such as `chi_sim`, `deu_latf`, `kor_vert`) |
| `pdfjpg` | `pdfjpg_mode` = `pages` (render) `\|extract` (embedded images) |
| `imagepdf` | `orientation`, `margin` (0), `pagesize` = `fit\|A4\|letter`, `merge_after` (true) |
| `pagenumber` | `facing_pages`, `first_cover`, `pages`, `starting_number`, vertical/horizontal position plus px adjustment, `font_family` (8 fonts), `font_size` 14, `font_color`, `text` template `{n}`/`{p}` |
| `watermark` | `mode` text/image, `pages`, position plus adjustment, `mosaic`, `rotation`, font, `transparency` 1–100, `layer` above/below |
| `protect` | `password` (no permission controls) |
| `pdfa` / `validatepdfa` | `conformance` = `pdfa-1b\|1a\|2b\|2u\|2a\|3b\|3u\|3a` (2b), `allow_downgrade` (true) |
| `extract` | `detailed` (per-element positions and fonts) |
| `editpdf` | text/image/SVG elements with coordinates, size, rotation, opacity, font styling |
| `sign` | an e-signature **workflow**: up to 50 signers and 5 files, signer/validator/viewer roles, email/SMS, ordering, reminders, expiry 1–130 days, audit trail with QR verification |
| `summarize`, `splitsmart` | AI features (`language`, `output_format` pdf/md; `prompt`) |

Note that iLovePDF's `sign` is a hosted signing-request product with email,
identity, and an audit trail. It is not a file conversion, and it is closer to
DocuSign than to anything in this repository.

## Which features matter most

There is no first-party usage data. The best public signals are estimated
organic-search keywords from [Ahrefs' public site pages](https://ahrefstop.com/websites/ilovepdf.com):

| Site (snapshot) | Estimated search visits | Top keywords (monthly volume) |
| --- | --- | --- |
| ilovepdf.com (Oct 2026, India) | ~86M/month | brand terms; **jpg to pdf** 4.8M; **pdf to word** 4M; pdf to word converter 1.5M |
| [smallpdf.com](https://ahrefstop.com/websites/smallpdf.com) (Aug 2026, US) | ~53M/month | **pdf to jpg** 190K; **jpg to pdf** 168K; **pdf to word** 230K; pdf to word converter 84K |
| [cloudconvert.com](https://ahrefstop.com/websites/cloudconvert.com) (Oct 2026, US) | ~7.1M/month | mp4 to mp3, webp to png, file converter, mp4 converter, mp3 to wav (no document term in the top five) |

These are estimates, are volatile (ilovepdf showed a −63M swing month on month),
and are country-specific. Still, the ordering agrees across the sources. A
second signal is that the self-hosted iLovePDF analogue
[Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) has ~94k GitHub
stars, versus ~13k for the converter API [Gotenberg](https://github.com/gotenberg/gotenberg).

Ranked for openBGremover by demand, cost, and agent use:

| Rank | Feature | Demand evidence | Feasibility with OSS |
| --- | --- | --- | --- |
| 1 | Images → PDF | top keyword on both PDF sites | trivial (img2pdf, PyMuPDF, ImageMagick) |
| 2 | PDF → images | top Smallpdf keyword | high (PDFium) |
| 3 | PDF → Word | top keyword, every site | **low**; commercial engines dominate |
| 4 | Compress PDF | core tool on every site; three levels everywhere | high (Ghostscript or pikepdf/OCRmyPDF) |
| 5 | Merge / split / extract / remove / rotate | first tools listed by iLovePDF | high (qpdf/pikepdf) |
| 6 | Office (Word/Excel/PPT) → PDF | standard on every site; CloudConvert pays for MS Office | medium (LibreOffice fidelity caveats) |
| 7 | OCR / searchable PDF | standard; agent-relevant | high (OCRmyPDF + Tesseract) |
| 8 | PDF → text / Markdown | new "intelligence" tools on iLovePDF and CloudConvert; strongest **agent** use case | medium–high (pypdfium2/pypdf, pymupdf4llm, Docling; see OCR doc) |
| 9 | HTML / URL → PDF | standard; CloudConvert `capture-website` | high quality, high SSRF risk (Chromium) |
| 10 | Protect / unlock | standard | high (qpdf) |
| 11 | Watermark, page numbers | standard | high (qpdf overlay, pdfcpu, PyMuPDF) |
| 12 | PDF/A | standard; archival/compliance | medium (OCRmyPDF/Ghostscript plus veraPDF validation) |
| 13 | PDF → Excel / PowerPoint | standard but niche | low (tables: Camelot/Tabula; slides: none) |
| 14 | Redact, compare, edit, forms, crop, repair | long tail | mixed; see the tool matrix |
| 15 | Sign (signature requests) | standard in UI | a separate product (DocuSeal/Documenso); cryptographic PAdES signing is feasible with pyHanko |
| — | Ebooks, CAD, iWork, fonts, archives | CloudConvert breadth, not PDF-site demand | defer |

## Open-source tools per feature

Licenses come from each project's repository metadata or license file as of
2026-10-16 (GitHub license detection is noted where it reports `NOASSERTION`).
openBGremover is **AGPL-3.0**, so AGPL/GPL tools are license-compatible with
the project itself. This is not legal clearance. Record versions and license
files with each build, as the media capabilities note
(`docs/media-capabilities-research-2026-10-15.md`, "License and build record")
already requires.

| Tool | License | Use it for | Caveats |
| --- | --- | --- | --- |
| [qpdf](https://github.com/qpdf/qpdf) | Apache-2.0 | merge/split (`--pages`, `--split-pages`), rotate, AES-256 encrypt plus permissions, decrypt, linearize, overlay/underlay watermark, flatten annotations, object-stream compression, xref repair | no rendering, no text extraction; splitting drops outlines; repair is heuristic ([CLI docs](https://qpdf.readthedocs.io/en/stable/cli.html)) |
| [pikepdf](https://github.com/pikepdf/pikepdf) | MPL-2.0 | Python API over qpdf for the same operations, metadata, removing JavaScript/OpenAction, PDF/A metadata | same scope as qpdf |
| [PDFium](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE) / [pypdfium2](https://github.com/pypdfium2-team/pypdfium2) | BSD-3-Clause (+ Apache-2.0 text in the file) | PDF → PNG/JPEG rendering, text extraction | rendering only, no PDF writing beyond basics; CloudConvert uses it for PDF → jpg/png |
| [Ghostscript](https://ghostscript.com/releases/index.html) (10.08.0, 2026-09-08) | AGPL-3.0 or commercial ([Artifex](https://artifex.com/licensing)) | compress (`-dPDFSETTINGS`), PDF/A-1/2/3**b**, PDF/X, PS/EPS/XPS → PDF | **rewrites** the file: drops hyperlinks/bookmarks/comments, does not preserve Form XObjects or some structure/tags; presets alter input, and "best quality… is obtained by not setting this parameter" ([docs](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html)); PDF/A defaults to *keeping* non-compliant features and emitting a non-compliant file unless `PDFACompatibilityPolicy` is set |
| [MuPDF](https://github.com/ArtifexSoftware/mupdf) / [PyMuPDF](https://github.com/pymupdf/PyMuPDF) / [pymupdf4llm](https://github.com/pymupdf/pymupdf4llm) | AGPL-3.0 or commercial | rendering, true redaction (`apply_redactions`), stamping, page numbers, edit, EPUB/XPS/CBZ input, PDF → Markdown (CloudConvert's engine) | the AGPL network clause applies to a hosted service; this is compatible with our AGPL repository, but a proprietary fork would need a commercial license |
| [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) (17.x) | MPL-2.0 | searchable PDF, PDF/A output, deskew/rotate, lossless optimize (`--optimize 1–3`) | needs [Tesseract](https://github.com/tesseract-ocr/tesseract) (Apache-2.0); since 17.0 Ghostscript is **optional**: pypdfium2 rasterizes, and `--pdfa-backend internal` uses pikepdf ([install docs](https://ocrmypdf.readthedocs.io/en/latest/installation.html)); optional jbig2enc, pngquant (GPL/commercial), unpaper |
| [LibreOffice](https://github.com/LibreOffice/core) headless | MPL-2.0 (headline; dual LGPLv3+, mirror ships a GPL-3 COPYING) | Office/ODF/RTF/CSV/legacy → PDF, PDF/A and PDF/UA export, Office ↔ ODF, thumbnails; imports Keynote/Pages/Numbers via libetonyek | fidelity depends on fonts (install metric-compatible [Liberation](https://github.com/liberationfonts/liberation-fonts) and [Carlito](https://github.com/googlefonts/carlito)/Caladea for Arial/Times/Calibri/Cambria); complex DOCX/PPTX layout and charts can reflow; heavy and single-conversion per process; frequent security advisories (below) |
| [unoserver](https://github.com/unoconv/unoserver) | MIT | keeps LibreOffice warm (README claims 50–75% less CPU for batches), `--conversion-timeout`, `--stop-after` | one instance per port; no auth on its ports, which "must not be accessible" outside the stack; no automatic restart |
| [Gotenberg](https://github.com/gotenberg/gotenberg) (reference) | MIT | Docker HTTP API: Chromium (HTML/URL/Markdown → PDF), LibreOffice, merge/split/flatten/encrypt/watermark/metadata/PDF/A/PDF/UA through qpdf, pdfcpu, pdftk, and ExifTool | ~705 MB compressed amd64 image ([Docker Hub](https://hub.docker.com/v2/repositories/gotenberg/gotenberg/tags/8?page_size=1)); good *configuration reference* (below) |
| Chromium via [Playwright](https://github.com/microsoft/playwright)/[Puppeteer](https://github.com/puppeteer/puppeteer) | BSD-3 / Apache-2.0 | HTML/URL → PDF with modern CSS/JS, headers/footers, page size, `waitUntil` | full browser: SSRF, local-file reads, resource exhaustion |
| [WeasyPrint](https://github.com/Kozea/WeasyPrint) | BSD-3-Clause | HTML/CSS → PDF **without JavaScript**; custom `url_fetcher` hook | no JS, so dynamic pages fail; still fetches resources unless the fetcher is restricted |
| [wkhtmltopdf](https://github.com/wkhtmltopdf/wkhtmltopdf) | LGPL-3.0 | **do not use** | archived Jan 2023; Qt4/QtWebKit unsupported; [status page](https://wkhtmltopdf.org/status.html): "Do not use wkhtmltopdf with any untrusted HTML… complete takeover of the server" |
| [Pandoc](https://github.com/jgm/pandoc) | GPL-2.0-or-later | Markdown/RST/DOCX/HTML/EPUB/LaTeX interconversion; PDF through a separate engine (Typst, WeasyPrint, LaTeX, …) | use `--sandbox` on untrusted input; `--pdf-engine` "introduces additional risks, which cannot be mitigated by using `--sandbox`" ([manual](https://pandoc.org/MANUAL.html)); disable `raw_html` or sanitize |
| [Calibre](https://github.com/kovidgoyal/calibre) `ebook-convert` | GPL-3.0 | EPUB/MOBI/AZW3/FB2/CBZ/… ↔ each other and PDF (CloudConvert: 157 of 158 ebook pairs) | large Qt WebEngine dependency; its own [manual](https://manual.calibre-ebook.com/conversion.html) calls PDF input "a really, really bad format" with "decent to unusable" results |
| [Poppler](https://gitlab.freedesktop.org/poppler/poppler) | GPL-2.0/3.0 | `pdftotext`, `pdftoppm`/`pdftocairo`, `pdfimages` (embedded-image extraction = iLovePDF `extract` mode) | overlaps PDFium; pick one renderer |
| [pdfcpu](https://github.com/pdfcpu/pdfcpu) | Apache-2.0 | Go CLI: stamps/watermarks, page numbers, N-up, booklets, crop, bookmarks, attachments | Gotenberg's default for watermark/rotate/split |
| [pypdf](https://github.com/py-pdf/pypdf) | BSD-3-Clause (GitHub: NOASSERTION) | pure-Python split/merge/text extraction/forms | slower; extraction ≠ OCR ([docs](https://pypdf.readthedocs.io/en/stable/user/extract-text.html)) |
| [veraPDF](https://github.com/veraPDF/veraPDF-library) | GPL-3.0 / MPL-2.0 | PDF/A and PDF/UA **validation** (= iLovePDF `validatepdfa`) | JVM; validation only |
| [pyHanko](https://github.com/MatthiasValvekens/pyHanko) | MIT | cryptographic PAdES signatures, timestamps, validation | a certificate signature is different from an e-signature request workflow |
| [DocuSeal](https://github.com/docusealco/docuseal) / [Documenso](https://github.com/documenso/documenso) | AGPL-3.0 | self-hosted signing-request workflows | separate applications, not conversion engines |
| [pdf2docx](https://github.com/ArtifexSoftware/pdf2docx) | MIT (depends on AGPL PyMuPDF) | best-effort PDF → DOCX | rule-based layout reconstruction; unproven against PDFTron |
| [Camelot](https://github.com/camelot-dev/camelot) / [Tabula](https://github.com/tabulapdf/tabula-java) | MIT | PDF tables → CSV/XLSX (digital PDFs) | table extraction, not whole-document Excel fidelity |
| [Docling](https://github.com/docling-project/docling) | MIT | PDF/DOCX/PPTX → Markdown/JSON with layout and tables | model-backed; evaluate alongside the OCR doc's document parsers |
| [Marker](https://github.com/datalab-to/marker) | Apache-2.0 code, **modified OpenRAIL-M weights** (free under $5M funding/revenue) | PDF → Markdown | weight license is restrictive for commercial use |
| [pdf2htmlEX](https://github.com/pdf2htmlEX/pdf2htmlEX) | GPL-3 (GitHub: NOASSERTION) | PDF → HTML (CloudConvert's engine) | last push July 2025; low priority |
| [diff-pdf](https://github.com/vslavik/diff-pdf) | GPL-2.0 | visual PDF compare | `unocompare` (unoserver) compares Office documents |
| [LibreDWG](https://github.com/LibreDWG/libredwg) / [ezdxf](https://github.com/mozman/ezdxf) | GPL-3.0 / MIT | DWG/DXF reading | CloudConvert uses a proprietary CAD engine; defer |
| [libarchive](https://github.com/libarchive/libarchive) | BSD-2-Clause (GitHub: NOASSERTION) | archive extraction | zip bombs, path traversal, symlinks; defer repacking |

### Feature → tool map

| Feature | Primary choice | Alternative / note |
| --- | --- | --- |
| Merge, split, extract, remove, reorder, rotate | qpdf/pikepdf | pdfcpu |
| Images → PDF | img2pdf-style lossless embed or PyMuPDF; honor EXIF orientation and ICC profiles | ImageMagick (needs a delegate allowlist) |
| PDF → images | pypdfium2 | Poppler `pdftoppm`; `pdfimages` for "extract embedded images" |
| Compress | **lossless first:** pikepdf/qpdf object streams plus OCRmyPDF `--optimize`; **lossy levels:** Ghostscript `/ebook` (150 dpi) or `/screen` (72 dpi) | report bytes saved; Ghostscript strips links/bookmarks; CloudConvert's MRC profile is commercial |
| Protect / unlock | qpdf (`--encrypt 256`, `--decrypt` with the supplied password) | never brute-force passwords |
| Watermark, page numbers, stamp | qpdf `--overlay` of a generated page, or pdfcpu / PyMuPDF | |
| Office → PDF | LibreOffice through unoserver (Gotenberg as reference) | fonts decide fidelity; MS Office fidelity needs Windows/commercial licensing |
| HTML / URL → PDF | Chromium (Playwright) with an egress proxy | WeasyPrint for no-JS HTML |
| Markdown → PDF | Pandoc → Typst/WeasyPrint, or HTML → Chromium | MuPDF Story (CloudConvert) |
| OCR / searchable PDF | OCRmyPDF + Tesseract | swap in PP-OCRv6 later per the OCR doc |
| PDF/A | OCRmyPDF (`--output-type pdfa-2`, internal backend) or Ghostscript; LibreOffice at export time | always validate with veraPDF; Ghostscript does only level b |
| PDF → text / Markdown | pypdfium2/pypdf for digital text; pymupdf4llm or Docling for structure | OCR when no text layer |
| PDF → Word / Excel / PPT | defer; pdf2docx or Camelot only as "approximate" | Apryse/PDFTron, Adobe, and Aspose are commercial |
| Redact | PyMuPDF `apply_redactions` (removes content under the box) | overlaying a black rectangle is **not** redaction |
| Repair | qpdf recovery, then `mutool clean`, then a Ghostscript rewrite | |
| Ebooks | Calibre | MuPDF for EPUB → PDF |
| PDF/A validation | veraPDF | |

## Security: untrusted uploads

These engines parse hostile, complex formats, several of which are programming
languages (PostScript, JavaScript, Basic macros, Python in LibreOffice). Assume
any parser can be exploited and contain the blast radius.

**Evidence the risk is real:**

- **Ghostscript:** PostScript is Turing-complete. `-dSAFER` has been the default
  since 9.50 ([docs](https://ghostscript.readthedocs.io/en/latest/Use.html)), but
  sandbox escapes recur. CVE-2024-29510 (uniprint format string) bypassed SAFER
  for RCE, fixed in 10.03.1, and was [exploited in the wild using EPS files
  disguised as JPGs](https://www.securityweek.com/attackers-exploiting-remote-code-execution-vulnerability-in-ghostscript/).
- **LibreOffice** [advisories](https://www.libreoffice.org/about-us/security/advisories/)
  from 2023 to 2026 include remote documents fetched on load by floating frames
  (CVE-2023-2255); linked CSV/SQL/HLS data fetched on load, exposing local files
  or reaching attacker hosts (CVE-2026-63267/63268/63269); URL expansion
  exfiltrating environment/INI values (CVE-2024-12426, CVE-2026-63270/63278);
  remote JDBC driver code execution (CVE-2026-63277); arbitrary file writes
  through font names and Firebird (CVE-2024-12425, CVE-2026-63266); GStreamer
  pipeline injection (CVE-2023-6185); and a steady stream of memory-safety bugs
  in PDF, WMF, EMF+, PPT, OOXML, and DXF importers (26.2.5 alone, September 2026).
  Many of these are **external-entity/link class** issues that a network-less
  sandbox neutralizes.
- **wkhtmltopdf:** its maintainers warn that untrusted HTML can mean full server takeover.
- **Pandoc:** `include` directives can read files; LaTeX PDF engines are outside `--sandbox`.

**Controls (engine-independent):**

1. **One job per ephemeral sandbox:** a fresh container or microVM per job (or
   per short-lived warm worker with `--stop-after`/restart-after), non-root user,
   read-only root filesystem, size-capped tmpfs, seccomp/AppArmor, no
   credentials or signed URLs in the environment, and cgroup memory/CPU/pids
   limits. Gotenberg's defaults restart LibreOffice after 10 conversions and
   Chromium after 100, which suggests long-lived instances are not trusted.
2. **No network by default** for LibreOffice, Ghostscript, Calibre, Pandoc,
   OCRmyPDF, and qpdf. This blocks linked-content fetches, URL exfiltration,
   remote JDBC, and SSRF. Return the bytes through the worker's own channel.
3. **URL/HTML → PDF gets a dedicated egress path:** deny private, link-local, and
   metadata IP ranges after DNS resolution, pin the resolved IP against DNS
   rebinding, deny `file:`, limit redirects, total bytes, and time, and use a
   fresh browser context per job. Gotenberg documents these controls; note that
   its defaults are permissive (*no* private-IP denial, and Chromium only denies
   `file:` outside `/tmp`), so copy the controls, not the defaults
   ([configuration](https://gotenberg.dev/docs/configuration)).
4. **Macros and active content:** never enable LibreOffice macro execution or
   trusted locations. Gotenberg 8.34+ drops linked content from untrusted
   locations; replicate this. Accept `.docm/.xlsm/.pptm` only for rendering, and
   document that macros are not run. Strip PDF JavaScript, `/OpenAction`,
   `/Launch`, and embedded files from **outputs** with pikepdf, so merged files
   do not carry payloads to customers.
5. **Narrow the parsers:** sniff magic bytes, then allowlist the formats per
   operation. Do not pass PS/EPS/XPS to Ghostscript unless a PostScript
   conversion is explicitly requested. Prefer PDFium (fuzzed and used in Chrome)
   for rendering. Use an ImageMagick policy that allowlists coders, because
   otherwise it delegates PDF/PS to Ghostscript.
6. **Bounds before expensive work** (an existing `AGENTS.md` invariant): upload bytes; page count read through qpdf/pikepdf before
   rendering; render DPI × page area as a pixel budget; decompressed-size limits
   for OOXML/ODF/EPUB (all ZIP containers, so zip-bomb risk); XML entity
   expansion (OOXML/ODF/SVG/FB2 are XML); wall-clock timeouts per engine
   (unoserver `--conversion-timeout`); and output-size caps.
7. **Passwords and secrets:** treat supplied PDF passwords like bearer tokens.
   Never log them, and never persist them with the job record.
8. **Patch cadence:** pin engine versions in the image, track LibreOffice,
   Ghostscript, Chromium, and PDFium advisories, and rebuild promptly. Chromium in
   particular ships security fixes every few weeks.

## Resource notes (unmeasured)

Nothing here was benchmarked. These are planning signals only:

- **qpdf/pikepdf/PDFium** are native, start in milliseconds, and are bounded by
  file size and page count. They fit the planned bounded CPU worker from the
  media capabilities note.
- **LibreOffice** is a large install and processes one document at a time per
  process. Cold start is the cost to measure, because a warm listener
  (unoserver) trades idle memory for latency. Scale with several instances on
  separate ports rather than with threads.
- **Chromium** costs one renderer per job, and it needs `/dev/shm` sizing.
  Gotenberg defaults to a maximum concurrency of 6.
- **Gotenberg's image** (Chromium + LibreOffice + PDF tools + fonts) is ~705 MB
  compressed, which hints at cold-pull cost on scale-to-zero platforms.
- **OCRmyPDF/Tesseract** is CPU-bound per page and parallelizes across pages; it
  needs the same per-page billing and bounds as the OCR doc.
- **Ghostscript** compression is single-threaded and CPU-bound on large image-heavy PDFs.

Before promotion, measure cold and warm complete-response latency, peak RSS, and
failure rate on a representative corpus: complex DOCX/XLSX/PPTX with non-Latin
fonts, scanned PDFs, image-heavy PDFs, forms, tagged PDFs, encrypted PDFs, and
malformed files. Compare cost per successful job including idle time, as
AGENTS.md requires.

## Fit with the platform

- Billing unit: **pages** for PDF operations and OCR; input bytes or pages for
  Office/HTML rendering. Validate page counts before reserving credits.
- Multi-page and long jobs (OCR of large PDFs, big decks) need the durable
  job/idempotency work described in [migration.md](../migration.md) before going
  past small synchronous limits. Page operations on small files can stay synchronous.
- Defaults are server-owned, with optional overrides that match the competitors'
  common surface: page ranges, compression level (`low`/`recommended`/`extreme`
  maps naturally to lossless / `/ebook` / `/screen`), PDF/A conformance, OCR
  languages, image-to-PDF page size/margin/orientation, render DPI/format, and
  HTML page format/margins/background/wait condition.
- Results should report the engine and version, page count, bytes in and out,
  and, for PDF/A, the validator verdict, rather than claiming compliance.

## Open questions

- **PDF → Word quality:** test pdf2docx and LibreOffice PDF import against a
  representative set before committing. If neither is acceptable, decide
  whether to offer a commercial engine (a license-cost question) or not offer
  the feature at all.
- **LibreOffice vs MS Office fidelity:** measure on real customer-style
  DOCX/PPTX with the fonts installed. CloudConvert's 2-credit MS Office routing
  suggests a gap worth quantifying.
- **The exact LibreOffice license file set** shipped in our image (MPL-2.0 vs
  the GPL-3 COPYING in the mirror) should be recorded from the package itself.
- **A sandbox runtime for Beam** (gVisor/microVM availability and network
  policy) needs provider confirmation before running LibreOffice or Chromium on
  customer uploads.
