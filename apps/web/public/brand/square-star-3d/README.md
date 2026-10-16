# Concept B, square and star in 3D

Preview: `/brand/square-star-3d/`, served from `apps/web/public` by the local HTTP server. Open `index.html` through HTTP so native JavaScript modules load.

The logo is a solid square tile with a concave four-point star cut through its full depth. Front and back faces, outer sidewalls, and inner aperture walls share one rigid rotation. An orthographic camera preserves the mark's scale. The turn uses a 1.52-second duration and quintic easing with zero velocity and acceleration at both ends. There is no spring, bounce, or overshoot. Endpoint rendering uses the exact identity transform.

The header and large preview share the same renderer. The wordmark remains fixed. Hover or click plays the turn. Holding hover or selecting Repeat plays another turn after a 750 ms pause. Leaving hover allows the active turn to finish. Slow motion plays at 0.35 times normal speed. The scrubber inspects individual positions. Light and dark backgrounds use appropriate monochrome materials.

The preview reads the system reduced-motion preference and provides a local toggle to inspect the fallback. In that state playback, repeating, and scrubbing are disabled and the resting mark stays visible. Rendering stops at rest and when the page is hidden. The static SVG remains available if JavaScript cannot load.

## Files

- `index.html`, `preview.css`, `preview.mjs`: standalone interactive preview.
- `geometry.mjs`: reusable 3D geometry, projection, canvas rendering, and SVG frame export.
- `symbol.svg`, `symbol.png`: static mark, including a transparent star opening.
- `wordmark.svg`: outlined lettering reused from the earlier logo study.
- `motion.gif`: portable preview rendered from the same geometry as the browser.
- `browser-preview.png`: screenshot of the working preview.

This version uses Canvas 2D to draw projected 3D surfaces without a runtime library or external assets. It is a local motion study. A production version can use a short rendered clip over the SVG, following the behavior recorded in `docs/cursor-logo-motion-study.md`. The existing website logo component is not replaced by this preview.

## Verification, 15 October 2026

Browser checks covered normal playback, a repeat after the hold, slow playback, frame scrubbing, light and dark backgrounds, and the reduced-motion fallback. A 390-pixel viewport had no horizontal overflow. The header wordmark's bounding box stayed unchanged during playback. Before and after screenshots of the large mark matched pixel for pixel, comparing 326,700 raw image bytes. Start and end 3D geometry also matched exactly. Browser console inspection found no errors or warnings.

The two JavaScript modules pass the repository's scoped Oxlint checks and Node syntax checks. `git diff --check` passed. No TypeScript application code or processing endpoints were changed, so the application build and live processing runner were not needed for this static preview.
