// ─── Curated Old Burmese syllable inventory ───────────────────────────────────
//
// Each entry represents one attested syllable pattern in Pagan-era stone
// inscriptions or in Pāli loanwords commonly found there. Patterns are stored
// in the visual-order hex convention used by the annotation tool:
//   - U+1031 ေ precedes its base consonant   (e.g. ကေ → "1031 1000")
//   - Stacking: base + 1039 + stacked        (e.g. က္က → "1000 1039 1000")
//   - Medials follow the base                (e.g. ကျ → "1000 103B")
//   - Vowel signs follow base + medials
//   - Final ် (103A) is last
//
// ─── Stacking (consonant cluster) rules ──────────────────────────────────────
//
// Stacked consonants in Burmese / Pāli orthography are HOMORGANIC — they
// must come from the same vagga (articulatory group). Within each vagga of
// five letters, valid stacking pairs are:
//   - 1st + 2nd (unaspirated + aspirated)
//   - 3rd + 4th (voiced + voiced aspirated)
//   - 5th (nasal) + any of the four stops in the same vagga
//   - Any consonant doubled with itself
//
// The five vagga groups:
//   က-vagga (velar):    က ခ ဂ ဃ င
//   စ-vagga (palatal):  စ ဆ ဇ ဈ ည  (and ဉ for nasal stacks)
//   ဋ-vagga (retroflex): ဋ ဌ ဍ ဎ ဏ
//   တ-vagga (dental):   တ ထ ဒ ဓ န
//   ပ-vagga (labial):   ပ ဖ ဗ ဘ မ
//
// Letters in a-vagga (ယ ရ လ ဝ သ ဟ ဠ အ) can only be doubled with themselves
// in standard orthography. သ has limited additional doublings attested in
// abbreviation usage (e.g. သမီး → သ္မီး) but those are non-canonical.
//
// Independent vowels (ဣ ဤ ဥ ဦ ဧ ဩ ဪ) DO NOT host stacked consonants in
// standard orthography. ဥ္က and similar are not attested.

export interface SyllablePattern {
  pattern: string;  // space-separated hex in visual storage order
  label: string;    // rendered character(s) for the pattern
}

export interface SyllableGroup {
  base: string;       // hex of the base consonant/vowel
  baseChar: string;   // rendered base character
  baseName: string;   // transliteration label
  patterns: SyllablePattern[];
}

// ─── Helper builders ──────────────────────────────────────────────────────────

function p(pattern: string, label: string): SyllablePattern {
  return { pattern, label };
}

const PLAIN_VOWELS: [string, string][] = [
  ["102B", "ါ"],
  ["102C", "ာ"],
  ["102D", "ိ"],
  ["102E", "ီ"],
  ["102F", "ု"],
  ["1030", "ူ"],
  ["1032", "ဲ"],
  ["1036", "ံ"],
  ["1037", "့"],
  ["1038", "း"],
];

/** Plain vowel + asat combinations for a base. */
function withVowels(base: string, ch: string): SyllablePattern[] {
  const out: SyllablePattern[] = [];
  out.push(p(base,            `${ch}`));
  out.push(p(`${base} 103A`,  `${ch}်`));
  for (const [v, vc] of PLAIN_VOWELS) {
    out.push(p(`${base} ${v}`, `${ch}${vc}`));
    if (["102D","102E","102F","1030"].includes(v)) {
      out.push(p(`${base} ${v} 103A`, `${ch}${vc}်`));
    }
  }
  out.push(p(`${base} 102D 102F`,       `${ch}ို`));
  out.push(p(`${base} 102D 102F 103A`,  `${ch}ိုက်`));
  out.push(p(`1031 ${base}`,             `${ch}ေ`));
  out.push(p(`1031 ${base} 102C`,        `${ch}ော`));
  out.push(p(`1031 ${base} 102C 103A`,   `${ch}ောက်`));
  out.push(p(`1031 ${base} 1036`,        `${ch}ောင်`));
  return out;
}

