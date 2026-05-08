"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SourcePage, CropRect, ViewTransform, HandleName } from "@/types";
import {
  displayedDimensions,
  displayedToOriginal,
  originalToDisplayed,
  cropCornersInDisplayed,
  cropCenterInDisplayed,
  cropDisplayedAngle,
  pointInsideCrop,
  handlePosInDisplayed,
  applyResize,
} from "@/lib/transforms";

interface Props {
  page: SourcePage;
  crops: CropRect[];
  onCommitCrop: (rect: { x: number; y: number; w: number; h: number; angle: number }) => void;
  onUpdateCropAngle: (id: string, angle: number) => void;
  onUpdateCropGeometry: (id: string, geom: { x: number; y: number; w: number; h: number }) => void;
  onSelectCrop: (id: string | null) => void;
  selectedCropId: string | null;
}

type DragMode = "none" | "panning" | "cropping" | "rotatingCrop" | "resizingCrop" | "rotatingPage";

const ROT_HANDLE_RADIUS = 8;       // canvas pixels
const ROT_HANDLE_OFFSET = 26;      // canvas pixels above top edge
const RESIZE_HANDLE_SIZE = 8;      // canvas pixels (square side)
const RESIZE_HIT_PAD     = 4;      // extra hit padding

const HANDLE_NAMES: HandleName[] = ["N", "S", "E", "W", "NW", "NE", "SW", "SE"];

