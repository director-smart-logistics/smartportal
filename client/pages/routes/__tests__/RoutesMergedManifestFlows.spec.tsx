// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ROUTES - MEGA-MAN & MERGED MANIFEST QUERY RESOLUTION', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Simulated package query searchTerms builder matching RoutesManagement.tsx
  function buildRouteSearchTerms(
    manifestFilter: string,
    manifestsFullData: Array<{
      id: string;
      manifestNumber: string;
      mergedInto?: string;
      fusedManifests?: string[];
      fusedFrom?: string[];
    }>
  ) {
    const searchTerms: string[] = [];
    if (!manifestFilter) return searchTerms;

    searchTerms.push(manifestFilter);
    const originalManifest = manifestsFullData.find(
      m => m.id === manifestFilter || m.manifestNumber === manifestFilter
    );

    if (originalManifest) {
      const origVal = originalManifest.manifestNumber || originalManifest.id;
      if (origVal && !searchTerms.includes(origVal)) {
        searchTerms.push(origVal);
      }
      if (originalManifest.mergedInto && !searchTerms.includes(originalManifest.mergedInto)) {
        searchTerms.push(originalManifest.mergedInto);
      }
      if (Array.isArray(originalManifest.fusedManifests)) {
        originalManifest.fusedManifests.forEach((fm: string) => {
          if (fm && !searchTerms.includes(fm)) searchTerms.push(fm);
        });
      }
      if (Array.isArray(originalManifest.fusedFrom)) {
        originalManifest.fusedFrom.forEach((fm: string) => {
          if (fm && !searchTerms.includes(fm)) searchTerms.push(fm);
        });
      }
    }

    return searchTerms;
  }

  // Simulated sub-manifest filtering when operator selects a merged sub-manifest directly
  function filterPackagesForSubManifest(
    packages: any[],
    manifestFilter: string,
    originalManifest?: { mergedInto?: string; packages?: any[] }
  ) {
    if (!originalManifest?.mergedInto || originalManifest.mergedInto === manifestFilter) {
      return packages;
    }

    const subTarget = manifestFilter.trim().toLowerCase();
    const manifestPkgTrackings = new Set(
      (originalManifest.packages || [])
        .map((p: any) => String(p.tracking || p.trackingNumber || '').toUpperCase().trim())
        .filter(Boolean)
    );

    return packages.filter((p: any) => {
      const pOrig = String(p.originalManifest || p.originalManifestID || p.originManifest || p.manifiesto || '').trim().toLowerCase();
      const pMn = String(p.manifestNumber || '').trim().toLowerCase();
      const pTrack = String(p.tracking || p.trackingNumber || p.id || '').toUpperCase().trim();
      return pOrig === subTarget || pMn === subTarget || (manifestPkgTrackings.size > 0 && manifestPkgTrackings.has(pTrack));
    });
  }

  it('builds comprehensive searchTerms for MEGA-MAN querying in RoutesManagement', () => {
    const manifests = [
      {
        id: 'SL-MEGA-MAN-10-09-2026',
        manifestNumber: 'SL-MEGA-MAN-10-09-2026',
        fusedManifests: ['10-09-2026', '10-09-2026DANP'],
      },
    ];

    const terms = buildRouteSearchTerms('SL-MEGA-MAN-10-09-2026', manifests);
    expect(terms).toContain('SL-MEGA-MAN-10-09-2026');
    expect(terms).toContain('10-09-2026');
    expect(terms).toContain('10-09-2026DANP');
  });

  it('filters sub-manifest packages accurately when querying a merged manifest', () => {
    const originalManifest = {
      mergedInto: 'SL-MEGA-MAN-10-09-2026',
      packages: [{ tracking: 'TRACK-DANP-1' }],
    };

    const allMergedPackages = [
      { id: '1', tracking: 'TRACK-DANP-1', manifestNumber: 'SL-MEGA-MAN-10-09-2026', originalManifest: '10-09-2026DANP' },
      { id: '2', tracking: 'TRACK-REG-2', manifestNumber: 'SL-MEGA-MAN-10-09-2026', originalManifest: '10-09-2026' },
    ];

    const subFiltered = filterPackagesForSubManifest(allMergedPackages, '10-09-2026DANP', originalManifest);
    expect(subFiltered.length).toBe(1);
    expect(subFiltered[0].tracking).toBe('TRACK-DANP-1');
  });
});
