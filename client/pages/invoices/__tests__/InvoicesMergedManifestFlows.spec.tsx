// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('INVOICES - MEGA-MAN & MERGED MANIFEST QUERY RESOLUTION', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Simulated Firestore query searchTerms builder matching Invoices.tsx
  function buildInvoiceSearchTerms(
    manifestFilter: string,
    manifestsData: Array<{
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
    const originalManifest = manifestsData.find(
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

  // Simulated filteredInvoices matching logic matching Invoices.tsx
  function filterInvoicesByManifest(
    invoices: any[],
    manifestFilter: string,
    manifestsData: any[]
  ) {
    if (!manifestFilter) return invoices;

    const allowedNumbers = new Set<string>();
    const trimmedTarget = manifestFilter.trim().toLowerCase();
    allowedNumbers.add(trimmedTarget);

    const mObj = manifestsData.find(
      m => m.id === manifestFilter || m.manifestNumber === manifestFilter
    );
    if (mObj) {
      if (mObj.manifestNumber) allowedNumbers.add(mObj.manifestNumber.trim().toLowerCase());
      if (mObj.id) allowedNumbers.add(mObj.id.trim().toLowerCase());
      if (mObj.mergedInto) allowedNumbers.add(mObj.mergedInto.trim().toLowerCase());
      if (Array.isArray(mObj.fusedManifests)) {
        mObj.fusedManifests.forEach((fm: string) => {
          if (fm) allowedNumbers.add(fm.trim().toLowerCase());
        });
      }
      if (Array.isArray(mObj.fusedFrom)) {
        mObj.fusedFrom.forEach((fm: string) => {
          if (fm) allowedNumbers.add(fm.trim().toLowerCase());
        });
      }
    }

    return invoices.filter(inv => {
      const mn = (inv.manifestNumber || '').trim().toLowerCase();
      const orig = (inv.originalManifest || '').trim().toLowerCase();
      const multi = (inv.manifestNumbers || []).map((m: string) => (m || '').trim().toLowerCase());
      const itemMfs = (inv.invoiceItems || []).map((it: any) => (it.manifestNumber || '').trim().toLowerCase());

      return (
        (mn && allowedNumbers.has(mn)) ||
        (orig && allowedNumbers.has(orig)) ||
        multi.some((m: string) => allowedNumbers.has(m)) ||
        itemMfs.some((m: string) => allowedNumbers.has(m))
      );
    });
  }

  it('resolves MEGA-MAN search terms including all fused child manifests', () => {
    const manifests = [
      {
        id: 'SL-MEGA-MAN-17-09-2026',
        manifestNumber: 'SL-MEGA-MAN-17-09-2026',
        fusedManifests: ['17-09-2026', '17-09-2026DANP'],
      },
      {
        id: '17-09-2026',
        manifestNumber: '17-09-2026',
        mergedInto: 'SL-MEGA-MAN-17-09-2026',
      },
      {
        id: '17-09-2026DANP',
        manifestNumber: '17-09-2026DANP',
        mergedInto: 'SL-MEGA-MAN-17-09-2026',
      },
    ];

    const terms = buildInvoiceSearchTerms('SL-MEGA-MAN-17-09-2026', manifests);
    expect(terms).toContain('SL-MEGA-MAN-17-09-2026');
    expect(terms).toContain('17-09-2026');
    expect(terms).toContain('17-09-2026DANP');
  });

  it('resolves child manifest search terms to include destination MEGA-MAN', () => {
    const manifests = [
      {
        id: '17-09-2026',
        manifestNumber: '17-09-2026',
        mergedInto: 'SL-MEGA-MAN-17-09-2026',
      },
    ];

    const terms = buildInvoiceSearchTerms('17-09-2026', manifests);
    expect(terms).toContain('17-09-2026');
    expect(terms).toContain('SL-MEGA-MAN-17-09-2026');
  });

  it('correctly filters invoices for MEGA-MAN even when items have original child manifest numbers', () => {
    const manifests = [
      {
        id: 'SL-MEGA-MAN-17-09-2026',
        manifestNumber: 'SL-MEGA-MAN-17-09-2026',
        fusedManifests: ['17-09-2026', '17-09-2026DANP'],
      },
    ];

    const mockInvoices = [
      {
        id: 'INV-001',
        manifestNumber: 'SL-MEGA-MAN-17-09-2026',
        invoiceItems: [{ tracking: 'TBA1', manifestNumber: '17-09-2026' }],
      },
      {
        id: 'INV-002',
        manifestNumber: '17-09-2026DANP',
        originalManifest: '17-09-2026DANP',
        invoiceItems: [{ tracking: 'TBA2', manifestNumber: '17-09-2026DANP' }],
      },
      {
        id: 'INV-003',
        manifestNumber: '18-09-2026',
        invoiceItems: [{ tracking: 'TBA3', manifestNumber: '18-09-2026' }],
      },
    ];

    const filtered = filterInvoicesByManifest(mockInvoices, 'SL-MEGA-MAN-17-09-2026', manifests);
    expect(filtered.length).toBe(2);
    expect(filtered.map(i => i.id)).toEqual(['INV-001', 'INV-002']);
  });
});