export default function CropperCanvas({
  page, crops, onCommitCrop, onUpdateCropAngle, onUpdateCropGeometry,
  onSelectCrop, selectedCropId,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<ViewTransform>({ panX: 0, panY: 0, zoom: 1 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const dragMode = useRef<DragMode>("none");
  const dragStart = useRef({ x: 0, y: 0 });
  const initialPan = useRef({ x: 0, y: 0 });
  const liveCropDisplay = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Crop rotation state
  const rotatingCropId = useRef<string | null>(null);
  const rotationStartAngle = useRef(0);
  const rotationStartPointer = useRef(0);

  // Crop resize state
  const resizingCropId = useRef<string | null>(null);
  const resizingHandle = useRef<HandleName | null>(null);

  // Page-rotation drag state
  const pageRotationStart = useRef(0);
  const pageRotationPointerStart = useRef(0);
  const pageRotateRef = useRef<((rad: number) => void) | null>(null);

  const [redrawTick, setRedrawTick] = useState(0);
  const triggerRedraw = useCallback(() => setRedrawTick(t => t + 1), []);

  const dispDims = displayedDimensions(page);

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setContainerSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) });
    return () => ro.disconnect();
  }, []);

  // ── Auto-fit ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (containerSize.w === 0 || containerSize.h === 0) return;
    const fit = Math.min(
      containerSize.w / dispDims.w,
      containerSize.h / dispDims.h
    );
    setView({
      zoom: fit,
      panX: (containerSize.w - dispDims.w * fit) / 2,
      panY: (containerSize.h - dispDims.h * fit) / 2,
    });
    // We intentionally do NOT include dispDims here in dependencies;
    // dispDims changes on every page rotation tick which would cause
    // jumpy resets. Fit only on page change or container resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, containerSize.w, containerSize.h]);

  // ── Coordinate transforms ─────────────────────────────────────────────────
  const canvasToDisplayed = useCallback((cx: number, cy: number) => ({
    x: (cx - view.panX) / view.zoom,
    y: (cy - view.panY) / view.zoom,
  }), [view]);

  const displayedToCanvas = useCallback((dx: number, dy: number) => ({
    x: dx * view.zoom + view.panX,
    y: dy * view.zoom + view.panY,
  }), [view]);

  const canvasToOriginal = useCallback((cx: number, cy: number) => {
    const d = canvasToDisplayed(cx, cy);
    return displayedToOriginal(page, d.x, d.y);
  }, [canvasToDisplayed, page]);

  // Position of the rotation handle (canvas pixels) for a crop
  function getRotationHandleCanvasPos(crop: CropRect) {
    const center = cropCenterInDisplayed(page, crop);
    const dispAngle = cropDisplayedAngle(page, crop.angle);
    const halfH = crop.h / 2;
    const dx = center.x + Math.sin(dispAngle) * halfH;
    const dy = center.y - Math.cos(dispAngle) * halfH;
    const cTop = displayedToCanvas(dx, dy);
    return {
      x: cTop.x + Math.sin(dispAngle) * ROT_HANDLE_OFFSET,
      y: cTop.y - Math.cos(dispAngle) * ROT_HANDLE_OFFSET,
    };
  }

  // Position of a resize handle (canvas pixels)
  function getResizeHandleCanvasPos(crop: CropRect, h: HandleName) {
    const d = handlePosInDisplayed(page, crop, h);
    return displayedToCanvas(d.x, d.y);
  }

  // Hit-test: which handle (if any) is under canvas point (cx, cy)?
  function hitTestHandle(crop: CropRect, cx: number, cy: number): HandleName | null {
    const half = RESIZE_HANDLE_SIZE / 2 + RESIZE_HIT_PAD;
    for (const h of HANDLE_NAMES) {
      const p = getResizeHandleCanvasPos(crop, h);
      if (Math.abs(cx - p.x) <= half && Math.abs(cy - p.y) <= half) return h;
    }
    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = containerSize.w;
    canvas.height = containerSize.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#0a0908";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw page bitmap with continuous page rotation
    const dispW = dispDims.w * view.zoom;
    const dispH = dispDims.h * view.zoom;
    ctx.save();
    ctx.translate(view.panX + dispW / 2, view.panY + dispH / 2);
    ctx.rotate(page.pageRotationRad);
    ctx.scale(view.zoom, view.zoom);
    ctx.imageSmoothingEnabled = view.zoom < 1.0;
    ctx.drawImage(page.bitmap, -page.width / 2, -page.height / 2);
    ctx.restore();

    // Crops
    const pageCrops = crops.filter(c => c.pageId === page.id);
    for (const c of pageCrops) {
      const corners = cropCornersInDisplayed(page, c).map(p => displayedToCanvas(p.x, p.y));
      const isSelected = c.id === selectedCropId;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.strokeStyle = isSelected ? "#f4a261" : "#e9c46a";
      ctx.fillStyle = isSelected ? "rgba(244,162,97,0.18)" : "rgba(233,196,106,0.10)";
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Label tab
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(c.label).width + 8;
      ctx.fillStyle = isSelected ? "#f4a261" : "#e9c46a";
      ctx.fillRect(corners[0].x, corners[0].y - 16, tw, 16);
      ctx.fillStyle = "#0a0908";
      ctx.fillText(c.label, corners[0].x + 4, corners[0].y - 4);

      // Handles for selected crop
      if (isSelected) {
        // Rotation handle
        const rh = getRotationHandleCanvasPos(c);
        const topMid = {
          x: (corners[0].x + corners[1].x) / 2,
          y: (corners[0].y + corners[1].y) / 2,
        };
        ctx.strokeStyle = "#f4a261";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(topMid.x, topMid.y);
        ctx.lineTo(rh.x, rh.y);
        ctx.stroke();
        ctx.fillStyle = "#0a0908";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, ROT_HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Resize handles
        ctx.lineWidth = 1.5;
        for (const h of HANDLE_NAMES) {
          const p = getResizeHandleCanvasPos(c, h);
          const s = RESIZE_HANDLE_SIZE;
          ctx.fillStyle = "#0a0908";
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          ctx.strokeStyle = "#f4a261";
          ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
        }
      }
    }

    // Live crop in progress
    const live = liveCropDisplay.current;
    if (live) {
      const tl = displayedToCanvas(live.x, live.y);
      const w = live.w * view.zoom;
      const h = live.h * view.zoom;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#e76f51";
      ctx.fillStyle = "rgba(231,111,81,0.15)";
      ctx.fillRect(tl.x, tl.y, w, h);
      ctx.strokeRect(tl.x, tl.y, w, h);
      ctx.setLineDash([]);
    }
  }, [page, view, containerSize, crops, selectedCropId, redrawTick, displayedToCanvas, dispDims.w, dispDims.h]);

  // Cursor for a hovered handle — informational, also used while dragging
  function cursorForHandle(h: HandleName, displayedAngle: number): string {
    // Approximate: pick directional cursor based on handle's *displayed* angle relative to crop centre
    // For simplicity use 4 cursors mapped by quadrant
    const handleAngles: Record<HandleName, number> = {
      E: 0,   SE: Math.PI / 4,  S: Math.PI / 2,  SW: 3 * Math.PI / 4,
      W: Math.PI, NW: -3 * Math.PI / 4, N: -Math.PI / 2, NE: -Math.PI / 4,
    };
    const a = handleAngles[h] + displayedAngle;
    const norm = ((a + Math.PI * 2) % Math.PI);
    if (norm < Math.PI / 8 || norm > Math.PI * 7 / 8) return "ew-resize";
    if (norm < Math.PI * 3 / 8) return "nwse-resize";
    if (norm < Math.PI * 5 / 8) return "ns-resize";
    return "nesw-resize";
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    dragStart.current = { x: cx, y: cy };

    // Ctrl+drag = page rotation
    if (e.ctrlKey || e.metaKey) {
      dragMode.current = "rotatingPage";
      pageRotationStart.current = page.pageRotationRad;
      const dispCenter = {
        x: view.panX + dispDims.w * view.zoom / 2,
        y: view.panY + dispDims.h * view.zoom / 2,
      };
      pageRotationPointerStart.current = Math.atan2(cy - dispCenter.y, cx - dispCenter.x);
      e.preventDefault();
      return;
    }

    // Shift/Alt + drag = pan
    if (e.button === 1 || e.shiftKey || e.altKey) {
      dragMode.current = "panning";
      initialPan.current = { x: view.panX, y: view.panY };
      return;
    }

    if (e.button === 0) {
      const sel = crops.find(c => c.id === selectedCropId && c.pageId === page.id);

      // Selected crop's rotation handle?
      if (sel) {
        const rh = getRotationHandleCanvasPos(sel);
        const dx = cx - rh.x;
        const dy = cy - rh.y;
        if (dx * dx + dy * dy <= ROT_HANDLE_RADIUS * ROT_HANDLE_RADIUS * 4) {
          dragMode.current = "rotatingCrop";
          rotatingCropId.current = sel.id;
          rotationStartAngle.current = sel.angle;
          const center = cropCenterInDisplayed(page, sel);
          const cCanvas = displayedToCanvas(center.x, center.y);
          rotationStartPointer.current = Math.atan2(cy - cCanvas.y, cx - cCanvas.x);
          return;
        }

        // Resize handle?
        const handle = hitTestHandle(sel, cx, cy);
        if (handle) {
          dragMode.current = "resizingCrop";
          resizingCropId.current = sel.id;
          resizingHandle.current = handle;
          return;
        }
      }

      // Click on existing crop?
      const disp = canvasToDisplayed(cx, cy);
      const hit = crops
        .filter(c => c.pageId === page.id)
        .find(c => pointInsideCrop(page, c, disp.x, disp.y));
      if (hit) {
        onSelectCrop(hit.id);
        dragMode.current = "none";
        return;
      }

      onSelectCrop(null);
      dragMode.current = "cropping";
      liveCropDisplay.current = { x: disp.x, y: disp.y, w: 0, h: 0 };
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (dragMode.current === "panning") {
      const ddx = cx - dragStart.current.x;
      const ddy = cy - dragStart.current.y;
      setView(v => ({ ...v, panX: initialPan.current.x + ddx, panY: initialPan.current.y + ddy }));
      return;
    }

    if (dragMode.current === "cropping") {
      const startD = canvasToDisplayed(dragStart.current.x, dragStart.current.y);
      const nowD = canvasToDisplayed(cx, cy);
      const x0 = Math.min(startD.x, nowD.x);
      const y0 = Math.min(startD.y, nowD.y);
      const w  = Math.abs(nowD.x - startD.x);
      const h  = Math.abs(nowD.y - startD.y);
      liveCropDisplay.current = { x: x0, y: y0, w, h };
      triggerRedraw();
      return;
    }

    if (dragMode.current === "rotatingCrop") {
      const id = rotatingCropId.current;
      if (!id) return;
      const crop = crops.find(c => c.id === id);
      if (!crop) return;
      const center = cropCenterInDisplayed(page, crop);
      const cCanvas = displayedToCanvas(center.x, center.y);
      const pointerAngle = Math.atan2(cy - cCanvas.y, cx - cCanvas.x);
      const delta = pointerAngle - rotationStartPointer.current;
      let newAngle = rotationStartAngle.current + delta;
      // Snap to cardinal angles within 1.5°
      const snapDeg = 1.5;
      const snaps = [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI];
      for (const s of snaps) {
        if (Math.abs(((newAngle - s + Math.PI * 3) % (Math.PI * 2)) - Math.PI) >
            Math.PI - (snapDeg * Math.PI / 180)) {
          newAngle = s;
          break;
        }
      }
      onUpdateCropAngle(id, newAngle);
      return;
    }

    if (dragMode.current === "resizingCrop") {
      const id = resizingCropId.current;
      const handle = resizingHandle.current;
      if (!id || !handle) return;
      const crop = crops.find(c => c.id === id);
      if (!crop) return;
      const orig = canvasToOriginal(cx, cy);
      const updated = applyResize(crop, handle, orig);
      onUpdateCropGeometry(id, updated);
      return;
    }

    if (dragMode.current === "rotatingPage") {
      const dispCenter = {
        x: view.panX + dispDims.w * view.zoom / 2,
        y: view.panY + dispDims.h * view.zoom / 2,
      };
      const pointerAngle = Math.atan2(cy - dispCenter.y, cx - dispCenter.x);
      let newRad = pageRotationStart.current + (pointerAngle - pageRotationPointerStart.current);
      // Snap to multiples of 90° within 2°
      const snapDeg = 2;
      const snaps = [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI];
      for (const s of snaps) {
        const diff = ((newRad - s + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (Math.abs(Math.abs(diff) - Math.PI) > Math.PI - (snapDeg * Math.PI / 180)) {
          newRad = s;
          break;
        }
      }
      pageRotateRef.current?.(newRad);
      return;
    }
  }

  function onMouseUp() {
    if (dragMode.current === "cropping") {
      const live = liveCropDisplay.current;
      if (live && live.w >= 5 && live.h >= 5) {
        const cxD = live.x + live.w / 2;
        const cyD = live.y + live.h / 2;
        const centerOrig = displayedToOriginal(page, cxD, cyD);
        const initAngle = -page.pageRotationRad;
        const w = live.w;
        const h = live.h;
        const x = centerOrig.x - w / 2;
        const y = centerOrig.y - h / 2;
        if (w >= 2 && h >= 2) onCommitCrop({ x, y, w, h, angle: initAngle });
      }
      liveCropDisplay.current = null;
      triggerRedraw();
    }
    rotatingCropId.current = null;
    resizingCropId.current = null;
    resizingHandle.current = null;
    dragMode.current = "none";
  }

  function onMouseLeave() {
    if (dragMode.current === "cropping") {
      liveCropDisplay.current = null;
      triggerRedraw();
    }
    rotatingCropId.current = null;
    resizingCropId.current = null;
    resizingHandle.current = null;
    dragMode.current = "none";
  }

  function onWheel(e: React.WheelEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.85 : 1.15;
    setView(v => {
      const newZoom = Math.max(0.05, Math.min(20, v.zoom * factor));
      const dx = (cx - v.panX) / v.zoom;
      const dy = (cy - v.panY) / v.zoom;
      return {
        zoom: newZoom,
        panX: cx - dx * newZoom,
        panY: cy - dy * newZoom,
      };
    });
  }

  function fitToScreen() {
    if (containerSize.w === 0 || containerSize.h === 0) return;
    const fit = Math.min(
      containerSize.w / dispDims.w,
      containerSize.h / dispDims.h
    );
    setView({
      zoom: fit,
      panX: (containerSize.w - dispDims.w * fit) / 2,
      panY: (containerSize.h - dispDims.h * fit) / 2,
    });
  }

  // ── Keyboard: angle nudge, position nudge (WASD/arrows), reset, page rotation ─
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const sel = crops.find(c => c.id === selectedCropId && c.pageId === page.id);

      // Crop angle: [ ] (0.5°), Shift+[ ] (0.1°), R (reset to undo page rotation)
      if (sel) {
        if (e.key === "[" || e.key === "]") {
          const fine = e.shiftKey ? 0.1 : 0.5;
          const rad = fine * Math.PI / 180 * (e.key === "[" ? -1 : 1);
          onUpdateCropAngle(sel.id, sel.angle + rad);
          e.preventDefault();
          return;
        }
        if (e.key === "r" || e.key === "R") {
          // "Reset" means: crop axis-aligned to current displayed view,
          // i.e. undo the page rotation
          onUpdateCropAngle(sel.id, -page.pageRotationRad);
          e.preventDefault();
          return;
        }

        // WASD / Arrow nudge
        const NUDGE = e.shiftKey ? 10 : 1;        // pixels in ORIGINAL space
        let dxLocal = 0, dyLocal = 0;             // displacement in crop's LOCAL frame
        let dxDisplayed = 0, dyDisplayed = 0;     // displacement in DISPLAYED frame
        const k = e.key.toLowerCase();
        // WASD: local frame (perpendicular/parallel to crop's long edge)
        if (k === "w") { dyLocal = -NUDGE; }
        else if (k === "s") { dyLocal =  NUDGE; }
        else if (k === "a") { dxLocal = -NUDGE; }
        else if (k === "d") { dxLocal =  NUDGE; }
        // Arrow keys: displayed frame
        else if (e.key === "ArrowUp")    { dyDisplayed = -NUDGE; }
        else if (e.key === "ArrowDown")  { dyDisplayed =  NUDGE; }
        else if (e.key === "ArrowLeft")  { dxDisplayed = -NUDGE; }
        else if (e.key === "ArrowRight") { dxDisplayed =  NUDGE; }

        if (dxLocal || dyLocal || dxDisplayed || dyDisplayed) {
          let dxOrig = 0, dyOrig = 0;
          if (dxLocal || dyLocal) {
            // Local → original: rotate by crop.angle
            const cos = Math.cos(sel.angle), sin = Math.sin(sel.angle);
            dxOrig = dxLocal * cos - dyLocal * sin;
            dyOrig = dxLocal * sin + dyLocal * cos;
          } else {
            // Displayed → original: rotate by -pageRotationRad
            const cos = Math.cos(-page.pageRotationRad), sin = Math.sin(-page.pageRotationRad);
            dxOrig = dxDisplayed * cos - dyDisplayed * sin;
            dyOrig = dxDisplayed * sin + dyDisplayed * cos;
          }
          onUpdateCropGeometry(sel.id, {
            x: sel.x + dxOrig, y: sel.y + dyOrig, w: sel.w, h: sel.h,
          });
          e.preventDefault();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crops, selectedCropId, page, onUpdateCropAngle, onUpdateCropGeometry]);

  // Expose the page-rotation setter for the drag interaction
  useEffect(() => {
    pageRotateRef.current = (rad: number) => {
      // Dispatch via a custom event for the parent to handle
      const ev = new CustomEvent("inscription:setPageRotation", { detail: { rad } });
      window.dispatchEvent(ev);
    };
  }, []);

  const cursor = dragMode.current === "panning" ? "grabbing"
              : dragMode.current === "rotatingCrop" || dragMode.current === "rotatingPage" ? "grabbing"
              : dragMode.current === "resizingCrop" ? "grabbing"
              : "crosshair";

  return (
    <div ref={containerRef} className="cropper-canvas-container">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onWheel={onWheel}
        onContextMenu={e => e.preventDefault()}
        style={{ cursor, display: "block" }}
      />
      <div className="canvas-hud">
        <span>{Math.round(view.zoom * 100)}%</span>
        <span className="hud-sep">·</span>
        <span>{page.width} × {page.height}px</span>
        {Math.abs(page.pageRotationRad) > 0.0005 && (
          <>
            <span className="hud-sep">·</span>
            <span>rot {(page.pageRotationRad * 180 / Math.PI).toFixed(1)}°</span>
          </>
        )}
        <button onClick={fitToScreen} className="hud-btn">fit</button>
      </div>
      <div className="canvas-help">
        drag = crop · shift+drag = pan · ctrl+drag = rotate page · wheel = zoom · WASD/arrows = nudge · drag handles = rotate/resize · [ ] = angle · R = reset angle
      </div>
    </div>
  );
}