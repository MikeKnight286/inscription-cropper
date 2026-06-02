// ─── Curated modern Burmese syllable inventory ─────────────────────────────────
//
// Each entry represents one common syllable pattern in modern Burmese
// literature. The inventory is intentionally CONSERVATIVE: less classes
// is better than more, to avoid false positives in the counter.
//
// ─── Grouping rule (strict) ────────────────────────────────────────────────
//
// Each pattern in the inventory contains exactly ONE base consonant or
// independent vowel. Patterns with two base consonants (e.g. ကောက် = ေ + က
// + ာ + က + ်) are NOT in the inventory — they appear in the counter as
// user-contributed entries when found in uploaded annotation data, and are
// composed of two inventory classes that are tracked separately under
// their respective bases (e.g. ကော under 1000 and က် under 1000).
//
// ─── Pattern encoding (visual storage order, matches annotation tool) ──────
//
//   - U+1031 ေ precedes its base consonant  (e.g. ကေ → "1031 1000")
//   - Stacking: base + 1039 + stacked       (e.g. က္က → "1000 1039 1000")
//   - Medials follow the base               (e.g. ကျ → "1000 103B")
//   - Vowel signs follow base + medials
//   - Final ် (103A) is last
//
// ─── ါ (U+102B) restriction ────────────────────────────────────────────────
//
// The long vowel form ါ only attaches to: ခ (1001), ဂ (1002), င (1004),
// ဒ (1012), ပ (1015), ဝ (101D). All other consonants use ာ (U+102C).
//
// ─── Stacking rule (homorganic vagga) ──────────────────────────────────────
//
// Stacked consonants are HOMORGANIC — they must come from the same vagga.
// Within each vagga of five letters, valid stacking pairs are:
//   - 1st + 2nd (unaspirated + aspirated)
//   - 3rd + 4th (voiced + voiced aspirated)
//   - 5th (nasal) + any of the four stops in the same vagga
//   - Self-doubling (any consonant with itself)
//
// Letters in a-vagga (ယ ရ လ ဝ သ ဟ ဠ အ) only self-double in modern Burmese.
// Independent vowels (ဣ ဤ ဥ ဦ ဧ ဩ ဪ) do not host stacks in standard
// orthography.

export interface SyllablePattern {
  pattern: string;
  label: string;
}

export interface SyllableGroup {
  base: string;
  baseChar: string;
  baseName: string;
  patterns: SyllablePattern[];
}

function p(pattern: string, label: string): SyllablePattern {
  return { pattern, label };
}

// ─── Pattern builders ────────────────────────────────────────────────────────

/** Core single-consonant patterns for a base.
 *  takesLongA: true for ခ ဂ င ဒ ပ ဝ (use ါ instead of ာ).
 *  Returns common modern patterns only. */
function buildCore(base: string, ch: string, takesLongA: boolean = false): SyllablePattern[] {
  const out: SyllablePattern[] = [];
  const aa = takesLongA ? "102B" : "102C";
  const aaCh = takesLongA ? "ါ" : "ာ";

  out.push(p(base,                     `${ch}`));
  out.push(p(`${base} 103A`,           `${ch}်`));
  out.push(p(`${base} ${aa}`,          `${ch}${aaCh}`));
  out.push(p(`${base} 102D`,           `${ch}ိ`));
  out.push(p(`${base} 102E`,           `${ch}ီ`));
  out.push(p(`${base} 102F`,           `${ch}ု`));
  out.push(p(`${base} 1030`,           `${ch}ူ`));
  out.push(p(`${base} 1032`,           `${ch}ဲ`));
  out.push(p(`${base} 1036`,           `${ch}ံ`));
  out.push(p(`${base} 1037`,           `${ch}့`));
  out.push(p(`${base} 1038`,           `${ch}း`));

  // ို family
  out.push(p(`${base} 102D 102F`,      `${ch}ို`));
  out.push(p(`${base} 102D 102F 1037`, `${ch}ို့`));

  // High-tone variants (း)
  out.push(p(`${base} ${aa} 1038`,     `${ch}${aaCh}း`));
  out.push(p(`${base} 102E 1038`,      `${ch}ီး`));
  out.push(p(`${base} 1030 1038`,      `${ch}ူး`));

  // Pre-vowel ေ family
  out.push(p(`1031 ${base}`,           `${ch}ေ`));
  out.push(p(`1031 ${base} 102C`,      `${ch}ော`));
  out.push(p(`1031 ${base} 102C 103A`, `${ch}ော်`));

  return out;
}

