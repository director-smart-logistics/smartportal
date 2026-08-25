/**
 * AuditService — Unit Tests
 *
 * Covers:
 *  - logAction entry queuing and enrichment
 *  - Micro-batch flush trigger at BATCH_MAX
 *  - flushAuditQueue drain behavior
 *  - Error tolerance (Firestore failures are swallowed)
 *  - getAuditLogs filter construction (userId, action, category, limitN)
 *  - getAuditLogs result mapping (timestamp, clientTimestamp fallback, empty)
 *  - Platform detection (Web vs Mobile user-agent)
 *
 * All Firebase calls and browser globals are mocked.
 * The test environment is 'node' — navigator/screen are stubbed via vi.stubGlobal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Browser global stubs ───────────────────────────────────────────────────────
// navigator and screen are not available in Node — stub them before module load.

vi.stubGlobal('navigator', {
  userAgent: 'TestAgent/1.0 Desktop',
  language: 'en-US',
});
vi.stubGlobal('screen', { width: 1920, height: 1080 });

// ── Firebase mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase/config', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => 'audit-col-ref'),
  addDoc:          vi.fn().mockResolvedValue({ id: 'audit-doc-id' }),
  serverTimestamp: vi.fn(() => 'server-ts'),
  query:           vi.fn((...args: unknown[]) => args),
  where:           vi.fn((f: string, op: string, v: unknown) => ({ where: f, op, val: v })),
  orderBy:         vi.fn((f: string, d: string) => ({ orderBy: f, dir: d })),
  limit:           vi.fn((n: number) => ({ limit: n })),
  getDocs:         vi.fn().mockResolvedValue({ docs: [] }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { AuditEntry } from '.././audit-service';

function baseEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    userId:   'user-123',
    userName: 'Test User',
    userEmail:'test@example.com',
    userRole: 'admin',
    action:   'nova_query',
    category: 'nova',
    result:   'success',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFirestore(): Promise<any> {
  return import('firebase/firestore');
}

// ── logAction & flushAuditQueue ───────────────────────────────────────────────

describe('AuditService — logAction & flushAuditQueue', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Drain any leftover queue from a previous test so queue starts empty
    const { flushAuditQueue } = await import('.././audit-service');
    await flushAuditQueue();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues an entry and writes it to Firestore on flush', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it('preserves all caller-supplied AuditEntry fields in the written document', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry({ resource: '/nova', resourceId: 'session-abc', result: 'success' }));
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.userId).toBe('user-123');
    expect(doc.action).toBe('nova_query');
    expect(doc.category).toBe('nova');
    expect(doc.result).toBe('success');
    expect(doc.resource).toBe('/nova');
    expect(doc.resourceId).toBe('session-abc');
  });

  it('enriches every entry with clientTimestamp (ISO string)', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(typeof doc.clientTimestamp).toBe('string');
    expect(() => new Date(doc.clientTimestamp)).not.toThrow();
  });

  it('enriches every entry with appVersion', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(typeof doc.appVersion).toBe('string');
    expect(doc.appVersion.length).toBeGreaterThan(0);
  });

  it('enriches every entry with device context: userAgent, language, screenSize', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.userAgent).toBe('TestAgent/1.0 Desktop');
    expect(doc.language).toBe('en-US');
    expect(doc.screenSize).toBe('1920x1080');
  });

  it('appends serverTimestamp() to every entry', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.timestamp).toBe('server-ts');
  });

  it('caller-supplied page overrides the auto-populated device context page', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry({ page: '/my-custom-page' }));
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.page).toBe('/my-custom-page');
  });

  it('flush is a no-op when the queue is already empty', async () => {
    const { flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    await flushAuditQueue();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('flushes multiple queued entries in a single batch', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry({ action: 'login' }));
    logAction(baseEntry({ action: 'page_view' }));
    logAction(baseEntry({ action: 'nova_query' }));
    await flushAuditQueue();

    expect(addDoc).toHaveBeenCalledTimes(3);
  });

  it('queue is empty after a successful flush (idempotent second flush)', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();
    addDoc.mockClear();

    await flushAuditQueue(); // second call — queue should be empty
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('triggers an immediate flush when BATCH_MAX (10) entries are queued', async () => {
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    for (let i = 0; i < 10; i++) {
      logAction(baseEntry({ metadata: { index: i } }));
    }

    // The 10th logAction triggers flush() internally (fire-and-forget).
    // Await a macro-task tick so pending microtasks (addDoc promises) can settle.
    await new Promise(resolve => setTimeout(resolve, 0));
    // Queue was already drained by the batch trigger — second flush is no-op
    await flushAuditQueue();

    expect(addDoc).toHaveBeenCalledTimes(10);
  });

  it('does not throw when Firestore write fails (error is swallowed)', async () => {
    const { addDoc } = await getFirestore();
    addDoc.mockRejectedValueOnce(new Error('Firestore unavailable'));
    const { logAction, flushAuditQueue } = await import('.././audit-service');

    logAction(baseEntry());
    await expect(flushAuditQueue()).resolves.toBeUndefined();
  });

  it('processes remaining entries even when one addDoc call fails', async () => {
    const { addDoc } = await getFirestore();
    addDoc
      .mockRejectedValueOnce(new Error('first write failed'))
      .mockResolvedValue({ id: 'ok' });
    const { logAction, flushAuditQueue } = await import('.././audit-service');

    logAction(baseEntry({ action: 'login' }));
    logAction(baseEntry({ action: 'logout' }));
    await flushAuditQueue();

    // Both were attempted despite the first failure (Promise.allSettled)
    expect(addDoc).toHaveBeenCalledTimes(2);
  });
});

// ── getAuditLogs filter construction ─────────────────────────────────────────

describe('AuditService — getAuditLogs filter construction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses orderBy(timestamp, desc) and limit(100) with no filters', async () => {
    const { getDocs, orderBy, limit, where } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getAuditLogs } = await import('.././audit-service');

    await getAuditLogs();

    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(limit).toHaveBeenCalledWith(100);
    expect(where).not.toHaveBeenCalled();
  });

  it('adds where(userId) when userId filter is provided', async () => {
    const { getDocs, where } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getAuditLogs } = await import('.././audit-service');

    await getAuditLogs({ userId: 'user-abc' });

    expect(where).toHaveBeenCalledWith('userId', '==', 'user-abc');
  });

  it('adds where(action) when action filter is provided', async () => {
    const { getDocs, where } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getAuditLogs } = await import('.././audit-service');

    await getAuditLogs({ action: 'login' });

    expect(where).toHaveBeenCalledWith('action', '==', 'login');
  });

  it('adds where(category) when category filter is provided', async () => {
    const { getDocs, where } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getAuditLogs } = await import('.././audit-service');

    await getAuditLogs({ category: 'nova' });

    expect(where).toHaveBeenCalledWith('category', '==', 'nova');
  });

  it('overrides default limit(100) when limitN is provided', async () => {
    const { getDocs, limit } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getAuditLogs } = await import('.././audit-service');

    await getAuditLogs({ limitN: 25 });

    expect(limit).toHaveBeenCalledWith(25);
  });

  it('can combine multiple filters simultaneously', async () => {
    const { getDocs, where } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getAuditLogs } = await import('.././audit-service');

    await getAuditLogs({ userId: 'u1', action: 'nova_query', category: 'nova' });

    expect(where).toHaveBeenCalledWith('userId', '==', 'u1');
    expect(where).toHaveBeenCalledWith('action', '==', 'nova_query');
    expect(where).toHaveBeenCalledWith('category', '==', 'nova');
  });
});

// ── getAuditLogs result mapping ───────────────────────────────────────────────

describe('AuditService — getAuditLogs result mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps Firestore docs to AuditLogDoc shape with correct id and fields', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({
      docs: [{
        id: 'doc-1',
        data: () => ({
          userId: 'user-1',
          action: 'login',
          category: 'auth',
          result: 'success',
          clientTimestamp: '2024-01-01T00:00:00.000Z',
          timestamp: { toDate: () => new Date('2024-01-15T12:00:00.000Z') },
        }),
      }],
    });
    const { getAuditLogs } = await import('.././audit-service');

    const logs = await getAuditLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe('doc-1');
    expect(logs[0].userId).toBe('user-1');
    expect(logs[0].action).toBe('login');
    expect(logs[0].result).toBe('success');
    expect(logs[0].timestamp).toBe('2024-01-15T12:00:00.000Z');
  });

  it('falls back to clientTimestamp when timestamp.toDate is absent', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({
      docs: [{
        id: 'doc-2',
        data: () => ({
          userId: 'user-2',
          action: 'page_view',
          category: 'navigation',
          result: 'success',
          clientTimestamp: '2024-02-01T08:00:00.000Z',
          timestamp: null,
        }),
      }],
    });
    const { getAuditLogs } = await import('.././audit-service');

    const logs = await getAuditLogs();

    expect(logs[0].timestamp).toBe('2024-02-01T08:00:00.000Z');
  });

  it('returns empty array when no documents match', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getAuditLogs } = await import('.././audit-service');

    const logs = await getAuditLogs({ userId: 'ghost-user' });

    expect(logs).toEqual([]);
  });

  it('maps multiple documents preserving order', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({
      docs: [
        { id: 'a', data: () => ({ userId: 'u1', action: 'login',    category: 'auth',       result: 'success', timestamp: null, clientTimestamp: '2024-01-02T00:00:00.000Z' }) },
        { id: 'b', data: () => ({ userId: 'u1', action: 'page_view', category: 'navigation', result: 'success', timestamp: null, clientTimestamp: '2024-01-01T00:00:00.000Z' }) },
      ],
    });
    const { getAuditLogs } = await import('.././audit-service');

    const logs = await getAuditLogs();

    expect(logs).toHaveLength(2);
    expect(logs[0].id).toBe('a');
    expect(logs[1].id).toBe('b');
  });
});

// ── Platform detection ────────────────────────────────────────────────────────

describe('AuditService — platform detection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { flushAuditQueue } = await import('.././audit-service');
    await flushAuditQueue();
    vi.clearAllMocks();
  });

  it('sets platform to "Web" for a desktop user-agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      language: 'en-US',
    });
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.platform).toBe('Web');
  });

  it('sets platform to "Mobile" for an iPhone user-agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      language: 'es-CR',
    });
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.platform).toBe('Mobile');
  });

  it('sets platform to "Mobile" for an Android user-agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36',
      language: 'en-US',
    });
    const { logAction, flushAuditQueue } = await import('.././audit-service');
    const { addDoc } = await getFirestore();

    logAction(baseEntry());
    await flushAuditQueue();

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.platform).toBe('Mobile');
  });
});
