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

/** Global monotonic segment counter — increments across all segmentation
 *  calls so each segment gets a unique numeric suffix regardless of how many
 *  times the same parent is re-segmented. */
let _segCounter = 0;

/** Slice a bitmap at the given x-positions (in DISPLAY pixels) and return
 *  new AnnotationImage entries normalised to SEGMENT_SIZE × SEGMENT_SIZE,
 *  each labelled <parentLabel>_NNN with a globally unique number. */
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
    _segCounter += 1;
    const suffix     = `_${String(_segCounter).padStart(3, "0")}`;

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

/** Normalize a blob image to SEGMENT_SIZE × SEGMENT_SIZE using contain-fit
 *  with a black background, matching the segment export format. */
export async function normalizeToSquare(blob: Blob): Promise<Blob> {
  const bm = await createImageBitmap(blob);
  const canvas = renderSegmentCanvas(bm, 0, bm.width);
  bm.close();
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png")
  );
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
//
// STORAGE CONVENTION: visual left-to-right order.
//   U+1031 ေ is stored BEFORE its consonant: e.g. ကေ → 1031 1000.
//   This matches the agreed annotation format for this project.
//
// DISPLAY CONVENTION: for rendering in the preview, 1031 must appear AFTER
//   its consonant so Unicode-compliant fonts render correctly.
//   hexToUnicode() performs this swap for display only.
//
// TYPING ORDER: users type left-to-right visually.
//   - Type ေ (1031) then က (1000) → stored 1031 1000 ✓
//   - Type က (1000) then ေ (1031) → stored 1031 1000 ✓ (swapped on append)
//   - Type ေ က ျ ာ ် → stored 1031 1000 103B 102C 103A ✓
//     (ျ and ာ typed after ေ+က are inserted before the trailing 1031)
//
// BACKSPACE removes the last stored codepoint (visual-order last).

const PRE_VOWEL = 0x1031;
const BASE_CONSONANT_RANGE: [number, number] = [0x1000, 0x102A];
// Range covers U+1000–U+102A: all consonants (1000–1021) and
// independent vowels (1022–102A: ဣ ဤ ဥ ဦ ဧ ဨ ဩ ဪ). Both can
// appear as the head of a cluster with a 1039 stacking sign.
// Medials that visually attach to a consonant and sit between it and ေ
const MEDIALS = new Set([0x103B, 0x103C, 0x103D, 0x103E]);
const STACK_SIGN = 0x1039; // stacking sign — precedes a stacked consonant

function isBase(cp: number): boolean {
  // U+1000–U+102A: consonants and independent vowels
  // U+103F ဿ: great Sa — also acts as a syllable head
  return (cp >= BASE_CONSONANT_RANGE[0] && cp <= BASE_CONSONANT_RANGE[1])
    || cp === 0x103F;
}

/** Parse a hex annotation string into an array of codepoint numbers. */
export function hexToCodepoints(hex: string): number[] {
  return hex.trim().split(/\s+/).filter(Boolean).map(h => parseInt(h, 16)).filter(n => !isNaN(n));
}

