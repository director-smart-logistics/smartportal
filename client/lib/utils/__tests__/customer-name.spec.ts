/**
 * customer-name.spec.ts — regression tests for resolveCustomerFullName.
 *
 * SCOPE: covers the BUG-NAME-FROM-DISPLAYNAME triple-regression history.
 * Every failure mode below was observed in production; removing any test
 * here re-opens that regression.
 *
 * Corresponding helper lives in `client/lib/utils/customer-name.ts`. The
 * same logic is mirrored inline in `functions/src/customers/sync.ts` and
 * `functions/scripts/run-customer-sync.ts` — any rule change here MUST be
 * ported to both server-side copies.
 */
import { describe, it, expect } from 'vitest';
import { resolveCustomerFullName, looksLikeHandle, resolveEffectiveCustomerName, isSyntheticPlaceholderName } from '../customer-name';

describe('looksLikeHandle', () => {
  it('LLH-01: plain multi-token name is NOT a handle', () => {
    expect(looksLikeHandle('Francisco Mejia')).toBe(false);
    expect(looksLikeHandle('JESUS ARRIETA CLAVERIA')).toBe(false);
    expect(looksLikeHandle('Ana María Gómez-López')).toBe(false);
  });

  it('LLH-02: contains digits → handle', () => {
    expect(looksLikeHandle('Fran92MJ')).toBe(true);
    expect(looksLikeHandle('user_123')).toBe(true);
  });

  it('LLH-03: handle-style punctuation → handle', () => {
    expect(looksLikeHandle('Foo (Foo)')).toBe(true);
    expect(looksLikeHandle('[operator]')).toBe(true);
    expect(looksLikeHandle('{jsmith}')).toBe(true);
    expect(looksLikeHandle('admin@company')).toBe(true);
  });

  it('LLH-04: repeated identical token → handle ("Foo (Foo)" synthesised pattern)', () => {
    // Parentheses stripped before comparison so "Foo (Foo)" collapses to ["Foo","Foo"].
    expect(looksLikeHandle('Foo (Foo)')).toBe(true);
    expect(looksLikeHandle('Jsmith Jsmith')).toBe(true);
    // Case-insensitive
    expect(looksLikeHandle('admin ADMIN')).toBe(true);
  });

  it('LLH-05: empty / whitespace input returns false', () => {
    expect(looksLikeHandle('')).toBe(false);
    expect(looksLikeHandle('   ')).toBe(false);
  });

  it('LLH-06: single token real name → NOT a handle', () => {
    // "Jesus" alone is a valid firstName, must NOT be treated as a handle
    expect(looksLikeHandle('Jesus')).toBe(false);
    expect(looksLikeHandle('María')).toBe(false);
  });
});

describe('resolveCustomerFullName', () => {
  // ── Rule C core cases (production regressions) ────────────────────────────

  it('RCN-01: structured name preferred when both forms have equal token count', () => {
    // Pre-0.0.591 "Fran92MJ" bug — structured wins to override SP2 handle
    expect(resolveCustomerFullName('Francisco', 'Mejia', 'Fran92MJ (Fran92MJ)'))
      .toBe('Francisco Mejia');
  });

  it('RCN-02: displayName preferred when it has strictly MORE tokens and is not a handle', () => {
    // 0.0.591 "Jesus" regression — must NOT truncate multi-surname names
    expect(resolveCustomerFullName('Jesus', '', 'JESUS ARRIETA CLAVERIA'))
      .toBe('JESUS ARRIETA CLAVERIA');
  });

  it('RCN-03: displayName preserves second apellido for Latin-American customers', () => {
    // SP1 lastName has only first apellido, SP2 displayName has both — Nova
    // name-matching needs both to achieve >= 0.88 threshold
    expect(resolveCustomerFullName('Ana', 'Gonzalez', 'ANA GONZALEZ LOPEZ'))
      .toBe('ANA GONZALEZ LOPEZ');
  });

  it('RCN-04: structured name wins when it has MORE tokens than display', () => {
    // SP1 operator manually curated the full name with both apellidos;
    // SP2 displayName fell behind — structured is authoritative.
    expect(resolveCustomerFullName('María', 'Gómez Díaz', 'Maria Gomez'))
      .toBe('María Gómez Díaz');
  });

  it('RCN-05: displayName wins when structured fields are empty', () => {
    expect(resolveCustomerFullName('', '', 'JUAN PEREZ'))
      .toBe('JUAN PEREZ');
    expect(resolveCustomerFullName(null, null, 'MARÍA FERNANDA'))
      .toBe('MARÍA FERNANDA');
  });

  it('RCN-06: structured name wins when displayName is empty', () => {
    expect(resolveCustomerFullName('Juan', 'Perez', ''))
      .toBe('Juan Perez');
    expect(resolveCustomerFullName('Ana', 'López', null))
      .toBe('Ana López');
  });

  it('RCN-07: falls back to "Usuario" for entirely empty profiles (legacy data)', () => {
    expect(resolveCustomerFullName('', '', '')).toBe('Usuario');
    expect(resolveCustomerFullName(null, null, null)).toBe('Usuario');
    expect(resolveCustomerFullName(undefined, undefined, undefined)).toBe('Usuario');
  });

  // ── Handle-detection gates (prevents Rule C from picking handles) ────────

  it('RCN-08: displayName rejected when it contains digits, even if it has more tokens', () => {
    // "user92 admin" has 2 tokens but is clearly a handle → structured "Juan" wins
    expect(resolveCustomerFullName('Juan', '', 'user92 admin'))
      .toBe('Juan');
  });

  it('RCN-09: displayName rejected when it is a repeated-token handle', () => {
    // Even though "Fran92MJ (Fran92MJ)" has 2 tokens vs 1 for just-"Fran92MJ",
    // the handle detector catches the digits AND the repeat pattern → fall through.
    expect(resolveCustomerFullName('Fran92MJ', '', 'Fran92MJ (Fran92MJ)'))
      .toBe('Fran92MJ');
  });

  it('RCN-10: displayName rejected when it has handle-style punctuation', () => {
    expect(resolveCustomerFullName('Maria', '', 'Maria (admin)'))
      .toBe('Maria');
    expect(resolveCustomerFullName('Jose', '', '[jose_admin]'))
      .toBe('Jose');
  });

  // ── Whitespace / edge cases ──────────────────────────────────────────────

  it('RCN-11: trims whitespace in all inputs', () => {
    expect(resolveCustomerFullName('  Juan  ', '  Perez  ', '  JUAN PEREZ LOPEZ  '))
      .toBe('JUAN PEREZ LOPEZ');
  });

  it('RCN-12: collapses to firstName when lastName is whitespace-only', () => {
    // Whitespace-only lastName treated as empty, displayName has more tokens → wins
    expect(resolveCustomerFullName('Jesus', '   ', 'JESUS ARRIETA CLAVERIA'))
      .toBe('JESUS ARRIETA CLAVERIA');
  });

  it('RCN-13: equal token count with handle-looking displayName → structured wins', () => {
    // Both "Juan Perez" (2 tokens) and "juan92 perez92" (2 tokens with digits)
    // → handle check kicks in and we fall through to structured.
    expect(resolveCustomerFullName('Juan', 'Perez', 'juan92 perez92'))
      .toBe('Juan Perez');
  });

  it('RCN-14: handles customer with a single-name firstName when displayName is also single, non-handle', () => {
    // "María" (1 token) + empty + "María" (1 token) → 1>1 false → structured wins ("María")
    expect(resolveCustomerFullName('María', '', 'María'))
      .toBe('María');
  });
});