/** Medial patterns — common subset. ေ + base + ာ included where applicable. */
function buildMedials(
  base: string,
  ch: string,
  medials: { hex: string; rendered: string; includeHighTone?: boolean }[],
): SyllablePattern[] {
  const out: SyllablePattern[] = [];
  for (const { hex, rendered, includeHighTone } of medials) {
    const bm = `${base} ${hex}`;
    out.push(p(bm,                       `${ch}${rendered}`));
    out.push(p(`${bm} 102C`,             `${ch}${rendered}ာ`));
    out.push(p(`${bm} 102C 103A`,        `${ch}${rendered}ာ်`));
    out.push(p(`${bm} 102D`,             `${ch}${rendered}ိ`));
    out.push(p(`${bm} 102F`,             `${ch}${rendered}ု`));
    out.push(p(`1031 ${bm}`,             `${ch}${rendered}ေ`));
    out.push(p(`1031 ${bm} 102C`,        `${ch}${rendered}ော`));
    if (includeHighTone) {
      out.push(p(`${bm} 102E 1038`,      `${ch}${rendered}ီး`));
      out.push(p(`${bm} 102C 1038`,      `${ch}${rendered}ား`));
    }
  }
  return out;
}

/** Stacking patterns — conservative subset: bare, ်, ာ, ိ, ု, ေ, ော. */
function buildStacks(
  base: string,
  ch: string,
  stacked: { hex: string; rendered: string }[],
): SyllablePattern[] {
  const out: SyllablePattern[] = [];
  for (const { hex, rendered } of stacked) {
    const bs = `${base} 1039 ${hex}`;
    out.push(p(bs,                  `${ch}္${rendered}`));
    out.push(p(`${bs} 103A`,        `${ch}္${rendered}်`));
    out.push(p(`${bs} 102C`,        `${ch}္${rendered}ာ`));
    out.push(p(`${bs} 102D`,        `${ch}္${rendered}ိ`));
    out.push(p(`${bs} 102F`,        `${ch}္${rendered}ု`));
    out.push(p(`1031 ${bs}`,        `${ch}္${rendered}ေ`));
    out.push(p(`1031 ${bs} 102C`,   `${ch}္${rendered}ော`));
  }
  return out;
}

