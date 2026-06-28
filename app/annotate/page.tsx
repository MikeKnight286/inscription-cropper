"use client";

import { useCallback, useRef, useState } from "react";
import ImageList from "@/components/annotate/ImageList";
import StripViewer from "@/components/annotate/StripViewer";
import AnnotationPanel from "@/components/annotate/AnnotationPanel";
import ReviewPanel from "@/components/annotate/ReviewPanel";
import EraseEditor from "@/components/EraseEditor";
import {
  type AnnotationImage,
  fileToAnnotationImage,
  segmentBitmap,
  exportAnnotationsJson,
  applyMaskToBlob,
} from "@/lib/annotate";
import type { EraseCircle, SourcePage } from "@/types";
import JSZip from "jszip";
import { saveAs } from "file-saver";

/** Wrap an AnnotationImage as a minimal SourcePage so EraseEditor can consume it. */
function toSourcePage(img: AnnotationImage): SourcePage {
  return {
    id: img.id,
    label: img.label,
    width: img.bitmap.width,
    height: img.bitmap.height,
    bitmap: img.bitmap,
    pageRotationRad: 0,
  };
}

/** Wrap an AnnotationImage as a minimal CropRect so EraseEditor can consume it. */
function toCropRect(img: AnnotationImage) {
  return {
    id: img.id,
    pageId: img.id,
    x: 0,
    y: 0,
    w: img.bitmap.width,
    h: img.bitmap.height,
    angle: 0,
    pageRotationAtCreation: 0,
    label: img.label,
    annotation: img.annotation,
    thumbUrl: img.objectUrl,
    eraseMask: img.eraseMask,
  };
}

