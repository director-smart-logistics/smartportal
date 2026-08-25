import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EN_DIR = join(__dirname, '../../../../i18n/en');
const ES_DIR = join(__dirname, '../../../../i18n/es');

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadJson(dir: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, file), 'utf-8'));
}

/** Returns flat [dotPath, value] pairs by recursing into nested objects. */
function flatEntries(obj: Record<string, unknown>, prefix = ''): Array<[string, unknown]> {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? flatEntries(v as Record<string, unknown>, path)
      : [[path, v] as [string, unknown]];
  });
}

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return flatEntries(obj, prefix).map(([k]) => k);
}

function duplicateKeys(jsonStr: string): string[] {
  // Stack-based approach: each object gets its own Set so nested objects
  // with same key names are NOT flagged (only true same-scope duplicates are).
  const dups = new Set<string>();
  const stack: Set<string>[] = [];
  let i = 0;
  const n = jsonStr.length;

  while (i < n) {
    const ch = jsonStr[i];
    if (ch === '{' || ch === '[') { stack.push(new Set<string>()); i++; continue; }
    if (ch === '}' || ch === ']') { stack.pop(); i++; continue; }
    if (ch === '"') {
      i++; // skip opening quote
      let str = '';
      while (i < n) {
        if (jsonStr[i] === '\\') { i++; if (i < n) { str += jsonStr[i]; i++; } continue; }
        if (jsonStr[i] === '"') { i++; break; }
        str += jsonStr[i]; i++;
      }
      // skip whitespace then check for ':'
      let j = i;
      while (j < n && ' \t\n\r'.includes(jsonStr[j])) j++;
      if (j < n && jsonStr[j] === ':') {
        const scope = stack[stack.length - 1];
        if (scope) { if (scope.has(str)) dups.add(str); scope.add(str); }
      }
      continue;
    }
    i++;
  }
  return [...dups];
}

// ── Load all namespace files ──────────────────────────────────────────────────
const enFiles  = readdirSync(EN_DIR).filter(f => f.endsWith('.json')).sort();
const esFiles  = readdirSync(ES_DIR).filter(f => f.endsWith('.json')).sort();

// ── Namespace file parity ─────────────────────────────────────────────────────
describe('i18n — namespace file parity', () => {
  it('en/ and es/ contain the same set of namespace files', () => {
    expect(enFiles).toEqual(esFiles);
  });

  it('both languages have at least 20 namespace files', () => {
    expect(enFiles.length).toBeGreaterThanOrEqual(20);
    expect(esFiles.length).toBeGreaterThanOrEqual(20);
  });
});

// ── Per-namespace key parity ──────────────────────────────────────────────────
describe('i18n — per-namespace key completeness', () => {
  for (const file of enFiles) {
    const en = loadJson(EN_DIR, file);
    const es = loadJson(ES_DIR, file);
    const enKeys = flatKeys(en).sort();
    const esKeys = flatKeys(es).sort();

    it(`[${file}] es/ has no extra keys missing from en/`, () => {
      const missing = esKeys.filter(k => !enKeys.includes(k));
      expect(missing, `Keys in es/${file} not in en/${file}: ${missing.join(', ')}`).toHaveLength(0);
    });

    it(`[${file}] en/ has no extra keys missing from es/`, () => {
      const missing = enKeys.filter(k => !esKeys.includes(k));
      expect(missing, `Keys in en/${file} not in es/${file}: ${missing.join(', ')}`).toHaveLength(0);
    });
  }
});

// ── No empty translations ─────────────────────────────────────────────────────
describe('i18n — no empty translation values', () => {
  for (const file of enFiles) {
    const en = loadJson(EN_DIR, file);
    const es = loadJson(ES_DIR, file);

    it(`[${file}] en/ has no empty string values`, () => {
      const empty = flatEntries(en).filter(([, v]) => v === '').map(([k]) => k);
      expect(empty, `Empty strings in en/${file}: ${empty.join(', ')}`).toHaveLength(0);
    });

    it(`[${file}] es/ has no empty string values`, () => {
      const empty = flatEntries(es).filter(([, v]) => v === '').map(([k]) => k);
      expect(empty, `Empty strings in es/${file}: ${empty.join(', ')}`).toHaveLength(0);
    });
  }
});

// ── Duplicate key guard (scanner.json has a known duplicate) ──────────────────
describe('i18n — no duplicate keys in JSON files', () => {
  for (const file of enFiles) {
    it(`[en/${file}] has no duplicate keys`, () => {
      const raw = readFileSync(join(EN_DIR, file), 'utf-8');
      const dups = duplicateKeys(raw);
      expect(dups, `Duplicate keys in en/${file}: ${dups.join(', ')}`).toHaveLength(0);
    });
  }

  for (const file of esFiles) {
    it(`[es/${file}] has no duplicate keys`, () => {
      const raw = readFileSync(join(ES_DIR, file), 'utf-8');
      const dups = duplicateKeys(raw);
      expect(dups, `Duplicate keys in es/${file}: ${dups.join(', ')}`).toHaveLength(0);
    });
  }
});

// ── Scanner namespace — specific regression guards ────────────────────────────
describe('i18n — scanner.json specific contracts', () => {
  const enScanner = loadJson(EN_DIR, 'scanner.json');
  const esScanner = loadJson(ES_DIR, 'scanner.json');

  const required = [
    'title', 'scanning', 'processing', 'success', 'error',
    'packageFound', 'packageNotFound', 'tracking', 'status',
    'confirmIntake', 'errorTitle',
  ];

  for (const key of required) {
    it(`en/scanner.json has required key: "${key}"`, () => {
      expect(enScanner).toHaveProperty(key);
    });

    it(`es/scanner.json has required key: "${key}"`, () => {
      expect(esScanner).toHaveProperty(key);
    });
  }

  it('es/scanner.json "title" is translated (not same as en)', () => {
    expect((esScanner as any).title).not.toBe((enScanner as any).title);
  });
});
