/**
 * Matching Engine — Nickname Resolver (Bidirectional)
 *
 * Resolves Spanish nicknames, diminutives, and name variants bidirectionally.
 * PEPE ↔ JOSE, PACO ↔ FRANCISCO, JUANITO → JUAN
 *
 * @module matching/nickname-resolver
 */

import { NAME_ABBREVIATIONS } from './normalize';

// Reverse index: canonical name → all known nicknames
const reverseNicknames = new Map<string, Set<string>>();
for (const [abbrev, expansions] of Object.entries(NAME_ABBREVIATIONS)) {
  for (const canonical of expansions) {
    if (!reverseNicknames.has(canonical)) reverseNicknames.set(canonical, new Set());
    reverseNicknames.get(canonical)!.add(abbrev);
  }
}

// Diminutive suffix patterns
const DIMINUTIVE_PATTERNS: Array<{ suffix: RegExp; replacement: string }> = [
  { suffix: /CITOS?$/, replacement: '' },
  { suffix: /CITAS?$/, replacement: '' },
  { suffix: /ITOS?$/, replacement: 'O' },
  { suffix: /ITAS?$/, replacement: 'A' },
  { suffix: /ILLO$/, replacement: '' },
  { suffix: /ILLA$/, replacement: '' },
  { suffix: /ITO$/, replacement: '' },
  { suffix: /ITA$/, replacement: '' },
];

/** Strip diminutive suffixes. JUANITO → JUAN */
export function stripDiminutive(token: string): string {
  if (token.length < 5) return token;
  for (const { suffix, replacement } of DIMINUTIVE_PATTERNS) {
    if (suffix.test(token)) {
      const base = token.replace(suffix, replacement);
      if (base.length >= 3) return base;
    }
  }
  return token;
}

/** Get ALL variant forms of a token (forward + reverse + diminutive). */
export function getAllVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  const forward = NAME_ABBREVIATIONS[token];
  if (forward) for (const f of forward) variants.add(f);
  const reverse = reverseNicknames.get(token);
  if (reverse) for (const r of reverse) variants.add(r);
  const dim = stripDiminutive(token);
  if (dim && dim !== token && dim.length >= 3) {
    variants.add(dim);
    const dimFwd = NAME_ABBREVIATIONS[dim];
    if (dimFwd) for (const f of dimFwd) variants.add(f);
  }
  return Array.from(variants);
}

/** Get the canonical (longest) form. PEPE → JOSE, PACO → FRANCISCO */
export function toCanonical(token: string): string {
  const forward = NAME_ABBREVIATIONS[token];
  if (forward && forward.length > 0) return forward.reduce((a, b) => a.length >= b.length ? a : b);
  const dim = stripDiminutive(token);
  if (dim && dim !== token && dim.length >= 3) return dim;
  return token;
}

/** Check if two tokens are nickname-equivalent. */
export function areNicknameEquivalent(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  if (a === b) return true;
  const fwdA = NAME_ABBREVIATIONS[a];
  if (fwdA && fwdA.includes(b)) return true;
  const fwdB = NAME_ABBREVIATIONS[b];
  if (fwdB && fwdB.includes(a)) return true;
  const revA = reverseNicknames.get(a);
  if (revA && revA.has(b)) return true;
  const revB = reverseNicknames.get(b);
  if (revB && revB.has(a)) return true;
  return false;
}
