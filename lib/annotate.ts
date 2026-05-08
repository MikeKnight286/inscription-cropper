import type { EraseCircle } from "@/types";

export interface AnnotationImage {
  id: string;
  label: string;
  objectUrl: string;
  bitmap: ImageBitmap;
  eraseMask: EraseCircle[];
  annotation: string;
  parentId: string | null;
  isSegment: boolean;
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Target output size for normalised segment images. */
const SEGMENT_SIZE = 395;

/** Load a File (image) into an AnnotationImage entry. */
export async function fileToAnnotationImage(
  file: File,
  labelOverride?: string,
): Promise<AnnotationImage> {
  const objectUrl = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  const label = labelOverride ?? file.name.replace(/\.[^.]+$/, "");
  return {
    id: `img_${uid()}`,
    label,
    objectUrl,
    bitmap,
    eraseMask: [],
    annotation: "",
    parentId: null,
    isSegment: false,
  };
}

/** Render a source region (x0..x1, full height) of a bitmap into a
 *  SEGMENT_SIZE × SEGMENT_SIZE canvas, centred with uniform scaling
 *  (contain mode) and a black background. Returns the canvas. */
function renderSegmentCanvas(
  bm: ImageBitmap,
  x0: number,
  x1: number,
): HTMLCanvasElement {
  const srcW = x1 - x0;
  const srcH = bm.height;

  // Uniform scale to fit inside SEGMENT_SIZE × SEGMENT_SIZE
  const scale = Math.min(SEGMENT_SIZE / srcW, SEGMENT_SIZE / srcH);
  const dstW  = Math.round(srcW * scale);
  const dstH  = Math.round(srcH * scale);
  // Centre offset
  const offX  = Math.floor((SEGMENT_SIZE - dstW) / 2);
  const offY  = Math.floor((SEGMENT_SIZE - dstH) / 2);

  const canvas = document.createElement("canvas");
  canvas.width  = SEGMENT_SIZE;
  canvas.height = SEGMENT_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, SEGMENT_SIZE, SEGMENT_SIZE);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bm, x0, 0, srcW, srcH, offX, offY, dstW, dstH);

  return canvas;
}

/** Slice a bitmap at the given x-positions (in DISPLAY pixels) and return
 *  new AnnotationImage entries normalised to SEGMENT_SIZE × SEGMENT_SIZE,
 *  each labelled <parentLabel>_a, _b, _c … */
export async function segmentBitmap(
  parent: AnnotationImage,
  cutXs: number[],     // sorted ascending, in display pixels
  displayWidth: number,
): Promise<AnnotationImage[]> {
  const bm     = parent.bitmap;
  const scaleX = bm.width / displayWidth;

  // Build intervals in source-bitmap pixels: [0, x0, x1, …, bm.width]
  const cuts = [0, ...cutXs.map(x => Math.round(x * scaleX)), bm.width]
    .sort((a, b) => a - b)
    .filter((v, i, arr) => i === 0 || v !== arr[i - 1]);

  const suffixes = "abcdefghijklmnopqrstuvwxyz";
  const segments: AnnotationImage[] = [];

  for (let i = 0; i < cuts.length - 1; i++) {
    const x0 = cuts[i];
    const x1 = cuts[i + 1];
    if (x1 - x0 < 2) continue;

    const canvas = renderSegmentCanvas(bm, x0, x1);

    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png")
    );
    const objectUrl  = URL.createObjectURL(blob);
    const segBitmap  = await createImageBitmap(blob);
    const suffix     = i < suffixes.length ? `_${suffixes[i]}` : `_${i}`;

    segments.push({
      id: `img_${uid()}`,
      label: `${parent.label}${suffix}`,
      objectUrl,
      bitmap: segBitmap,   // already 395×395; eraseMask coords are in this space
      eraseMask: [],
      annotation: "",
      parentId: parent.id,
      isSegment: true,
    });
  }

  return segments;
}

