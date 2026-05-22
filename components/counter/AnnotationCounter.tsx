"use client";

import { useState } from "react";
import { hexToUnicode } from "@/lib/annotate";
import ImageGallery from "./ImageGallery";

export interface AnnotationEntry {
  annotation: string;
  labels: string[];
  objectUrls: string[];
}

interface Props {
  entries: AnnotationEntry[];
  target: number;
  totalImages: number;
}

type View = "list" | "completed";

export default function AnnotationCounter({ entries, target, totalImages }: Props) {
  const [expandedAnnotation, setExpandedAnnotation] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");

  const sorted = [...entries].sort((a, b) => {
    if (a.annotation === "") return 1;
    if (b.annotation === "") return -1;
    return a.labels.length - b.labels.length;
  });

  const completed    = entries
    .filter(e => e.annotation !== "" && e.labels.length >= target)
    .slice()
    .sort((a, b) => {
      // Sort by each codepoint in the hex string left-to-right (ascending)
      const aCps = a.annotation.trim().split(/\s+/).map(h => parseInt(h, 16));
      const bCps = b.annotation.trim().split(/\s+/).map(h => parseInt(h, 16));
      for (let i = 0; i < Math.max(aCps.length, bCps.length); i++) {
        const diff = (aCps[i] ?? 0) - (bCps[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  const belowTarget  = entries.filter(e => e.annotation !== "" && e.labels.length < target).length;
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
        <div className="ct-summary-divider" />
        <div className="ct-summary-stat">
          <span className="ct-summary-value" style={{ color: "var(--accent-cool)" }}>
            {completed.length}
          </span>
          <span className="ct-summary-label">completed</span>
        </div>

        {/* View toggle — right-aligned inside summary bar */}
        <div className="ct-view-toggle">
          <button
            className={`ct-view-btn${view === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
            title="List view"
          >
            ≡ list
          </button>
          <button
            className={`ct-view-btn${view === "completed" ? " active" : ""}`}
            onClick={() => setView("completed")}
            title="Completed thumbnails"
          >
            ⊞ completed ({completed.length})
          </button>
        </div>
      </div>

      {view === "completed" ? (

        /* ── Completed thumbprint grid ────────────────────────────────────── */
        <div className="ct-completed-wrap">
          {completed.length === 0 ? (
            <div className="ct-completed-empty">
              no annotations have reached the target of {target} yet
            </div>
          ) : (
            <div className="ct-completed-grid">
              {completed.map(entry => {
                const rendered = hexToUnicode(entry.annotation);
                const thumbs = entry.objectUrls.slice(0, 6); // show up to 6 per cell
                const extra  = entry.objectUrls.length - thumbs.length;
                return (
                  <div key={entry.annotation} className="ct-completed-cell">
                    <div className="ct-completed-char">{rendered}</div>
                    <div className="ct-completed-hex">{entry.annotation}</div>
                    <div className="ct-completed-thumbs">
                      {thumbs.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={entry.labels[i] ?? ""}
                          className="ct-completed-thumb"
                          title={entry.labels[i] ?? ""}
                        />
                      ))}
                      {extra > 0 && (
                        <span className="ct-completed-extra">+{extra}</span>
                      )}
                    </div>
                    <div className="ct-completed-count">
                      {entry.labels.length} / {target}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : (

        /* ── Standard list view ───────────────────────────────────────────── */
        <ol className="ct-entry-list">
          {sorted.map((entry) => {
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
                  <div className="ct-entry-id">
                    {rendered
                      ? <span className="ct-entry-rendered">{rendered}</span>
                      : <span className="ct-entry-no-annotation">— no annotation —</span>
                    }
                    {entry.annotation && (
                      <span className="ct-entry-hex">{entry.annotation}</span>
                    )}
                  </div>

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
      )}
    </div>
  );
}