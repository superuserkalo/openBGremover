# Logo motion study 02

Open `index.html` directly or serve this directory through the existing website. It has no runtime dependencies or processing requests.

The new curled-ribbon symbol consists of three copies of one curved path, rotated 120 degrees apart. Each piece can move independently. It opens on hover, rotates during a processing preview, and folds back together on completion. Resting is static. The original open-frame logo is also available in the preview, with a lifted-pixel animation.

## Files

- `index.html`: interactive comparison with rest, hover, processing, and ready states, a full sequence, animation pause, and background switch.
- `ribbon-symbol.svg`: editable static symbol with transparent background.
- `ribbon-symbol.png`: 512-pixel transparent export.
- `ribbon-processing.svg`: self-contained looping SVG, with reduced-motion support.
- `ribbon-motion.gif`: portable motion preview of rest, hover, processing, and completion.
- `browser-preview.png`: screenshot of the working browser prototype.

The original logo assets remain in `../open-frame-v1/`. Wordmark outlines use the same Geist lettering as that concept. The new symbol is authored SVG, rather than a generated bitmap.

## Website behaviour

Use a static symbol in navigation until hover or keyboard focus. Use the rotating state inside the processing control only while a real request is pending. Use the completion movement once when the response arrives. Do not use a permanent spinning header. Respect `prefers-reduced-motion` with the resting symbol, while keeping text status updates.

This preview demonstrates motion; it does not wire logo state to the production uploader or change the site's current logo component.

## Verification

Checked in the local browser: concept switching, independent SVG rotation and part movement, pause/resume, light and dark backgrounds. At 390 pixels, the page had no horizontal overflow and all four state controls retained full width. The static and animated SVGs use the same path geometry. Reduced-motion handling is present in CSS; OS-level reduced-motion behaviour was not exercised.

Visual references supplied by the user: [Cursor](https://cursor.com/) and [Firecrawl](https://www.firecrawl.dev/). The new mark uses original geometry.
