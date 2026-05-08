import type { SourcePage, CropRect, HandleName } from "@/types";

/** Bounding-box dimensions of the rotated page in displayed space. */
export function displayedDimensions(page: SourcePage): { w: number; h: number } {
  const a = page.pageRotationRad;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  return {
    w: page.width * cos + page.height * sin,
    h: page.width * sin + page.height * cos,
  };
}

/** Map a point in DISPLAYED-space (after page rotation, in the displayed
 *  bounding box) to ORIGINAL-space (the un-rotated bitmap's pixels). */
export function displayedToOriginal(
  page: SourcePage, dx: number, dy: number,
): { x: number; y: number } {
  const a = page.pageRotationRad;
  const dims = displayedDimensions(page);
  // Translate to centre, rotate by -a, translate back to original-space centre
  const cdx = dx - dims.w / 2;
  const cdy = dy - dims.h / 2;
  const cos = Math.cos(-a);
  const sin = Math.sin(-a);
  const ox = cdx * cos - cdy * sin + page.width / 2;
  const oy = cdx * sin + cdy * cos + page.height / 2;
  return { x: ox, y: oy };
}

/** Map a point in ORIGINAL-space to DISPLAYED-space (after page rotation). */
export function originalToDisplayed(
  page: SourcePage, ox: number, oy: number,
): { x: number; y: number } {
  const a = page.pageRotationRad;
  const dims = displayedDimensions(page);
  const cox = ox - page.width / 2;
  const coy = oy - page.height / 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = cox * cos - coy * sin + dims.w / 2;
  const dy = cox * sin + coy * cos + dims.h / 2;
  return { x: dx, y: dy };
}

/** Four corners of a crop in DISPLAYED-space, in TL-TR-BR-BL order. */
export function cropCornersInDisplayed(
  page: SourcePage,
  crop: { x: number; y: number; w: number; h: number; angle: number },
): { x: number; y: number }[] {
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const cos = Math.cos(crop.angle);
  const sin = Math.sin(crop.angle);
  const half: [number, number][] = [
    [-crop.w / 2, -crop.h / 2],
    [ crop.w / 2, -crop.h / 2],
    [ crop.w / 2,  crop.h / 2],
    [-crop.w / 2,  crop.h / 2],
  ];
  return half.map(([hx, hy]) => {
    const ox = cx + hx * cos - hy * sin;
    const oy = cy + hx * sin + hy * cos;
    return originalToDisplayed(page, ox, oy);
  });
}

export function cropCenterInDisplayed(
  page: SourcePage, crop: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
  return originalToDisplayed(page, crop.x + crop.w / 2, crop.y + crop.h / 2);
}

/** Effective rotation of a crop's local x-axis as drawn on screen. */
export function cropDisplayedAngle(page: SourcePage, cropAngle: number): number {
  return cropAngle + page.pageRotationRad;
}

export function pointInsideCrop(
  page: SourcePage, crop: CropRect, dx: number, dy: number,
): boolean {
  const orig = displayedToOriginal(page, dx, dy);
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const cos = Math.cos(-crop.angle);
  const sin = Math.sin(-crop.angle);
  const lx = (orig.x - cx) * cos - (orig.y - cy) * sin;
  const ly = (orig.x - cx) * sin + (orig.y - cy) * cos;
  return Math.abs(lx) <= crop.w / 2 && Math.abs(ly) <= crop.h / 2;
}

// ── Resize math ──────────────────────────────────────────────────────────────

/** Local-axis offset of each handle from the crop's centre, expressed in
 *  units of (w/2, h/2). E = +x, W = -x, S = +y, N = -y in canvas convention. */
const HANDLE_LOCAL: Record<HandleName, [number, number]> = {
  N:  [ 0, -1],
  S:  [ 0,  1],
  E:  [ 1,  0],
  W:  [-1,  0],
  NW: [-1, -1],
  NE: [ 1, -1],
  SW: [-1,  1],
  SE: [ 1,  1],
};

/** Position of a handle in DISPLAYED-space, given crop and handle name. */
export function handlePosInDisplayed(
  page: SourcePage,
  crop: { x: number; y: number; w: number; h: number; angle: number },
  h: HandleName,
): { x: number; y: number } {
  const [hx, hy] = HANDLE_LOCAL[h];
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const cos = Math.cos(crop.angle);
  const sin = Math.sin(crop.angle);
  const ox = cx + (hx * crop.w / 2) * cos - (hy * crop.h / 2) * sin;
  const oy = cy + (hx * crop.w / 2) * sin + (hy * crop.h / 2) * cos;
  return originalToDisplayed(page, ox, oy);
}

/** Apply a resize: drag handle `h` from its original position to a new
 *  position given in ORIGINAL space. The opposite edge (or corner) stays
 *  anchored. Returns the new (x, y, w, h); angle is unchanged.
 *
 *  Math: express the drag in the crop's local frame. For each axis the handle
 *  is active on, set the new local extent to the projection from the anchor
 *  to the new handle position, and shift the centre to keep the anchor fixed.
 */
export function applyResize(
  crop: { x: number; y: number; w: number; h: number; angle: number },
  handle: HandleName,
  newPosOrig: { x: number; y: number },
  minSize = 4,
): { x: number; y: number; w: number; h: number } {
  const [hx, hy] = HANDLE_LOCAL[handle];
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const cos = Math.cos(crop.angle);
  const sin = Math.sin(crop.angle);

  // Express new pos relative to centre, in local coords
  const dx = newPosOrig.x - cx;
  const dy = newPosOrig.y - cy;
  const lx =  dx * cos + dy * sin;          // local x
  const ly = -dx * sin + dy * cos;          // local y

  let newW = crop.w;
  let newH = crop.h;
  // Centre offset in local coords (will be applied as a shift along local axes)
  let centerShiftLx = 0;
  let centerShiftLy = 0;

  if (hx !== 0) {
    // Anchor is at -hx (opposite side). Anchor's local-x is -hx * w/2.
    const anchorLx = -hx * crop.w / 2;
    // New width = |lx_new - anchorLx|, signed direction must match hx
    const signed = lx - anchorLx;
    // If user drags past the anchor, clamp to minSize
    let wNew = hx > 0 ? signed : -signed;
    if (wNew < minSize) wNew = minSize;
    newW = wNew;
    // New centre's local x relative to old centre: anchorLx + hx * wNew/2
    centerShiftLx = anchorLx + hx * wNew / 2;
  }
  if (hy !== 0) {
    const anchorLy = -hy * crop.h / 2;
    const signed = ly - anchorLy;
    let hNew = hy > 0 ? signed : -signed;
    if (hNew < minSize) hNew = minSize;
    newH = hNew;
    centerShiftLy = anchorLy + hy * hNew / 2;
  }

  // Convert centre shift back to original-space delta
  const sX = centerShiftLx * cos - centerShiftLy * sin;
  const sY = centerShiftLx * sin + centerShiftLy * cos;
  const newCx = cx + sX;
  const newCy = cy + sY;

  return {
    x: newCx - newW / 2,
    y: newCy - newH / 2,
    w: newW,
    h: newH,
  };
}