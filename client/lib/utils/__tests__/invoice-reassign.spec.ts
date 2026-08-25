import { describe, it, expect } from 'vitest';
import {
  replaceInvoiceNumberPrefix,
  isTempSlCode,
  isTempInvoiceNumber,
  isOrphanSlCode,
  isOrphanInvoiceNumber,
  TEMP_WARNING_TITLE,
} from '.././invoice-reassign';

/**
 * Every route declared in `@/lib/utils/route-colors.ts`. When the Nova
 * ingest fails to match a package to a real customer, these names can
 * leak into the invoice number as a placeholder prefix. The reassign
 * flow must be able to rewrite every one of them.
 */
const ALL_SYSTEM_ROUTES = [
  'San Jose Centro',
  'San Jose Escazu',
  'San Jose Coronado',
  'Cartago 1',
  'Cartago 2',
  'Encomiendas',
  'Occidente',
  'Alajuela',
  'Heredia',
  'Retira',
  'Desconocida',
];

describe('replaceInvoiceNumberPrefix', () => {
  it('rewrites a real customer prefix', () => {
    expect(
      replaceInvoiceNumberPrefix('SL26339-20260428120000000', 'SL26549'),
    ).toBe('SL26549-20260428120000000');
  });

  it('rewrites a temp customer prefix (SL-NAN-NNNNN) — regression for reassign bug', () => {
    expect(
      replaceInvoiceNumberPrefix('SL-NAN-00813-20260428120000000', 'SL26632'),
    ).toBe('SL26632-20260428120000000');
  });

  it('rewrites a manifest-style prefix (SL-MAN-NNNNN)', () => {
    expect(
      replaceInvoiceNumberPrefix('SL-MAN-00813-20260428120000000', 'SL26632'),
    ).toBe('SL26632-20260428120000000');
  });

  it('preserves the -C consolidation suffix', () => {
    expect(
      replaceInvoiceNumberPrefix('SL-NAN-00813-20260428120000000-C', 'SL26632'),
    ).toBe('SL26632-20260428120000000-C');
  });

  it('preserves the -MERGE suffix', () => {
    expect(
      replaceInvoiceNumberPrefix('SL-NAN-00813-1234567890-MERGE', 'SL26632'),
    ).toBe('SL26632-1234567890-MERGE');
  });

  it('uppercases the replacement slCode', () => {
    expect(
      replaceInvoiceNumberPrefix('sl-nan-00813-20260428120000000', 'sl26632'),
    ).toBe('SL26632-20260428120000000');
  });

  it('returns the input unchanged when there is no recognized prefix', () => {
    expect(replaceInvoiceNumberPrefix('INV-20260428-001', 'SL26632')).toBe(
      'INV-20260428-001',
    );
  });

  it('returns the input unchanged when invoiceNumber is empty', () => {
    expect(replaceInvoiceNumberPrefix('', 'SL26632')).toBe('');
  });

  it('returns the input unchanged when newSlCode is empty', () => {
    expect(
      replaceInvoiceNumberPrefix('SL-NAN-00813-20260428120000000', ''),
    ).toBe('SL-NAN-00813-20260428120000000');
  });

  it('does not touch a second SL-prefix later in the string', () => {
    // Defensive: only the leading prefix should be rewritten.
    expect(
      replaceInvoiceNumberPrefix(
        'SL-NAN-00813-20260428120000000-SL99999',
        'SL26632',
      ),
    ).toBe('SL26632-20260428120000000-SL99999');
  });
});

describe('isTempSlCode', () => {
  it('flags SL-NAN-* codes as temp', () => {
    expect(isTempSlCode('SL-NAN-00813')).toBe(true);
    expect(isTempSlCode('sl-nan-00001')).toBe(true);
  });

  it('does NOT flag SL-MAN-* codes (not in temp_customers)', () => {
    expect(isTempSlCode('SL-MAN-00813')).toBe(false);
  });

  it('does NOT flag real customer codes', () => {
    expect(isTempSlCode('SL26632')).toBe(false);
    expect(isTempSlCode('SL-26632')).toBe(false);
  });

  it('handles null / undefined / empty safely', () => {
    expect(isTempSlCode(null)).toBe(false);
    expect(isTempSlCode(undefined)).toBe(false);
    expect(isTempSlCode('')).toBe(false);
  });
});