/** Medial combinations then their common vowel patterns. */
function withMedials(base: string, ch: string, medials: [string, string][]): SyllablePattern[] {
  const out: SyllablePattern[] = [];
  for (const [m, mc] of medials) {
    const bm = `${base} ${m}`;
    out.push(p(bm,                      `${ch}${mc}`));
    out.push(p(`${bm} 103A`,            `${ch}${mc}်`));
    out.push(p(`${bm} 102C`,            `${ch}${mc}ာ`));
    out.push(p(`${bm} 102C 103A`,       `${ch}${mc}ာ်`));
    out.push(p(`${bm} 102D`,            `${ch}${mc}ိ`));
    out.push(p(`${bm} 102D 103A`,       `${ch}${mc}ိ်`));
    out.push(p(`${bm} 102F`,            `${ch}${mc}ု`));
    out.push(p(`${bm} 1030`,            `${ch}${mc}ူ`));
    out.push(p(`1031 ${bm}`,            `${ch}${mc}ေ`));
    out.push(p(`1031 ${bm} 102C`,       `${ch}${mc}ော`));
    out.push(p(`1031 ${bm} 102C 103A`,  `${ch}${mc}ောက်`));
  }
  return out;
}

/** Stacking combinations then their common vowel patterns. */
function withStacks(base: string, ch: string, stacked: [string, string][]): SyllablePattern[] {
  const out: SyllablePattern[] = [];
  for (const [s, sc] of stacked) {
    const bs = `${base} 1039 ${s}`;
    out.push(p(bs,                   `${ch}္${sc}`));
    out.push(p(`${bs} 103A`,         `${ch}္${sc}်`));
    out.push(p(`${bs} 102C`,         `${ch}္${sc}ာ`));
    out.push(p(`${bs} 102D`,         `${ch}္${sc}ိ`));
    out.push(p(`${bs} 102F`,         `${ch}္${sc}ု`));
    out.push(p(`${bs} 1036`,         `${ch}္${sc}ံ`));
    out.push(p(`1031 ${bs}`,         `${ch}္${sc}ေ`));
    out.push(p(`1031 ${bs} 102C`,    `${ch}္${sc}ော`));
  }
  return out;
}

// ─── Inventory ────────────────────────────────────────────────────────────────
//
// Stacks follow the homorganic vagga rule. Self-doubling allowed for all.
// Cross-vagga stacks REMOVED (e.g. က္ဏ, က္ယ, က္သ, ပ္မ, မ္မ across vaggas).

