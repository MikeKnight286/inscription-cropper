"use client";

import { useState } from "react";
import type { CropRect } from "@/types";

interface Props {
  crops: CropRect[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onEdit: (id: string) => void;
}

function angleDisplay(rad: number): string {
  let deg = rad * 180 / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  if (Math.abs(deg) < 0.05) return "0°";
  return `${deg.toFixed(1)}°`;
}

export default function CropList({
  crops, selectedId, onSelect, onRename, onDelete, onMove, onEdit,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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
        return (
          <li
            key={c.id}
            className={`crop-item${isSel ? " selected" : ""}`}
            onClick={() => onSelect(c.id)}
          >
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
          </li>
        );
      })}
    </ol>
  );
}