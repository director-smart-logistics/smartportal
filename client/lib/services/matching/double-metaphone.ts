/**
 * Matching Engine — Double Metaphone Phonetic Algorithm
 *
 * Generates TWO phonetic codes per word, handling multilingual rules
 * (Spanish, English, Italian, German). Far superior to basic Soundex for
 * Costa Rican names.
 *
 * WHY THIS EXISTS:
 *   Basic Soundex is English-only and produces incorrect codes for Spanish names:
 *     - "García" → G620, "Garsia" → G620 ✅ (lucky coincidence)
 *     - "Jiménez" → J552, "Ximenez" → X552 ❌ (should match!)
 *     - "Huertas" → H632, "Uertas" → U632 ❌ (H is silent in Spanish)
 *
 *   Double Metaphone handles these correctly:
 *     - Primary code for common pronunciation
 *     - Alternate code for variant pronunciation
 *     - Match if ANY code pair matches → higher recall
 *
 * REGRESSION SAFETY:
 *   Additive module. Does NOT replace existing phoneticKey() or soundex().
 *   Can be used alongside them in the scoring pipeline.
 *
 * REFERENCE: Lawrence Philips, "The Double Metaphone Search Algorithm"
 *            (C/C++ Users Journal, June 2000)
 *
 * @module matching/double-metaphone
 */

/**
 * Generate Double Metaphone codes for a single word.
 *
 * @param word - A single token (already normalized/uppercased)
 * @returns [primary, alternate] — alternate may equal primary if only one pronunciation
 */
export function doubleMetaphone(word: string): [string, string] {
  if (typeof word !== 'string' || !word || word.length === 0) return ['', ''];

  const str = word.toUpperCase();
  const len = str.length;
  let primary = '';
  let alternate = '';
  let pos = 0;
  const maxLen = 6; // Max code length

  // Helper: get char at position (or empty if OOB)
  const charAt = (i: number) => (i >= 0 && i < len ? str[i] : '');
  const sliceAt = (i: number, n: number) => str.substring(i, i + n);

  // Skip silent initial letters
  if (['GN', 'KN', 'PN', 'AE', 'WR'].includes(sliceAt(0, 2))) pos++;

  // Handle initial vowel — always maps to 'A'
  if ('AEIOU'.includes(charAt(pos))) {
    primary += 'A';
    alternate += 'A';
    pos++;
  }

  while (pos < len && (primary.length < maxLen || alternate.length < maxLen)) {
    const ch = charAt(pos);

    switch (ch) {
      case 'B':
        primary += 'P'; alternate += 'P';
        pos += charAt(pos + 1) === 'B' ? 2 : 1;
        break;

      case 'C':
        if (sliceAt(pos, 2) === 'CH') {
          primary += 'X'; alternate += 'X'; pos += 2;
        } else if ('EIY'.includes(charAt(pos + 1))) {
          // CE, CI, CY → S (soft C — Spanish "cerrar", "cielo")
          primary += 'S'; alternate += 'S'; pos += 2;
        } else {
          primary += 'K'; alternate += 'K';
          pos += sliceAt(pos, 2) === 'CK' ? 2 : 1;
        }
        break;

      case 'D':
        if ('GEI'.includes(charAt(pos + 1)) && sliceAt(pos, 2) === 'DG') {
          primary += 'J'; alternate += 'J'; pos += 2;
        } else {
          primary += 'T'; alternate += 'T';
          pos += charAt(pos + 1) === 'D' ? 2 : 1;
        }
        break;

      case 'F':
        primary += 'F'; alternate += 'F';
        pos += charAt(pos + 1) === 'F' ? 2 : 1;
        break;

      case 'G':
        if (charAt(pos + 1) === 'H') {
          // GH: silent before consonant, else K
          if (pos + 2 < len && !'AEIOU'.includes(charAt(pos + 2))) {
            pos += 2; // silent GH
          } else {
            primary += 'K'; alternate += 'K'; pos += 2;
          }
        } else if ('EIY'.includes(charAt(pos + 1))) {
          // Spanish: GE/GI → H sound (like "gente", "Jiménez"/"Giménez")
          primary += 'J'; alternate += 'K'; pos += 2;
        } else if (charAt(pos + 1) === 'G') {
          primary += 'K'; alternate += 'K'; pos += 2;
        } else {
          primary += 'K'; alternate += 'K'; pos += 1;
        }
        break;

      case 'H':
        // H is silent in Spanish — only code if followed by a vowel
        if ('AEIOU'.includes(charAt(pos + 1))) {
          primary += 'A'; alternate += 'A';
        }
        pos++;
        break;

      case 'J':
        // Spanish J → H sound (like "José", "Jiménez")
        primary += 'H'; alternate += 'J'; pos += 1;
        break;

      case 'K':
        primary += 'K'; alternate += 'K';
        pos += charAt(pos + 1) === 'K' ? 2 : 1;
        break;

      case 'L':
        if (sliceAt(pos, 2) === 'LL') {
          // Spanish LL → Y (like "llave", "calle")
          primary += 'L'; alternate += 'L'; pos += 2;
        } else {
          primary += 'L'; alternate += 'L'; pos += 1;
        }
        break;

      case 'M':
        primary += 'M'; alternate += 'M';
        pos += charAt(pos + 1) === 'M' ? 2 : 1;
        break;

      case 'N':
        primary += 'N'; alternate += 'N';
        pos += charAt(pos + 1) === 'N' ? 2 : 1;
        break;

      case 'Ñ':
        primary += 'N'; alternate += 'N'; pos += 1;
        break;

      case 'P':
        if (charAt(pos + 1) === 'H') {
          primary += 'F'; alternate += 'F'; pos += 2;
        } else {
          primary += 'P'; alternate += 'P';
          pos += charAt(pos + 1) === 'P' ? 2 : 1;
        }
        break;

      case 'Q':
        primary += 'K'; alternate += 'K';
        pos += charAt(pos + 1) === 'U' ? 2 : 1;
        break;

      case 'R':
        primary += 'R'; alternate += 'R';
        pos += charAt(pos + 1) === 'R' ? 2 : 1;
        break;

      case 'S':
        if (sliceAt(pos, 2) === 'SH') {
          primary += 'X'; alternate += 'X'; pos += 2;
        } else if (sliceAt(pos, 3) === 'SCH') {
          primary += 'SK'; alternate += 'SK'; pos += 3;
        } else {
          primary += 'S'; alternate += 'S';
          pos += charAt(pos + 1) === 'S' ? 2 : 1;
        }
        break;

      case 'T':
        if (sliceAt(pos, 2) === 'TH') {
          primary += 'T'; alternate += '0'; pos += 2;
        } else {
          primary += 'T'; alternate += 'T';
          pos += charAt(pos + 1) === 'T' ? 2 : 1;
        }
        break;

      case 'V':
        // Spanish V = B sound (like "vaca" = "baca")
        primary += 'F'; alternate += 'P'; pos += 1;
        break;

      case 'W':
        if ('AEIOU'.includes(charAt(pos + 1))) {
          primary += 'A'; alternate += 'F'; pos += 1;
        } else {
          pos++;
        }
        break;

      case 'X':
        // Spanish X can be S, KS, or H
        if (pos === 0) {
          primary += 'S'; alternate += 'S'; pos += 1;
        } else {
          primary += 'KS'; alternate += 'KS'; pos += 1;
        }
        break;

      case 'Y':
        primary += 'A'; alternate += 'A'; pos += 1;
        break;

      case 'Z':
        // Spanish Z = S (like "zapato" → S sound)
        primary += 'S'; alternate += 'S';
        pos += charAt(pos + 1) === 'Z' ? 2 : 1;
        break;

      default:
        // Skip vowels in middle/end positions and unknown chars
        pos++;
        break;
    }
  }

  return [primary.slice(0, maxLen), alternate.slice(0, maxLen)];
}

