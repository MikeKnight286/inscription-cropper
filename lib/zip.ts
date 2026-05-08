import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { CropRect, SourcePage } from "@/types";
import { cropToBlob } from "./cropping";

interface ManifestEntry {
  filename: string;
  label: string;
  source_page_id: string;
  source_page_label: string;
  source_pixel_x: number;
  source_pixel_y: number;
  source_pixel_w: number;
  source_pixel_h: number;
  crop_angle_degrees: number;
  page_rotation_degrees_at_creation: number;
  erase_strokes: number;
}

export async function downloadCropsZip(
  crops: CropRect[],
  pages: SourcePage[],
): Promise<void> {
  if (crops.length === 0) return;

  const zip = new JSZip();
  const manifest: ManifestEntry[] = [];
  const pageById = new Map(pages.map(p => [p.id, p]));

  for (let i = 0; i < crops.length; i++) {
    const c = crops[i];
    const page = pageById.get(c.pageId);
    if (!page) continue;
    const { blob } = await cropToBlob(
      page,
      { x: c.x, y: c.y, w: c.w, h: c.h, angle: c.angle },
      c.eraseMask ?? [],
    );
    const safeLabel = c.label.replace(/[^a-zA-Z0-9_\-]/g, "_") || `crop_${i + 1}`;
    const filename = `${String(i + 1).padStart(3, "0")}_${safeLabel}.png`;
    zip.file(filename, blob);
    manifest.push({
      filename,
      label: c.label,
      source_page_id: page.id,
      source_page_label: page.label,
      source_pixel_x: Math.round(c.x),
      source_pixel_y: Math.round(c.y),
      source_pixel_w: Math.round(c.w),
      source_pixel_h: Math.round(c.h),
      crop_angle_degrees: +(c.angle * 180 / Math.PI).toFixed(3),
      page_rotation_degrees_at_creation: +(c.pageRotationAtCreation * 180 / Math.PI).toFixed(3),
      erase_strokes: (c.eraseMask ?? []).length,
    });
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const out = await zip.generateAsync({ type: "blob" });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  saveAs(out, `crops_${ts}.zip`);
}