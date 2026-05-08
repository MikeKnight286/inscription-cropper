"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AnnotationImage } from "@/lib/annotate";

interface Props {
  image: AnnotationImage | null;
  onSegment: (parentId: string, cutXs: number[], displayWidth: number) => void;
  onEditErase: (id: string) => void;
}

export default function StripViewer({ image, onSegment, onEditErase }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [dispW, setDispW]   = useState(0);
  const [dispH, setDispH]   = useState(0);
  const [cuts, setCuts]     = useState<number[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState(0);
  const [mode, setMode]     = useState<"view" | "cut">("view");
  const [zoom, setZoom]     = useState(1);
  const [panX, setPanX]     = useState(0);
  const [panY, setPanY]     = useState(0);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const viewportRef = useRef({ zoom: 1, panX: 0, panY: 0 });

  // Keep viewportRef in sync
  useEffect(() => { viewportRef.current = { zoom, panX, panY }; }, [zoom, panX, panY]);

  // Reset when image changes
  useEffect(() => {
    setCuts([]);
    setMode("view");
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, [image?.id]);

  // Size canvas to container and draw image
  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas || !image) return;

    const maxW = container.clientWidth - 40;
    const bm   = image.bitmap;
    const scale = Math.min(1, maxW / bm.width);
    const w = Math.round(bm.width  * scale);
    const h = Math.round(bm.height * scale);

    canvas.width  = w;
    canvas.height = h;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    setDispW(w);
    setDispH(h);

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bm, 0, 0, w, h);
    if (image.eraseMask.length > 0) {
      const sx = w / bm.width;
      const sy = h / bm.height;
      ctx.fillStyle = "#000";
      for (const c of image.eraseMask) {
        ctx.beginPath();
        ctx.arc(c.x * sx, c.y * sy, c.r * Math.max(sx, sy), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [image, image?.eraseMask]);

  // Scroll-to-zoom towards cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const vp      = viewportRef.current;
      const delta   = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.min(8, Math.max(1, vp.zoom * delta));
      if (newZoom === vp.zoom) return;

      const cr  = el!.getBoundingClientRect();
      const mx  = e.clientX - (cr.left + cr.width  / 2);
      const my  = e.clientY - (cr.top  + cr.height / 2);
      const cx  = (mx - vp.panX) / vp.zoom;
      const cy  = (my - vp.panY) / vp.zoom;
      const newPanX = mx - cx * newZoom;
      const newPanY = my - cy * newZoom;

      viewportRef.current = { zoom: newZoom, panX: newPanX, panY: newPanY };
      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function canvasX(e: React.MouseEvent): number {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) / zoom;
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (mode !== "cut") return;
    const x = canvasX(e);
    setCuts(prev => [...prev, x].sort((a, b) => a - b));
  }

  function handleCutPointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingIdx(idx);
    setDragStart(e.clientX);
  }

  function handleWrapPointerMove(e: React.PointerEvent) {
    if (draggingIdx === null) return;
    const dx = (e.clientX - dragStart) / zoom;
    setCuts(prev => {
      const next = [...prev];
      next[draggingIdx] = Math.max(2, Math.min(dispW - 2, prev[draggingIdx] + dx));
      return next.sort((a, b) => a - b);
    });
    setDragStart(e.clientX);
  }

  function handleWrapPointerUp() {
    setDraggingIdx(null);
  }

  // Middle-mouse pan (X and Y)
  function handleContainerPointerDown(e: React.PointerEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    containerRef.current?.setPointerCapture(e.pointerId);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
  }
  function handleContainerPointerMove(e: React.PointerEvent) {
    if (!panStartRef.current) return;
    const np = {
      ...viewportRef.current,
      panX: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
      panY: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
    };
    viewportRef.current = np;
    setPanX(np.panX);
    setPanY(np.panY);
  }
  function handleContainerPointerUp(e: React.PointerEvent) {
    if (e.button === 1) panStartRef.current = null;
  }

  function removeCut(idx: number) {
    setCuts(prev => prev.filter((_, i) => i !== idx));
  }

  function handleSegment() {
    if (!image || cuts.length === 0) return;
    onSegment(image.id, cuts, dispW);
    setCuts([]);
    setMode("view");
  }

  function resetView() {
    setZoom(1); setPanX(0); setPanY(0);
    viewportRef.current = { zoom: 1, panX: 0, panY: 0 };
  }

  if (!image) {
    return <div className="an-viewer-empty">select an image from the list</div>;
  }

  return (
    <div className="an-viewer">
      <div className="an-viewer-toolbar">
        <span className="an-viewer-name">{image.label}</span>
        <div className="an-viewer-tools">
          <button
            className={`an-tool-btn${mode === "cut" ? " active" : ""}`}
            onClick={() => { setMode(m => m === "cut" ? "view" : "cut"); setCuts([]); }}
            title="Toggle cut-line mode: click image to place vertical cut lines"
          >
            {mode === "cut" ? "✕ cancel cut" : "⊢ cut lines"}
          </button>
          {mode === "cut" && cuts.length > 0 && (
            <button className="an-tool-btn primary" onClick={handleSegment}>
              segment ({cuts.length + 1} parts)
            </button>
          )}
          <button
            className="an-tool-btn"
            onClick={() => onEditErase(image.id)}
            title="Open erase editor"
          >
            ◌ erase
          </button>
          <span className="an-zoom-display">{Math.round(zoom * 100)}%</span>
          <button className="an-tool-btn" onClick={resetView} title="Reset zoom and pan">fit</button>
        </div>
      </div>

      {mode === "cut" && (
        <div className="an-cut-hint">
          click on the image to place cut lines · drag to move · click × above the line to remove
        </div>
      )}

      <div
        ref={containerRef}
        className="an-viewer-canvas-area"
        style={{ cursor: mode === "cut" ? "crosshair" : "default", overflow: "hidden" }}
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
      >
        <div
          className="an-viewer-canvas-wrap"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: "center center",
            position: "relative",
            display: "inline-block",
            lineHeight: 0,
          }}
          onPointerMove={handleWrapPointerMove}
          onPointerUp={handleWrapPointerUp}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{ display: "block" }}
          />

          {/* Cut line overlays — × sits ABOVE the image, not over it */}
          {cuts.map((x, i) => (
            <div
              key={i}
              className="an-cut-line"
              style={{ left: x }}
              onPointerDown={e => handleCutPointerDown(e, i)}
            >
              {/* Remove button floats above the top edge of the image */}
              <span
                className="an-cut-remove"
                onClick={e => { e.stopPropagation(); removeCut(i); }}
              >×</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
