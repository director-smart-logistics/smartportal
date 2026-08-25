/**
 * nova-print.spec.ts
 *
 * Unit tests for buildRouteManifestHTML and buildBoletaHTML.
 *
 * These are pure HTML-string functions with no external dependencies —
 * no mocks required.
 *
 * Coverage:
 *  - Label text ("Dólares:", "Colones:" — NOT "Total en …")
 *  - Font sizes in CSS (-1pt vs legacy values)
 *  - Consolidado badge shown for consolidation groups
 *  - No badge for regular individual groups
 *  - Price and peso rendering per row
 *  - Grand total in footer
 *  - Empty rows edge case
 *  - TC=0 hides CRC amounts
 *  - Multiple groups grouped by slCode
 */

import { describe, it, expect } from 'vitest';
import { buildRouteManifestHTML, buildBoletaHTML, type RouteManifestRow, type BoletaPrintRow } from '.././nova-print';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<RouteManifestRow> = {}): RouteManifestRow {
  return {
    slCode:       'SL001',
    customerName: 'JUAN PEREZ',
    manifestName: '08-04-2026DAN',
    tracking:     'TRACK001',
    price:        12.00,
    descripcion:  'ROPA',
    peso:         0.36,
    consolidacion: false,
    ...overrides,
  };
}

// ── Label tests (regression guard: "Total en" must NOT appear) ────────────────

describe('buildRouteManifestHTML — labels', () => {
  it('shows dollar total WITHOUT "Dólares:" prefix label', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).not.toContain('D&oacute;lares:');
    expect(html).not.toMatch(/total\s+en\s+d[oó]lares/i);
    expect(html).toContain('$12.00');
  });

  it('shows CRC total WITHOUT "Colones:" prefix label', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).not.toContain('Colones:');
    expect(html).not.toMatch(/total\s+en\s+colones/i);
    expect(html).toContain('&#8353;');
  });

  it('shows TC line when tc > 0', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).toContain('Tipo de Cambio:');
  });

  it('omits CRC and TC lines when tc = 0', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 0);
    expect(html).not.toContain('&#8353;');
    expect(html).not.toContain('Tipo de Cambio:');
  });
});

// ── Font size regression guard (-1pt vs legacy) ───────────────────────────────

describe('buildRouteManifestHTML — font sizes', () => {
  it('body font-size is 7pt (not 8pt)', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).toContain('font-size: 7pt');
    expect(html).not.toMatch(/body[^}]*font-size:\s*8pt/);
  });

  it('td font-size is 6.5pt (not 7.5pt)', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).toContain('font-size: 6.5pt');
    expect(html).not.toMatch(/^.*td[^}]*font-size:\s*7\.5pt/m);
  });

  it('header h1 font-size is 10pt (not 11pt)', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).toMatch(/header h1[^}]*font-size:\s*10pt/);
    expect(html).not.toMatch(/header h1[^}]*font-size:\s*11pt/);
  });
});

// ── Permiso flag in tracking cell ─────────────────────────────────────────────

describe('buildRouteManifestHTML — permiso [P] flag', () => {
  it('shows perm-flag [P] before tracking for permit rows', () => {
    const html = buildRouteManifestHTML([makeRow({ permisos: true })], 'R', 'M', 487);
    expect(html).toContain('perm-flag');
    expect(html).toContain('>P<');
  });

  it('does NOT show perm-flag for non-permit rows', () => {
    const html = buildRouteManifestHTML([makeRow({ permisos: false })], 'R', 'M', 487);
    expect(html).not.toContain('<span class="perm-flag">');
  });

  it('shows perm-badge "Permisos" in group header when any row has permisos=true', () => {
    const html = buildRouteManifestHTML([makeRow({ permisos: true })], 'R', 'M', 487);
    expect(html).toContain('perm-badge');
    expect(html).toContain('Permisos');
    expect(html).toContain('Prohibida la consolidaci');
    expect(html).toContain('perm-note');
  });

  it('does NOT show perm-badge when no row has permisos', () => {
    const html = buildRouteManifestHTML([makeRow({ permisos: false })], 'R', 'M', 487);
    expect(html).not.toContain('<span class="perm-badge">');
    expect(html).not.toContain('<span class="perm-note">');
  });
});

// ── Consolidado badge ─────────────────────────────────────────────────────────

