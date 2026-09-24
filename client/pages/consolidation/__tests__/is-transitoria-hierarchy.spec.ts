import { describe, it, expect } from 'vitest';
import { isPackageTransitoria } from '../components/normalize-manifest';

// AUDIT NOTE (2026-09-23): this file used to re-implement isTransitoria as a
// local "mirror" function and assert against its own copy — the real
// production logic (inline inside useConsolidationData.ts's
// mapDocToPackage) was never exercised, so it could drift silently. Fixed
// by extracting the real logic into normalize-manifest.ts as
// isPackageTransitoria() and importing it here AND in useConsolidationData.ts.

describe('Manifest Priority Hierarchy & isTransitoria Invariant Guards', () => {
  it('returns TRUE when a package was moved to consolidacion_transitoria via updatedManifest', () => {
    const pkg = {
      manifestId: '18-09-2026DAN',
      manifestNumber: '18-09-2026DAN',
      manifiesto: '18-09-2026DAN',
      updatedManifest: 'consolidacion_transitoria',
    };

    expect(isPackageTransitoria(pkg)).toBe(true);
  });

  it('returns FALSE when a package was moved from transitoria to a new real manifest via updatedManifest', () => {
    const pkg = {
      manifestId: 'consolidacion_transitoria',
      manifestNumber: 'consolidacion_transitoria',
      manifiesto: 'consolidacion_transitoria',
      updatedManifest: '22-09-2026DAN',
    };

    expect(isPackageTransitoria(pkg)).toBe(false);
  });

  it('returns TRUE when manifestId is explicitly consolidacion_transitoria and updatedManifest is empty', () => {
    const pkg = {
      manifestId: 'consolidacion_transitoria',
      manifestNumber: '08-09-2026DAN',
      manifiesto: '08-09-2026DAN',
      updatedManifest: '',
    };

    expect(isPackageTransitoria(pkg)).toBe(true);
  });

  it('returns FALSE for legacy packages with only manifestNumber set to a real manifest', () => {
    const pkg = {
      manifestNumber: 'SL-MEGA-MAN-10-09-2026',
    };

    expect(isPackageTransitoria(pkg)).toBe(false);
  });

  it('returns TRUE for legacy packages with only manifiesto set to consolidacion_transitoria', () => {
    const pkg = {
      manifiesto: 'consolidacion_transitoria',
    };

    expect(isPackageTransitoria(pkg)).toBe(true);
  });

  it('returns TRUE when only updatedManifest is present and is consolidacion_transitoria', () => {
    const pkg = {
      updatedManifest: 'consolidacion_transitoria',
    };

    expect(isPackageTransitoria(pkg)).toBe(true);
  });

  it('returns FALSE for brand new package in a real manifest with no prior transitoria', () => {
    const pkg = {
      manifestId: '22-09-2026DAN',
      manifestNumber: '22-09-2026DAN',
      manifiesto: '22-09-2026DAN',
      updatedManifest: '22-09-2026DAN',
    };

    expect(isPackageTransitoria(pkg)).toBe(false);
  });

  it('returns FALSE for a null/undefined package (defensive)', () => {
    expect(isPackageTransitoria(null as any)).toBe(false);
    expect(isPackageTransitoria(undefined as any)).toBe(false);
  });
});
