import { describe, it, expect } from 'vitest';

/**
 * Mirror of the canonical isTransitoria logic from Cloud Functions and useConsolidationData.
 */
function isTransitoria(pkg: {
  manifestId?: string | null;
  manifestNumber?: string | null;
  manifiesto?: string | null;
  updatedManifest?: string | null;
}): boolean {
  if (!pkg) return false;
  const uMf  = String(pkg.updatedManifest || '').trim().toLowerCase();
  const mId  = String(pkg.manifestId || '').trim().toLowerCase();
  const mNum = String(pkg.manifestNumber || '').trim().toLowerCase();
  const mnf  = String(pkg.manifiesto || '').trim().toLowerCase();
  
  // Priority: updatedManifest (most recent operational/manual move) > manifestId > manifestNumber > manifiesto
  if (uMf) return uMf === 'consolidacion_transitoria';
  if (mId) return mId === 'consolidacion_transitoria';
  if (mNum) return mNum === 'consolidacion_transitoria';
  return mnf === 'consolidacion_transitoria';
}

describe('Manifest Priority Hierarchy & isTransitoria Invariant Guards', () => {
  it('returns TRUE when a package was moved to consolidacion_transitoria via updatedManifest', () => {
    const pkg = {
      manifestId: '18-09-2026DAN',
      manifestNumber: '18-09-2026DAN',
      manifiesto: '18-09-2026DAN',
      updatedManifest: 'consolidacion_transitoria',
    };

    expect(isTransitoria(pkg)).toBe(true);
  });

  it('returns FALSE when a package was moved from transitoria to a new real manifest via updatedManifest', () => {
    const pkg = {
      manifestId: 'consolidacion_transitoria',
      manifestNumber: 'consolidacion_transitoria',
      manifiesto: 'consolidacion_transitoria',
      updatedManifest: '22-09-2026DAN',
    };

    expect(isTransitoria(pkg)).toBe(false);
  });

  it('returns TRUE when manifestId is explicitly consolidacion_transitoria and updatedManifest is empty', () => {
    const pkg = {
      manifestId: 'consolidacion_transitoria',
      manifestNumber: '08-09-2026DAN',
      manifiesto: '08-09-2026DAN',
      updatedManifest: '',
    };

    expect(isTransitoria(pkg)).toBe(true);
  });

  it('returns FALSE for legacy packages with only manifestNumber set to a real manifest', () => {
    const pkg = {
      manifestNumber: 'SL-MEGA-MAN-10-09-2026',
    };

    expect(isTransitoria(pkg)).toBe(false);
  });

  it('returns TRUE for legacy packages with only manifiesto set to consolidacion_transitoria', () => {
    const pkg = {
      manifiesto: 'consolidacion_transitoria',
    };

    expect(isTransitoria(pkg)).toBe(true);
  });

  it('returns TRUE when only updatedManifest is present and is consolidacion_transitoria', () => {
    const pkg = {
      updatedManifest: 'consolidacion_transitoria',
    };

    expect(isTransitoria(pkg)).toBe(true);
  });

  it('returns FALSE for brand new package in a real manifest with no prior transitoria', () => {
    const pkg = {
      manifestId: '22-09-2026DAN',
      manifestNumber: '22-09-2026DAN',
      manifiesto: '22-09-2026DAN',
      updatedManifest: '22-09-2026DAN',
    };

    expect(isTransitoria(pkg)).toBe(false);
  });
});
