export interface SourcePage {
  id: string;
  label: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
  /** Continuous page rotation in radians, clockwise.
   *  Applied at render time only; bitmap is never mutated. */
  pageRotationRad: number;
}

/** A single eraser stroke in crop-local upright pixel space.
 *  Origin is top-left of the rendered crop output; y is down.
 *  Coordinates are in full-resolution output pixels (matching blob export). */
export interface EraseCircle {
  x: number;
  y: number;
  r: number;
}

export interface CropRect {
  id: string;
  pageId: string;
  /** Axis-aligned rect in SOURCE-image pixel space (original orientation),
   *  before per-crop rotation. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Per-crop rotation in radians, about the crop's centre. */
  angle: number;
  /** Page rotation in radians in effect when this crop was created.
   *  Coords are always relative to the source bitmap's ORIGINAL orientation. */
  pageRotationAtCreation: number;
  label: string;
  thumbUrl: string;
  /** Eraser strokes in crop-local upright pixel space.
   *  Applied after crop rendering; each entry blacks out a circle. */
  eraseMask: EraseCircle[];
}

export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
}

/** Names of resize handles. NW = north-west corner, N = north edge, etc. */
export type HandleName = "N" | "S" | "E" | "W" | "NW" | "NE" | "SW" | "SE";