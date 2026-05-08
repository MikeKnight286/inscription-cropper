"use client";

import { useRef, useState } from "react";
import type { AnnotationImage } from "@/lib/annotate";

interface Props {
  images: AnnotationImage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
}

export default function ImageList({
  images, selectedId, onSelect, onDelete, onReorder,
}: Props) {
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function handleDragStart(i: number) {
    dragIdx.current = i;
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setDragOverIdx(i);
  }

  function handleDrop(i: number) {
    if (dragIdx.current !== null && dragIdx.current !== i) {
      onReorder(dragIdx.current, i);
    }
    dragIdx.current = null;
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    dragIdx.current = null;
    setDragOverIdx(null);
  }

  if (images.length === 0) {
    return (
      <div className="an-list-empty">
        upload images to begin
      </div>
    );
  }

  return (
    <ol className="an-list">
      {images.map((img, i) => {
        const isSel = img.id === selectedId;
        const isDragOver = dragOverIdx === i;
        const hasAnnotation = img.annotation.trim().length > 0;
        const hasChildren = images.some(m => m.parentId === img.id);

        return (
          <li
            key={img.id}
            className={[
              "an-list-item",
              isSel ? "selected" : "",
              img.isSegment ? "is-segment" : "",
              isDragOver ? "drag-over" : "",
            ].join(" ")}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(img.id)}
          >
            <span className="an-list-drag" title="drag to reorder">⠿</span>
            <div className="an-list-thumb-wrap">
              <img
                src={img.objectUrl}
                alt={img.label}
                className="an-list-thumb"
              />
            </div>
            <div className="an-list-meta">
              <span className="an-list-label" title={img.label}>
                {img.label}
                {img.isSegment && <span className="an-seg-badge">seg</span>}
                {hasChildren && <span className="an-children-badge">split</span>}
              </span>
              <span className="an-list-status">
                {hasAnnotation
                  ? <span className="an-status-done">✓ annotated</span>
                  : <span className="an-status-empty">— empty</span>}
              </span>
            </div>
            <button
              className="an-list-delete"
              title="delete"
              onClick={e => { e.stopPropagation(); onDelete(img.id); }}
            >×</button>
          </li>
        );
      })}
    </ol>
  );
}
