/**
 * Matching Engine — Normalization & Token Utilities
 *
 * Text normalization, Spanish phonetic key generation, name token helpers,
 * stopword filtering, abbreviation/apodo dictionary, and permutation cache.
 *
 * All functions are **pure** (except caches, which are transparent) and
 * safe to call from any module without side-effects.
 *
 * @module matching/normalize
 */

import { areDistinctGivenNames } from './gender-name-guard';

// ─── Per-run caches ─────────────────────────────────────────────────────────────

const normalizeCache = new Map<string, string>();
const phoneticKeyCache = new Map<string, string>();

/**
 * Clear per-batch caches. Called at the start of each batch matching run
 * to prevent stale entries from accumulating unbounded.
 */
export function clearNormalizeCaches(): void {
  if (normalizeCache.size > 5000) normalizeCache.clear();
  if (phoneticKeyCache.size > 2000) phoneticKeyCache.clear();
}

// ─── Normalize ──────────────────────────────────────────────────────────────────

/**
 * Normalize text: uppercase → NFD accent strip → remove special chars → collapse spaces.
 * Result is cached per input string.
 */
export function normalize(text: string): string {
  if (typeof text !== 'string') return '';
  const cached = normalizeCache.get(text);
  if (cached !== undefined) return cached;
  const result = text
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
  normalizeCache.set(text, result);
  return result;
}

// ─── Name Sanitizer ────────────────────────────────────────────────────────────

/**
 * Patterns that indicate a date or numeric suffix accidentally concatenated
 * to a customer name during import (e.g. "GERARDO SOLANO06-05-2026").
 *
 * Applied **before** normalize() so the matching engine never sees the garbage.
 */
const DATE_SUFFIX_PATTERNS: RegExp[] = [
  // DD-MM-YYYY or MM-DD-YYYY with separators: 06-05-2026, 5/8/2026
  /\s?\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/,
  // DDMMYYYY or MMDDYYYY no separator: 06052026
  /\d{6,8}$/,
  // Loose trailing digits ≥ 4 not preceded by a letter (e.g. name1234)
  /(?<![A-Za-z])\d{4,}$/,
];

/**
 * Strip date/numeric suffixes accidentally appended to a customer name.
 * Always call this BEFORE normalize() inside the matching pipeline.
 *
 * @example
 * sanitizeName("GERARDO SOLANO CARTIN06-05-2026") // → "GERARDO SOLANO CARTIN"
 * sanitizeName("MARIA JOSE 20260508")              // → "MARIA JOSE"
 * sanitizeName("CARLOS MENDEZ")                    // → "CARLOS MENDEZ" (unchanged)
 */
export function sanitizeName(raw: string): string {
  let name = raw.trim();
  for (const pattern of DATE_SUFFIX_PATTERNS) {
    name = name.replace(pattern, '').trim();
  }
  return name;
}

// ─── Stopwords ──────────────────────────────────────────────────────────────────

/**
 * Spanish stopwords / connector words to ignore during token matching.
 * These carry no discriminating value for name identity.
 */
export const NAME_STOPWORDS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'DA', 'DAS', 'DO', 'DOS',
]);

/**
 * Filter meaningful tokens: length ≥ 2 AND not a stopword.
 * Use this anywhere you need the "real" name tokens for scoring.
 */
export function meaningfulTokens(parts: string[]): string[] {
  if (!Array.isArray(parts)) return [];
  return parts.filter(p => typeof p === 'string' && p.length >= 2 && !NAME_STOPWORDS.has(p));
}

// ─── Phonetic Key ───────────────────────────────────────────────────────────────

/**
 * Spanish phonetic key: normalize common phonetic equivalences.
 * QU/K → C, V → B, LL → Y, Z → S, X → CS, H removed, collapse repeats.
 * Result is cached per token.
 */
