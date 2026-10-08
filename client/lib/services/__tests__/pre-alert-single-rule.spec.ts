/**
 * Phase 1 (F1.2) — ONE match rule for the manifest load (batchResolvePreAlerts) and the live
 * listener (watchPreAlerts). Every scenario runs through both and they must agree.
 * docs/NOVA_PREALERT_MATCH_SCENARIOS.md (A, B, C).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

type Doc = Record<string, any>;
const h = vi.hoisted(() => ({
  store: {} as Record<string, Doc>,                                   // SP2 pre_alerts: id -> data
  listeners: [] as Array<{ q: any; cb: (s: any) => void }>,
  failField: '' as string,                                            // simulate SP2 failing on one field
}));

vi.mock('@/lib/firebase/config', () => ({ db: { __db: 'SP1' }, dbSP2: { __db: 'SP2' } }));
vi.mock('firebase/firestore', () => {
  const run = (q: any) => {
    const docs = Object.entries(h.store)
      .filter(([, d]) => q.cs.every((c: any) => (c.op === 'in' ? c.value.includes(d[c.field]) : d[c.field] === c.value)))
      .map(([id, d]) => ({ id, data: () => ({ ...d }) }));
    return { docs, empty: docs.length === 0 };
  };
  return {
    collection: (db: any, name: string) => ({ db: db.__db, name }),
    where: (field: string, op: string, value: any) => ({ field, op, value }),
    limit: (n: number) => ({ limit: n }),
    query: (ref: any, ...cs: any[]) => ({ ref, cs }),
    getDocs: async (q: any) => {
      if (h.failField && q.cs.some((c: any) => c.field === h.failField)) throw new Error('unavailable');
      return run(q);
    },
    doc: vi.fn(), getDoc: vi.fn(), updateDoc: vi.fn(),
    onSnapshot: (q: any, cb: (s: any) => void, onErr?: (e: any) => void) => {
      const l = { q, cb };
      if (h.failField && q.cs.some((c: any) => c.field === h.failField)) { onErr?.(new Error('unavailable')); return () => {}; }
      h.listeners.push(l);
      cb(run(q));
      return () => { h.listeners = h.listeners.filter((x) => x !== l); };
    },
    __emitAll: () => h.listeners.forEach((l) => l.cb(run(l.q))),
  };
});

import * as fs from 'firebase/firestore';
import { batchResolvePreAlerts, watchPreAlerts, repeatedTrackingIndices, diffLivePreAlerts } from '../pre-alert-resolver';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const P = (sl: string, t: string, extra: Doc = {}) => ({ tracking: t, slCode: sl, active: true, status: 'pending', createdAt: daysAgo(3), ...extra });
const view = (m: Map<string, any>) => Object.fromEntries([...m.entries()].map(([k, v]) =>
  [k, v.found ? v.slCode : v.ambiguousSlCodes ? `SEVERAL:${v.ambiguousSlCodes.join('/')}` : '-']));

async function both(trackings: string[], manifest?: string) {
  const batch = view(await batchResolvePreAlerts(trackings, manifest));
  let live: any;
  const unsub = watchPreAlerts(trackings, (m) => { live = view(m); }, manifest);
  unsub();
  return { batch, live };
}

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { h.store = {}; h.listeners = []; h.failField = ''; });

const FEDEX34 = '9632001960806794376300877098560696';
const USPS420 = '420331959405511899223197428491';

describe('F1.2 — load and live give the SAME result', () => {
  const cases: Array<[string, Record<string, Doc>, string[], Record<string, string>, string?]> = [
    ['A1 exact TBA', { a: P('SL1', 'TBA330000000020') }, ['TBA330000000020'], { TBA330000000020: 'SL1' }],
    ['A2 FedEx 34 → pre-alerted 12 (reverse)', { a: P('SL1', '877098560696') }, [FEDEX34], { [FEDEX34]: 'SL1' }],
    ['A3 USPS 420+ZIP → pre-alerted 22 (reverse)', { a: P('SL1', '9405511899223197428491') }, [USPS420], { [USPS420]: 'SL1' }],
    ['A6 legacy doc with only trackingNumber', { a: { trackingNumber: 'TBA330000000013', slCode: 'SL1', active: true, createdAt: daysAgo(2) } }, ['TBA330000000013'], { TBA330000000013: 'SL1' }],
    ['A7 one digit different → nothing (never "similar")', { a: P('SL1', 'TBA330000000014') }, ['TBA330000000015'], { TBA330000000015: '-' }],
    ['A8 FedEx 12 exact, another 15 ending the same is another package', { a: P('SL1', '877098560696'), b: P('SL2', '123877098560696') }, ['877098560696'], { '877098560696': 'SL1' }],
    ['B1 two accounts, same tracking → several', { a: P('SL1', 'TBA330000000021'), b: P('SL2', 'TBA330000000021') }, ['TBA330000000021'], { TBA330000000021: 'SEVERAL:SL1/SL2' }],
    ['B2 A exact (typed the 34) + B by the end (12) → several', { a: P('SL1', FEDEX34), b: P('SL2', '877098560696') }, [FEDEX34], { [FEDEX34]: 'SEVERAL:SL1/SL2' }],
    ['B3 USPS: A typed 420+ZIP, B typed the 22 → several', { a: P('SL1', USPS420), b: P('SL2', '9405511899223197428491') }, [USPS420], { [USPS420]: 'SEVERAL:SL1/SL2' }],
    ['B4 same account twice → one owner', { a: P('SL1', 'TBA330000000016'), b: P('sl1', 'TBA330000000016') }, ['TBA330000000016'], { TBA330000000016: 'SL1' }],
    ['B5 A 120 days old + B fresh → B', { a: P('SL1', 'TBA330000000017', { createdAt: daysAgo(120) }), b: P('SL2', 'TBA330000000017') }, ['TBA330000000017'], { TBA330000000017: 'SL2' }],
    ['B6 A + ownerless legacy → A', { a: P('SL1', 'TBA330000000018'), b: { tracking: 'TBA330000000018', userId: 'x', active: true, createdAt: daysAgo(1) } }, ['TBA330000000018'], { TBA330000000018: 'SL1' }],
    ['B6b ownerless exact + owner by the end → the owner', { a: { tracking: FEDEX34, userId: 'x', active: true, createdAt: daysAgo(1) }, b: P('SL2', '877098560696') }, [FEDEX34], { [FEDEX34]: 'SL2' }],
    ['C1 91 days → nothing', { a: P('SL1', 'TBA330000000022', { createdAt: daysAgo(91) }) }, ['TBA330000000022'], { TBA330000000022: '-' }],
    ['C2 no date → nothing', { a: { tracking: 'TBA330000000023', slCode: 'SL1', active: true } }, ['TBA330000000023'], { TBA330000000023: '-' }],
    ['C3 cancelled → nothing', { a: P('SL1', 'TBA330000000024', { active: false }) }, ['TBA330000000024'], { TBA330000000024: '-' }],
    ['C4 needsReview → nothing', { a: P('SL1', 'TBA330000000025', { needsReview: true }) }, ['TBA330000000025'], { TBA330000000025: '-' }],
    ['C5 delivered → nothing', { a: P('SL1', 'TBA330000000026', { delivered: true }) }, ['TBA330000000026'], { TBA330000000026: '-' }],
    ['C6 used in ANOTHER manifest → nothing', { a: P('SL1', 'TBA330000000027', { status: 'manifested', manifestNumber: 'MAN-A' }) }, ['TBA330000000027'], { TBA330000000027: '-' }, 'MAN-B'],
    ['C7 used in THIS manifest → still counts', { a: P('SL1', 'TBA330000000011', { status: 'manifested', manifestNumber: 'MAN-1' }) }, ['TBA330000000011'], { TBA330000000011: 'SL1' }, 'MAN-1'],
    ['C8 no slCode → nothing', { a: { tracking: 'TBA330000000028', userId: '2429', active: true, createdAt: daysAgo(1) } }, ['TBA330000000028'], { TBA330000000028: '-' }],
  ];

  for (const [name, store, trackings, expected, manifest] of cases) {
    it(name, async () => {
      h.store = structuredClone(store);
      const { batch, live } = await both(trackings, manifest);
      expect(batch).toEqual(expected);
      expect(live).toEqual(batch);
    });
  }
});

describe('F1.2 — live listener follows changes', () => {
  it('a pre-alert that stops matching (tracking corrected) is dropped', () => {
    h.store = { a: P('SL1', 'TBA330000000030') };
    let live: any;
    const unsub = watchPreAlerts(['TBA330000000030'], (m) => { live = view(m); });
    expect(live).toEqual({ TBA330000000030: 'SL1' });
    h.store.a = { ...h.store.a, tracking: 'TBA330000000031' };
    (fs as any).__emitAll();
    expect(live).toEqual({ TBA330000000030: '-' });
    unsub();
  });

  it('a pre-alert cancelled while the table is open is dropped', () => {
    h.store = { a: P('SL1', 'TBA330000000032') };
    let live: any;
    const unsub = watchPreAlerts(['TBA330000000032'], (m) => { live = view(m); });
    h.store.a = { ...h.store.a, active: false };
    (fs as any).__emitAll();
    expect(live).toEqual({ TBA330000000032: '-' });
    unsub();
  });

  it('a second account pre-alerting the same tracking turns it into several', () => {
    h.store = { a: P('SL1', 'TBA330000000033') };
    let live: any;
    const unsub = watchPreAlerts(['TBA330000000033'], (m) => { live = view(m); });
    h.store.b = P('SL2', 'TBA330000000033');
    (fs as any).__emitAll();
    expect(live).toEqual({ TBA330000000033: 'SEVERAL:SL1/SL2' });
    unsub();
  });
});

describe('F1.6 — repeatedTrackingIndices (B7: same package twice in one manifest)', () => {
  const rep = (t: Array<string | undefined>, skip?: number[]) => [...repeatedTrackingIndices(t, skip && new Set(skip))].sort();
  it('identical tracking twice', () => expect(rep(['TBA330000000040', 'TBA330000000041', 'TBA330000000040'])).toEqual([0, 2]));
  it('case and spaces do not hide it', () => expect(rep(['tba 330000000042', 'TBA330000000042'])).toEqual([0, 1]));
  it('FedEx 34 barcode and its 12 digits are the same package', () => expect(rep([FEDEX34, '877098560696'])).toEqual([0, 1]));
  it('USPS 420+ZIP and its 22-digit tracking are the same package', () => expect(rep([USPS420, '9405511899223197428491'])).toEqual([0, 1]));
  it('different trackings → none', () => expect(rep(['TBA330000000043', 'TBA330000000044', '877098560696'])).toEqual([]));
  it('one digit different → none (never "similar")', () => expect(rep(['TBA330000000045', 'TBA330000000046'])).toEqual([]));
  it('a deleted row does not count', () => expect(rep(['TBA330000000047', 'TBA330000000047'], [1])).toEqual([]));
  it('empty trackings are ignored', () => expect(rep(['', undefined, ''])).toEqual([]));
});

describe('F1.3 — live listener acts on complete results only, and never silently', () => {
  it('the first result comes ONCE, after every query answered (never a partial result)', () => {
    h.store = { a: P('SL1', 'TBA330000000050'), b: P('SL2', '877098560696') };
    const calls: any[] = [];
    const unsub = watchPreAlerts(['TBA330000000050', FEDEX34, 'TBA330000000051'], (m) => calls.push(view(m)));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ TBA330000000050: 'SL1', [FEDEX34]: 'SL2', TBA330000000051: '-' });
    unsub();
  });

  it('a failing listener is reported and no partial result is used', () => {
    h.failField = 'canonicalTracking';
    h.store = { a: P('SL1', 'TBA330000000052') };
    const calls: any[] = []; const errors: unknown[] = [];
    const unsub = watchPreAlerts(['TBA330000000052'], (m) => calls.push(view(m)), undefined, (e) => errors.push(e));
    expect(errors).toHaveLength(1);
    expect(calls).toHaveLength(0);
    unsub();
  });

  it('the one-shot read reports a failing query (the found ones still count)', async () => {
    h.failField = 'trackingNumber';
    h.store = { a: P('SL1', 'TBA330000000053') };
    const errors: unknown[] = [];
    const res = view(await batchResolvePreAlerts(['TBA330000000053'], undefined, (e) => errors.push(e)));
    expect(errors.length).toBeGreaterThan(0);
    expect(res).toEqual({ TBA330000000053: 'SL1' });
  });
});

describe('F1.3 — diffLivePreAlerts: only CHANGES are acted on', () => {
  const info = (sl?: string, several?: string[]) =>
    (sl ? { found: true, tracking: 't', slCode: sl } : several ? { found: false, tracking: 't', ambiguousSlCodes: several } : { found: false, tracking: 't' }) as any;
  it('first result → every tracking changed, nothing withdrawn', () => {
    const last = new Map<string, string>();
    const d = diffLivePreAlerts(last, new Map([['t1', info('SL1')], ['t2', info()]]));
    expect([...d.changed].sort()).toEqual(['T1', 'T2']);
    expect(d.withdrawn).toEqual([]);
  });
  it('same result again → nothing changed (no re-processing, no loop)', () => {
    const last = new Map<string, string>();
    diffLivePreAlerts(last, new Map([['T1', info('SL1')], ['T2', info()]]));
    const d = diffLivePreAlerts(last, new Map([['T1', info('SL1')], ['T2', info()]]));
    expect(d.changed.size).toBe(0);
  });
  it('an unrelated tracking changes → only that one', () => {
    const last = new Map<string, string>();
    diffLivePreAlerts(last, new Map([['T1', info('SL1')], ['T2', info()]]));
    const d = diffLivePreAlerts(last, new Map([['T1', info('SL1')], ['T2', info('SL2')]]));
    expect([...d.changed]).toEqual(['T2']);
  });
  it('owner cancelled → withdrawn (the admin is told; nothing reverted)', () => {
    const last = new Map<string, string>();
    diffLivePreAlerts(last, new Map([['T1', info('SL1')]]));
    expect(diffLivePreAlerts(last, new Map([['T1', info()]])).withdrawn).toEqual(['T1']);
  });
  it('owner → several accounts → withdrawn', () => {
    const last = new Map<string, string>();
    diffLivePreAlerts(last, new Map([['T1', info('SL1')]]));
    expect(diffLivePreAlerts(last, new Map([['T1', info(undefined, ['SL1', 'SL2'])]])).withdrawn).toEqual(['T1']);
  });
  it('owner changes to another account → changed (not withdrawn)', () => {
    const last = new Map<string, string>();
    diffLivePreAlerts(last, new Map([['T1', info('SL1')]]));
    const d = diffLivePreAlerts(last, new Map([['T1', info('SL2')]]));
    expect([...d.changed]).toEqual(['T1']);
    expect(d.withdrawn).toEqual([]);
  });
});

describe('E7 — a large manifest (many query chunks) is resolved completely, load and live alike', () => {
  it('120 trackings, every other one pre-alerted', async () => {
    const trackings = Array.from({ length: 120 }, (_, i) => `TBA3310000${String(i).padStart(5, '0')}`);
    h.store = Object.fromEntries(trackings.filter((_, i) => i % 2 === 0).map((t, i) => [`d${i}`, P(`SL${1000 + i}`, t)]));
    const { batch, live } = await both(trackings);
    expect(Object.keys(batch)).toHaveLength(120);
    expect(Object.values(batch).filter((v) => v !== '-')).toHaveLength(60);
    expect(live).toEqual(batch);
  });
});

