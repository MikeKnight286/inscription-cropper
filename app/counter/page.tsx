"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AnnotationCounter, { type AnnotationEntry } from "@/components/counter/AnnotationCounter";
import SyllableTracker from "@/components/counter/SyllableTracker";

interface JsonEntry {
  label: string;
  annotation: string;
  isSegment?: boolean;
  parentId?: string | null;
}

function parseJsonFiles(files: File[]): Promise<JsonEntry[]> {
  return Promise.all(
    files.map(f => f.text().then(t => JSON.parse(t) as JsonEntry[]))
  ).then(arrays => arrays.flat());
}

function fingerprint(file: File): string { return `${file.name}:${file.size}`; }

function labelsFromFile(file: File): string[] {
  const fullName = file.webkitRelativePath ? file.webkitRelativePath.split("/").pop()! : file.name;
  const stem = fullName.replace(/\.[^.]+$/, "");
  const stripped = stem.replace(/^\d+_/, "");
  const keys = [stem];
  if (stripped !== stem) keys.push(stripped);
  return keys;
}

type Tab = "counter" | "syllables";

export default function CounterPage() {
  const [entryMap, setEntryMap]       = useState<Map<string, { labels: string[] }> | null>(null);
  const [urlMap, setUrlMap]           = useState<Map<string, string>>(new Map());
  const [target, setTarget]           = useState(50);
  const [targetDraft, setTargetDraft] = useState("50");
  const [totalImages, setTotalImages] = useState(0);
  const [imageCount, setImageCount]   = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [dupWarning, setDupWarning]   = useState<string | null>(null);
  const [tab, setTab]                 = useState<Tab>("counter");
  const seenFilesRef = useRef<Set<string>>(new Set());
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef  = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = folderInputRef.current;
    if (el) { el.setAttribute("webkitdirectory",""); el.setAttribute("multiple",""); }
  }, []);

  const handleJsonFiles = useCallback(async (files: FileList | File[]) => {
    const all = Array.from(files).filter(f => f.name.endsWith(".json"));
    if (all.length === 0) { setError("no JSON files found in selection"); return; }
    const seen = seenFilesRef.current;
    const fresh = all.filter(f => !seen.has(fingerprint(f)));
    const dupCount = all.length - fresh.length;
    if (dupCount > 0 && fresh.length === 0) { setDupWarning(`${dupCount} JSON file${dupCount!==1?"s":""} already loaded — no new data added`); return; }
    if (dupCount > 0) setDupWarning(`${dupCount} duplicate JSON file${dupCount!==1?"s":""} skipped`); else setDupWarning(null);
    fresh.forEach(f => seen.add(fingerprint(f)));
    try {
      const entries = await parseJsonFiles(fresh);
      setEntryMap(prev => {
        const next = new Map(prev ?? []);
        for (const entry of entries) {
          const key = (entry.annotation ?? "").trim();
          if (!next.has(key)) next.set(key, { labels: [] });
          next.get(key)!.labels.push(entry.label);
        }
        return next;
      });
      setTotalImages(prev => prev + entries.length);
      setError(null);
    } catch (e) { setError(`failed to parse JSON: ${(e as Error).message}`); }
  }, []);

  const handleImageFiles = useCallback((files: FileList | File[]) => {
    const all = Array.from(files).filter(f => f.type.startsWith("image/") || /\.(png|jpg|jpeg|tiff|bmp|webp)$/i.test(f.name));
    if (all.length === 0) return;
    const seen = seenFilesRef.current;
    const fresh = all.filter(f => !seen.has(fingerprint(f)));
    const dupCount = all.length - fresh.length;
    if (dupCount > 0 && fresh.length === 0) { setDupWarning(`${dupCount} image${dupCount!==1?"s":""} already loaded — no new images added`); return; }
    if (dupCount > 0) setDupWarning(`${dupCount} duplicate image${dupCount!==1?"s":""} skipped`); else setDupWarning(null);
    fresh.forEach(f => seen.add(fingerprint(f)));
    setUrlMap(prev => {
      const next = new Map(prev);
      for (const file of fresh) {
        const url = URL.createObjectURL(file);
        for (const key of labelsFromFile(file)) { if (!next.has(key)) next.set(key, url); }
      }
      return next;
    });
    setImageCount(prev => prev + fresh.length);
  }, []);

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items ?? []);
    if (items.length > 0 && items[0].webkitGetAsEntry?.() !== null) {
      const files = await collectFilesFromItems(items);
      const jf = files.filter(f => f.name.endsWith(".json"));
      const im = files.filter(f => f.type.startsWith("image/") || /\.(png|jpg|jpeg|tiff|bmp|webp)$/i.test(f.name));
      if (jf.length > 0) handleJsonFiles(jf); if (im.length > 0) handleImageFiles(im); return;
    }
    const files = Array.from(e.dataTransfer.files);
    const jf = files.filter(f => f.name.endsWith(".json")); const im = files.filter(f => f.type.startsWith("image/"));
    if (jf.length > 0) handleJsonFiles(jf); if (im.length > 0) handleImageFiles(im);
  }

  function commitTarget(raw: string) {
    const v = parseInt(raw, 10);
    if (!isNaN(v) && v > 0) { setTarget(v); setTargetDraft(String(v)); } else setTargetDraft(String(target));
  }

  function buildAnnotationEntries(): AnnotationEntry[] {
    if (!entryMap) return [];
    return Array.from(entryMap.entries()).map(([annotation, { labels }]) => ({
      annotation, labels,
      objectUrls: labels.map(l => urlMap.get(l) ?? "").filter(Boolean),
    }));
  }

  function buildAnnotationMap(): Map<string, { label: string; objectUrl: string }[]> {
    const map = new Map<string, { label: string; objectUrl: string }[]>();
    if (!entryMap) return map;
    for (const [annotation, { labels }] of entryMap.entries()) {
      const images = labels.map(label => ({ label, objectUrl: urlMap.get(label) ?? "" })).filter(img => img.objectUrl);
      if (images.length > 0) map.set(annotation, images);
    }
    return map;
  }

  const entries = buildAnnotationEntries();
  const annotationMap = buildAnnotationMap();

  return (
    <main className="ct-app" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <header className="ct-header">
        <div className="ct-brand">
          <a href="/" className="ct-brand-back" title="back to cropper">▭</a>
          <span className="ct-brand-sep">/</span>
          <a href="/annotate" className="ct-brand-link">annotate</a>
          <span className="ct-brand-sep">/</span>
          <span className="ct-brand-name">Counter</span>
        </div>
        <div className="ct-header-controls">
          <div className="ct-tab-group">
            <button className={`ct-tab${tab==="counter"?" active":""}`} onClick={() => setTab("counter")}>by annotation</button>
            <button className={`ct-tab${tab==="syllables"?" active":""}`} onClick={() => setTab("syllables")}>by syllable</button>
          </div>
          {imageCount > 0 && <span className="ct-img-count">{imageCount} images loaded</span>}
          <button className="ct-btn" onClick={() => jsonInputRef.current?.click()}>+ json</button>
          <button className="ct-btn" onClick={() => imgInputRef.current?.click()}>+ images</button>
          <button className="ct-btn" onClick={() => folderInputRef.current?.click()}>+ folder</button>
          <label className="ct-target-label">target
            <input type="number" min={1} className="ct-target-input" value={targetDraft}
              onChange={e => setTargetDraft(e.target.value)}
              onBlur={e => commitTarget(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") commitTarget((e.target as HTMLInputElement).value); if (e.key==="Escape") setTargetDraft(String(target)); }} />
          </label>
        </div>
        <input ref={jsonInputRef} type="file" accept=".json" multiple style={{display:"none"}} onChange={e => { if (e.target.files) handleJsonFiles(e.target.files); e.target.value=""; }} />
        <input ref={imgInputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e => { if (e.target.files) handleImageFiles(e.target.files); e.target.value=""; }} />
        <input ref={folderInputRef} type="file" style={{display:"none"}} onChange={e => {
          if (!e.target.files) return;
          const all = Array.from(e.target.files);
          const jf = all.filter(f => f.name.endsWith(".json")); const im = all.filter(f => f.type.startsWith("image/") || /\.(png|jpg|jpeg|tiff|bmp|webp)$/i.test(f.name));
          if (jf.length > 0) handleJsonFiles(jf); if (im.length > 0) handleImageFiles(im); e.target.value="";
        }} />
      </header>

      {dupWarning && (
        <div className="ct-dup-warning">
          <span>⚠ {dupWarning}</span>
          <button className="ct-dup-dismiss" onClick={() => setDupWarning(null)}>×</button>
        </div>
      )}

      <div className="ct-body">
        {error && <div className="ct-error">{error}</div>}
        {!entryMap ? (
          <div className="ct-welcome">
            <div className="ct-welcome-icon">⊟</div>
            <p>upload one or more <strong>annotations.json</strong> files to begin</p>
            <p className="ct-welcome-sub">drag and drop JSON files and images here, or use the buttons above</p>
            <p className="ct-welcome-sub">multiple folders are merged · duplicate files are detected and skipped</p>
          </div>
        ) : tab === "counter" ? (
          <AnnotationCounter entries={entries} target={target} totalImages={totalImages} />
        ) : (
          <SyllableTracker annotationMap={annotationMap} target={target} />
        )}
      </div>
    </main>
  );
}

async function collectFilesFromItems(items: DataTransferItem[]): Promise<File[]> {
  const files: File[] = [];
  async function traverseEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const entries = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      await Promise.all(entries.map(traverseEntry));
    }
  }
  await Promise.all(items.map(item => item.webkitGetAsEntry()).filter((e): e is FileSystemEntry => e !== null).map(traverseEntry));
  return files;
}