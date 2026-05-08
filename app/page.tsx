"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CropperCanvas from "@/components/CropperCanvas";
import CropList from "@/components/CropList";
import EraseEditor from "@/components/EraseEditor";
import FileUploader from "@/components/FileUploader";
import PageControls from "@/components/PageControls";
import { loadAnyFile } from "@/lib/pdf";
import { cropToBlob } from "@/lib/cropping";
import { downloadCropsZip } from "@/lib/zip";
import type { CropRect, EraseCircle, SourcePage } from "@/types";

const DEG = 180 / Math.PI;

/** Rotation degree input that holds a local draft string while focused,
 *  so the user can type freely without React overwriting the field mid-entry.
 *  Commits to the parent on blur or Enter; reverts to the canonical value on Escape. */
function RotationInput({
  valueDeg,
  onChange,
}: {
  valueDeg: number;
  onChange: (deg: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayed = draft ?? valueDeg.toFixed(1);

  function commit(raw: string) {
    const v = parseFloat(raw);
    if (!isNaN(v)) onChange(v);
    setDraft(null);
  }

  return (
    <input
      type="number"
      step="0.1"
      className="rotate-deg"
      value={displayed}
      title="page rotation in degrees"
      onChange={e => setDraft(e.target.value)}
      onFocus={e => {
        setDraft(valueDeg.toFixed(1));
        e.target.select();
      }}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") { commit((e.target as HTMLInputElement).value); e.preventDefault(); }
        if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

export default function Home() {
  const [pages, setPages] = useState<SourcePage[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string>("");
  const [crops, setCrops] = useState<CropRect[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelPrefix, setLabelPrefix] = useState("line");
  const [editingId, setEditingId] = useState<string | null>(null);

  const currentPage = useMemo(
    () => pages.find(p => p.id === currentPageId) ?? null,
    [pages, currentPageId]
  );

  const editingCrop = useMemo(
    () => crops.find(c => c.id === editingId) ?? null,
    [crops, editingId]
  );

  const editingPage = useMemo(() => {
    if (!editingCrop) return null;
    return pages.find(p => p.id === editingCrop.pageId) ?? null;
  }, [editingCrop, pages]);

  const handleLoad = useCallback(async (file: File) => {
    setCrops(prev => {
      prev.forEach(c => URL.revokeObjectURL(c.thumbUrl));
      return [];
    });
    const newPages = await loadAnyFile(file);
    setPages(newPages);
    setCurrentPageId(newPages[0]?.id ?? "");
    setSelectedId(null);
    setEditingId(null);
  }, []);

  const handleCommitCrop = useCallback(async (rect: { x: number; y: number; w: number; h: number; angle: number }) => {
    if (!currentPage) return;
    const { thumbUrl } = await cropToBlob(currentPage, rect);
    setCrops(prev => {
      const sameLabelCount = prev.filter(c => c.label.startsWith(labelPrefix)).length;
      const label = `${labelPrefix}_${String(sameLabelCount + 1).padStart(3, "0")}`;
      const newCrop: CropRect = {
        id: `crop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        pageId: currentPage.id,
        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
        angle: rect.angle,
        pageRotationAtCreation: currentPage.pageRotationRad,
        label,
        thumbUrl,
        eraseMask: [],
      };
      return [...prev, newCrop];
    });
  }, [currentPage, labelPrefix]);

  const refreshThumb = useCallback(async (id: string) => {
    const crop = crops.find(c => c.id === id);
    if (!crop) return;
    const page = pages.find(p => p.id === crop.pageId);
    if (!page) return;
    const { thumbUrl } = await cropToBlob(page, crop, crop.eraseMask);
    setCrops(prev => prev.map(c => {
      if (c.id !== id) return c;
      URL.revokeObjectURL(c.thumbUrl);
      return { ...c, thumbUrl };
    }));
  }, [crops, pages]);

  const handleUpdateCropAngle = useCallback(async (id: string, angle: number) => {
    setCrops(prev => prev.map(c => c.id === id ? { ...c, angle } : c));
    setTimeout(() => refreshThumb(id), 0);
  }, [refreshThumb]);

  const handleUpdateCropGeometry = useCallback((id: string, geom: { x: number; y: number; w: number; h: number }) => {
    setCrops(prev => prev.map(c => c.id === id ? { ...c, ...geom } : c));
    setTimeout(() => refreshThumb(id), 0);
  }, [refreshThumb]);

  const handleRename = useCallback((id: string, label: string) => {
    setCrops(prev => prev.map(c => c.id === id ? { ...c, label } : c));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setCrops(prev => {
      const target = prev.find(c => c.id === id);
      if (target) URL.revokeObjectURL(target.thumbUrl);
      return prev.filter(c => c.id !== id);
    });
    setSelectedId(s => s === id ? null : s);
    setEditingId(e => e === id ? null : e);
  }, []);

  const handleMove = useCallback((id: string, dir: -1 | 1) => {
    setCrops(prev => {
      const i = prev.findIndex(c => c.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const handleDownload = useCallback(async () => {
    await downloadCropsZip(crops, pages);
  }, [crops, pages]);

  const handleClear = useCallback(() => {
    if (!confirm("Delete all crops?")) return;
    crops.forEach(c => URL.revokeObjectURL(c.thumbUrl));
    setCrops([]);
    setSelectedId(null);
    setEditingId(null);
  }, [crops]);

  const handleEraseCommit = useCallback(async (id: string, newMask: EraseCircle[]) => {
    setCrops(prev => prev.map(c => c.id === id ? { ...c, eraseMask: newMask } : c));
    setEditingId(null);
    setTimeout(() => refreshThumb(id), 0);
  }, [refreshThumb]);

  const setPageRotationRad = useCallback((rad: number) => {
    if (!currentPage) return;
    setPages(prev => prev.map(p =>
      p.id === currentPage.id ? { ...p, pageRotationRad: rad } : p
    ));
  }, [currentPage]);

  const rotatePageBy = useCallback((delta: number) => {
    if (!currentPage) return;
    setPageRotationRad(currentPage.pageRotationRad + delta);
  }, [currentPage, setPageRotationRad]);

  useEffect(() => {
    function onSet(e: Event) {
      const detail = (e as CustomEvent).detail as { rad: number } | undefined;
      if (detail) setPageRotationRad(detail.rad);
    }
    window.addEventListener("inscription:setPageRotation", onSet);
    return () => window.removeEventListener("inscription:setPageRotation", onSet);
  }, [setPageRotationRad]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (editingId) return;
      if (!currentPage) return;
      if (e.ctrlKey || e.metaKey) {
        const fine = e.shiftKey ? 0.1 : 90;
        const rad = fine * Math.PI / 180;
        if (e.key === "." || e.key === ">") { rotatePageBy(rad); e.preventDefault(); }
        else if (e.key === "," || e.key === "<") { rotatePageBy(-rad); e.preventDefault(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPage, rotatePageBy, editingId]);

  const pageRotDeg = currentPage ? currentPage.pageRotationRad * DEG : 0;

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">▭</span>
          <span className="brand-name">Inscription Cropper</span>
          <a href="/annotate" className="brand-nav-link" title="Go to annotation tool">annotate →</a>
        </div>
        <div className="header-controls">
          {pages.length > 0 && (
            <>
              <PageControls
                pages={pages}
                currentId={currentPageId}
                onChange={setCurrentPageId}
              />
              <div className="rotate-controls" title="Rotate page (Ctrl/Cmd + < or >, hold Shift for fine)">
                <button onClick={() => rotatePageBy(-Math.PI / 2)} title="Rotate page 90° CCW">↶</button>
                <RotationInput
                  valueDeg={pageRotDeg}
                  onChange={deg => setPageRotationRad(deg / DEG)}
                />
                <span className="rotate-unit">°</span>
                <button onClick={() => rotatePageBy(Math.PI / 2)} title="Rotate page 90° CW">↷</button>
                <button onClick={() => setPageRotationRad(0)} className="rotate-reset" title="Reset rotation">⟲</button>
              </div>
              <label className="prefix-input">
                prefix
                <input
                  value={labelPrefix}
                  onChange={e => setLabelPrefix(e.target.value.replace(/\s+/g, "_") || "crop")}
                />
              </label>
              <button onClick={handleDownload} disabled={crops.length === 0} className="btn primary">
                download zip ({crops.length})
              </button>
              <button onClick={handleClear} disabled={crops.length === 0} className="btn ghost">
                clear
              </button>
            </>
          )}
        </div>
      </header>

      <div className="app-body">
        {!currentPage ? (
          <div className="welcome">
            <FileUploader onLoad={handleLoad} />
            <p className="welcome-blurb">
              Upload a PDF or image. Drag rectangles on the canvas to crop;
              each crop is added to the list and can be rotated, renamed,
              reordered, or deleted before export.
            </p>
          </div>
        ) : (
          <>
            <section className="canvas-pane">
              <CropperCanvas
                page={currentPage}
                crops={crops}
                onCommitCrop={handleCommitCrop}
                onUpdateCropAngle={handleUpdateCropAngle}
                onUpdateCropGeometry={handleUpdateCropGeometry}
                onSelectCrop={setSelectedId}
                selectedCropId={selectedId}
              />
            </section>
            <aside className="side-pane">
              <div className="side-header">
                <span className="side-title">Crops</span>
                <span className="side-count">{crops.length}</span>
              </div>
              <CropList
                crops={crops}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRename={handleRename}
                onDelete={handleDelete}
                onMove={handleMove}
                onEdit={setEditingId}
              />
              <div className="side-footer">
                <FileUploader onLoad={handleLoad} />
              </div>
            </aside>
          </>
        )}
      </div>

      {editingId && editingCrop && editingPage && (
        <EraseEditor
          crop={editingCrop}
          page={editingPage}
          onCommit={handleEraseCommit}
          onClose={() => setEditingId(null)}
        />
      )}
    </main>
  );
}
