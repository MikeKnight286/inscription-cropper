"use client";

import type { SourcePage } from "@/types";

interface Props {
  pages: SourcePage[];
  currentId: string;
  onChange: (id: string) => void;
}

export default function PageControls({ pages, currentId, onChange }: Props) {
  if (pages.length <= 1) return null;
  const idx = pages.findIndex(p => p.id === currentId);
  return (
    <div className="page-controls">
      <button
        onClick={() => onChange(pages[Math.max(0, idx - 1)].id)}
        disabled={idx <= 0}
      >‹ prev</button>
      <select value={currentId} onChange={e => onChange(e.target.value)}>
        {pages.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <button
        onClick={() => onChange(pages[Math.min(pages.length - 1, idx + 1)].id)}
        disabled={idx >= pages.length - 1}
      >next ›</button>
    </div>
  );
}
