"use client";

// Unicode Myanmar keyboard — buttons fire onCodepoint(codePointNumber).
// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL NOTE:
//   ဋ (U+100B) corresponds to the right-facing-3 glyph in Pagan-era stone
//   inscriptions. In Old Burmese epigraphy these are the same phoneme; use ဋ
//   when transcribing that glyph.
// ─────────────────────────────────────────────────────────────────────────────
// VISUAL ORDER NOTE:
//   ေ (U+1031) is typed FIRST in visual order (it appears to the left of the
//   consonant). The tool automatically reorders it to the correct Unicode
//   logical position (after the consonant + medials) when stored.
// ─────────────────────────────────────────────────────────────────────────────

interface Section {
  label: string;
  note?: string;
  keys: { char: string; cp: number }[][];
}

function k(char: string): { char: string; cp: number } {
  return { char, cp: char.codePointAt(0)! };
}

const SECTIONS: Section[] = [
  {
    label: "consonants",
    note: "ဋ (100B) = right-facing-3 glyph in stone inscriptions",
    keys: [
      ["က","ခ","ဂ","ဃ","င","စ","ဆ","ဇ","ဈ","ဉ","ည"].map(k),
      ["ဋ","ဌ","ဍ","ဎ","ဏ","တ","ထ","ဒ","ဓ","န"].map(k),
      ["ပ","ဖ","ဗ","ဘ","မ","ယ","ရ","လ","ဝ","သ","ဟ","ဠ","အ"].map(k),
    ],
  },
  {
    label: "independent vowels",
    note: "distinct from consonant+vowel combinations",
    keys: [
      ["ဣ","ဤ","ဥ","ဦ","ဧ","ဩ","ဪ"].map(k),
    ],
  },
  {
    label: "pre-vowel (type FIRST for visual order)",
    note: "ေ (1031) appears left of consonant visually — type it before the consonant; stored order is corrected automatically",
    keys: [
      ["ေ"].map(k),
    ],
  },
  {
    label: "dependent vowel signs (type after consonant)",
    keys: [
      ["ါ","ာ","ိ","ီ","ု","ူ","ဲ","ဳ","ဴ","ဵ","ံ","့","း"].map(k),
    ],
  },
  {
    label: "medials · asat · stacking",
    note: "္ (1039) stacking sign: place between two consonants for clusters, e.g. က + ္ + က = က္က",
    keys: [
      ["်","ျ","ြ","ွ","ှ","ဿ"].map(k),
      // Stacking sign rendered with placeholder circle so key is non-empty
      [{ char: "္", cp: 0x1039 }],
    ],
  },
  {
    label: "punctuation",
    keys: [
      ["၊","။","၌","၍","၎","၏"].map(k),
    ],
  },
  {
    label: "digits",
    keys: [
      ["၀","၁","၂","၃","၄","၅","၆","၇","၈","၉"].map(k),
    ],
  },
];

interface Props {
  onCodepoint: (cp: number) => void;
  onBackspace: () => void;
}

export default function BurmeseKeyboard({ onCodepoint, onBackspace }: Props) {
  return (
    <div className="bk-wrap">
      {/* Delete button fixed at the top — always visible without scrolling */}
      <div className="bk-del-bar">
        <button
          className="bk-key bk-backspace"
          onMouseDown={e => { e.preventDefault(); onBackspace(); }}
          title="Delete last code point"
        >
          ⌫ del
        </button>
      </div>
      {SECTIONS.map((sec, si) => (
        <div key={si} className="bk-section">
          <div className="bk-section-label">{sec.label}</div>
          {sec.note && <div className="bk-section-note">{sec.note}</div>}
          {sec.keys.map((row, ri) => (
            <div key={ri} className="bk-row">
              {row.map(({ char, cp }, ci) => (
                <button
                  key={ci}
                  className="bk-key"
                  onMouseDown={e => {
                    e.preventDefault(); // keep focus off textarea
                    onCodepoint(cp);
                  }}
                  title={`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`}
                >
                  {cp === 0x1039
                    ? <span className="bk-stack-glyph">◌္</span>
                    : char
                  }
                </button>
              ))}
            </div>
          ))}
        </div>
      ))}

    </div>
  );
}