describe('isTempInvoiceNumber', () => {
  it('flags invoice numbers prefixed with SL-NAN-*', () => {
    expect(isTempInvoiceNumber('SL-NAN-00813-20260428120000000')).toBe(true);
    expect(isTempInvoiceNumber('sl-nan-00813-20260428120000000-C')).toBe(true);
  });

  it('does NOT flag real customer invoice numbers', () => {
    expect(isTempInvoiceNumber('SL26632-20260428120000000')).toBe(false);
  });

  it('does NOT flag SL-MAN-* manifest-prefixed invoices', () => {
    expect(isTempInvoiceNumber('SL-MAN-00813-20260428120000000')).toBe(false);
  });

  it('handles null / undefined / empty safely', () => {
    expect(isTempInvoiceNumber(null)).toBe(false);
    expect(isTempInvoiceNumber(undefined)).toBe(false);
    expect(isTempInvoiceNumber('')).toBe(false);
  });
});

describe('replaceInvoiceNumberPrefix — route-name placeholder prefixes', () => {
  // Parity check: EVERY system route (from route-colors.ts) must be
  // reassignable. If a new route is added without updating the regex, this
  // loop surfaces it immediately.
  for (const route of ALL_SYSTEM_ROUTES) {
    it(`rewrites the "${route}" route prefix into a real slCode`, () => {
      const original = `${route}-20260430180345611`;
      expect(replaceInvoiceNumberPrefix(original, 'SL26632')).toBe(
        'SL26632-20260430180345611',
      );
    });
  }

  it('preserves the -C suffix on a consolidated route-prefixed invoice', () => {
    expect(
      replaceInvoiceNumberPrefix('Cartago 1-20260430180345611-C', 'SL26632'),
    ).toBe('SL26632-20260430180345611-C');
  });

  it('handles routes with multiple spaces in the name', () => {
    expect(
      replaceInvoiceNumberPrefix('San Jose Coronado-20260430180410576', 'SL26632'),
    ).toBe('SL26632-20260430180410576');
  });
});

describe('isOrphanSlCode', () => {
  it('flags SL-NAN-* as orphan', () => {
    expect(isOrphanSlCode('SL-NAN-00813')).toBe(true);
  });

  it('flags SL-MAN-* as orphan', () => {
    expect(isOrphanSlCode('SL-MAN-00813')).toBe(true);
  });

  it('flags every system route name as orphan', () => {
    for (const route of ALL_SYSTEM_ROUTES) {
      expect(isOrphanSlCode(route), `route "${route}" should be orphan`).toBe(true);
    }
  });

  it('does NOT flag canonical SL<digits> codes', () => {
    expect(isOrphanSlCode('SL26632')).toBe(false);
    expect(isOrphanSlCode('SL8035')).toBe(false);
    expect(isOrphanSlCode('SL1')).toBe(false);
    expect(isOrphanSlCode('sl26632')).toBe(false);
  });

  it('treats empty / null / undefined as orphan (safety)', () => {
    expect(isOrphanSlCode(null)).toBe(true);
    expect(isOrphanSlCode(undefined)).toBe(true);
    expect(isOrphanSlCode('')).toBe(true);
    expect(isOrphanSlCode('   ')).toBe(true);
  });
});