// Medial combinations (e.g. ျွ ြွ) — minimal common set
function buildMedialCombo(base: string, ch: string, combo: string, rendered: string): SyllablePattern[] {
  const out: SyllablePattern[] = [];
  const bm = `${base} ${combo}`;
  out.push(p(bm,                `${ch}${rendered}`));
  out.push(p(`${bm} 102C`,      `${ch}${rendered}ာ`));
  return out;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export const SYLLABLE_INVENTORY: SyllableGroup[] = [

  // ── က-vagga ───────────────────────────────────────────────────────────────
  {
    base: "1000", baseChar: "က", baseName: "Ka",
    patterns: [
      ...buildCore("1000", "က"),
      ...buildMedials("1000", "က", [
        { hex: "103B", rendered: "ျ", includeHighTone: true },
        { hex: "103C", rendered: "ြ", includeHighTone: true },
        { hex: "103D", rendered: "ွ", includeHighTone: true },
      ]),
      ...buildMedialCombo("1000", "က", "103B 103D", "ျွ"),
      ...buildMedialCombo("1000", "က", "103C 103D", "ြွ"),
      ...buildStacks("1000", "က", [
        { hex: "1000", rendered: "က" },  // က္က self
        { hex: "1001", rendered: "ခ" },  // က္ခ (1+2)
      ]),
    ],
  },
  {
    base: "1001", baseChar: "ခ", baseName: "Kha",
    patterns: [
      ...buildCore("1001", "ခ", true),  // takes ါ
      ...buildMedials("1001", "ခ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103C", rendered: "ြ" },
        { hex: "103D", rendered: "ွ" },
      ]),
      ...buildStacks("1001", "ခ", [{ hex: "1001", rendered: "ခ" }]),  // self only
    ],
  },
  {
    base: "1002", baseChar: "ဂ", baseName: "Ga",
    patterns: [
      ...buildCore("1002", "ဂ", true),  // takes ါ
      ...buildMedials("1002", "ဂ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103C", rendered: "ြ" },
      ]),
      ...buildStacks("1002", "ဂ", [
        { hex: "1002", rendered: "ဂ" },  // ဂ္ဂ self
        { hex: "1003", rendered: "ဃ" },  // ဂ္ဃ (3+4)
      ]),
    ],
  },
  {
    base: "1003", baseChar: "ဃ", baseName: "Gha",
    patterns: [...buildCore("1003", "ဃ")],
  },
  {
    base: "1004", baseChar: "င", baseName: "Nga",
    patterns: [
      ...buildCore("1004", "င", true),  // takes ါ
      ...buildStacks("1004", "င", [
        { hex: "1000", rendered: "က" },
        { hex: "1002", rendered: "ဂ" },
      ]),
    ],
  },

  // ── စ-vagga ───────────────────────────────────────────────────────────────
  {
    base: "1005", baseChar: "စ", baseName: "Ca",
    patterns: [
      ...buildCore("1005", "စ"),
      ...buildMedials("1005", "စ", [{ hex: "103B", rendered: "ျ" }]),
      ...buildStacks("1005", "စ", [
        { hex: "1005", rendered: "စ" },  // စ္စ self
        { hex: "1006", rendered: "ဆ" },  // စ_ဆ (1+2)
      ]),
    ],
  },
  {
    base: "1006", baseChar: "ဆ", baseName: "Cha",
    patterns: [
      ...buildCore("1006", "ဆ"),
      ...buildMedials("1006", "ဆ", [{ hex: "103B", rendered: "ျ" }]),
    ],
  },
  {
    base: "1007", baseChar: "ဇ", baseName: "Ja",
    patterns: [
      ...buildCore("1007", "ဇ"),
      ...buildMedials("1007", "ဇ", [{ hex: "103B", rendered: "ျ" }]),
      ...buildStacks("1007", "ဇ", [{ hex: "1007", rendered: "ဇ" }]),  // ဇ္ဇ self
    ],
  },
  {
    base: "1008", baseChar: "ဈ", baseName: "Jha",
    patterns: [...buildCore("1008", "ဈ")],
  },
  {
    base: "100A", baseChar: "ည", baseName: "Nya",
    patterns: [
      ...buildCore("100A", "ည"),
      ...buildStacks("100A", "ည", [
        { hex: "1005", rendered: "စ" },
        { hex: "1007", rendered: "ဇ" },
      ]),
    ],
  },

  // ── ဋ-vagga (Pali origin, less common in modern Burmese) ─────────────────
  {
    base: "100B", baseChar: "ဋ", baseName: "Tta",
    patterns: [
      ...buildCore("100B", "ဋ"),
      ...buildStacks("100B", "ဋ", [
        { hex: "100B", rendered: "ဋ" },  // ဋ_ဋ self
        { hex: "100C", rendered: "ဌ" },  // ဋ_ဌ (1+2)
      ]),
    ],
  },
  {
    base: "100C", baseChar: "ဌ", baseName: "Ttha",
    patterns: [...buildCore("100C", "ဌ")],
  },
  {
    base: "100D", baseChar: "ဍ", baseName: "Dda",
    patterns: [...buildCore("100D", "ဍ")],
  },
  {
    base: "100E", baseChar: "ဎ", baseName: "Ddha",
    patterns: [...buildCore("100E", "ဎ")],
  },
  {
    base: "100F", baseChar: "ဏ", baseName: "Nna",
    patterns: [
      ...buildCore("100F", "ဏ"),
      ...buildStacks("100F", "ဏ", [
        { hex: "100B", rendered: "ဋ" },  // ဏ_ဋ
        { hex: "100D", rendered: "ဍ" },  // ဏ_ဍ
      ]),
    ],
  },

  // ── တ-vagga ───────────────────────────────────────────────────────────────
  {
    base: "1010", baseChar: "တ", baseName: "Ta",
    patterns: [
      ...buildCore("1010", "တ"),
      ...buildMedials("1010", "တ", [
        { hex: "103D", rendered: "ွ" },
      ]),
      ...buildStacks("1010", "တ", [
        { hex: "1010", rendered: "တ" },  // တ_တ self
        { hex: "1011", rendered: "ထ" },  // တ_ထ (1+2)
      ]),
    ],
  },
  {
    base: "1011", baseChar: "ထ", baseName: "Tha",
    patterns: [
      ...buildCore("1011", "ထ"),
      ...buildMedials("1011", "ထ", [{ hex: "103D", rendered: "ွ" }]),
    ],
  },
  {
    base: "1012", baseChar: "ဒ", baseName: "Da",
    patterns: [
      ...buildCore("1012", "ဒ", true),  // takes ါ
      ...buildMedials("1012", "ဒ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103D", rendered: "ွ" },
      ]),
      ...buildStacks("1012", "ဒ", [
        { hex: "1012", rendered: "ဒ" },  // ဒ_ဒ self
        { hex: "1013", rendered: "ဓ" },  // ဒ_ဓ (3+4)
      ]),
    ],
  },
  {
    base: "1013", baseChar: "ဓ", baseName: "Dha",
    patterns: [...buildCore("1013", "ဓ")],
  },
  {
    base: "1014", baseChar: "န", baseName: "Na",
    patterns: [
      ...buildCore("1014", "န"),
      ...buildMedials("1014", "န", [{ hex: "103D", rendered: "ွ" }]),
      ...buildStacks("1014", "န", [
        { hex: "1010", rendered: "တ" },  // န_တ (e.g. မန္တလေး)
        { hex: "1012", rendered: "ဒ" },  // န_ဒ
        { hex: "1013", rendered: "ဓ" },  // န_ဓ
        { hex: "1014", rendered: "န" },  // န_န self
      ]),
    ],
  },

  // ── ပ-vagga ───────────────────────────────────────────────────────────────
  {
    base: "1015", baseChar: "ပ", baseName: "Pa",
    patterns: [
      ...buildCore("1015", "ပ", true),  // takes ါ
      ...buildMedials("1015", "ပ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103C", rendered: "ြ" },
        { hex: "103D", rendered: "ွ" },
      ]),
      ...buildStacks("1015", "ပ", [
        { hex: "1015", rendered: "ပ" },  // ပ_ပ self
        { hex: "1016", rendered: "ဖ" },  // ပ_ဖ (1+2)
      ]),
    ],
  },
  {
    base: "1016", baseChar: "ဖ", baseName: "Pha",
    patterns: [
      ...buildCore("1016", "ဖ"),
      ...buildMedials("1016", "ဖ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103C", rendered: "ြ" },
      ]),
    ],
  },
  {
    base: "1017", baseChar: "ဗ", baseName: "Ba",
    patterns: [
      ...buildCore("1017", "ဗ"),
      ...buildMedials("1017", "ဗ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103C", rendered: "ြ" },
      ]),
      ...buildStacks("1017", "ဗ", [
        { hex: "1017", rendered: "ဗ" },  // ဗ_ဗ self
        { hex: "1018", rendered: "ဘ" },  // ဗ_ဘ (3+4)
      ]),
    ],
  },
  {
    base: "1018", baseChar: "ဘ", baseName: "Bha",
    patterns: [
      ...buildCore("1018", "ဘ"),
      ...buildMedials("1018", "ဘ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103C", rendered: "ြ" },
      ]),
    ],
  },
  {
    base: "1019", baseChar: "မ", baseName: "Ma",
    patterns: [
      ...buildCore("1019", "မ"),
      ...buildMedials("1019", "မ", [
        { hex: "103B", rendered: "ျ", includeHighTone: true },
        { hex: "103C", rendered: "ြ", includeHighTone: true },
      ]),
      ...buildStacks("1019", "မ", [
        { hex: "1015", rendered: "ပ" },  // မ_ပ
        { hex: "1018", rendered: "ဘ" },  // မ_ဘ (e.g. ကမ္ဘာ)
        { hex: "1019", rendered: "မ" },  // မ_မ self (e.g. ဓမ_မ)
      ]),
    ],
  },

  // ── a-vagga (self-doubling only in modern Burmese) ────────────────────────
  {
    base: "101A", baseChar: "ယ", baseName: "Ya",
    patterns: [...buildCore("101A", "ယ")],
  },
  {
    base: "101B", baseChar: "ရ", baseName: "Ra",
    patterns: [
      ...buildCore("101B", "ရ"),
      ...buildMedials("101B", "ရ", [{ hex: "103D", rendered: "ွ" }]),
    ],
  },
  {
    base: "101C", baseChar: "လ", baseName: "La",
    patterns: [
      ...buildCore("101C", "လ"),
      ...buildStacks("101C", "လ", [{ hex: "101C", rendered: "လ" }]),  // လ_လ self
    ],
  },
  {
    base: "101D", baseChar: "ဝ", baseName: "Wa",
    patterns: [...buildCore("101D", "ဝ", true)],  // takes ါ
  },
  {
    base: "101E", baseChar: "သ", baseName: "Sa",
    patterns: [
      ...buildCore("101E", "သ"),
      ...buildMedials("101E", "သ", [
        { hex: "103B", rendered: "ျ" },
        { hex: "103D", rendered: "ွ" },
      ]),
      ...buildStacks("101E", "သ", [{ hex: "101E", rendered: "သ" }]),  // သ_သ self
    ],
  },
  {
    base: "101F", baseChar: "ဟ", baseName: "Ha",
    patterns: [
      ...buildCore("101F", "ဟ"),
      ...buildMedials("101F", "ဟ", [{ hex: "103D", rendered: "ွ" }]),
    ],
  },
  {
    base: "1020", baseChar: "ဠ", baseName: "Lla",
    patterns: [...buildCore("1020", "ဠ")],
  },
  {
    base: "1021", baseChar: "အ", baseName: "A",
    patterns: [
      ...buildCore("1021", "အ"),
      ...buildMedials("1021", "အ", [{ hex: "103D", rendered: "ွ" }]),
    ],
  },

  // ── Independent vowels — bare only ────────────────────────────────────────
  {
    base: "1023", baseChar: "ဣ", baseName: "I (independent)",
    patterns: [p("1023", "ဣ")],
  },
  {
    base: "1024", baseChar: "ဤ", baseName: "Ii (independent)",
    patterns: [p("1024", "ဤ")],
  },
  {
    base: "1025", baseChar: "ဥ", baseName: "U (independent)",
    patterns: [p("1025", "ဥ")],
  },
  {
    base: "1026", baseChar: "ဦ", baseName: "Uu (independent)",
    patterns: [p("1026", "ဦ")],
  },
  {
    base: "1027", baseChar: "ဧ", baseName: "E (independent)",
    patterns: [p("1027", "ဧ")],
  },
  {
    base: "1029", baseChar: "ဩ", baseName: "O (independent)",
    patterns: [p("1029", "ဩ")],
  },
  {
    base: "102A", baseChar: "ဪ", baseName: "Aw (independent)",
    patterns: [p("102A", "ဪ")],
  },
];
// ─── Inventory query helpers ──────────────────────────────────────────────────

/** Return a flat Set of all baseline pattern strings. */
export function getInventoryPatternSet(): Set<string> {
  const set = new Set<string>();
  for (const group of SYLLABLE_INVENTORY) {
    for (const pt of group.patterns) {
      set.add(pt.pattern);
    }
  }
  return set;
}