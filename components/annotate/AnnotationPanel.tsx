"use client";

import { useState } from "react";
import type { AnnotationImage } from "@/lib/annotate";
import {
  appendCodepoint,
  removeLastCodepoint,
  hexToUnicode,
  hexToCodepoints,
} from "@/lib/annotate";
import BurmeseKeyboard from "./BurmeseKeyboard";

interface Props {
  image: AnnotationImage | null;
  onChange: (id: string, hex: string) => void;
  annotationCount: number;
}

export default function AnnotationPanel({ image, onChange, annotationCount }: Props) {
  const [showKeyboard, setShowKeyboard] = useState(false);

  // Called by BurmeseKeyboard when a character key is pressed.
  // The keyboard now passes the codepoint number directly.
  function handleChar(cp: number) {
    if (!image) return;
    const newHex = appendCodepoint(image.annotation, cp);
    onChange(image.id, newHex);
  }

  function handleBackspace() {
    if (!image) return;
    const newHex = removeLastCodepoint(image.annotation);
    onChange(image.id, newHex);
  }

  if (!image) {
    return <div className="an-annot-empty">select an image to annotate</div>;
  }

  const cps      = hexToCodepoints(image.annotation);
  const rendered = hexToUnicode(image.annotation);
  const cpCount  = cps.length;

  return (
    <div className="an-annot-panel">
      <div className="an-annot-header">
        <span className="an-annot-label">{image.label}</span>
        <button
          className={`an-annot-kbd-toggle${showKeyboard ? " active" : ""}`}
          onClick={() => setShowKeyboard(v => !v)}
          title="Toggle on-screen keyboard"
        >
          ကခ keyboard
        </button>
      </div>

      {/* Live rendered preview of what the hex codes produce */}
      <div className="an-annot-preview" title="Rendered characters">
        {rendered
          ? <span className="an-annot-rendered">{rendered}</span>
          : <span className="an-annot-preview-empty">—</span>
        }
      </div>

      {/* Read-only hex display — source of truth */}
      <div className="an-annot-hex-display">
        {cps.length === 0
          ? <span className="an-annot-hex-empty">use the keyboard below to annotate</span>
          : cps.map((cp, i) => (
              <span key={i} className="an-annot-hex-token">
                {cp.toString(16).toUpperCase().padStart(4, "0")}
              </span>
            ))
        }
      </div>

      <div className="an-annot-meta">
        <span className="an-annot-charcount">{cpCount} code point{cpCount !== 1 ? "s" : ""}</span>
        <span className="an-annot-occurrence">
          {annotationCount} match{annotationCount !== 1 ? "es" : ""}
        </span>
        {cpCount > 0 && (
          <button
            className="an-annot-clear"
            onClick={() => onChange(image.id, "")}
            title="Clear annotation"
          >
            clear
          </button>
        )}
      </div>

      {showKeyboard && (
        <BurmeseKeyboard onCodepoint={handleChar} onBackspace={handleBackspace} />
      )}
    </div>
  );
}
