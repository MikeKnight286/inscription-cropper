"use client";

import type { AnnotationImage } from "@/lib/annotate";
import { hexToUnicode } from "@/lib/annotate";

interface Props {
  images: AnnotationImage[];
  onSelect: (id: string) => void;
}

export default function ReviewPanel({ images, onSelect }: Props) {
  const annotated = images.filter(img => img.annotation.trim().length > 0);

  if (images.length === 0) return null;

  return (
    <div className="an-review">
      <div className="an-review-header">
        <span className="an-review-title">review</span>
        <span className="an-review-progress">
          {annotated.length} / {images.length}
        </span>
      </div>
      <ol className="an-review-list">
        {images.map(img => {
          const hasAnnotation = img.annotation.trim().length > 0;
          const rendered = hasAnnotation ? hexToUnicode(img.annotation) : "";
          return (
            <li
              key={img.id}
              className={`an-review-item${hasAnnotation ? "" : " unannotated"}`}
              onClick={() => onSelect(img.id)}
              title="click to jump to this image"
            >
              <img
                src={img.objectUrl}
                alt={img.label}
                className="an-review-strip"
              />
              <div className="an-review-text">
                {hasAnnotation ? (
                  <>
                    {/* Rendered Unicode characters */}
                    <span className="an-review-rendered">{rendered}</span>
                    {/* Hex codes below */}
                    <span className="an-review-hex">{img.annotation}</span>
                  </>
                ) : (
                  <span className="an-review-placeholder">— not yet annotated</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
