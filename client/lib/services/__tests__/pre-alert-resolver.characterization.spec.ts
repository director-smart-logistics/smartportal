/**
 * Characterization (golden master) of the pre-alert resolver used by Nova — BEFORE any fix.
 *
 * Records exactly what `batchResolvePreAlerts`, `watchPreAlerts`, `batchConsumePreAlerts` and
 * `canonicalizeTracking` do today, against an in-memory copy of the two databases:
 *   - SP2 `(default)/pre_alerts` + `users`  (dbSP2, the source of truth)
 *   - SP1 `portal/pre_alerts` + `users` + `customers` (db, the synced copy)
 *
 * Scenarios tagged [BUG Nx] document a finding of docs/audits/NOVA_PREALERT_MATCH_AUDIT_2026-09-25.md.
 * Their snapshot changes ONLY in the commit that fixes that finding. Scenarios tagged [STABLE]
 * must never change: they are the zero-regression guard.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

type Doc = Record<string, any>;
const h = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, Record<string, any>>>,   // db -> collection -> id -> data
  writes: [] as Array<{ db: string; col: string; id: string; payload: Record<string, any> }>,
}));

vi.mock('@/lib/firebase/config', () => ({ db: { __db: 'SP1' }, dbSP2: { __db: 'SP2' } }));

vi.mock('firebase/firestore', () => {
  const coll = (db: any, name: string) => ({ db: db.__db, name });
  const where = (field: string, op: string, value: any) => ({ field, op, value });
  const limit = (n: number) => ({ limit: n });
  const query = (ref: any, ...cs: any[]) => ({ ref, cs });
  const run = (q: any) => {
    const rows = Object.entries(h.store[q.ref.db]?.[q.ref.name] || {});
    let out = rows.filter(([, d]) => q.cs.every((c: any) => {
      if (c.limit) return true;
      if (c.op === '==') return d[c.field] === c.value;
      if (c.op === 'in') return c.value.includes(d[c.field]);
      throw new Error(`op ${c.op} not simulated`);
    }));
    const lim = q.cs.find((c: any) => c.limit)?.limit;
    if (lim) out = out.slice(0, lim);
    const docs = out.map(([id, d]) => ({ id, data: () => ({ ...d }) }));
    return { docs, empty: docs.length === 0 };
  };
  return {
    collection: coll,
    where,
    limit,
    query,
    getDocs: async (q: any) => run(q),
    doc: (db: any, col: string, id: string) => ({ db: db.__db, col, id }),
    getDoc: async (r: any) => {
      const d = h.store[r.db]?.[r.col]?.[r.id];
      return { exists: () => d !== undefined, data: () => (d ? { ...d } : undefined) };
    },
    updateDoc: async (r: any, payload: any) => {
      h.writes.push({ db: r.db, col: r.col, id: r.id, payload });
      const c = (h.store[r.db] ||= {})[r.col] ||= {};
      c[r.id] = { ...(c[r.id] || {}), ...payload };
    },
    onSnapshot: (q: any, cb: (s: any) => void) => { cb(run(q)); return () => {}; },
  };
});

import { batchResolvePreAlerts, watchPreAlerts, batchConsumePreAlerts } from '../pre-alert-resolver';
import { canonicalizeTracking } from '../../utils/tracking-canonicalizer';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

function seed(data: { sp2?: Record<string, Record<string, Doc>>; sp1?: Record<string, Record<string, Doc>> }) {
  h.store = { SP2: structuredClone(data.sp2 || {}), SP1: structuredClone(data.sp1 || {}) };
  h.writes = [];
}
const pick = (m: Map<string, any>) =>
  Object.fromEntries([...m.entries()].map(([k, v]) => [k, v.found ? { found: true, slCode: v.slCode ?? null, sp2PreAlertId: v.sp2PreAlertId ?? null } : { found: false }]));

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => seed({}));

// ─────────────────────────────────────────────────────────────────────────────
describe('batchResolvePreAlerts — golden master', () => {
  const cases: Array<{ tag: string; name: string; data: Parameters<typeof seed>[0]; trackings: string[]; manifest?: string }> = [
    // ── STABLE: correct today, must never change ──
    { tag: 'STABLE', name: 'exact TBA with slCode', trackings: ['TBA328164202802'],
      data: { sp2: { pre_alerts: { TBA328164202802_SL500: { tracking: 'TBA328164202802', canonicalTracking: 'TBA328164202802', slCode: 'SL500', active: true, status: 'pending', createdAt: daysAgo(5) } } } } },
    { tag: 'STABLE', name: 'exact 1Z with slCode', trackings: ['1Z999AA10123456784'],
      data: { sp2: { pre_alerts: { '1Z999AA10123456784_SL501': { tracking: '1Z999AA10123456784', slCode: 'SL501', active: true, status: 'pending', createdAt: daysAgo(2) } } } } },
    { tag: 'STABLE', name: 'USPS 420+ZIP scanned, customer pre-alerted the 22-digit core', trackings: ['420331959405511899223197428491'],
      data: { sp2: { pre_alerts: { '9405511899223197428491_SL502': { tracking: '9405511899223197428491', canonicalTracking: '9405511899223197428491', slCode: 'SL502', active: true, status: 'pending', createdAt: daysAgo(10) } } } } },
    { tag: 'STABLE', name: 'USPS 420+ZIP4 scanned, 22-digit core pre-alerted', trackings: ['4203316612349400111899223197428490'],
      data: { sp2: { pre_alerts: { '9400111899223197428490_SL507': { tracking: '9400111899223197428490', slCode: 'SL507', active: true, status: 'pending', createdAt: daysAgo(3) } } } } },
    { tag: 'STABLE', name: 'lower-case slCode normalized', trackings: ['TBA328164202803'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA328164202803', slCode: 'sl503', active: true, createdAt: daysAgo(1) } } } } },
    { tag: 'STABLE', name: 'cancelled (active:false) → not found', trackings: ['TBA328164202804'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA328164202804', slCode: 'SL504', active: false, createdAt: daysAgo(1) } } } } },
    { tag: 'STABLE', name: 'invoiced → not found', trackings: ['TBA328164202805'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA328164202805', slCode: 'SL505', active: true, invoiceNumber: 'F-1', createdAt: daysAgo(1) } } } } },
    { tag: 'N5 rule', name: '65 days old → found: the window is 90 days (decision 2026-09-25)', trackings: ['TBA328164202806'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA328164202806', slCode: 'SL506', active: true, createdAt: daysAgo(65) } } } } },
    { tag: 'STABLE', name: 'no pre-alert anywhere → not found', trackings: ['TBA328164202807'], data: {} },
    { tag: 'N1 rule', name: 'no stored slCode (userId account is SL1854) → no P: the owner must be stored on the pre-alert', trackings: ['TBA328164202808'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA328164202808', userId: 'u-2429-sp2', active: true, createdAt: daysAgo(1) } }, users: { 'u-2429-sp2': { slCode: 'SL1854' } } } } },

    // ── BUGS: current behavior recorded; each changes only in its own fix ──
    { tag: 'BUG N1', name: 'no slCode + numeric userId 2429 → invents SL2429 (another person)', trackings: ['TBA330000000001'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA330000000001', userId: '2429', active: true, createdAt: daysAgo(1) } } } } },
    { tag: 'BUG N1', name: 'no slCode + doc id ending _2429 (SP2 shipment key) → invents SL2429', trackings: ['TBA330000000002'],
      data: { sp2: { pre_alerts: { TBA330000000002_2429: { tracking: 'TBA330000000002', active: true, createdAt: daysAgo(1) } } } } },
    { tag: 'BUG N2', name: 'two accounts pre-alerted the same tracking → one picked silently (the one with a name)', trackings: ['TBA330000000003'],
      data: { sp2: { pre_alerts: {
        TBA330000000003_SL600: { tracking: 'TBA330000000003', slCode: 'SL600', active: true, createdAt: daysAgo(3) },
        TBA330000000003_SL601: { tracking: 'TBA330000000003', slCode: 'SL601', displayName: 'Otra Persona', active: true, createdAt: daysAgo(2) },
      } } } },
    { tag: 'BUG N3', name: 'SP2 has nothing, SP1 synced copy has one → ghost match', trackings: ['TBA330000000004'],
      data: { sp1: { pre_alerts: { TBA330000000004_u1234567: { tracking: 'TBA330000000004', slCode: 'SL602', status: 'pre-alerted', createdAt: daysAgo(4) } } } } },
    { tag: 'BUG N3', name: 'SP2 pre-alert CANCELLED, SP1 copy still active → ghost match revives it', trackings: ['TBA330000000005'],
      data: {
        sp2: { pre_alerts: { TBA330000000005_SL603: { tracking: 'TBA330000000005', slCode: 'SL603', active: false, createdAt: daysAgo(4) } } },
        sp1: { pre_alerts: { TBA330000000005_u1234567: { tracking: 'TBA330000000005', slCode: 'SL603', status: 'pre-alerted', createdAt: daysAgo(4) } } },
      } },
    { tag: 'BUG N4', name: 'pre-alert consumed by manifest A matches again while editing manifest B', trackings: ['TBA330000000006'], manifest: 'MAN-B',
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA330000000006', slCode: 'SL604', active: true, status: 'manifested', manifestNumber: 'MAN-A', createdAt: daysAgo(5) } } } } },
    { tag: 'BUG N5', name: 'pre-alert without any date is valid forever', trackings: ['TBA330000000007'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA330000000007', slCode: 'SL605', active: true, status: 'pending' } } } } },
    { tag: 'BUG N6', name: 'pre-alert flagged needsReview by SP2 still decides the customer', trackings: ['TBA330000000008'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA330000000008', slCode: 'SL606', active: true, needsReview: true, reviewReason: 'slcode_user_mismatch', createdAt: daysAgo(1) } } } } },
    { tag: 'N5 rule', name: '95 days old → not found (outside the 90-day window)', trackings: ['TBA328164202809'],
      data: { sp2: { pre_alerts: { x1: { tracking: 'TBA328164202809', slCode: 'SL509', active: true, createdAt: daysAgo(95) } } } } },
    { tag: 'BUG N7', name: 'FedEx 34-digit barcode never finds the 12-digit pre-alert (real 877098560696)', trackings: ['9632001960806794376300877098560696'],
      data: { sp2: { pre_alerts: { '877098560696_SL607': { tracking: '877098560696', canonicalTracking: '877098560696', slCode: 'SL607', active: true, createdAt: daysAgo(3) } } } } },
    { tag: 'BUG N7', name: 'FedEx 34-digit barcode never finds the 12-digit pre-alert (real 541441998502)', trackings: ['9622080430009957513300541441998502'],
      data: { sp2: { pre_alerts: { '541441998502_SL608': { tracking: '541441998502', slCode: 'SL608', active: true, createdAt: daysAgo(3) } } } } },
  ];

  for (const c of cases) {
    it(`[${c.tag}] ${c.name}`, async () => {
      seed(c.data);
      const res = await batchResolvePreAlerts(c.trackings, c.manifest);
      expect(pick(res)).toMatchSnapshot();
      expect(h.writes).toEqual([]);   // resolving never writes
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('watchPreAlerts (Nova live listener) — golden master', () => {
  const run = (trackings: string[]) => new Promise<any>((resolve) => {
    let last: any; watchPreAlerts(trackings, (m) => { last = pick(m); });
    resolve(last);
  });

  it('[STABLE] exact TBA with slCode', async () => {
    seed({ sp2: { pre_alerts: { a: { tracking: 'TBA340000000001', slCode: 'SL700', active: true, createdAt: daysAgo(1) } } } });
    expect(await run(['TBA340000000001'])).toMatchSnapshot();
  });
  it('[BUG N2] two accounts, same tracking → first document wins', async () => {
    seed({ sp2: { pre_alerts: {
      a: { tracking: 'TBA340000000002', slCode: 'SL701', active: true, createdAt: daysAgo(1) },
      b: { tracking: 'TBA340000000002', slCode: 'SL702', active: true, createdAt: daysAgo(1) },
    } } });
    expect(await run(['TBA340000000002'])).toMatchSnapshot();
  });
  it('[BUG N10] pre-alert without slCode is still reported as found (the P shows with the row customer)', async () => {
    seed({ sp2: { pre_alerts: { a: { tracking: 'TBA340000000003', userId: 'x', active: true, createdAt: daysAgo(1) } } } });
    expect(await run(['TBA340000000003'])).toMatchSnapshot();
  });
  it('[BUG N6] needsReview pre-alert still matches live', async () => {
    seed({ sp2: { pre_alerts: { a: { tracking: 'TBA340000000004', slCode: 'SL703', needsReview: true, active: true, createdAt: daysAgo(1) } } } });
    expect(await run(['TBA340000000004'])).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('batchConsumePreAlerts — golden master', () => {
  it('[BUG N9] consuming for SL800 also marks SL801 pre-alert of the same tracking as invoiced', async () => {
    seed({ sp2: { pre_alerts: {
      TBA350000000001_SL800: { tracking: 'TBA350000000001', slCode: 'SL800', active: true, status: 'pending' },
      TBA350000000001_SL801: { tracking: 'TBA350000000001', slCode: 'SL801', active: true, status: 'pending' },
    } } });
    await batchConsumePreAlerts([{ tracking: 'TBA350000000001', slCode: 'SL800', manifestNumber: 'MAN-1', invoiceNumber: 'F-9' }]);
    expect(h.writes.map(w => ({ id: w.id, status: w.payload.status, invoiceNumber: w.payload.invoiceNumber })).sort((a, b) => a.id.localeCompare(b.id))).toMatchSnapshot();
  });
  it('[N9 rule] item without slCode consumes nothing', async () => {
    seed({ sp2: { pre_alerts: { TBA350000000003_SL803: { tracking: 'TBA350000000003', slCode: 'SL803', active: true, status: 'pending' } } } });
    await batchConsumePreAlerts([{ tracking: 'TBA350000000003', manifestNumber: 'MAN-3' }]);
    expect(h.writes).toEqual([]);
  });
  it('[STABLE] consuming a single-owner pre-alert marks only it', async () => {
    seed({ sp2: { pre_alerts: { TBA350000000002_SL802: { tracking: 'TBA350000000002', slCode: 'SL802', active: true, status: 'pending' } } } });
    await batchConsumePreAlerts([{ tracking: 'TBA350000000002', slCode: 'SL802', manifestNumber: 'MAN-2' }]);
    expect(h.writes.map(w => ({ id: w.id, status: w.payload.status, manifestNumber: w.payload.manifestNumber }))).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canonicalizeTracking — golden master of real formats', () => {
  const inputs = [
    'TBA328164202802', '1Z999AA10123456784', 'GFUS01037285975296', 'GSUNJ62X00ABCD', 'YT2512345678901234', 'LP00123456789012',
    'LY123456789CN', '1234567890', '771234567890', '612345678901234',
    '9400111899223197428490', '92055901755477000000000011', '420331959405511899223197428491', '4203316612349400111899223197428490',
    '4203316694001008754116860220', '420331669400111899223344556677',
    '9632001960806794376300877098560696', '9622080430009957513300541441998502', '9632080400208194694100875411686022',
    'tba-328164202802', ' 1z999aa10123456784 ', ']C1TBA328164202802',
  ];
  for (const raw of inputs) {
    it(`${JSON.stringify(raw)}`, () => {
      const a = canonicalizeTracking(raw);
      expect({ canonical: a.canonicalTracking, type: a.carrierType, carrier: a.carrier, variants: [...a.trackingVariants].sort() }).toMatchSnapshot();
    });
  }
});
