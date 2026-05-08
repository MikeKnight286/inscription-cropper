import type { SourcePage } from "@/types";

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist");
    const version = pdfjsLib.version;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  }
  return pdfjsLib;
}

const PDF_RENDER_SCALE = 2.0;

export async function loadPdfPages(file: File): Promise<SourcePage[]> {
  const pdfjs = await getPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const pages: SourcePage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width  = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("2D context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const bitmap = await createImageBitmap(canvas);
    pages.push({
      id: `page_${i}`,
      label: `Page ${i}`,
      width:  canvas.width,
      height: canvas.height,
      bitmap,
      pageRotationRad: 0,
    });
  }
  return pages;
}

export async function loadImageFile(file: File): Promise<SourcePage[]> {
  const bitmap = await createImageBitmap(file);
  return [{
    id: `image_1`,
    label: file.name,
    width:  bitmap.width,
    height: bitmap.height,
    bitmap,
    pageRotationRad: 0,
  }];
}

export async function loadAnyFile(file: File): Promise<SourcePage[]> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return loadPdfPages(file);
  }
  return loadImageFile(file);
}