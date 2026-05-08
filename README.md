# Inscription Cropper

A browser-based, single-page Next.js app for manual cropping of stone-inscription images and multi-page PDFs into individually-named PNGs, suitable for line-by-line annotation prior to OCR training. Now with two kinds of rotation: discrete page rotation (90°/180°/270°) and continuous per-crop rotation for slanted lines.

Everything runs client-side; no file ever leaves the browser.

## Features

- Upload a PDF (any number of pages) or any common image format.
- Pan with `Shift+drag` (or middle-click drag); zoom with the mouse wheel.
- Drag a rectangle on the canvas to commit a crop. Each crop is auto-numbered.
- **Page rotation** in 90° steps via the `↶` / `↷` buttons in the header (or `Ctrl/Cmd + ,` / `Ctrl/Cmd + .`).
- **Per-crop rotation** for slanted lines:
  - Select a crop, then drag its rotation handle (the small circle above the rectangle).
  - Or select a crop and use `[` / `]` to rotate by 0.5°, `Shift+[` / `Shift+]` for 0.1° fine adjustments.
  - Press `R` to reset the selected crop's angle to zero.
  - Snaps to 0/90/180/270° within 1.5° tolerance during handle drag.
- Side panel lists each crop with thumbnail, dimensions, and angle. Crops can be renamed, reordered, and deleted.
- Export ZIP contains:
  - `001_label.png`, `002_label.png`, ... — each crop rendered upright at full source resolution. Rotated crops are de-skewed automatically.
  - `manifest.json` — for each crop: filename, label, source page, source-pixel coordinates of the un-rotated bounding rect, crop angle in degrees, and the page rotation in effect at creation.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Build for production

```bash
npm run build
npm start
```

## Notes on rotation

There are two rotations and they compose. The page can be rotated in 90° steps for convenience (e.g. a sideways photograph). Each crop also carries its own continuous rotation in radians, recorded relative to the source bitmap's *original* (un-page-rotated) orientation. This means:

- The manifest's `source_pixel_x/y/w/h` are always interpretable in the original photograph's pixel coordinate system, regardless of how the page is rotated for display.
- When extracting pixels for the ZIP, the crop's rotation is undone so the output PNG is upright.
- If you re-upload the same source file later, the crops will appear in the same place even if you rotated the page differently in this session.

## Configuration

- `PDF_RENDER_SCALE` in `lib/pdf.ts` (default `2.0`): higher = sharper crops, more memory.
- Output is PNG (lossless). To switch to JPEG, change the MIME type in `lib/cropping.ts` and `lib/zip.ts`.
