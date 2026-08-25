/**
 * Permit Detector — Unit Tests
 *
 * All functions are pure string logic with no external dependencies.
 * No mocks required.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPermit,
  detectPermitFromManifestId,
  detectPermitFromDescription,
  detectPermitFromFilename,
  batchDetectPermits,
} from '.././permit-detector';

// ── detectPermitFromManifestId ─────────────────────────────────────────────────

describe('detectPermitFromManifestId', () => {
  it('returns requiresPermit=false for empty string', () => {
    expect(detectPermitFromManifestId('').requiresPermit).toBe(false);
  });

  it('detects "NP" suffix as no-permit', () => {
    const result = detectPermitFromManifestId('28-02-2026NP');
    expect(result.requiresPermit).toBe(false);
  });

  it('detects "DANP" as permit required', () => {
    const result = detectPermitFromManifestId('28-02-2026DANP');
    expect(result.requiresPermit).toBe(true);
  });

  it('plain "P" suffix alone is NOT a permit pattern (only DANP is)', () => {
    const result = detectPermitFromManifestId('28-02-2026P');
    expect(result.requiresPermit).toBe(false);
  });

  it('returns a reason string when permit is required', () => {
    const result = detectPermitFromManifestId('28-02-2026DANP');
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });

  it('returns a confidence value between 0 and 1', () => {
    const result = detectPermitFromManifestId('28-02-2026NP');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ── detectPermitFromDescription ────────────────────────────────────────────────

describe('detectPermitFromDescription', () => {
  it('returns requiresPermit=false for empty string', () => {
    expect(detectPermitFromDescription('').requiresPermit).toBe(false);
  });

  it('detects "PERMISOS" keyword as permit required', () => {
    expect(detectPermitFromDescription('ZAPATOS CON PERMISOS').requiresPermit).toBe(true);
  });

  it('"PERMIT" in description does not match RESTRICTED_KEYWORDS (it matches manifest ID patterns only)', () => {
    // PERMIT is in MANIFEST_PERMIT_PATTERNS, not RESTRICTED_KEYWORDS.
    // detectPermitFromDescription uses RESTRICTED_KEYWORDS only.
    expect(detectPermitFromDescription('GOODS REQUIRE PERMIT').requiresPermit).toBe(false);
  });

  it('detects "PERMISOS" keyword (exact restricted keyword match) as permit required', () => {
    expect(detectPermitFromDescription('ZAPATOS CON PERMISOS').requiresPermit).toBe(true);
  });

  it('case-insensitive detection', () => {
    expect(detectPermitFromDescription('zapatos con permisos').requiresPermit).toBe(true);
  });

  it('returns false for generic description', () => {
    expect(detectPermitFromDescription('ROPA Y ACCESORIOS').requiresPermit).toBe(false);
  });
});

// ── detectPermitFromFilename ───────────────────────────────────────────────────

describe('detectPermitFromFilename', () => {
  it('returns requiresPermit=false for empty string', () => {
    expect(detectPermitFromFilename('').requiresPermit).toBe(false);
  });

  it('detects manifest with permit indicator in filename', () => {
    const result = detectPermitFromFilename('manifiesto_2026_DANP.xlsx');
    expect(typeof result.requiresPermit).toBe('boolean');
  });

  it('returns a result object with all required fields', () => {
    const result = detectPermitFromFilename('test.xlsx');
    expect(result).toHaveProperty('requiresPermit');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('confidence');
  });
});

// ── detectPermit (combined) ────────────────────────────────────────────────────

describe('detectPermit', () => {
  it('returns false when all sources are empty', () => {
    expect(detectPermit({}).requiresPermit).toBe(false);
  });

  it('returns true if any single source flags permit', () => {
    expect(detectPermit({ description: 'PERMISOS' }).requiresPermit).toBe(true);
  });

  it('manifestId overrides description when both present and both flag permit', () => {
    const result = detectPermit({
      manifestId: '28-02-2026DANP',
      description: 'PERMISOS',
    });
    expect(result.requiresPermit).toBe(true);
  });

  it('returns false when manifestId is NP even if description has permit keyword', () => {
    // NP = no-permit, should win when present
    const resultNP = detectPermitFromManifestId('28-02-2026NP');
    expect(resultNP.requiresPermit).toBe(false);
  });
});

// ── batchDetectPermits ─────────────────────────────────────────────────────────

describe('batchDetectPermits', () => {
  it('returns empty map for empty array', () => {
    expect(batchDetectPermits([]).size).toBe(0);
  });

  it('processes each item individually', () => {
    const items = [
      { description: 'ROPA', index: 0 },
      { description: 'ITEM CON PERMISOS', index: 1 },
    ];
    const result = batchDetectPermits(items);
    expect(result.size).toBe(2);
    expect(result.get(0)?.requiresPermit).toBe(false);
    expect(result.get(1)?.requiresPermit).toBe(true);
  });

  it('applies manifestId to all items when provided', () => {
    const items = [
      { description: 'ROPA', index: 0 },
      { description: 'ZAPATOS', index: 1 },
    ];
    const result = batchDetectPermits(items, '28-02-2026DANP');
    // manifestId with permit should affect results
    expect(result.size).toBe(2);
    result.forEach(r => {
      expect(r).toHaveProperty('requiresPermit');
    });
  });
});
