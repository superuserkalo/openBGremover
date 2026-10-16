# openBGremover logo, open frame v1

The open frame and detached pixel suggest an image element separated from its background. Orange matches the existing website palette.

## Assets

- `logo-orange.svg`: horizontal logo, orange symbol and charcoal lettering.
- `logo-black.svg` and `logo-white.svg`: single-color horizontal logos.
- `symbol-orange.svg`, `symbol-black.svg`, `symbol-white.svg`: standalone symbols.
- Matching PNG files have transparent backgrounds. Symbols are 1024 pixels square. Horizontal logos are 2064 × 384 pixels.
- `symbol-16.png`, `symbol-24.png`, `symbol-32.png`, `symbol-48.png`: small-size exports.
- `presentation.png` and `presentation.svg`: final vector artwork on a presentation sheet.
- `concept.png`: original built-in image-generation exploration.
- `design-prompt.txt`: complete generation prompt.
- `size-check.png`: enlarged nearest-neighbor views of 16, 24, 32, and 48 pixel exports, left to right.

## Use

Use the SVG masters for the website and scalable artwork. All lettering is outlined, so no font installation is required. The wordmark uses outlines from the Geist Regular font bundled with Next.js, with adjusted spacing. No font binary is distributed in this folder.

Colors: orange `#FA4B00`, charcoal `#262626`, pale background `#FAFAFA`, white `#FFFFFF`. Keep at least one detached-pixel width of empty space around the symbol. Use the symbol alone when the full name would become hard to read. Prefer 24 pixels or larger for interface use.

The generated concept was redrawn as editable SVG geometry and an outlined wordmark, then rasterized into the final PNGs. The SVG masters and final presentation are the reference for production use. The website's existing logo component has not been changed.