/** Export annotations as a JSON blob. */
export function exportAnnotationsJson(images: AnnotationImage[]): Blob {
  const data = images.map(img => ({
    label: img.label,
    annotation: img.annotation,
    isSegment: img.isSegment,
    parentId: img.parentId,
  }));
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

/** Apply erase mask to a bitmap and return a PNG blob.
 *  Erase-circle coordinates are in bitmap-pixel space, which for normalised
 *  segments is already the 395×395 output space. */
export async function applyMaskToBlob(img: AnnotationImage): Promise<Blob> {
  const bm = img.bitmap;
  const canvas = document.createElement("canvas");
  canvas.width  = bm.width;
  canvas.height = bm.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bm, 0, 0);
  if (img.eraseMask.length > 0) {
    ctx.fillStyle = "#000000";
    for (const circle of img.eraseMask) {
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png")
  );
}

// ─── Hex annotation utilities ─────────────────────────────────────────────────

/** U+1031 ေ is the only pre-posed (visually left-of-consonant) vowel sign in
 *  standard Unicode Myanmar. When the user types it first (visual order), it
 *  must be moved after the preceding base consonant + medials in storage order.
 *
 *  Rule: after appending 1031 to the pending syllable cluster, if the cluster
 *  already contains a base consonant (U+1000–U+1021), move 1031 to immediately
 *  after the last medial (or the base consonant if no medials), i.e. after all
 *  of: base, 1039+consonant stacks, 103B–103E medials. */
const PRE_VOWEL = 0x1031;

// Characters that form part of the consonant + medial cluster BEFORE 1031
const BASE_CONSONANT_RANGE: [number, number] = [0x1000, 0x1021];
const MEDIALS = new Set([0x103B, 0x103C, 0x103D, 0x103E, 0x1039]);

/** Parse a hex annotation string into an array of codepoint numbers. */
export function hexToCodepoints(hex: string): number[] {
  return hex.trim().split(/\s+/).filter(Boolean).map(h => parseInt(h, 16)).filter(n => !isNaN(n));
}

/** Convert an array of codepoints to a space-separated hex string. */
export function codepointsToHex(cps: number[]): string {
  return cps.map(cp => cp.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

/** Convert a hex annotation string to the rendered Unicode string (for display). */
export function hexToUnicode(hex: string): string {
  const cps = hexToCodepoints(hex);
  return cps.map(cp => String.fromCodePoint(cp)).join("");
}

/** Apply visual-to-logical reordering to a codepoint array.
 *  When U+1031 (ေ) is appended and a base consonant already precedes it in
 *  the current cluster, move 1031 to after the base + all medials.
 *  All other characters are stored in the order they are typed. */
export function reorderForStorage(codepoints: number[]): number[] {
  if (codepoints.length === 0) return [];

  const last = codepoints[codepoints.length - 1];
  if (last !== PRE_VOWEL) return codepoints; // no reorder needed

  // Find the start of the current syllable cluster: scan backwards from
  // second-to-last until we hit a character that is not a base consonant,
  // medial, stacking sign, or previous diacritic (i.e. a syllable boundary).
  // For our purposes we find the last base consonant index.
  const prev = codepoints.slice(0, -1);
  let baseIdx = -1;
  for (let i = prev.length - 1; i >= 0; i--) {
    const cp = prev[i];
    const isBase = cp >= BASE_CONSONANT_RANGE[0] && cp <= BASE_CONSONANT_RANGE[1];
    const isMedial = MEDIALS.has(cp);
    if (isBase) { baseIdx = i; break; }
    if (!isMedial) break; // hit something that is not a medial — stop
  }

  if (baseIdx < 0) return codepoints; // no base consonant found — leave as typed

  // Find insertion point: after base consonant + all following medials/stacks
  let insertAfter = baseIdx;
  for (let i = baseIdx + 1; i < prev.length; i++) {
    if (MEDIALS.has(prev[i])) insertAfter = i;
    else break;
  }

  // Rebuild: everything up to and including insertAfter, then 1031, then rest
  const result = [
    ...prev.slice(0, insertAfter + 1),
    PRE_VOWEL,
    ...prev.slice(insertAfter + 1),
  ];
  return result;
}

/** Append one codepoint (from on-screen keyboard) to an existing hex annotation,
 *  applying visual-to-logical reordering, and return the new hex string. */
export function appendCodepoint(currentHex: string, newCp: number): string {
  const cps = hexToCodepoints(currentHex);
  const reordered = reorderForStorage([...cps, newCp]);
  return codepointsToHex(reordered);
}

/** Remove the last codepoint from a hex annotation string. */
export function removeLastCodepoint(currentHex: string): string {
  const cps = hexToCodepoints(currentHex);
  if (cps.length === 0) return "";
  return codepointsToHex(cps.slice(0, -1));
}
