import type { SourcePage, EraseCircle } from "@/types";

const THUMB_MAX_DIM = 240;

interface CropParams {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;        // radians, rotation about crop centre
}

/** Render a (possibly rotated) crop onto a fresh canvas of size (outW, outH).
 *  The crop's centre in source space is (x + w/2, y + h/2); we translate
 *  the destination canvas to its centre, then rotate by -angle (to undo
 *  the crop's rotation), then draw the source bitmap with its centre
 *  placed at the origin. Result: an upright (w × h) image regardless of
 *  the crop's angle in source space.
 *
 *  If eraseMask is non-empty, each circle is painted in black (fill) in
 *  crop-local upright pixel space AFTER the bitmap is drawn. The scale
 *  from crop-local pixels to output pixels is (outW/p.w, outH/p.h). */
function renderCropToCanvas(
  page: SourcePage,
  p: CropParams,
  outCanvas: HTMLCanvasElement,
  outW: number,
  outH: number,
  eraseMask?: EraseCircle[],
): void {
  const ctx = outCanvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  outCanvas.width  = outW;
  outCanvas.height = outH;

  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  // Scale factor from source pixels to output pixels
  const sx = outW / p.w;
  const sy = outH / p.h;

  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, outW, outH);

  // Build transform: out = scale(sx,sy) * translate(w/2,h/2) * rotate(-angle) * translate(-cx,-cy) * source
  ctx.translate(outW / 2, outH / 2);
  ctx.scale(sx, sy);
  ctx.rotate(-p.angle);
  ctx.translate(-cx, -cy);

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(page.bitmap, 0, 0);
  ctx.restore();

  // Apply erase mask in crop-local upright space
  if (eraseMask && eraseMask.length > 0) {
    const scaleX = outW / p.w;
    const scaleY = outH / p.h;
    ctx.save();
    ctx.fillStyle = "#000000";
    for (const circle of eraseMask) {
      const ex = circle.x * scaleX;
      const ey = circle.y * scaleY;
      const er = circle.r * Math.max(scaleX, scaleY);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export async function cropToBlob(
  page: SourcePage,
  params: CropParams,
  eraseMask?: EraseCircle[],
): Promise<{ blob: Blob; thumbUrl: string }> {
  // Clamp size — we still allow the centre to be near the bitmap edge
  // because rotated regions can validly extend past it (filled with black)
  const w = Math.max(1, Math.round(params.w));
  const h = Math.max(1, Math.round(params.h));
  const p: CropParams = { ...params, w, h };

  const fullCanvas = document.createElement("canvas");
  renderCropToCanvas(page, p, fullCanvas, w, h, eraseMask);
  const blob: Blob = await new Promise((res, rej) =>
    fullCanvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png")
  );

  const scale = Math.min(1, THUMB_MAX_DIM / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const thumbCanvas = document.createElement("canvas");
  renderCropToCanvas(page, p, thumbCanvas, tw, th, eraseMask);
  const thumbBlob: Blob = await new Promise((res, rej) =>
    thumbCanvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png")
  );
  const thumbUrl = URL.createObjectURL(thumbBlob);

  return { blob, thumbUrl };
}

/** Render a crop to an ImageBitmap at its natural size.
 *  Used by EraseEditor to display the base image layer. */
export async function cropToBitmap(
  page: SourcePage,
  params: CropParams,
): Promise<ImageBitmap> {
  const w = Math.max(1, Math.round(params.w));
  const h = Math.max(1, Math.round(params.h));
  const p: CropParams = { ...params, w, h };
  const canvas = document.createElement("canvas");
  renderCropToCanvas(page, p, canvas, w, h);
  return createImageBitmap(canvas);
}