/**
 * Phase 1 (F1.1) — Nova reads pre-alerts ONLY from SP2 `pre_alerts`, and the owner is ONLY the
 * slCode stored on the pre-alert. docs/NOVA_PREALERT_MATCH_SCENARIOS.md (rules 1 and 2).
 */
import { describe, it, expect, vi } from 'vitest';

const cfg = vi.hoisted(() => ({ db: { __db: 'SP1' } as unknown, dbSP2: { __db: 'SP2' } as unknown }));
vi.mock('@/lib/firebase/config', () => cfg);

import { getPreAlertsDatabase, preAlertInfoOwner } from '../pre-alert-resolver';

describe('F1.1 — single source: SP2 pre_alerts', () => {
  it('returns the SP2 database', () => {
    expect(getPreAlertsDatabase()).toEqual({ __db: 'SP2' });
  });

  it('never falls back to the SP1 database', () => {
    expect(getPreAlertsDatabase()).not.toEqual({ __db: 'SP1' });
  });
});

describe('F1.1 — owner of a resolved pre-alert = stored slCode only', () => {
  it.each([
    [{ found: true, tracking: 'T', slCode: 'SL90001' }, 'SL90001'],
    [{ found: true, tracking: 'T', slCode: 'sl90001' }, 'SL90001'],
  ])('%j → %s', (info, expected) => {
    expect(preAlertInfoOwner(info)).toBe(expected);
  });

  it.each([
    [{ found: true, tracking: 'T', sp2PreAlertId: 'SL90001-ABC' }],        // the id is not the owner
    [{ found: true, tracking: 'T', sp2PreAlertId: 'TBA3300_SL90001' }],
    [{ found: false, tracking: 'T', slCode: 'SL90001' }],                    // not found → nobody
    [{ found: true, tracking: 'T', slCode: 'PENDIENTE' }],
    [null],
    [undefined],
  ])('%j → no owner', (info) => {
    expect(preAlertInfoOwner(info as never)).toBeNull();
  });
});
