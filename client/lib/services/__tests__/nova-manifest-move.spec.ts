import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real module logic; Firestore replaced by an in-memory recorder so the test can count commits.
const commits: Array<Array<{ op: string; path: string; data?: any }>> = [];
let invoices: Array<{ id: string; data: any }> = [];
let packages: Record<string, any> = {};
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../sync-invoices-service', () => ({ deleteInvoiceFromSp2: vi.fn(async () => {}) }));
vi.mock('../sync-smartweb-service', () => ({ syncPackagesToSmartWeb: vi.fn(async () => {}) }));
vi.mock('../invoice-service', () => ({
  findPackagesLinkedToInvoice: vi.fn(async (id: string) => Object.entries(packages).filter(([, p]) => p.invoiceId === id).map(([pid, p]) => ({ id: pid, data: () => p }))),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: any, name: string) => ({ name }),
  doc: (_db: any, coll: string, id: string) => ({ path: `${coll}/${id}` }),
  documentId: () => '__id__',
  where: (f: string, op: string, v: any) => ({ f, op, v }),
  query: (c: any, w: any) => ({ c, w }),
  getDocs: async (q: any) => {
    if (q.c.name === 'invoices') return { docs: invoices.map((i) => ({ id: i.id, data: () => i.data })) };
    if (q.c.name === 'packages') return { docs: (q.w.v as string[]).filter((id) => packages[id]).map((id) => ({ id, data: () => packages[id] })) };
    return { docs: [] };
  },
  writeBatch: () => { const ops: any[] = []; return {
    set: (r: any, data: any) => ops.push({ op: 'set', path: r.path, data }),
    update: (r: any, data: any) => ops.push({ op: 'update', path: r.path, data }),
    delete: (r: any) => ops.push({ op: 'delete', path: r.path }),
    commit: async () => { commits.push(ops); },
  }; },
  deleteField: () => '__delete__',
  arrayUnion: (x: any) => ({ arrayUnion: x }),
}));

import { moveTrackingsToManifestAtomic, classifyInvoicesForMove, MAX_ATOMIC_WRITES } from '../nova-manifest-move';

beforeEach(() => {
  commits.length = 0;
  invoices = [
    { id: 'INV-DRAFT', data: { status: 'draft', trackingNumbers: ['T1'], invoiceNumber: 'N-D' } },
    { id: 'INV-SENT', data: { status: 'sent', trackingNumbers: ['T2', 'T9'], invoiceNumber: 'N-S' } },
    { id: 'INV-PAID', data: { status: 'paid', trackingNumbers: ['T3'], invoiceNumber: 'N-P' } },
    { id: 'INV-OTHER', data: { status: 'sent', trackingNumbers: ['X1'], invoiceNumber: 'N-O' } },
  ];
  packages = {
    T1: { invoiceId: 'INV-DRAFT', slCode: 'SL1', status: 'processed' },
    T2: { invoiceId: 'INV-SENT', slCode: 'SL1', status: 'processed' },
    T9: { invoiceId: 'INV-SENT', slCode: 'SL1', status: 'processed' },   // same invoice, NOT moved
    T3: { invoiceId: 'INV-PAID', slCode: 'SL1', status: 'processed' },
  };
});

describe('Nova "Reasignar Encomiendas" — atomic move', () => {
  it('classifies: drafts deleted, sent annulled, paid protected, other invoices untouched', () => {
    const c = classifyInvoicesForMove(invoices, ['T1', 'T2', 'T3']);
    expect(c.drafts.map((i) => i.id)).toEqual(['INV-DRAFT']);
    expect(c.toAnnul.map((i) => i.id)).toEqual(['INV-SENT']);
    expect(c.skippedPaid).toBe(1);
  });

  it('writes EVERYTHING in exactly ONE commit', async () => {
    const r = await moveTrackingsToManifestAtomic(['T1', 'T2', 'T3'], 'M-SRC', 'ENC-DEST', { movedBy: 'qa' });
    expect(commits).toHaveLength(1);
    const ops = commits[0];
    expect(ops.find((o) => o.path === 'invoices/INV-DRAFT')?.op).toBe('delete');
    expect(ops.find((o) => o.path === 'invoices/INV-SENT')?.data.status).toBe('annulled');
    expect(ops.some((o) => o.path === 'invoices/INV-PAID' || o.path === 'invoices/INV-OTHER')).toBe(false);
    for (const t of ['T1', 'T2', 'T3']) {
      const w = ops.find((o) => o.path === `packages/${t}`)!;
      expect(w.data.manifestNumber).toBe('ENC-DEST');
      expect(w.data.encomiendaManifestNumber).toBe('ENC-DEST');
      expect(ops.find((o) => o.path === `manifest_encomiendas/${t}`)?.data.manifestNumber).toBe('ENC-DEST');
    }
    // unlinked from deleted / annulled invoices; the paid one keeps its link
    expect(ops.find((o) => o.path === 'packages/T1')!.data.invoiceId).toBe('__delete__');
    expect(ops.find((o) => o.path === 'packages/T2')!.data.invoiceId).toBe('__delete__');
    expect(ops.find((o) => o.path === 'packages/T3')!.data.invoiceId).toBeUndefined();
    // T9 shares the annulled invoice but is NOT moved: unlinked, manifest unchanged
    const t9 = ops.find((o) => o.path === 'packages/T9')!;
    expect(t9.data.invoiceId).toBe('__delete__');
    expect(t9.data.manifestNumber).toBeUndefined();
    // nothing to consolidation
    expect(ops.some((o) => /consolidation|consolidacion/.test(o.path) || o.data?.manifestNumber === 'consolidacion_transitoria' || o.data?.status === 'consolidated')).toBe(false);
    expect(r).toMatchObject({ deletedDrafts: 1, annulledIds: ['INV-SENT'], skippedPaid: 1 });
  });

  it('too many writes → refuses BEFORE writing anything', async () => {
    const many = Array.from({ length: MAX_ATOMIC_WRITES }, (_, i) => `B${i}`);
    await expect(moveTrackingsToManifestAtomic(many, 'M-SRC', 'ENC-DEST', { movedBy: 'qa' })).rejects.toThrow(/No se modificó nada/);
    expect(commits).toHaveLength(0);
  });
});
