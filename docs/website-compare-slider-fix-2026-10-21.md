# Website comparison slider and button cursor fix — 21 October 2026

Website-only change; the API and Beam workers were not redeployed.

## Changes

- `7198d76`: the before/after comparison takes the image's own aspect ratio
  (capped at 70vh tall) instead of a fixed 512 × 440 letterboxed box. The
  white divider with the round arrows handle is restored. Pointer events drive
  dragging; the range input stays invisible and only serves keyboard and
  screen-reader use. Previously it became visible on focus and drew an orange
  native slider across the image.
- `e936e03`: buttons show the pointer cursor. Tailwind v4 dropped it from
  buttons, so the Connect agent menu did not look clickable.

## Deployment

- Production: `dpl_G7ZF7QZL3k6ZADG12fWxtq4otW4Z` (commit `e936e03`).
- Previous production, for rollback: `dpl_CMdE2kkDWb8YqHQ9HxMivkZH59kw`
  (commit `a86b15b`).

## Verification

`npm run check` (177 tests, typecheck, lint) and the web build passed, and CI
passed on `e936e03`. A headless Chromium check on https://openbgremover.dev
showed the homepage comparison at 558 × 558 for the square astronaut image
with no letterboxing. Dragging moved the divider, and the Connect agent button
reported `cursor: pointer`.
