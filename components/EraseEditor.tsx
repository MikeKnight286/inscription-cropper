"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CropRect, EraseCircle, SourcePage } from "@/types";
import { cropToBitmap } from "@/lib/cropping";

interface Props {
  crop: CropRect;
  page: SourcePage;
  onCommit: (id: string, mask: EraseCircle[]) => void;
  onClose: () => void;
}

const MIN_BRUSH = 4;
const MAX_BRUSH = 120;
const DEFAULT_BRUSH = 20;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 16;

interface Viewport {
  zoom: number;   // CSS scale multiplier applied to the canvas wrap
  panX: number;   // px, offset of canvas wrap centre from container centre
  panY: number;
}

export default function EraseEditor({ crop, page, onCommit, onClose }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bitmapRef    = useRef<ImageBitmap | null>(null);

  // mask stored in crop-local pixels (1:1 with full-res export)
  const [mask, setMask]       = useState<EraseCircle[]>(() => crop.eraseMask ?? []);
  const [history, setHistory] = useState<EraseCircle[][]>([crop.eraseMask ?? []]);
  const [histIdx, setHistIdx] = useState(0);

  const [brushR, setBrushR]         = useState(DEFAULT_BRUSH);
  const [isPainting, setIsPainting] = useState(false);
  const [cursorPos, setCursorPos]   = useState<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded]         = useState(false);
  const [viewport, setViewport]     = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });

  // Display scale: canvas CSS px -> crop-local pixels (set once on layout)
  const scaleRef      = useRef({ x: 1, y: 1 });
  // Live viewport ref (avoids stale closures in wheel/pointer handlers)
  const viewportRef   = useRef<Viewport>({ zoom: 1, panX: 0, panY: 0 });
  const currentStrokeRef = useRef<EraseCircle[]>([]);
  // Middle-mouse pan tracking
  const midPanRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  // Keep viewportRef in sync
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // Load bitmap once
  useEffect(() => {
    let cancelled = false;
    cropToBitmap(page, { x: crop.x, y: crop.y, w: crop.w, h: crop.h, angle: crop.angle })
      .then(bm => {
        if (cancelled) { bm.close(); return; }
        bitmapRef.current = bm;
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [crop, page]);

  // Size canvases to fit container at zoom=1 baseline
  useLayoutEffect(() => {
    if (!loaded || !canvasRef.current || !overlayRef.current || !containerRef.current) return;
    const bm   = bitmapRef.current!;
    const maxW = containerRef.current.clientWidth  - 48;
    const maxH = containerRef.current.clientHeight - 48;
    const fit  = Math.min(1, maxW / bm.width, maxH / bm.height);
    const dispW = Math.round(bm.width  * fit);
    const dispH = Math.round(bm.height * fit);

    for (const c of [canvasRef.current, overlayRef.current]) {
      c.width  = dispW;
      c.height = dispH;
      c.style.width  = `${dispW}px`;
      c.style.height = `${dispH}px`;
    }
    scaleRef.current = { x: bm.width / dispW, y: bm.height / dispH };

    const ctx = canvasRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.drawImage(bm, 0, 0, dispW, dispH);

    redrawOverlay(mask);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const redrawOverlay = useCallback((currentMask: EraseCircle[]) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = canvas.width  / crop.w;
    const sy = canvas.height / crop.h;
    ctx.fillStyle = "#000000";
    for (const circle of currentMask) {
      ctx.beginPath();
      ctx.arc(circle.x * sx, circle.y * sy, circle.r * Math.max(sx, sy), 0, Math.PI * 2);
      ctx.fill();
    }
  }, [crop.w, crop.h]);

  useEffect(() => { redrawOverlay(mask); }, [mask, redrawOverlay]);

  // Convert client-space pointer to crop-local pixels, accounting for zoom+pan
  function clientToCropLocal(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = overlayRef.current!;
    const vp     = viewportRef.current;
    const rect   = canvas.getBoundingClientRect();
    const px = (clientX - rect.left)  / vp.zoom;
    const py = (clientY - rect.top)   / vp.zoom;
    return { x: px * scaleRef.current.x, y: py * scaleRef.current.y };
  }

  // Scroll-to-zoom (zoom towards cursor)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const vp      = viewportRef.current;
      const delta   = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * delta));
      if (newZoom === vp.zoom) return;

      const cr  = container!.getBoundingClientRect();
      const mx  = e.clientX - (cr.left + cr.width  / 2);
      const my  = e.clientY - (cr.top  + cr.height / 2);
      const cx  = (mx - vp.panX) / vp.zoom;
      const cy  = (my - vp.panY) / vp.zoom;
      const newPanX = mx - cx * newZoom;
      const newPanY = my - cy * newZoom;

      const next = { zoom: newZoom, panX: newPanX, panY: newPanY };
      viewportRef.current = next;
      setViewport(next);
    }

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [loaded]);

  // Middle-mouse pan
  function handleContainerPointerDown(e: React.PointerEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    containerRef.current?.setPointerCapture(e.pointerId);
    midPanRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPanX: viewportRef.current.panX,
      startPanY: viewportRef.current.panY,
    };
  }

  function handleContainerPointerMove(e: React.PointerEvent) {
    setCursorPos({ x: e.clientX, y: e.clientY });
    if (!midPanRef.current) return;
    const dx = e.clientX - midPanRef.current.startX;
    const dy = e.clientY - midPanRef.current.startY;
    const next = {
      ...viewportRef.current,
      panX: midPanRef.current.startPanX + dx,
      panY: midPanRef.current.startPanY + dy,
    };
    viewportRef.current = next;
    setViewport(next);
  }

  function handleContainerPointerUp(e: React.PointerEvent) {
    if (e.button === 1) midPanRef.current = null;
  }

  // Erase painting
  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    overlayRef.current?.setPointerCapture(e.pointerId);
    setIsPainting(true);
    currentStrokeRef.current = [];
    const pt     = clientToCropLocal(e.clientX, e.clientY);
    const circle: EraseCircle = { x: pt.x, y: pt.y, r: brushR };
    currentStrokeRef.current.push(circle);
    setMask(prev => [...prev, circle]);
  }

  function handlePointerMove(e: React.PointerEvent) {
    setCursorPos({ x: e.clientX, y: e.clientY });
    if (!isPainting) return;
    const pt     = clientToCropLocal(e.clientX, e.clientY);
    const circle: EraseCircle = { x: pt.x, y: pt.y, r: brushR };
    currentStrokeRef.current.push(circle);
    setMask(prev => [...prev, circle]);
  }

  function handlePointerUp() {
    if (!isPainting) return;
    setIsPainting(false);
    setMask(prev => {
      const next = [...prev];
      setHistory(h => [...h.slice(0, histIdx + 1), next]);
      setHistIdx(i => i + 1);
      return next;
    });
    currentStrokeRef.current = [];
  }

  function undo() {
    if (histIdx <= 0) return;
    const prevIdx = histIdx - 1;
    setHistIdx(prevIdx);
    setHistory(h => { setMask(h[prevIdx]); return h; });
  }

  function redo() {
    setHistory(h => {
      if (histIdx >= h.length - 1) return h;
      const nextIdx = histIdx + 1;
      setHistIdx(nextIdx);
      setMask(h[nextIdx]);
      return h;
    });
  }

  function clearAll() {
    const next: EraseCircle[] = [];
    setMask(next);
    setHistory(h => [...h.slice(0, histIdx + 1), next]);
    setHistIdx(i => i + 1);
  }

  function resetView() {
    const next = { zoom: 1, panX: 0, panY: 0 };
    viewportRef.current = next;
    setViewport(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onCommit(crop.id, mask);
      if (e.key === "0") resetView();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, histIdx, history]);

  const canUndo = histIdx > 0;
  const canRedo = histIdx < history.length - 1;
  // Brush ring diameter in screen px
  const brushScreenR = brushR / scaleRef.current.x * viewport.zoom;

  return (
    <div className="erase-overlay">
      <div className="erase-modal">

        <div className="erase-header">
          <span className="erase-title">
            <span className="erase-icon">◌</span>
            erase — <em>{crop.label}</em>
          </span>
          <div className="erase-toolbar">
            <label className="brush-label">
              brush
              <input
                type="range"
                min={MIN_BRUSH}
                max={MAX_BRUSH}
                value={brushR}
                onChange={e => setBrushR(Number(e.target.value))}
                className="brush-range"
              />
              <span className="brush-val">{brushR}px</span>
            </label>
            <span className="zoom-display" title="scroll to zoom · middle-drag to pan · 0 to reset">
              {Math.round(viewport.zoom * 100)}%
            </span>
            <button className="erase-btn" onClick={resetView} title="Reset zoom and pan (0)">fit</button>
            <button className="erase-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩ undo</button>
            <button className="erase-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪ redo</button>
            <button className="erase-btn danger" onClick={clearAll} title="Clear all erasing">clear</button>
            <button className="erase-btn ghost" onClick={onClose} title="Discard (Escape)">cancel</button>
            <button className="erase-btn primary" onClick={() => onCommit(crop.id, mask)} title="Apply (Enter)">apply</button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="erase-canvas-area"
          style={{ cursor: "none", overflow: "hidden" }}
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
        >
          {!loaded && <div className="erase-loading">rendering crop…</div>}
          <div
            className="erase-canvas-wrap"
            style={{
              transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            <canvas ref={canvasRef} className="erase-base-canvas" />
            <canvas
              ref={overlayRef}
              className="erase-overlay-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => { setCursorPos(null); if (isPainting) handlePointerUp(); }}
            />
          </div>
        </div>

        <div className="erase-status">
          <span>{mask.length} strokes</span>
          <span className="erase-hint">
            scroll to zoom · middle-drag to pan · 0 fit · Ctrl+Z undo · Enter apply · Esc cancel
          </span>
        </div>
      </div>

      {cursorPos && (
        <div
          className="erase-cursor"
          style={{
            left:   cursorPos.x,
            top:    cursorPos.y,
            width:  brushScreenR * 2,
            height: brushScreenR * 2,
          }}
        />
      )}
    </div>
  );
}