export const SYLLABLE_INVENTORY: SyllableGroup[] = [

  // ── က-vagga ───────────────────────────────────────────────────────────────
  {
    base: "1000", baseChar: "က", baseName: "Ka",
    patterns: [
      ...withVowels("1000", "က"),
      ...withMedials("1000", "က", [
        ["103B","ျ"],["103C","ြ"],["103D","ွ"],["103E","ှ"],
        ["103B 103D","ျွ"],["103B 103E","ျှ"],["103C 103D","ြွ"],["103C 103E","ြှ"],
      ]),
      ...withStacks("1000", "က", [
        ["1000","က"],      // က္က self
        ["1001","ခ"],      // က္ခ same vagga (1+2)
      ]),
    ],
  },
  {
    base: "1001", baseChar: "ခ", baseName: "Kha",
    patterns: [
      ...withVowels("1001", "ခ"),
      ...withMedials("1001", "ခ", [["103B","ျ"],["103C","ြ"],["103D","ွ"]]),
      ...withStacks("1001", "ခ", [["1001","ခ"]]),  // self only
    ],
  },
  {
    base: "1002", baseChar: "ဂ", baseName: "Ga",
    patterns: [
      ...withVowels("1002", "ဂ"),
      ...withMedials("1002", "ဂ", [["103B","ျ"],["103C","ြ"],["103D","ွ"]]),
      ...withStacks("1002", "ဂ", [
        ["1002","ဂ"],     // ဂ္ဂ self
        ["1003","ဃ"],     // ဂ္ဃ same vagga (3+4)
      ]),
    ],
  },
  {
    base: "1003", baseChar: "ဃ", baseName: "Gha",
    patterns: [...withVowels("1003", "ဃ")],
  },
  {
    base: "1004", baseChar: "င", baseName: "Nga",
    patterns: [
      ...withVowels("1004", "င"),
      ...withStacks("1004", "င", [
        ["1000","က"],     // င္က nasal + stop in same vagga
        ["1001","ခ"],     // င္ခ
        ["1002","ဂ"],     // င္ဂ
        ["1003","ဃ"],     // င္ဃ
      ]),
    ],
  },

  // ── စ-vagga ───────────────────────────────────────────────────────────────
  {
    base: "1005", baseChar: "စ", baseName: "Ca",
    patterns: [
      ...withVowels("1005", "စ"),
      ...withMedials("1005", "စ", [["103B","ျ"]]),
      ...withStacks("1005", "စ", [
        ["1005","စ"],     // စ္စ self
        ["1006","ဆ"],     // စ္ဆ same vagga (1+2)
      ]),
    ],
  },
  {
    base: "1006", baseChar: "ဆ", baseName: "Cha",
    patterns: [
      ...withVowels("1006", "ဆ"),
      ...withMedials("1006", "ဆ", [["103B","ျ"]]),
      ...withStacks("1006", "ဆ", [["1006","ဆ"]]),  // self only
    ],
  },
  {
    base: "1007", baseChar: "ဇ", baseName: "Ja",
    patterns: [
      ...withVowels("1007", "ဇ"),
      ...withMedials("1007", "ဇ", [["103B","ျ"]]),
      ...withStacks("1007", "ဇ", [
        ["1007","ဇ"],     // ဇ္ဇ self
        ["1008","ဈ"],     // ဇ္ဈ same vagga (3+4)
      ]),
    ],
  },
  {
    base: "1008", baseChar: "ဈ", baseName: "Jha",
    patterns: [...withVowels("1008", "ဈ")],
  },
  {
    base: "100A", baseChar: "ည", baseName: "Nya",
    patterns: [
      ...withVowels("100A", "ည"),
      ...withStacks("100A", "ည", [
        ["1005","စ"],     // ည္စ nasal + stop in same vagga
        ["1006","ဆ"],     // ည္ဆ
        ["1007","ဇ"],     // ည္ဇ
        ["1008","ဈ"],     // ည္ဈ
        ["1009","ဉ"],     // ည္ဉ (with ဉ nasal)
      ]),
    ],
  },

  // ── ဋ-vagga (retroflex) ───────────────────────────────────────────────────
  {
    base: "100B", baseChar: "ဋ", baseName: "Tta (right-3 in inscriptions)",
    patterns: [
      ...withVowels("100B", "ဋ"),
      ...withStacks("100B", "ဋ", [
        ["100B","ဋ"],     // ဋ္ဋ self
        ["100C","ဌ"],     // ဋ္ဌ same vagga (1+2)
      ]),
    ],
  },
  {
    base: "100C", baseChar: "ဌ", baseName: "Ttha",
    patterns: [
      ...withVowels("100C", "ဌ"),
      ...withStacks("100C", "ဌ", [["100C","ဌ"]]),
    ],
  },
  {
    base: "100D", baseChar: "ဍ", baseName: "Dda",
    patterns: [
      ...withVowels("100D", "ဍ"),
      ...withStacks("100D", "ဍ", [
        ["100D","ဍ"],     // ဍ္ဍ self
        ["100E","ဎ"],     // ဍ္ဎ same vagga (3+4)
      ]),
    ],
  },
  {
    base: "100E", baseChar: "ဎ", baseName: "Ddha",
    patterns: [...withVowels("100E", "ဎ")],
  },
  {
    base: "100F", baseChar: "ဏ", baseName: "Nna",
    patterns: [
      ...withVowels("100F", "ဏ"),
      ...withStacks("100F", "ဏ", [
        ["100B","ဋ"],     // ဏ္ဋ nasal + stop
        ["100C","ဌ"],     // ဏ္ဌ
        ["100D","ဍ"],     // ဏ္ဍ
        ["100E","ဎ"],     // ဏ္ဎ
        ["100F","ဏ"],     // ဏ္ဏ self
      ]),
    ],
  },

  // ── တ-vagga (dental) ──────────────────────────────────────────────────────
  {
    base: "1010", baseChar: "တ", baseName: "Ta",
    patterns: [
      ...withVowels("1010", "တ"),
      ...withMedials("1010", "တ", [["103D","ွ"],["103E","ှ"]]),
      ...withStacks("1010", "တ", [
        ["1010","တ"],     // တ္တ self
        ["1011","ထ"],     // တ္ထ same vagga (1+2)
      ]),
    ],
  },
  {
    base: "1011", baseChar: "ထ", baseName: "Tha",
    patterns: [
      ...withVowels("1011", "ထ"),
      ...withMedials("1011", "ထ", [["103D","ွ"]]),
      ...withStacks("1011", "ထ", [["1011","ထ"]]),
    ],
  },
  {
    base: "1012", baseChar: "ဒ", baseName: "Da",
    patterns: [
      ...withVowels("1012", "ဒ"),
      ...withMedials("1012", "ဒ", [["103D","ွ"],["103E","ှ"]]),
      ...withStacks("1012", "ဒ", [
        ["1012","ဒ"],     // ဒ္ဒ self
        ["1013","ဓ"],     // ဒ္ဓ same vagga (3+4)
      ]),
    ],
  },
  {
    base: "1013", baseChar: "ဓ", baseName: "Dha",
    patterns: [...withVowels("1013", "ဓ")],
  },
  {
    base: "1014", baseChar: "န", baseName: "Na",
    patterns: [
      ...withVowels("1014", "န"),
      ...withMedials("1014", "န", [["103D","ွ"],["103E","ှ"]]),
      ...withStacks("1014", "န", [
        ["1010","တ"],     // န္တ nasal + stop
        ["1011","ထ"],     // န္ထ
        ["1012","ဒ"],     // န္ဒ
        ["1013","ဓ"],     // န္ဓ
        ["1014","န"],     // န္န self
      ]),
    ],
  },

  // ── ပ-vagga (labial) ──────────────────────────────────────────────────────
  {
    base: "1015", baseChar: "ပ", baseName: "Pa",
    patterns: [
      ...withVowels("1015", "ပ"),
      ...withMedials("1015", "ပ", [["103B","ျ"],["103C","ြ"],["103D","ွ"],["103E","ှ"]]),
      ...withStacks("1015", "ပ", [
        ["1015","ပ"],     // ပ္ပ self
        ["1016","ဖ"],     // ပ္ဖ same vagga (1+2)
      ]),
    ],
  },
  {
    base: "1016", baseChar: "ဖ", baseName: "Pha",
    patterns: [
      ...withVowels("1016", "ဖ"),
      ...withMedials("1016", "ဖ", [["103B","ျ"],["103C","ြ"]]),
      ...withStacks("1016", "ဖ", [["1016","ဖ"]]),
    ],
  },
  {
    base: "1017", baseChar: "ဗ", baseName: "Ba",
    patterns: [
      ...withVowels("1017", "ဗ"),
      ...withMedials("1017", "ဗ", [["103B","ျ"],["103C","ြ"],["103D","ွ"]]),
      ...withStacks("1017", "ဗ", [
        ["1017","ဗ"],     // ဗ္ဗ self
        ["1018","ဘ"],     // ဗ္ဘ same vagga (3+4)
      ]),
    ],
  },
  {
    base: "1018", baseChar: "ဘ", baseName: "Bha",
    patterns: [
      ...withVowels("1018", "ဘ"),
      ...withMedials("1018", "ဘ", [["103B","ျ"],["103C","ြ"],["103D","ွ"]]),
    ],
  },
  {
    base: "1019", baseChar: "မ", baseName: "Ma",
    patterns: [
      ...withVowels("1019", "မ"),
      ...withMedials("1019", "မ", [["103B","ျ"],["103C","ြ"],["103D","ွ"],["103E","ှ"]]),
      ...withStacks("1019", "မ", [
        ["1015","ပ"],     // မ္ပ nasal + stop
        ["1016","ဖ"],     // မ္ဖ
        ["1017","ဗ"],     // မ္ဗ
        ["1018","ဘ"],     // မ္ဘ (e.g. ကမ္ဘာ "world")
        ["1019","မ"],     // မ္မ self (e.g. ဓမ္မ "dhamma")
      ]),
    ],
  },

  // ── a-vagga (non-grouped) — self-doubling only ────────────────────────────
  {
    base: "101A", baseChar: "ယ", baseName: "Ya",
    patterns: [
      ...withVowels("101A", "ယ"),
      ...withStacks("101A", "ယ", [["101A","ယ"]]),  // self only
    ],
  },
  {
    base: "101B", baseChar: "ရ", baseName: "Ra",
    patterns: [
      ...withVowels("101B", "ရ"),
      ...withMedials("101B", "ရ", [["103D","ွ"],["103E","ှ"]]),
    ],
  },
  {
    base: "101C", baseChar: "လ", baseName: "La",
    patterns: [
      ...withVowels("101C", "လ"),
      ...withStacks("101C", "လ", [["101C","လ"]]),  // လ္လ self only
    ],
  },
  {
    base: "101D", baseChar: "ဝ", baseName: "Wa",
    patterns: [
      ...withVowels("101D", "ဝ"),
      ...withStacks("101D", "ဝ", [["101D","ဝ"]]),  // ဝ္ဝ self only
    ],
  },
  {
    base: "101E", baseChar: "သ", baseName: "Sa",
    patterns: [
      ...withVowels("101E", "သ"),
      ...withMedials("101E", "သ", [["103B","ျ"],["103D","ွ"],["103E","ှ"]]),
      ...withStacks("101E", "သ", [["101E","သ"]]),  // သ္သ self only
    ],
  },
  {
    base: "101F", baseChar: "ဟ", baseName: "Ha",
    patterns: [
      ...withVowels("101F", "ဟ"),
      ...withMedials("101F", "ဟ", [["103D","ွ"],["103E","ှ"]]),
    ],
  },
  {
    base: "1020", baseChar: "ဠ", baseName: "Lla",
    patterns: [
      ...withVowels("1020", "ဠ"),
      ...withStacks("1020", "ဠ", [["1020","ဠ"]]),  // ဠ္ဠ self only
    ],
  },
  {
    base: "1021", baseChar: "အ", baseName: "A",
    patterns: [
      ...withVowels("1021", "အ"),
      ...withMedials("1021", "အ", [["103D","ွ"],["103E","ှ"]]),
      // No stacks — အ is non-vagga and doubling is rare/non-attested
    ],
  },

  // ── Independent vowels — NO STACKS (do not host stacked consonants) ───────
  {
    base: "1023", baseChar: "ဣ", baseName: "I (independent)",
    patterns: [
      p("1023",       "ဣ"),
      p("1023 103A",  "ဣ်"),
    ],
  },
  {
    base: "1024", baseChar: "ဤ", baseName: "Ii (independent)",
    patterns: [
      p("1024",       "ဤ"),
      p("1024 103A",  "ဤ်"),
    ],
  },
  {
    base: "1025", baseChar: "ဥ", baseName: "U (independent)",
    patterns: [
      p("1025",       "ဥ"),
      p("1025 103A",  "ဥ်"),
      // Note: ဥ္စ etc. are NOT attested in standard orthography. Removed.
    ],
  },
  {
    base: "1026", baseChar: "ဦ", baseName: "Uu (independent)",
    patterns: [
      p("1026",       "ဦ"),
      p("1026 103A",  "ဦ်"),
    ],
  },
  {
    base: "1027", baseChar: "ဧ", baseName: "E (independent)",
    patterns: [
      p("1027",       "ဧ"),
      p("1027 103A",  "ဧ်"),
    ],
  },
  {
    base: "1029", baseChar: "ဩ", baseName: "O (independent)",
    patterns: [
      p("1029",       "ဩ"),
      p("1029 103A",  "ဩ်"),
    ],
  },
  {
    base: "102A", baseChar: "ဪ", baseName: "Aw (independent)",
    patterns: [
      p("102A", "ဪ"),
    ],
  },
];