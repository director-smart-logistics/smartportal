/**
 * SP1 functions must reach the REAL SP2 in production, and the emulated SP2 only
 * inside the Firebase emulator. A stray SP2_PROJECT_ID in production is ignored.
 */
import { describe, it, expect } from 'vitest';
import { sp2ProjectId, SP2_PRODUCTION_PROJECT_ID } from '../src/config/sp2-target';

describe('sp2ProjectId', () => {
  it('production (no emulator) → smart-portal-2', () => {
    expect(sp2ProjectId({})).toBe('smart-portal-2');
    expect(SP2_PRODUCTION_PROJECT_ID).toBe('smart-portal-2');
  });
  it('production with a stray SP2_PROJECT_ID → still smart-portal-2', () => {
    expect(sp2ProjectId({ SP2_PROJECT_ID: 'demo-sp-qa' })).toBe('smart-portal-2');
    expect(sp2ProjectId({ SP2_PROJECT_ID: 'demo-sp-qa', FUNCTIONS_EMULATOR: 'false' })).toBe('smart-portal-2');
  });
  it('emulator without override → smart-portal-2 (the emulator itself keeps it local)', () => {
    expect(sp2ProjectId({ FUNCTIONS_EMULATOR: 'true' })).toBe('smart-portal-2');
  });
  it('emulator with override → the emulated SP2 project', () => {
    expect(sp2ProjectId({ FUNCTIONS_EMULATOR: 'true', SP2_PROJECT_ID: 'demo-sp-qa' })).toBe('demo-sp-qa');
  });
});