describe('isOrphanInvoiceNumber', () => {
  it('flags invoice numbers with route-name prefixes', () => {
    for (const route of ALL_SYSTEM_ROUTES) {
      expect(
        isOrphanInvoiceNumber(`${route}-20260430180345611`),
        `route "${route}" should be orphan in invoice number`,
      ).toBe(true);
    }
  });

  it('flags invoice numbers with SL-NAN-* prefixes', () => {
    expect(isOrphanInvoiceNumber('SL-NAN-00813-20260428120000000')).toBe(true);
  });

  it('flags invoice numbers with SL-MAN-* prefixes', () => {
    expect(isOrphanInvoiceNumber('SL-MAN-00813-20260428120000000')).toBe(true);
  });

  it('does NOT flag real customer invoice numbers', () => {
    expect(isOrphanInvoiceNumber('SL26632-20260428120000000')).toBe(false);
  });

  it('returns false for unrecognised formats (no timestamp)', () => {
    expect(isOrphanInvoiceNumber('INV-001')).toBe(false);
    expect(isOrphanInvoiceNumber('random-text')).toBe(false);
  });

  it('handles null / undefined / empty safely', () => {
    expect(isOrphanInvoiceNumber(null)).toBe(false);
    expect(isOrphanInvoiceNumber(undefined)).toBe(false);
    expect(isOrphanInvoiceNumber('')).toBe(false);
  });
});

describe('TEMP_WARNING_TITLE', () => {
  it('is generic enough to cover temp, route, and other orphan cases', () => {
    const msg = TEMP_WARNING_TITLE.toLowerCase();
    // Must reference the root concern (customers linkage + SmartWeb risk).
    expect(msg).toMatch(/customers/);
    expect(msg).toMatch(/smartweb/);
    // Must instruct the operator to reassign.
    expect(msg).toMatch(/reas[íi]gn/);
  });

  it('is non-empty', () => {
    expect(TEMP_WARNING_TITLE.length).toBeGreaterThan(0);
  });

  it('is a single-line string (no embedded newlines)', () => {
    expect(TEMP_WARNING_TITLE).not.toContain('\n');
  });
});

describe('replaceInvoiceNumberPrefix — additional regressions', () => {
  it('preserves a millisecond-precision timestamp (17-digit format)', () => {
    expect(
      replaceInvoiceNumberPrefix('SL-NAN-00001-20260428120000123', 'SL26632'),
    ).toBe('SL26632-20260428120000123');
  });

  it('returns input unchanged when suffix is 9 digits (below timestamp threshold)', () => {
    expect(replaceInvoiceNumberPrefix('FOO-123456789', 'SL26632')).toBe('FOO-123456789');
  });

  it('idempotent: applying twice yields the same result', () => {
    const once  = replaceInvoiceNumberPrefix('SL-NAN-00001-20260428120000000', 'SL26632');
    const twice = replaceInvoiceNumberPrefix(once, 'SL26632');
    expect(once).toBe(twice);
  });

  it('can rewrite back and forth between two slCodes', () => {
    const original = 'SL26549-20260428120000000';
    const step1 = replaceInvoiceNumberPrefix(original, 'SL26632');
    const step2 = replaceInvoiceNumberPrefix(step1, 'SL26549');
    expect(step2).toBe(original);
  });

  it('trims nothing — operator must pass a clean slCode', () => {
    // Whitespace in slCode is preserved verbatim after uppercase; callers must
    // sanitise. This test locks that contract.
    expect(
      replaceInvoiceNumberPrefix('SL-NAN-00001-20260428120000000', '  SL26632  '),
    ).toBe('  SL26632  -20260428120000000');
  });
});

describe('isOrphanSlCode — additional boundary checks', () => {
  it('rejects codes with hyphens (SL-1234)', () => {
    expect(isOrphanSlCode('SL-1234')).toBe(true);
  });

  it('rejects codes with trailing letters (SL1234A)', () => {
    expect(isOrphanSlCode('SL1234A')).toBe(true);
  });

  it('accepts very long digit sequences', () => {
    expect(isOrphanSlCode('SL1234567890')).toBe(false);
  });

  it('accepts single-digit codes (SL0)', () => {
    expect(isOrphanSlCode('SL0')).toBe(false);
  });
});
