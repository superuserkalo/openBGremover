# Specs: PDF operations

Shared rules, the `output` object and the result shape are in [README.md](README.md). `compress`, `convert`, `merge`, `split`, `rotate`, `crop` and `watermark` also accept PDFs and are specified in [change.md](change.md).

Rules for every operation here:

- **Accepts** a PDF and **returns** a PDF unless stated.
- **Encrypted files:** a `password` option is accepted on every operation. Without it, an encrypted file returns `PASSWORD_REQUIRED`.
- **Page ranges** are written `1-3,8,10-` and count from 1. `-1` is the last page.
- **Output safety:** JavaScript, launch actions and embedded files are removed from every PDF we return (#18), and `data.removed` lists what was taken out.
- **`output`:** the PDF fields, so any operation can also produce PDF/A or a fast-web-view file.
- **Runs on:** a Cloudflare Container per job, unless stated.
- **Usage:** `pages`.
- **Preview:** the first affected page, on by default where the look of a page changes.

---

## `extract-pages`

Keeps the named pages and drops the rest.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `pages` | Page ranges | **Required** | Order in the list is the order in the result |

- **Engine:** qpdf.
- **Reference files:** pages 2 to 4 of a 10-page file; a range past the last page (`INVALID_OPTION` stating the page count); a file with form fields on the kept pages.
- **Agent tasks:** "Give me just pages 3 to 5 of this PDF."
- **Readiness:** Ready.

---

## `delete-pages`

Removes the named pages.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `pages` | Page ranges | None | Either `pages` or `blank` is **required** |
| `blank` | Boolean | `false` | Removes pages with no visible content |
| `blank_threshold` | 0 to 1 | 0.005 | Share of non-white area below which a page counts as blank |

- **`data`:** the pages removed.
- **Errors:** `INVALID_OPTION` when every page would be removed.
- **Engine:** qpdf; PDFium to judge blank pages.
- **Reference files:** a scan with every second page blank; a file where one "blank" page carries a faint stamp.
- **Agent tasks:** "Delete the blank pages from this scan." "Remove the last page."
- **Readiness:** Ready.

---

## `reorder-pages`

Puts pages in a new order.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `order` | List of page numbers, or `reverse`, `odd-even`, `interleave` | **Required** | `interleave` takes two inputs: fronts and backs from a one-sided scanner |

- **Rule:** a list that omits pages is an error naming them; use `extract-pages` to drop pages.
- **Engine:** qpdf.
- **Reference files:** a 6-page file reversed; fronts and backs interleaved where the backs were scanned last page first.
- **Agent tasks:** "Move page 7 to the front." "I scanned the fronts and backs separately, put them in order."
- **Readiness:** Ready.

---

## `protect`

Encrypts a PDF with a password and sets what readers may do.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `open_password` | String | None | Needed to open the file. Either password is **required** |
| `owner_password` | String | None | Needed to change permissions |
| `allow` | List of `print`, `copy`, `edit`, `annotate`, `fill-forms` | All | Applies when an owner password is set |

- **Rule:** AES-256. Passwords are never logged, stored or echoed; `applied` records only that one was set.
- **Rule:** a warning explains that permission flags are honoured by readers, not enforced by encryption.
- **Engine:** qpdf.
- **Reference files:** a file protected with an open password (must fail to open without it); a file with printing disallowed.
- **Agent tasks:** "Password-protect this PDF."
- **Readiness:** Ready. Preview off.

---

## `unlock`

Removes a PDF's password and restrictions.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `password` | String | None | **Required** when the file needs one to open |

- **Rule:** the caller must supply the password that opens the file. We do not guess or break passwords. A file restricted only by an owner password, which opens without one, can be unlocked.
- **Errors:** `PASSWORD_REQUIRED`; `INVALID_OPTION` for a wrong password.
- **Engine:** qpdf.
- **Reference files:** a file with an open password; a file with only an owner password; a wrong password.
- **Agent tasks:** "Remove the password from this PDF; the password is …"
- **Readiness:** Ready. Preview off.

---

## `add-page-numbers`

Prints page numbers, or other running text, on each page.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `format` | String with `{page}` and `{total}` | `{page}` | For example `Page {page} of {total}` |
| `position` | `bottom-center`, `bottom-left`, `bottom-right`, and the three `top-` forms | `bottom-center` | |
| `start_at` | Integer | 1 | The number printed on the first numbered page |
| `pages` | Page ranges | All | |
| `font_size`, `color`, `margin` | Points; colour; points | 10; black; 24 | |

- **Engine:** pikepdf or PyMuPDF.
- **Reference files:** a 12-page file numbered from page 2 starting at 1; a file mixing portrait and landscape pages.
- **Agent tasks:** "Add 'Page X of Y' to the bottom of every page, skipping the cover."
- **Readiness:** Ready.

---

## `add-bookmarks`

Sets a PDF's outline, the list of sections a reader shows in its side panel.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `bookmarks` | List of `{ title, page, level }` | None | Either `bookmarks` or `from_headings` is **required** |
| `from_headings` | Boolean | `false` | Builds the outline from text that looks like headings |
| `replace` | Boolean | `true` | `false` adds to an existing outline |

- **`from_file`:** when `from_headings` is on, the titles found.
- **Engine:** pikepdf; PDFium for heading detection.
- **Reference files:** a report with numbered headings; a file with an existing outline.
- **Agent tasks:** "Add bookmarks for each chapter of this PDF."
- **Readiness:** Ready for `bookmarks`. `from_headings` is Evaluate. Preview off.

---

## `fill-form`

Writes values into a PDF form.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `values` | Map of field name to value | **Required** | Checkboxes take `true` or `false`; choices take one of the field's options |
| `flatten` | Boolean | `false` | Makes the filled values part of the page so they can no longer be edited |
| `strict` | Boolean | `true` | An unknown field name is an error listing the real names |

- **`data`:** the fields filled, and required fields left empty.
- **Rule:** field names come from `extract-form-data`. A value that does not fit its field (a letter in a number field, an option that does not exist) is an error naming the field.
- **Engine:** pikepdf or PyMuPDF.
- **Reference files:** a tax form filled with 12 values; a radio group; a value too long for its box; an unknown field name.
- **Agent tasks:** "Fill in this form with these details." (expects `extract-form-data` first).
- **Readiness:** Ready.

---

## `flatten`

Makes form fields, annotations and layers part of the page.

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `what` | List of `forms`, `annotations`, `layers` | `forms`, `annotations` | |

- **Rule:** the page must look the same before and after; the reference check compares rendered pages.
- **Engine:** pikepdf or PyMuPDF.
- **Reference files:** a filled form; a file with comments and highlights; a file with a hidden layer (the hidden layer must not become visible).
- **Agent tasks:** "Lock in what I filled out so it can't be edited."
- **Readiness:** Ready.

---

## `make-searchable`

Adds an invisible text layer to a scanned PDF so its text can be selected and searched.

- **Accepts:** PDF; images of pages (returns a PDF).
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `languages` | List of language codes | Detected | |
| `pages` | Page ranges | Pages without text | |
| `redo` | Boolean | `false` | Replaces an existing text layer |
| `deskew`, `rotate` | Boolean | `true` | Straightens tilted and sideways pages |
| `clean` | Boolean | `false` | Removes specks before reading; the visible page is unchanged |

- **`data`:** pages read, pages skipped because they already had text, and a confidence per page.
- **Rule:** the visible page image is not re-encoded unless `output` asks for it.
- **Engine:** OCRmyPDF with Tesseract. **Runs on:** a Beam CPU worker. **Usage:** `ocr_pages`.
- **Reference files:** a 5-page scan at 300 dpi; a sideways page; a file where half the pages already have text; a page of handwriting (expects low confidence and a warning).
- **Agent tasks:** "Make this scanned contract searchable."
- **Readiness:** Ready. Preview off.

---

## `repair`

Rebuilds a damaged PDF so it opens.

- **Options:** none.
- **`data`:** what was wrong and what was recovered: pages found against pages expected, objects rebuilt.
- **Rule:** tries a structural rebuild first, then re-renders through a second engine. The result states which worked in `applied.route`.
- **Rule:** when pages could not be recovered, the job succeeds with a warning naming them. When nothing could be recovered, it fails with `FILE_DAMAGED` and no charge.
- **Engine:** qpdf, then Ghostscript.
- **Reference files:** a file with a broken cross-reference table; a file truncated at 80%; a file that is not a PDF at all.
- **Agent tasks:** "This PDF won't open, can you fix it?"
- **Readiness:** Ready for PDF. Repairing video is Evaluate.