export default function AnnotatePage() {
  const [images, setImages] = useState<AnnotationImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eraseId, setEraseId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = images.find(img => img.id === selectedId) ?? null;
  const eraseImage    = images.find(img => img.id === eraseId)    ?? null;

  // ── File loading ──────────────────────────────────────────────────────────

  async function loadFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const loaded = await Promise.all(arr.map(f => fileToAnnotationImage(f)));
    setImages(prev => [...prev, ...loaded]);
    if (!selectedId && loaded.length > 0) setSelectedId(loaded[0].id);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) loadFiles(e.target.files);
    e.target.value = "";
  }

  function handlePageDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files) loadFiles(e.dataTransfer.files);
  }

  // ── List operations ───────────────────────────────────────────────────────

  const handleDelete = useCallback((id: string) => {
    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter(img => img.id !== id);
    });
    setSelectedId(s => s === id ? null : s);
  }, []);

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    setImages(prev => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, []);

  // ── Annotation ────────────────────────────────────────────────────────────

  const handleAnnotationChange = useCallback((id: string, text: string) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, annotation: text } : img));
  }, []);

  // ── Segmentation ──────────────────────────────────────────────────────────

  const handleSegment = useCallback(async (
    parentId: string,
    cutXs: number[],
    displayWidth: number,
  ) => {
    const parent = images.find(img => img.id === parentId);
    if (!parent) return;
    const segments = await segmentBitmap(parent, cutXs, displayWidth);
    if (segments.length === 0) return;
    setImages(prev => {
      const idx = prev.findIndex(img => img.id === parentId);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx + 1, 0, ...segments);
      return next;
    });
    setSelectedId(segments[0].id);
  }, [images]);

  // ── Erase ─────────────────────────────────────────────────────────────────

  // When the user applies an erase mask:
  // 1. Store the new eraseMask on the AnnotationImage (for future re-editing and export).
  // 2. Re-render the masked image into a blob, create a new objectUrl, and revoke the
  //    old one. This makes ImageList and ReviewPanel (which use <img src={objectUrl}>)
  //    show the up-to-date masked image immediately without any additional prop threading.
  const handleEraseCommit = useCallback(async (id: string, mask: EraseCircle[]) => {
    setEraseId(null);

    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (!target) return prev;

      // Build an updated entry with the new mask synchronously so the modal
      // closes immediately. objectUrl refresh happens asynchronously below.
      return prev.map(img =>
        img.id === id ? { ...img, eraseMask: mask } : img
      );
    });

    // Async: regenerate the preview objectUrl with the mask baked in.
    // We need to read the current image out of state here, but since setImages
    // above is async we reconstruct it directly from the images array in scope.
    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (!target) return prev;

      const updated: AnnotationImage = { ...target, eraseMask: mask };

      // Fire the async re-render and update objectUrl when ready.
      applyMaskToBlob(updated).then(blob => {
        const newUrl = URL.createObjectURL(blob);
        setImages(current => current.map(img => {
          if (img.id !== id) return img;
          URL.revokeObjectURL(img.objectUrl);   // release the old URL
          return { ...img, objectUrl: newUrl };
        }));
      });

      return prev; // return unchanged; the .then() will trigger the real update
    });
  }, []);

  // ── Export ────────────────────────────────────────────────────────────────

  function handleExportJson() {
    const blob = exportAnnotationsJson(images);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    saveAs(blob, `annotations_${ts}.json`);
  }

  async function handleExportZip() {
    if (images.length === 0) return;
    const zip = new JSZip();
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const blob = await applyMaskToBlob(img);
      const safe = img.label.replace(/[^a-zA-Z0-9_\-]/g, "_");
      zip.file(`${String(i + 1).padStart(3, "0")}_${safe}.png`, blob);
    }
    const jsonBlob = exportAnnotationsJson(images);
    zip.file("annotations.json", jsonBlob);
    const out = await zip.generateAsync({ type: "blob" });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    saveAs(out, `annotated_${ts}.zip`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main
      className="an-app"
      onDragOver={e => e.preventDefault()}
      onDrop={handlePageDrop}
    >
      <header className="an-header">
        <div className="an-brand">
          <a href="/" className="an-brand-back" title="back to cropper">▭</a>
          <span className="an-brand-sep">/</span>
          <a href="/" className="an-brand-cropper-link" title="Back to Inscription Cropper">cropper</a>
          <span className="an-brand-sep">/</span>
          <span className="an-brand-name">Annotation</span>
        </div>
        <div className="an-header-controls">
          <a href="/counter" className="an-btn" style={{textDecoration:"none"}}>counter</a>
          <button className="an-btn" onClick={() => fileInputRef.current?.click()}>
            + images
          </button>
          <button className="an-btn" onClick={() => folderInputRef.current?.click()}>
            + folder
          </button>
          <button
            className="an-btn"
            onClick={handleExportJson}
            disabled={images.length === 0}
          >
            export json
          </button>
          <button
            className="an-btn primary"
            onClick={handleExportZip}
            disabled={images.length === 0}
          >
            export zip
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
        <input
          ref={folderInputRef}
          type="file"
          accept="image/*"
          multiple
          // @ts-ignore — webkitdirectory is not in React's types but works in all modern browsers
          webkitdirectory=""
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
      </header>

      <div className="an-body">
        <aside className="an-list-pane">
          <div className="an-pane-header">
            <span className="an-pane-title">images</span>
            <span className="an-pane-count">{images.length}</span>
          </div>
          <ImageList
            images={images}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onReorder={handleReorder}
          />
        </aside>

        <section className="an-viewer-pane">
          {images.length === 0 ? (
            <div className="an-welcome">
              <div className="an-welcome-icon">⊞</div>
              <p>drag images or a folder here, or use the buttons above</p>
              <p className="an-welcome-sub">supports PNG, JPEG, TIFF</p>
            </div>
          ) : (
            <StripViewer
              image={selectedImage}
              onSegment={handleSegment}
              onEditErase={setEraseId}
            />
          )}
        </section>

        <aside className="an-right-pane">
          <AnnotationPanel
            image={selectedImage}
            onChange={handleAnnotationChange}
          />
          <ReviewPanel
            images={images}
            onSelect={setSelectedId}
          />
        </aside>
      </div>

      {eraseId && eraseImage && (
        <EraseEditor
          crop={toCropRect(eraseImage)}
          page={toSourcePage(eraseImage)}
          onCommit={handleEraseCommit}
          onClose={() => setEraseId(null)}
        />
      )}
    </main>
  );
}