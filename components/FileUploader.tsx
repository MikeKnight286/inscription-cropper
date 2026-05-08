"use client";

import { useRef, useState } from "react";

interface Props {
  onLoad: (file: File) => Promise<void>;
}

export default function FileUploader({ onLoad }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      await onLoad(file);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`uploader${drag ? " drag" : ""}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="uploader-btn"
      >
        {busy ? "loading…" : "choose file"}
      </button>
      <div className="uploader-hint">
        or drop a PDF / image here
      </div>
      {err && <div className="uploader-err">{err}</div>}
    </div>
  );
}