describe('isSyntheticPlaceholderName', () => {
  it('identifies synthetic pre-alert names', () => {
    expect(isSyntheticPlaceholderName('Cliente Pre-alertado (SL262179)')).toBe(true);
    expect(isSyntheticPlaceholderName('Cliente Pre-Alerta')).toBe(true);
    expect(isSyntheticPlaceholderName('Prealerta')).toBe(true);
    expect(isSyntheticPlaceholderName('SL-NAN-999')).toBe(true);
    expect(isSyntheticPlaceholderName('SL-123')).toBe(true);
    expect(isSyntheticPlaceholderName('Cliente')).toBe(true);
    expect(isSyntheticPlaceholderName('Usuario')).toBe(true);
    expect(isSyntheticPlaceholderName('SIN-CODIGO')).toBe(true);
    expect(isSyntheticPlaceholderName(null)).toBe(true);
    expect(isSyntheticPlaceholderName('')).toBe(true);
  });

  it('accepts legitimate customer names', () => {
    expect(isSyntheticPlaceholderName('DAYANA MARIA JIMENEZ ESQUIVEL')).toBe(false);
    expect(isSyntheticPlaceholderName('DAYANA JIMENEZ')).toBe(false);
    expect(isSyntheticPlaceholderName('JUAN PEREZ')).toBe(false);
  });
});

describe('resolveEffectiveCustomerName', () => {
  it('prioritizes registered contact profile over synthetic pre-alert string', () => {
    const res = resolveEffectiveCustomerName({
      savedCustomerName: 'Cliente Pre-alertado (SL262179)',
      contactName: 'DAYANA MARIA JIMENEZ ESQUIVEL',
      manifestConsigneeName: 'DAYANA JIMENEZ',
      slCode: 'SL262179',
    });
    expect(res).toBe('DAYANA MARIA JIMENEZ ESQUIVEL');
  });

  it('falls back to pre-alert declared name if contact profile is not yet available', () => {
    const res = resolveEffectiveCustomerName({
      savedCustomerName: 'Cliente Pre-alertado (SL262179)',
      preAlertName: 'Dayana Jimenez Esquivel',
      manifestConsigneeName: 'DAYANA JIMENEZ',
      slCode: 'SL262179',
    });
    expect(res).toBe('Dayana Jimenez Esquivel');
  });

  it('falls back to manifest consignee name if pre-alert and contact are missing', () => {
    const res = resolveEffectiveCustomerName({
      savedCustomerName: 'Cliente Pre-alertado (SL262179)',
      manifestConsigneeName: 'DAYANA JIMENEZ ESQUIVEL',
      slCode: 'SL262179',
    });
    expect(res).toBe('DAYANA JIMENEZ ESQUIVEL');
  });

  it('never returns Cliente Pre-alertado as fallback', () => {
    const res = resolveEffectiveCustomerName({
      savedCustomerName: 'Cliente Pre-alertado (SL262179)',
      slCode: 'SL262179',
    });
    expect(res).toBe('SL262179');
  });
});

