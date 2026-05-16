"use client";

import { useState, useMemo } from "react";
import { SYLLABLE_INVENTORY, type SyllableGroup, type SyllablePattern } from "@/lib/syllable-inventory";
import { hexToUnicode } from "@/lib/annotate";
import ImageGallery from "./ImageGallery";

interface MatchedImage {
  label: string;
  objectUrl: string;
}

interface Props {
  // Map from annotation hex string → matched images (same as counter)
  annotationMap: Map<string, MatchedImage[]>;
  target: number;
}

/** Deletions persisted only for this session.
 *  Key: pattern hex string. Value: true = deleted. */
type DeletedSet = Set<string>;

export default function SyllableTracker({ annotationMap, target }: Props) {
  const [deleted, setDeleted]       = useState<DeletedSet>(new Set());
  const [expanded, setExpanded]     = useState<string | null>(null);   // pattern key
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set()); // base hex keys
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "found">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Derived counts ─────────────────────────────────────────────────────────
  //
  // Two sources of patterns:
  //  1. The curated inventory (baseline, shown even at count 0)
  //  2. Annotation patterns NOT in the inventory (user-contributed, shown only
  //     when found in uploaded data). These are grouped under the inventory
  //     group whose base hex matches the first codepoint of the pattern, or
  //     under a special "user-contributed" group if no match is found.

  const groups = useMemo(() => {
    // Build a set of all inventory pattern strings for fast lookup
    const inventoryPatterns = new Set(
      SYLLABLE_INVENTORY.flatMap(g => g.patterns.map(pt => pt.pattern))
    );

    // Find annotation patterns not in inventory that have at least one image
    const userContributed = new Map<string, { pattern: string; images: MatchedImage[] }>();
    for (const [pattern, images] of annotationMap.entries()) {
      if (!inventoryPatterns.has(pattern) && images.length > 0) {
        userContributed.set(pattern, { pattern, images });
      }
    }

    // Build a lookup: base hex → group index in SYLLABLE_INVENTORY
    const baseToGroupIdx = new Map<string, number>();
    SYLLABLE_INVENTORY.forEach((g, i) => baseToGroupIdx.set(g.base, i));

    // Clone inventory groups, adding user-contributed patterns to matching groups
    const result = SYLLABLE_INVENTORY.map(group => ({
      ...group,
      patterns: group.patterns
        .filter(pt => !deleted.has(pt.pattern))
        .map(pt => {
          const images = annotationMap.get(pt.pattern) ?? [];
          return { ...pt, count: images.length, images, userContributed: false };
        }),
    }));

    // Insert user-contributed patterns into their matching group (by first codepoint)
    const unmatched: typeof userContributed = new Map();
    for (const [pattern, entry] of userContributed.entries()) {
      if (deleted.has(pattern)) continue;
      const firstHex = pattern.split(" ")[0].toUpperCase();
      // For patterns starting with 1031 (pre-vowel), use the second codepoint as base
      const baseHex = firstHex === "1031"
        ? (pattern.split(" ")[1] ?? firstHex).toUpperCase()
        : firstHex;
      const groupIdx = baseToGroupIdx.get(baseHex);
      if (groupIdx !== undefined) {
        result[groupIdx].patterns.push({
          pattern,
          label: hexToUnicode(pattern),
          count: entry.images.length,
          images: entry.images,
          userContributed: true,
        });
      } else {
        unmatched.set(pattern, entry);
      }
    }

    // Any unmatched user-contributed patterns get their own group
    const unmatchedGroup = unmatched.size > 0 ? [{
      base: "__user__",
      baseChar: "✦",
      baseName: "user-contributed (unmatched base)",
      patterns: [...unmatched.entries()].map(([pattern, entry]) => ({
        pattern,
        label: hexToUnicode(pattern),
        count: entry.images.length,
        images: entry.images,
        userContributed: true,
      })),
    }] : [];

    return [...result.filter(g => g.patterns.length > 0), ...unmatchedGroup];
  }, [annotationMap, deleted]);

  // ── Search filter ──────────────────────────────────────────────────────────

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups.map(group => ({
      ...group,
      patterns: group.patterns.filter(pt => {
        if (filterMode === "missing" && pt.count > 0) return false;
        if (filterMode === "found"   && pt.count === 0) return false;
        if (q) {
          return (
            pt.pattern.toLowerCase().includes(q) ||
            pt.label.toLowerCase().includes(q) ||
            group.baseName.toLowerCase().includes(q) ||
            group.baseChar.includes(q)
          );
        }
        return true;
      }),
    })).filter(g => g.patterns.length > 0);
  }, [groups, filterMode, searchQuery]);

  // ── Summary stats ──────────────────────────────────────────────────────────

  const totalPatterns = groups.reduce((s, g) => s + g.patterns.length, 0);
  const foundPatterns = groups.reduce((s, g) => s + g.patterns.filter(p => p.count > 0).length, 0);
  const missingPatterns = totalPatterns - foundPatterns;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function toggleGroup(base: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(base) ? next.delete(base) : next.add(base);
      return next;
    });
  }

  function togglePattern(pattern: string) {
    setExpanded(prev => prev === pattern ? null : pattern);
  }

  function requestDelete(pattern: string) {
    setPendingDelete(pattern);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    setDeleted(prev => new Set([...prev, pendingDelete]));
    if (expanded === pendingDelete) setExpanded(null);
    setPendingDelete(null);
  }

  function handleSaveDeletions() {
    setShowSaveConfirm(true);
  }

  function confirmSaveDeletions() {
    const data = JSON.stringify([...deleted], null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "deleted-patterns.json";
    a.click();
    URL.revokeObjectURL(url);
    setShowSaveConfirm(false);
  }

  function restoreAll() {
    setDeleted(new Set());
  }

  return (
    <div className="st-wrap">

      {/* Summary */}
      <div className="ct-summary">
        <div className="ct-summary-stat">
          <span className="ct-summary-value">{totalPatterns}</span>
          <span className="ct-summary-label">patterns</span>
        </div>
        <div className="ct-summary-divider" />
        <div className="ct-summary-stat">
          <span className="ct-summary-value">{foundPatterns}</span>
          <span className="ct-summary-label">found</span>
        </div>
        <div className="ct-summary-divider" />
        <div className="ct-summary-stat">
          <span className="ct-summary-value ct-summary-deficit">{missingPatterns}</span>
          <span className="ct-summary-label">missing</span>
        </div>
        <div className="ct-summary-divider" />
        <div className="ct-summary-stat">
          <span className="ct-summary-value">{deleted.size}</span>
          <span className="ct-summary-label">deleted</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="st-toolbar">
        <div className="st-filter-btns">
          {(["all","missing","found"] as const).map(mode => (
            <button
              key={mode}
              className={`st-filter-btn${filterMode === mode ? " active" : ""}`}
              onClick={() => setFilterMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <input
          className="st-search"
          placeholder="search hex, label, or consonant…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <div className="st-action-btns">
          {deleted.size > 0 && (
            <>
              <button className="st-action-btn" onClick={restoreAll}>
                restore all ({deleted.size})
              </button>
              <button className="st-action-btn primary" onClick={handleSaveDeletions}>
                save deletions
              </button>
            </>
          )}
        </div>
      </div>

      {/* Group list */}
      <div className="st-groups">
        {filteredGroups.map(group => {
          const isOpen    = openGroups.has(group.base);
          const groupFound   = group.patterns.filter(p => p.count > 0).length;
          const groupMissing = group.patterns.length - groupFound;
          return (
            <div key={group.base} className="st-group">
              <button
                className={`st-group-header${isOpen ? " open" : ""}`}
                onClick={() => toggleGroup(group.base)}
              >
                <span className="st-group-char">{group.baseChar}</span>
                <span className="st-group-name">{group.baseName}</span>
                <span className="st-group-hex">{group.base}</span>
                <div className="st-group-stats">
                  <span className="st-group-found">{groupFound} found</span>
                  {groupMissing > 0 && (
                    <span className="st-group-missing">·{groupMissing} missing</span>
                  )}
                  <span className="st-group-total">/ {group.patterns.length}</span>
                </div>
                <span className="st-group-chevron">{isOpen ? "▴" : "▾"}</span>
              </button>

              {isOpen && (
                <div className="st-patterns">
                  {group.patterns.map(pt => {
                    const pct    = Math.min(1, pt.count / Math.max(1, target));
                    const deficit = Math.max(0, target - pt.count);
                    const isExp  = expanded === pt.pattern;
                    return (
                      <div key={pt.pattern} className="st-pattern">
                        {/* div instead of button to avoid nested-button HTML violation */}
                        <div
                          role="button"
                          tabIndex={0}
                          className={`st-pattern-header${isExp ? " open" : ""}${pt.count === 0 ? " missing" : ""}`}
                          onClick={() => togglePattern(pt.pattern)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePattern(pt.pattern); } }}
                        >
                          {/* Rendered + hex */}
                          <div className="st-pattern-id">
                            <span className="st-pattern-rendered">
                              {hexToUnicode(pt.pattern)}
                            </span>
                            <span className="st-pattern-hex">
                              {pt.pattern}
                              {(pt as any).userContributed && (
                                <span className="st-user-badge" title="found in your data — not in baseline inventory">
                                  ✦ data
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Bar */}
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

                          {/* Count */}
                          <div className="ct-entry-count">
                            <span className={`ct-entry-count-num${pct >= 1 ? " complete" : pt.count === 0 ? " deficit" : ""}`}>
                              {pt.count}
                            </span>
                            <span className="ct-entry-count-sep">/</span>
                            <span className="ct-entry-count-target">{target}</span>
                          </div>

                          {/* Delete button — valid here because parent is div, not button */}
                          <button
                            className="st-delete-btn"
                            title="Remove this pattern from tracker"
                            onClick={e => { e.stopPropagation(); requestDelete(pt.pattern); }}
                          >
                            ×
                          </button>

                          <span className="ct-entry-chevron">{isExp ? "▴" : "▾"}</span>
                        </div>

                        {isExp && (
                          <div className="ct-entry-gallery">
                            <ImageGallery images={pt.images} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div className="st-modal-overlay">
          <div className="st-modal">
            <div className="st-modal-title">remove pattern?</div>
            <div className="st-modal-body">
              <span className="st-modal-pattern">
                {hexToUnicode(pendingDelete)}
              </span>
              <span className="st-modal-hex">{pendingDelete}</span>
              <p className="st-modal-warn">
                This pattern will be hidden for this session. Use "save deletions" to export the list. It can be restored with "restore all."
              </p>
            </div>
            <div className="st-modal-actions">
              <button className="st-modal-btn ghost" onClick={() => setPendingDelete(null)}>cancel</button>
              <button className="st-modal-btn danger" onClick={confirmDelete}>remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Save deletions confirmation modal */}
      {showSaveConfirm && (
        <div className="st-modal-overlay">
          <div className="st-modal">
            <div className="st-modal-title">save deletions?</div>
            <div className="st-modal-body">
              <p className="st-modal-warn">
                This will download a JSON file of {deleted.size} deleted pattern{deleted.size !== 1 ? "s" : ""}. The file is for your records only — it is not loaded back automatically.
              </p>
            </div>
            <div className="st-modal-actions">
              <button className="st-modal-btn ghost" onClick={() => setShowSaveConfirm(false)}>cancel</button>
              <button className="st-modal-btn primary" onClick={confirmSaveDeletions}>download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}