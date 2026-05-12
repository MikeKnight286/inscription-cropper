"use client";

import { useState } from "react";
import { hexToUnicode } from "@/lib/annotate";
import ImageGallery from "./ImageGallery";

export interface AnnotationEntry {
  annotation: string;       // hex string — the key
  labels: string[];         // all image labels with this annotation
  objectUrls: string[];     // matched uploaded image URLs (may be shorter than labels)
}

interface Props {
  entries: AnnotationEntry[];
  target: number;
  totalImages: number;
}

export default function AnnotationCounter({ entries, target, totalImages }: Props) {
  const [expandedAnnotation, setExpandedAnnotation] = useState<string | null>(null);

  // Sort: most deficit (lowest count) first; unannotated always last
  const sorted = [...entries].sort((a, b) => {
    if (a.annotation === "") return 1;
    if (b.annotation === "") return -1;
    return a.labels.length - b.labels.length;
  });

  const belowTarget = entries.filter(e => e.annotation !== "" && e.labels.length < target).length;
  const uniqueAnnotations = entries.filter(e => e.annotation !== "").length;

  return (
    <div className="ct-counter">
      {/* Summary bar */}
      <div className="ct-summary">
        <div className="ct-summary-stat">
          <span className="ct-summary-value">{totalImages}</span>
          <span className="ct-summary-label">total images</span>
        </div>
        <div className="ct-summary-divider" />
        <div className="ct-summary-stat">
          <span className="ct-summary-value">{uniqueAnnotations}</span>
          <span className="ct-summary-label">unique annotations</span>
        </div>
        <div className="ct-summary-divider" />
        <div className="ct-summary-stat">
          <span className="ct-summary-value ct-summary-deficit">{belowTarget}</span>
          <span className="ct-summary-label">below target</span>
        </div>
      </div>

      {/* Entry list */}
      <ol className="ct-entry-list">
        {sorted.map((entry, i) => {
          const count    = entry.labels.length;
          const deficit  = Math.max(0, target - count);
          const pct      = Math.min(1, count / Math.max(1, target));
          const isOpen   = expandedAnnotation === entry.annotation;
          const rendered = entry.annotation ? hexToUnicode(entry.annotation) : null;
          const isUnannotated = entry.annotation === "";

          return (
            <li key={entry.annotation || "__unannotated__"} className="ct-entry">
              <button
                className={`ct-entry-header${isOpen ? " open" : ""}${isUnannotated ? " unannotated" : ""}`}
                onClick={() => setExpandedAnnotation(isOpen ? null : entry.annotation)}
              >
                {/* Left: rendered + hex */}
                <div className="ct-entry-id">
                  {rendered
                    ? <span className="ct-entry-rendered">{rendered}</span>
                    : <span className="ct-entry-no-annotation">— no annotation —</span>
                  }
                  {entry.annotation && (
                    <span className="ct-entry-hex">{entry.annotation}</span>
                  )}
                </div>

                {/* Centre: deficit bar */}
                <div className="ct-entry-bar-wrap">
                  <div className="ct-entry-bar">
                    <div
                      className={`ct-entry-bar-fill${pct >= 1 ? " complete" : ""}`}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  {deficit > 0 && (
                    <span className="ct-entry-deficit">−{deficit}</span>
                  )}
                </div>

                {/* Right: count */}
                <div className="ct-entry-count">
                  <span className={`ct-entry-count-num${pct >= 1 ? " complete" : deficit > 0 ? " deficit" : ""}`}>
                    {count}
                  </span>
                  <span className="ct-entry-count-sep">/</span>
                  <span className="ct-entry-count-target">{target}</span>
                </div>

                <span className="ct-entry-chevron">{isOpen ? "▴" : "▾"}</span>
              </button>

              {isOpen && (
                <div className="ct-entry-gallery">
                  <ImageGallery
                    images={entry.labels.map((label, j) => ({
                      label,
                      objectUrl: entry.objectUrls[j] ?? "",
                    })).filter(img => img.objectUrl)}
                  />
                  {entry.objectUrls.length < entry.labels.length && (
                    <div className="ct-gallery-unmatched">
                      {entry.labels.length - entry.objectUrls.length} image{entry.labels.length - entry.objectUrls.length !== 1 ? "s" : ""} not uploaded
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
