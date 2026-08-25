import { describe, it, expect } from 'vitest';

/**
 * manifest-supplement-loader.spec.ts
 *
 * Automated regression test to verify that candidate supplements whose manifest assignment
 * in the database collection has diverged from the active manifest or its sources
 * are excluded during the Nova loading/fusion process.
 *
 * This covers:
 *  - Courier manifests (where we verify against manifestNumber).
 *  - Encomienda manifests (where we verify against encomiendaManifestNumber).
 *  - Draft packages (which are not in the collection and must be kept).
 *  - Blacklisted/deleted trackings (which must be excluded).
 *  - Already-loaded collection trackings (which must be excluded to prevent duplicates).
 *  - Case-insensitive checks.
 */
describe('Nova Manifest Supplement Loader Regression Test Suite', () => {

  // Helper simulating the filter logic in fusion.ts
  function filterSupplements({
    candidates,
    deletedTrackingsSet,
    mergedTrackingSet,
    trackingToManifestMap,
    megaManId,
    searchTerms,
    isMegaContainer
  }: {
    candidates: any[];
    deletedTrackingsSet: Set<string>;
    mergedTrackingSet: Set<string>;
    trackingToManifestMap: Map<string, string>;
    megaManId: string;
    searchTerms: string[];
    isMegaContainer: boolean;
  }) {
    const targetMnSet = new Set([
      megaManId.toUpperCase(),
      ...searchTerms.map(s => s.toUpperCase())
    ]);

    const isEncomiendaMn = megaManId.toUpperCase().startsWith('ENC-');

    // 1. Initial filter for unlinked, deleted, and encomienda-route stubs
    const initialCandidates = candidates.filter(p => {
      const trk = String(p.tracking || p.guia || p.trackingNumber || '').toUpperCase().trim();
      if (deletedTrackingsSet.has(trk)) return false;
      if (mergedTrackingSet.has(trk)) return false;
      if (!isMegaContainer) {
        const pRuta = String(p.ruta || '').trim();
        const pEncMn = String(p.encomiendaManifestNumber || '').toUpperCase();
        if (pRuta === 'Encomiendas' || pEncMn.startsWith('ENC-MEGA-MAN-')) {
          return false;
        }
      }
      return true;
    });

    // 2. Database collection status filter
    return initialCandidates.filter(p => {
      const trk = String(p.tracking || p.guia || p.trackingNumber || '').toUpperCase().trim();
      if (!trackingToManifestMap.has(trk)) return true; // Draft rows not in collection are kept
      
      const currentMn = (trackingToManifestMap.get(trk) || '').toUpperCase();
      if (currentMn === 'CONSOLIDACION_TRANSITORIA') return false;
      
      if (isEncomiendaMn) {
        const currentEncMn = (trackingToManifestMap.get(trk + '_ENC') || '').toUpperCase();
        return currentEncMn === megaManId.toUpperCase();
      } else {
        return targetMnSet.has(currentMn);
      }
    });
  }

  it('filters out candidate supplements whose active manifestNumber has diverged in Courier manifests', () => {
    const trackingToManifestMap = new Map<string, string>([
      ['TRACKING_ACTIVE', 'SL-MEGA-MAN-05-08-2026'],
      ['TRACKING_ANNULLED_TRANSITORIA', 'consolidacion_transitoria'],
      ['TRACKING_REASSIGNED_OTHER', '06-08-2026DAN'],
      ['TRACKING_ACTIVE_SOURCE', '03-08-2026DAN']
    ]);

    const result = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_ACTIVE' },
        { tracking: 'TRACKING_ANNULLED_TRANSITORIA' },
        { tracking: 'TRACKING_REASSIGNED_OTHER' },
        { tracking: 'TRACKING_ACTIVE_SOURCE' }
      ],
      deletedTrackingsSet: new Set(),
      mergedTrackingSet: new Set(),
      trackingToManifestMap,
      megaManId: 'SL-MEGA-MAN-05-08-2026',
      searchTerms: ['03-08-2026DAN'],
      isMegaContainer: true
    });

    expect(result).toHaveLength(2);
    expect(result.map(r => r.tracking)).toEqual(['TRACKING_ACTIVE', 'TRACKING_ACTIVE_SOURCE']);
  });

  it('filters out candidate supplements whose active encomiendaManifestNumber has diverged in Encomienda manifests', () => {
    const trackingToManifestMap = new Map<string, string>([
      ['TRACKING_ACTIVE_ENC', '03-08-2026DAN'],
      ['TRACKING_ACTIVE_ENC_ENC', 'ENC-MEGA-MAN-03-08-2026'],
      ['TRACKING_ANNULLED_ENC', 'consolidacion_transitoria'],
      ['TRACKING_ANNULLED_ENC_ENC', 'none'],
      ['TRACKING_REASSIGNED_OTHER_ENC', '03-08-2026DAN'],
      ['TRACKING_REASSIGNED_OTHER_ENC_ENC', 'ENC-MEGA-MAN-99-09-2026']
    ]);

    const result = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_ACTIVE_ENC' },
        { tracking: 'TRACKING_ANNULLED_ENC' },
        { tracking: 'TRACKING_REASSIGNED_OTHER_ENC' }
      ],
      deletedTrackingsSet: new Set(),
      mergedTrackingSet: new Set(),
      trackingToManifestMap,
      megaManId: 'ENC-MEGA-MAN-03-08-2026',
      searchTerms: ['03-08-2026DAN'],
      isMegaContainer: true
    });

    expect(result).toHaveLength(1);
    expect(result[0].tracking).toBe('TRACKING_ACTIVE_ENC');
  });

  it('keeps draft packages that are in the snapshot but do not exist in the collection', () => {
    const trackingToManifestMap = new Map<string, string>([
      ['TRACKING_IN_DB', 'SL-MEGA-MAN-05-08-2026']
    ]);

    const result = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_IN_DB' },
        { tracking: 'TRACKING_DRAFT_NEW' } // Not in database map
      ],
      deletedTrackingsSet: new Set(),
      mergedTrackingSet: new Set(),
      trackingToManifestMap,
      megaManId: 'SL-MEGA-MAN-05-08-2026',
      searchTerms: [],
      isMegaContainer: true
    });

    expect(result).toHaveLength(2);
    expect(result.map(r => r.tracking)).toContain('TRACKING_DRAFT_NEW');
  });

  it('excludes blacklisted and deleted trackings immediately', () => {
    const trackingToManifestMap = new Map<string, string>();

    const result = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_DELETED' },
        { tracking: 'TRACKING_ACTIVE' }
      ],
      deletedTrackingsSet: new Set(['TRACKING_DELETED']),
      mergedTrackingSet: new Set(),
      trackingToManifestMap,
      megaManId: 'SL-MEGA-MAN-05-08-2026',
      searchTerms: [],
      isMegaContainer: true
    });

    expect(result).toHaveLength(1);
    expect(result[0].tracking).toBe('TRACKING_ACTIVE');
  });

  it('excludes trackings that are already loaded in mergedTrackingSet to avoid duplication', () => {
    const trackingToManifestMap = new Map<string, string>();

    const result = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_ALREADY_LOADED' },
        { tracking: 'TRACKING_ACTIVE' }
      ],
      deletedTrackingsSet: new Set(),
      mergedTrackingSet: new Set(['TRACKING_ALREADY_LOADED']),
      trackingToManifestMap,
      megaManId: 'SL-MEGA-MAN-05-08-2026',
      searchTerms: [],
      isMegaContainer: true
    });

    expect(result).toHaveLength(1);
    expect(result[0].tracking).toBe('TRACKING_ACTIVE');
  });

  it('handles case-insensitivity correctly for manifest comparisons', () => {
    const trackingToManifestMap = new Map<string, string>([
      ['TRACKING_LOWER_CASE', 'sl-mega-man-05-08-2026']
    ]);

    const result = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_LOWER_CASE' }
      ],
      deletedTrackingsSet: new Set(),
      mergedTrackingSet: new Set(),
      trackingToManifestMap,
      megaManId: 'SL-MEGA-MAN-05-08-2026',
      searchTerms: [],
      isMegaContainer: true
    });

    expect(result).toHaveLength(1);
    expect(result[0].tracking).toBe('TRACKING_LOWER_CASE');
  });

  it('excludes trackings in CONSOLIDACION_TRANSITORIA immediately regardless of manifest prefix (Courier or Encomiendas)', () => {
    const trackingToManifestMap = new Map<string, string>([
      ['TRACKING_TRANSITORIA_COURIER', 'CONSOLIDACION_TRANSITORIA'],
      ['TRACKING_TRANSITORIA_ENC', 'CONSOLIDACION_TRANSITORIA'],
      ['TRACKING_TRANSITORIA_ENC_ENC', 'ENC-MEGA-MAN-03-08-2026'] // global ENC still references old, but main is transitoria
    ]);

    const resultCourier = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_TRANSITORIA_COURIER' }
      ],
      deletedTrackingsSet: new Set(),
      mergedTrackingSet: new Set(),
      trackingToManifestMap,
      megaManId: 'SL-MEGA-MAN-05-08-2026',
      searchTerms: [],
      isMegaContainer: true
    });

    const resultEnc = filterSupplements({
      candidates: [
        { tracking: 'TRACKING_TRANSITORIA_ENC' }
      ],
      deletedTrackingsSet: new Set(),
      mergedTrackingSet: new Set(),
      trackingToManifestMap,
      megaManId: 'ENC-MEGA-MAN-03-08-2026',
      searchTerms: [],
      isMegaContainer: true
    });

    expect(resultCourier).toHaveLength(0);
    expect(resultEnc).toHaveLength(0);
  });
});