describe('buildRouteManifestHTML — consolidado badge', () => {
  it('shows Consolidado badge for consolidation groups', () => {
    const rows: RouteManifestRow[] = [
      makeRow({ slCode: 'SL002', consolidacion: true, tracking: 'T1', precio: 6 } as any),
      makeRow({ slCode: 'SL002', consolidacion: true, tracking: 'T2', precio: 6 } as any),
    ];
    const html = buildRouteManifestHTML(rows, 'Alajuela', '08-04-2026DAN', 487);
    expect(html).toContain('cons-badge');
    expect(html).toContain('Consolidado');
  });

  it('does NOT show Consolidado badge for regular individual rows', () => {
    const html = buildRouteManifestHTML([makeRow({ consolidacion: false })], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).not.toContain('<span class="cons-badge">');
  });

  it('shows badge for mixed group where at least one row has consolidacion=true', () => {
    const rows: RouteManifestRow[] = [
      makeRow({ slCode: 'SL003', consolidacion: true }),
      makeRow({ slCode: 'SL003', consolidacion: false }),
    ];
    const html = buildRouteManifestHTML(rows, 'Alajuela', '08-04-2026DAN', 487);
    expect(html).toContain('cons-badge');
  });

  it('does NOT show badge when consolidacion is undefined (defaults to non-consolidation)', () => {
    const row: RouteManifestRow = {
      slCode: 'SL004', customerName: 'TEST', manifestName: 'M', tracking: 'T',
      price: 10, descripcion: 'DESC', peso: 1.0,
    };
    const html = buildRouteManifestHTML([row], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).not.toContain('<span class="cons-badge">');
  });
});

// ── Price and peso rendering ──────────────────────────────────────────────────

describe('buildRouteManifestHTML — price / peso / totals', () => {
  it('shows group total price in header, NOT in each child row', () => {
    const html = buildRouteManifestHTML([makeRow({ price: 8.5 })], 'R', 'M', 487);
    expect(html).toContain('$8.50');
    expect(html).toContain('total-amt');
    const amountCellCount = (html.match(/class="amount"/g) || []).length;
    expect(amountCellCount).toBe(0);
  });

  it('does NOT render peso column in route manifest rows', () => {
    const html = buildRouteManifestHTML([makeRow({ peso: 0.36 })], 'R', 'M', 487);
    expect(html).not.toContain('peso-cell');
    expect(html).not.toContain('>Peso<');
  });

  it('grand total in footer equals sum of all row prices', () => {
    const rows = [makeRow({ price: 10 }), makeRow({ slCode: 'SL002', price: 15 })];
    const html = buildRouteManifestHTML(rows, 'R', 'M', 0);
    expect(html).toContain('$25.00');
  });

  it('CRC amount in group header is price × tc rounded', () => {
    const html = buildRouteManifestHTML([makeRow({ price: 10 })], 'R', 'M', 487);
    expect(html).toContain('&#8353;4');
  });

  it('group total reflects sum of rows in the group', () => {
    const rows = [
      makeRow({ slCode: 'SL005', price: 8 }),
      makeRow({ slCode: 'SL005', price: 12 }),
    ];
    const html = buildRouteManifestHTML(rows, 'R', 'M', 0);
    expect(html).toContain('$20.00');
  });
});

// ── Grouping by slCode ────────────────────────────────────────────────────────

