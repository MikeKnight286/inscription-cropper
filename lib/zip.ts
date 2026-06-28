import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { CropRect, SourcePage } from "@/types";
import { cropToBlob } from "./cropping";
import { normalizeToSquare } from "./annotate";

export async function downloadCropsZip(
  crops: CropRect[],
  pages: SourcePage[],
): Promise<void> {
  if (crops.length === 0) return;

  const zip = new JSZip();
  const annotations: { label: string; annotation: string; isSegment: boolean; parentId: string | null }[] = [];
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
    const normalized = await normalizeToSquare(blob);
    const safeLabel = c.label.replace(/[^a-zA-Z0-9_\-]/g, "_") || `crop_${i + 1}`;
    zip.file(`${String(i + 1).padStart(3, "0")}_${safeLabel}.png`, normalized);
    annotations.push({
      label: c.label,
      annotation: c.annotation ?? "",
      isSegment: false,
      parentId: null,
    });
  }
  zip.file("annotations.json", JSON.stringify(annotations, null, 2));

  const out = await zip.generateAsync({ type: "blob" });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  saveAs(out, `crops_${ts}.zip`);
}