export function phoneticKey(token: string): string {
  if (typeof token !== 'string') return '';
  const cached = phoneticKeyCache.get(token);
  if (cached !== undefined) return cached;
  const result = token
    .replace(/QU|K/g, 'C')
    .replace(/V/g, 'B')
    .replace(/LL/g, 'Y')
    .replace(/Z/g, 'S')
    .replace(/X/g, 'CS')
    .replace(/H/g, '')
    .replace(/([AEIOU])\1+/g, '$1')
    .replace(/(.)\1+/g, '$1');
  phoneticKeyCache.set(token, result);
  return result;
}

// ─── Name Parts ─────────────────────────────────────────────────────────────────

/**
 * Split a name into first/last/parts after normalizing.
 */
export function getNameParts(name: string): { firstName: string; lastName: string; parts: string[] } {
  const normalized = normalize(name);
  const parts = normalized.split(' ').filter(p => p.length > 0);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    parts
  };
}

// ─── Abbreviation Dictionary ────────────────────────────────────────────────────

/**
 * Common name abbreviations AND Costa Rican apodos/nicknames → canonical full names.
 * Used to expand short/nickname forms before algorithmic matching so we avoid
 * unnecessary AI calls for very common CR naming patterns.
 *
 * Rules for `isAbbreviationOf()`:
 *   - If `full.startsWith(abbrev)` → true (prefix match)
 *   - If `NAME_ABBREVIATIONS[abbrev].includes(full)` → true (dictionary match)
 */
export const NAME_ABBREVIATIONS: Record<string, string[]> = {
  // ── Prefix abbreviations ────────────────────────────────────────────────────
  'STEPH': ['STEPHANIE', 'STEPHEN'],
  'STIVEN': ['STEVEN', 'STEPHEN'],
  'CRIS': ['CRISTINA', 'CRISTOPHER', 'CRISTIAN', 'CRISTA'],
  'CHRIS': ['CRISTOPHER', 'CHRISTOPHER', 'CRISTIAN'],
  'ALEX': ['ALEXANDER', 'ALEJANDRO', 'ALEXIS', 'ALEXA'],
  'ANDY': ['ANDRES', 'ANDREA'],
  'ANGI': ['ANGELA', 'ANGELICA'],
  'BETO': ['ROBERTO', 'ALBERTO', 'HERIBERTO'],
  'CARO': ['CAROLINA', 'CAROLA'],
  'DANI': ['DANIELA', 'DANIEL'],
  'FERN': ['FERNANDO', 'FERNANDA'],
  'GABY': ['GABRIELA', 'GABRIEL'],
  'GIO': ['GIOVANNI', 'GIORGIA'],
  'GUILLE': ['GUILLERMO'],
  'JOSE': ['JOSEFINA', 'JOSE'],
  'KARI': ['KARINA', 'KARLA'],
  'KARO': ['KAROLINE', 'CAROLINA'],
  'LILI': ['LILIANA'],
  'MARI': ['MARIA', 'MARIELA', 'MARIANA'],
  'MELI': ['MELISSA', 'MELANIE'],
  'MONI': ['MONICA'],
  'NATI': ['NATALIA', 'NATASHA'],
  'PATI': ['PATRICIA'],
  'RAFA': ['RAFAEL'],
  'ROBE': ['ROBERTO'],
  'SAMI': ['SAMANTHA', 'SAMUEL'],
  'SANTI': ['SANTIAGO'],
  'VALE': ['VALERIA', 'VALENTINA'],
  'VERO': ['VERONICA'],
  'VICKI': ['VICTORIA'],
  'WILLE': ['WILBER', 'WILBERTH'],
  // ── Costa Rican apodos/nicknames (not prefix-based) ─────────────────────────
  // These are completely different words → must be in dictionary for matching to work.
  'PEPE': ['JOSE'],
  'PACO': ['FRANCISCO'],
  'PANCHO': ['FRANCISCO'],
  'NACHO': ['IGNACIO'],
  'CHEMA': ['JOSE', 'JOSEMARIA'],
  'CHAGO': ['SANTIAGO'],
  'TONO': ['ANTONIO'],
  'TOÑO': ['ANTONIO'],
  'TONI': ['ANTONIO'],
  'MEMO': ['GUILLERMO', 'MEMPHIS'],
  'LUPE': ['GUADALUPE', 'MARIA'],
  'LUPITA': ['GUADALUPE'],
  'KIKE': ['ENRIQUE'],
  'QUIQUE': ['ENRIQUE'],
  'LALO': ['EDUARDO', 'GERARDO'],
  'FITO': ['ALFREDO'],
  'CHECO': ['SERGIO'],
  'NETO': ['ERNESTO', 'ROBERTO'],
  'GOYO': ['GREGORIO'],
  'YAYO': ['GERARDO'],
  'MANOLO': ['MANUEL'],
  'NANDO': ['FERNANDO'],
  'BERNI': ['BERNARDO'],
  'TETE': ['TERESA'],
  'LINA': ['CATALINA'],
  'TITA': ['MARGARITA'],
  'PILI': ['PILAR'],
  'MEME': ['MERCEDES'],
  'NENA': ['ELENA', 'IRENE'],
  'PONCHO': ['ALFONSO', 'ALFONZO'],
  'CHALO': ['GONZALO'],
  'CUCO': ['REFUGIO'],
  'CUCA': ['REFUGIO'],
  'JUANCHO': ['JUAN'],
  'YEYO': ['SERGIO'],
  'TETO': ['ERNESTO'],
  'KETO': ['HERIBERTO'],
  'BICHI': ['EUGENIO'],
  'CHACHA': ['ROSARIO'],
  'CHACHI': ['ROSARIO'],
  'LICHA': ['ALICIA', 'FELICIA'],
  'LENCHO': ['LORENZO'],
  'LENCHITO': ['LORENZO'],
  'MAGUE': ['MARGARITA'],
  'CHACHO': ['IGNACIO'],
  'YOYO': ['JORGE'],
  'COLO': ['NICOLAS'],
  'TICO': ['PATRICIO'],
  'TRINI': ['TRINIDAD'],
  'CONCHO': ['CONCEPCION'],
  'GATO': ['ARMANDO'],
  'CHUS': ['JESUS'],
  'XICO': ['FRANCISCO'],
};