/**
 * Check if two words match phonetically via Double Metaphone.
 * Returns true if ANY pair of codes matches:
 *   primary(a) == primary(b) OR primary(a) == alternate(b)
 *   OR alternate(a) == primary(b) OR alternate(a) == alternate(b)
 *
 * @param a - First word (normalized/uppercased)
 * @param b - Second word (normalized/uppercased)
 * @returns true if phonetically equivalent
 */
export function doubleMetaphoneMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a === b) return true;
  const [pa, aa] = doubleMetaphone(a);
  const [pb, ab] = doubleMetaphone(b);
  if (!pa || !pb) return false;
  return pa === pb || pa === ab || aa === pb || aa === ab;
}

/**
 * Score how well two tokens match phonetically (0–1).
 * Uses code prefix overlap for partial phonetic similarity.
 *
 * @param a - First word
 * @param b - Second word
 * @returns Phonetic similarity score (1.0 = identical codes, 0.0 = no overlap)
 */
export function doubleMetaphoneScore(a: string, b: string): number {
  if (typeof a !== 'string' || typeof b !== 'string') return 0;
  if (a === b) return 1;
  const [pa, aa] = doubleMetaphone(a);
  const [pb, ab] = doubleMetaphone(b);
  if (!pa || !pb) return 0;

  // Find best match across all code combinations
  let best = 0;
  for (const ca of [pa, aa]) {
    for (const cb of [pb, ab]) {
      if (!ca || !cb) continue;
      if (ca === cb) return 1;
      // Prefix overlap score
      const minLen = Math.min(ca.length, cb.length);
      let shared = 0;
      for (let i = 0; i < minLen; i++) {
        if (ca[i] === cb[i]) shared++;
        else break;
      }
      const score = shared / Math.max(ca.length, cb.length);
      if (score > best) best = score;
    }
  }
  return best;
}