describe('buildRouteManifestHTML — grouping', () => {
  it('creates two separate groups for two different slCodes', () => {
    const rows = [
      makeRow({ slCode: 'SL001', customerName: 'JUAN', tracking: 'T1' }),
      makeRow({ slCode: 'SL002', customerName: 'MARIA', tracking: 'T2' }),
    ];
    const html = buildRouteManifestHTML(rows, 'R', 'M', 0);
    expect(html).toContain('JUAN');
    expect(html).toContain('MARIA');
    // Two separate group-header rows
    const headerCount = (html.match(/class="group-header"/g) || []).length;
    expect(headerCount).toBe(2);
  });

  it('groups both rows of same slCode under one header and combines signature cells with rowspan', () => {
    const rows = [
      makeRow({ slCode: 'SL001', tracking: 'T1' }),
      makeRow({ slCode: 'SL001', tracking: 'T2' }),
      makeRow({ slCode: 'SL001', tracking: 'T3' }),
    ];
    const html = buildRouteManifestHTML(rows, 'R', 'M', 0);
    const headerCount = (html.match(/class="group-header"/g) || []).length;
    expect(headerCount).toBe(1);

    // Exactly 1 td.sig rendered with rowspan="3"
    const sigCellMatches = html.match(/<td class="sig" rowspan="3"><\/td>/g) || [];
    expect(sigCellMatches.length).toBe(1);
    // Total td.sig in html is 1
    const totalSigCells = html.match(/class="sig"/g) || [];
    expect(totalSigCells.length).toBe(1);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('buildRouteManifestHTML — edge cases', () => {
  it('handles empty rows array without throwing', () => {
    expect(() => buildRouteManifestHTML([], 'Alajuela', '08-04-2026DAN', 487)).not.toThrow();
  });

  it('renders manifest number in header', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Alajuela', '08-04-2026DAN', 487);
    expect(html).toContain('08-04-2026DAN');
  });

  it('renders route name in header', () => {
    const html = buildRouteManifestHTML([makeRow()], 'Cartago 3', 'M', 487);
    expect(html).toContain('Cartago 3');
  });

  it('renders slCode badge when slCode is present', () => {
    const html = buildRouteManifestHTML([makeRow({ slCode: 'SL999' })], 'R', 'M', 0);
    expect(html).toContain('SL999');
  });

  it('renders tracking in row cell (description column removed)', () => {
    const html = buildRouteManifestHTML([makeRow({ tracking: 'TRACK-SPEC-001' })], 'R', 'M', 0);
    expect(html).toContain('TRACK-SPEC-001');
  });
});

// ── Active Invoices & Single-Group Aggregation ──────────────────────────────────

describe('buildRouteManifestHTML — active invoices', () => {
  it('displays invoice text in muted font when row carries invoiceId / invoiceNumber', () => {
    const rows = [
      makeRow({ slCode: 'SL1001', customerName: 'CARLOS', tracking: 'T1', invoiceId: 'inv-100', invoiceNumber: '10045', invoiceAmountUSD: 25 }),
      makeRow({ slCode: 'SL1001', customerName: 'CARLOS', tracking: 'T2', invoiceId: 'inv-100', invoiceNumber: '10045', invoiceAmountUSD: 25 }),
    ];
    const html = buildRouteManifestHTML(rows, 'San Jose', 'MAN-001', 500);
    expect(html).toContain('#10045');
    expect(html).not.toContain('Factura #');
    expect(html).toContain('inv-subline');
    expect(html).toContain('$25.00');
    // Only 1 group header for CARLOS
    const headerCount = (html.match(/class="group-header"/g) || []).length;
    expect(headerCount).toBe(1);
  });

  it('sums multiple active invoices for the same customer into a single group header', () => {
    const rows = [
      makeRow({ slCode: 'SL2002', customerName: 'ANA PEREZ', tracking: 'T1', invoiceId: 'inv-A', invoiceNumber: '101', invoiceAmountUSD: 30 }),
      makeRow({ slCode: 'SL2002', customerName: 'ANA PEREZ', tracking: 'T2', invoiceId: 'inv-B', invoiceNumber: '102', invoiceAmountUSD: 45 }),
    ];
    const html = buildRouteManifestHTML(rows, 'Heredia', 'MAN-002', 500);
    expect(html).toContain('#101, #102');
    expect(html).toContain('$75.00'); // 30 + 45
    const headerCount = (html.match(/class="group-header"/g) || []).length;
    expect(headerCount).toBe(1);
  });

  it('combines active invoice amounts and un-invoiced package prices in single group total', () => {
    const rows = [
      makeRow({ slCode: 'SL3003', customerName: 'MARIO', tracking: 'T1', invoiceId: 'inv-A', invoiceNumber: '555', invoiceAmountUSD: 50 }),
      makeRow({ slCode: 'SL3003', customerName: 'MARIO', tracking: 'T2', price: 15 }), // un-invoiced package
    ];
    const html = buildRouteManifestHTML(rows, 'Alajuela', 'MAN-003', 500);
    expect(html).toContain('#555');
    expect(html).toContain('$65.00'); // 50 + 15
  });
});

// ── Returned Packages Badges & Line Pricing ────────────────────────────────────

describe('buildRouteManifestHTML — returned packages & per-line pricing', () => {
  it('renders +1 DEV badge on customer header, [D] flag + origin manifest next to tracking, and line pricing ONLY on returned groups', () => {
    const rows = [
      makeRow({ slCode: 'SL270', customerName: 'JOSE LUIS RODRIGUEZ VELIZ', tracking: '1Z80F20X0427186620', price: 80.00 }),
      makeRow({
        slCode: 'SL270',
        customerName: 'JOSE LUIS RODRIGUEZ VELIZ',
        tracking: 'TBA333475078910',
        price: 12.00,
        isReturned: true,
        originManifest: '12-08-2026DAN',
      }),
    ];
    const html = buildRouteManifestHTML(rows, 'Desamparados', 'MEGA-MAN-14-08-2026', 470);
    
    // Header has +1 badge
    expect(html).toContain('+1');
    expect(html).toContain('ret-count-badge');

    // Child row 2 has origin manifest badge (no D flag needed)
    expect(html).toContain('12-08-2026DAN');
    expect(html).toContain('ret-mani-badge');

    // Child rows in returned group have individual prices in USD and CRC, and invoice numbers
    expect(html).toContain('$80.00');
    expect(html).toMatch(/&#8353;37[\s\u00A0]?600/);
    expect(html).toContain('$12.00');
    expect(html).toMatch(/&#8353;5[\s\u00A0]?640/);
  });

  it('does NOT render line prices, line invoices or DEV badges for normal groups without returned packages', () => {
    const rows = [
      makeRow({ slCode: 'SL999', customerName: 'MARIO ROJAS', tracking: 'TRK-NORM-1', invoiceNumber: 'INV-MARIO-1', price: 15.00 }),
      makeRow({ slCode: 'SL999', customerName: 'MARIO ROJAS', tracking: 'TRK-NORM-2', invoiceNumber: 'INV-MARIO-1', price: 20.00 }),
    ];
    const html = buildRouteManifestHTML(rows, 'San Jose', 'MAN-001', 500);
    expect(html).not.toContain('ret-count-badge"');
    expect(html).not.toContain('ret-flag"');
    expect(html).not.toContain('<div class="child-amt-split">');
    expect(html).toContain('<td class="child-amt"></td>');
    // Group header has invoice subline without Factura word
    expect(html).toContain('#INV-MARIO-1');
    expect(html).not.toContain('Factura #');
    // But child rows do not repeat the invoice number
    expect(html).not.toContain('(INV-MARIO-1)');
  });
});

// ── buildBoletaHTML smoke tests ───────────────────────────────────────────────

describe('buildBoletaHTML — smoke', () => {
  const boletaRows: BoletaPrintRow[] = [
    { slCode: 'SL001', customerName: 'JUAN PEREZ', manifestName: 'M001', tracking: 'T001', ruta: 'Alajuela' },
    { slCode: 'SL002', customerName: 'MARIA LOPEZ', manifestName: 'M001', tracking: 'T002', ruta: 'Cartago' },
  ];

  it('renders without throwing', () => {
    expect(() => buildBoletaHTML(boletaRows, 'M001')).not.toThrow();
  });

  it('includes customer names', () => {
    const html = buildBoletaHTML(boletaRows, 'M001');
    expect(html).toContain('JUAN PEREZ');
    expect(html).toContain('MARIA LOPEZ');
  });

  it('includes tracking numbers', () => {
    const html = buildBoletaHTML(boletaRows, 'M001');
    expect(html).toContain('T001');
    expect(html).toContain('T002');
  });

  it('includes manifest number in header', () => {
    const html = buildBoletaHTML(boletaRows, 'M001');
    expect(html).toContain('M001');
  });

  it('handles empty rows', () => {
    expect(() => buildBoletaHTML([], 'M001')).not.toThrow();
  });

  it('renders DEV badge and origin manifest when package isReturned is true', () => {
    const rowsWithReturn: BoletaPrintRow[] = [
      { slCode: 'SL001', customerName: 'JUAN PEREZ', manifestName: 'M001', tracking: 'T001', ruta: 'Alajuela' },
      {
        slCode: 'SL002',
        customerName: 'MARIA LOPEZ',
        manifestName: 'M001',
        tracking: 'T002',
        ruta: 'Cartago',
        isReturned: true,
        originManifest: '10-08-2026DAN',
      },
    ];
    const html = buildBoletaHTML(rowsWithReturn, 'M001');
    expect(html).toContain('ret-badge');
    expect(html).toContain('DEV');
    expect(html).toContain('ret-origin-badge');
    expect(html).toContain('10-08-2026DAN');
  });
});