/**
 * Check if a token is an abbreviation of another token.
 * e.g. STEPH → STEPHANIE, JOSE → JOSEFINA, PEPE → JOSE (via dictionary)
 */
export function isAbbreviationOf(abbrev: string, full: string): boolean {
  if (typeof abbrev !== 'string' || typeof full !== 'string' || !abbrev || !full) return false;
  if (areDistinctGivenNames(abbrev, full)) return false;
  if (full.startsWith(abbrev) && abbrev.length >= 3 && full.length > abbrev.length) return true;
  const expansions = NAME_ABBREVIATIONS[abbrev];
  if (expansions) return expansions.includes(full);
  return false;
}

// ─── Permutation Utilities ──────────────────────────────────────────────────────

/**
 * Per-batch permutation cache. Cleared at the start of each batch run.
 */
export const permutationCache = new Map<string, string[][]>();

/**
 * Generates all permutations of an array of tokens (for name order variations).
 * Capped at 4 tokens to avoid combinatorial explosion (4! = 24, 5! = 120).
 */
export function tokenPermutations(parts: string[]): string[][] {
  if (parts.length <= 1) return [parts];
  if (parts.length > 4) return [parts, [...parts].reverse()];
  const result: string[][] = [];
  for (let i = 0; i < parts.length; i++) {
    const rest = [...parts.slice(0, i), ...parts.slice(i + 1)];
    for (const perm of tokenPermutations(rest)) {
      result.push([parts[i], ...perm]);
    }
  }
  return result;
}