/** Convert an array of codepoints to a space-separated hex string. */
export function codepointsToHex(cps: number[]): string {
  return cps.map(cp => cp.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

/** Convert a hex annotation string to the rendered Unicode string.
 *  Performs display-only reordering: wherever the stored sequence is
 *  1031 <consonant> [medials], swap to <consonant> [medials] 1031 so
 *  Unicode-compliant renderers display ေ correctly to the left. */
export function hexToUnicode(hex: string): string {
  const cps = hexToCodepoints(hex);
  const out: number[] = [];
  const ZWSP = 0x200B; // zero-width space — acts as syllable boundary for shaping
  let i = 0;
  while (i < cps.length) {
    if (cps[i] === PRE_VOWEL) {
      i++; // skip stored 1031
      const cluster: number[] = [];
      if (i < cps.length && isBase(cps[i])) {
        cluster.push(cps[i++]);
        // Consume medials (103B–103E) and stacking pairs (1039 + consonant)
        // that belong to this cluster before placing 1031 after them.
        let consuming = true;
        while (consuming && i < cps.length) {
          if (MEDIALS.has(cps[i])) {
            cluster.push(cps[i++]);
          } else if (cps[i] === STACK_SIGN && i + 1 < cps.length) {
            cluster.push(cps[i++]); // 1039
            cluster.push(cps[i++]); // stacked consonant or independent vowel
          } else {
            consuming = false;
          }
        }
      }
      if (cluster.length === 0) {
        // Bare ေ with no consonant host — insert ZWSP before it so the
        // renderer does not attach it to the preceding cluster visually.
        if (out.length > 0) out.push(ZWSP);
      }
      out.push(...cluster, PRE_VOWEL);
    } else {
      out.push(cps[i++]);
    }
  }
  return out.map(cp => String.fromCodePoint(cp)).join("");
}

/** Append one codepoint to the stored codepoint array in visual order.
 *
 *  Rules for 1031 (ေ):
 *   A. New char is 1031, last stored is a base consonant:
 *      — ေ goes BEFORE the consonant in storage (visual order).
 *        Find the consonant's position, insert 1031 before it.
 *        e.g. [1000] + 1031 → [1031, 1000]
 *
 *   B. New char is 1031, last stored is a medial whose consonant precedes it:
 *      — Medials sit after their consonant but before ေ visually.
 *        Insert 1031 before the run of medials (and their consonant).
 *        e.g. [1031, 1000, 103B] + 1031 (second syllable) → not this case;
 *             [1000, 103B] + 1031 → [1031, 1000, 103B]
 *        Concretely: walk back past medials to find base, insert before base.
 *
 *   C. New char is a base consonant or medial, last stored is 1031:
 *      — User typed ေ first; consonant/medial goes AFTER 1031 (stays in place).
 *        e.g. [1031] + 1000 → [1031, 1000]  ✓ already correct storage order.
 *        No special action needed — just append.
 *
 *   D. New char is a medial, and the sequence ends with [1031, consonant]:
 *      — Medial belongs after the consonant but before ေ visually,
 *        but in our storage convention ေ is already before the consonant.
 *        Insert medial after the consonant (i.e. append — it is already last).
 *        e.g. [1031, 1000] + 103B → [1031, 1000, 103B]  ✓ append as-is.
 *
 *   E. All other characters: append as-is. */
function appendWithReorder(cps: number[], newCp: number): number[] {
  // Rule A/B: appending 1031 — find the base consonant of the current cluster
  // to insert 1031 before it (visual-order storage: 1031 precedes consonant).
  // Walk back past medials AND stacking pairs (1039 + consonant) to reach the
  // true base consonant. Only insert if that consonant is not already owned
  // by a preceding 1031.
  if (newCp === PRE_VOWEL) {
    let insertBefore = -1;
    let i = cps.length - 1;
    while (i >= 0) {
      if (MEDIALS.has(cps[i])) {
        i--; continue;
      }
      // Stacking pair: [base, 1039, stacked] — skip stacked consonant and 1039
      // Skip stacking pairs (1039 + any codepoint) when walking back
      if (i >= 2 && cps[i - 1] === STACK_SIGN) {
        i -= 2; // skip stacked element and 1039, keep looking
        continue;
      }
      if (isBase(cps[i])) { insertBefore = i; break; }
      break; // hit something unrelated — stop
    }
    if (insertBefore >= 0) {
      const alreadyOwned = insertBefore > 0 && cps[insertBefore - 1] === PRE_VOWEL;
      if (!alreadyOwned) {
        return [...cps.slice(0, insertBefore), PRE_VOWEL, ...cps.slice(insertBefore)];
      }
    }
    return [...cps, PRE_VOWEL];
  }

  // All other characters: append as-is.
  return [...cps, newCp];
}

/** Append one codepoint (from on-screen keyboard) to an existing hex annotation
 *  and return the new hex string. */
export function appendCodepoint(currentHex: string, newCp: number): string {
  const cps = hexToCodepoints(currentHex);
  return codepointsToHex(appendWithReorder(cps, newCp));
}

/** Remove the last codepoint from a hex annotation string. */
export function removeLastCodepoint(currentHex: string): string {
  const cps = hexToCodepoints(currentHex);
  if (cps.length === 0) return "";
  return codepointsToHex(cps.slice(0, -1));
}