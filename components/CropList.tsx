"use client";

import { useState } from "react";
import type { CropRect } from "@/types";
import {
  appendCodepoint,
  removeLastCodepoint,
  hexToUnicode,
  hexToCodepoints,
} from "@/lib/annotate";
import BurmeseKeyboard from "./annotate/BurmeseKeyboard";

interface Props {
  crops: CropRect[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onEdit: (id: string) => void;
  onAnnotate: (id: string, hex: string) => void;
}

function angleDisplay(rad: number): string {
  let deg = rad * 180 / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  if (Math.abs(deg) < 0.05) return "0°";
  return `${deg.toFixed(1)}°`;
}

export default function CropList({
  crops, selectedId, onSelect, onRename, onDelete, onMove, onEdit, onAnnotate,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [kbOpenId, setKbOpenId] = useState<string | null>(null);

  function startEdit(c: CropRect) {
    setEditingId(c.id);
    setEditValue(c.label);
  }

  function commitEdit() {
    if (editingId) onRename(editingId, editValue.trim() || "untitled");
    setEditingId(null);
  }

  if (crops.length === 0) {
    return (
      <div className="crop-list-empty">
        no crops yet — drag a rectangle on the image
      </div>
    );
  }

  return (
    <ol className="crop-list">
      {crops.map((c, i) => {
        const isSel = c.id === selectedId;
        const hasMask = c.eraseMask && c.eraseMask.length > 0;
        const kbOpen = kbOpenId === c.id && isSel;
        const annotation = c.annotation ?? "";
        const cps = hexToCodepoints(annotation);
        const rendered = hexToUnicode(annotation);

        return (
          <li
            key={c.id}
            className={`crop-item${isSel ? " selected" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="crop-item-row">
              <span className="crop-index">{String(i + 1).padStart(3, "0")}</span>
              <div className="crop-thumb-wrap">
                <img src={c.thumbUrl} alt={c.label} className="crop-thumb" />
                {hasMask && <span className="crop-erased-badge" title="has erased regions">◌</span>}
              </div>
              <div className="crop-meta">
                {editingId === c.id ? (
                  <input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="crop-name-input"
                  />
                ) : (
                  <button
                    className="crop-name"
                    onClick={e => { e.stopPropagation(); startEdit(c); }}
                    title="click to rename"
                  >
                    {c.label}
                  </button>
                )}
                <span className="crop-dims">
                  {Math.round(c.w)} × {Math.round(c.h)}
                  <span className="crop-angle">{angleDisplay(c.angle)}</span>
                  {rendered && !isSel && (
                    <span className="crop-annot-badge">{rendered}</span>
                  )}
                </span>
              </div>
              <div className="crop-actions" onClick={e => e.stopPropagation()}>
                <button
                  className="crop-edit-btn"
                  onClick={() => onEdit(c.id)}
                  title="erase strokes from this crop"
                >
                  edit
                </button>
                <button onClick={() => onMove(c.id, -1)} disabled={i === 0} title="move up">↑</button>
                <button onClick={() => onMove(c.id,  1)} disabled={i === crops.length - 1} title="move down">↓</button>
                <button onClick={() => onDelete(c.id)} title="delete" className="crop-delete">×</button>
              </div>
            </div>

            {isSel && (
              <div className="crop-annot-section" onClick={e => e.stopPropagation()}>
                <div className="crop-annot-preview">
                  <span className={rendered ? "crop-annot-rendered" : "crop-annot-empty"}>
                    {rendered || "—"}
                  </span>
                  <div className="crop-annot-controls">
                    <button
                      className={`crop-annot-kbd-toggle${kbOpen ? " active" : ""}`}
                      onClick={() => setKbOpenId(kbOpen ? null : c.id)}
                      title="Toggle Burmese keyboard"
                    >
                      ကခ
                    </button>
                    {cps.length > 0 && (
                      <button
                        className="crop-annot-clear"
                        onClick={() => onAnnotate(c.id, "")}
                        title="Clear annotation"
                      >
                        clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="crop-annot-hex-display">
                  {cps.length === 0
                    ? <span className="an-annot-hex-empty">use keyboard to annotate</span>
                    : cps.map((cp, idx) => (
                        <span key={idx} className="an-annot-hex-token">
                          {cp.toString(16).toUpperCase().padStart(4, "0")}
                        </span>
                      ))
                  }
                </div>
                {kbOpen && (
                  <BurmeseKeyboard
                    onCodepoint={cp => onAnnotate(c.id, appendCodepoint(annotation, cp))}
                    onBackspace={() => onAnnotate(c.id, removeLastCodepoint(annotation))}
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
