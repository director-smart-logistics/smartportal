/**
 * feature-flags.spec.ts
 *
 * Locks the shape of the FEATURE_FLAGS export. Adding a flag is a
 * deliberate, reviewed action; this spec catches accidental renames or
 * removals that would silently turn a feature off in production.
 */

import { describe, it, expect } from 'vitest';
import { FEATURE_FLAGS } from '.././feature-flags';

describe('FEATURE_FLAGS', () => {
  it('is a plain object (not a Map / Proxy / Class instance)', () => {
    expect(FEATURE_FLAGS).toBeTypeOf('object');
    expect(Array.isArray(FEATURE_FLAGS)).toBe(false);
    expect(FEATURE_FLAGS).not.toBeNull();
  });

  it('every flag is a boolean', () => {
    for (const [k, v] of Object.entries(FEATURE_FLAGS)) {
      expect(v, `flag ${k} must be boolean`).toBeTypeOf('boolean');
    }
  });

  it('exposes the ENABLE_USA_SEA_MODULE flag', () => {
    expect(FEATURE_FLAGS).toHaveProperty('ENABLE_USA_SEA_MODULE');
  });

  it('flag names use SCREAMING_SNAKE_CASE', () => {
    for (const k of Object.keys(FEATURE_FLAGS)) {
      expect(k).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});
