/**
 * AI Manifest Service — Nova Learning Functions Tests
 *
 * Covers the two new learning-layer functions added alongside the audit system:
 *   - saveConversationTurn  → writes a Q&A turn to `nova_conversation_logs`
 *   - getRecentConversationTurns → queries and maps turns for few-shot context
 *
 * All Firebase calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Firebase mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase/config', () => ({ db: {}, sp2App: {} }));

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => 'conv-col-ref'),
  addDoc:          vi.fn().mockResolvedValue({ id: 'turn-doc-id' }),
  updateDoc:       vi.fn().mockResolvedValue(undefined),
  arrayUnion:      vi.fn((...args: unknown[]) => args),
  setDoc:          vi.fn().mockResolvedValue(undefined),
  getDoc:          vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  getDocs:         vi.fn().mockResolvedValue({ docs: [] }),
  doc:             vi.fn(() => 'doc-ref'),
  query:           vi.fn((...args: unknown[]) => args),
  where:           vi.fn((f: string, op: string, v: unknown) => ({ where: f, op, val: v })),
  orderBy:         vi.fn((f: string, d: string) => ({ orderBy: f, dir: d })),
  limit:           vi.fn((n: number) => ({ limit: n })),
  serverTimestamp: vi.fn(() => 'server-ts'),
  Timestamp:       { fromDate: vi.fn((d: Date) => d) },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { ConversationTurn } from '.././ai-manifest-service';

function baseTurn(overrides: Partial<Omit<ConversationTurn, 'id'>> = {}): Omit<ConversationTurn, 'id'> {
  return {
    userId:      'user-42',
    sessionId:   'session-abc',
    userQuery:   '¿Dónde está el paquete 9400111899228226247158?',
    novaResponse:'El paquete está en tránsito hacia Costa Rica.',
    toolsUsed:   ['track_package'],
    durationMs:  1420,
    resultType:  'tracking',
    timestamp:   new Date().toISOString(),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFirestore(): Promise<any> {
  return import('firebase/firestore');
}

// ── saveConversationTurn ───────────────────────────────────────────────────────

describe('saveConversationTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls addDoc once to persist the turn', async () => {
    const { addDoc } = await getFirestore();
    const { saveConversationTurn } = await import('.././ai-manifest-service');

    await saveConversationTurn(baseTurn());

    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it('writes to the nova_conversation_logs collection', async () => {
    const { addDoc, collection } = await getFirestore();
    const { saveConversationTurn } = await import('.././ai-manifest-service');

    await saveConversationTurn(baseTurn());

    // collection() is called with (db, 'nova_conversation_logs')
    expect(collection).toHaveBeenCalledWith(expect.anything(), 'nova_conversation_logs');
    const [ref] = addDoc.mock.calls[0];
    expect(ref).toBe('conv-col-ref');
  });

  it('spreads all turn fields into the stored document', async () => {
    const { addDoc } = await getFirestore();
    const { saveConversationTurn } = await import('.././ai-manifest-service');

    const turn = baseTurn({ trackingNumbers: ['9400111899228226247158'], durationMs: 2000 });
    await saveConversationTurn(turn);

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.userId).toBe('user-42');
    expect(doc.sessionId).toBe('session-abc');
    expect(doc.userQuery).toBe('¿Dónde está el paquete 9400111899228226247158?');
    expect(doc.novaResponse).toBe('El paquete está en tránsito hacia Costa Rica.');
    expect(doc.toolsUsed).toEqual(['track_package']);
    expect(doc.durationMs).toBe(2000);
    expect(doc.trackingNumbers).toEqual(['9400111899228226247158']);
    expect(doc.resultType).toBe('tracking');
  });

  it('overrides caller timestamp with serverTimestamp()', async () => {
    const { addDoc } = await getFirestore();
    const { saveConversationTurn } = await import('.././ai-manifest-service');

    await saveConversationTurn(baseTurn({ timestamp: '2024-01-01T00:00:00.000Z' }));

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.timestamp).toBe('server-ts');
  });

  it('resolves without throwing on a valid turn', async () => {
    const { saveConversationTurn } = await import('.././ai-manifest-service');
    await expect(saveConversationTurn(baseTurn())).resolves.toBeUndefined();
  });

  it('propagates Firestore errors to the caller', async () => {
    const { addDoc } = await getFirestore();
    addDoc.mockRejectedValueOnce(new Error('Firestore write failed'));
    const { saveConversationTurn } = await import('.././ai-manifest-service');

    await expect(saveConversationTurn(baseTurn())).rejects.toThrow('Firestore write failed');
  });

  it('stores a minimal turn (only required fields)', async () => {
    const { addDoc } = await getFirestore();
    const { saveConversationTurn } = await import('.././ai-manifest-service');

    await saveConversationTurn({
      userId:      'u1',
      sessionId:   's1',
      userQuery:   'Hola',
      novaResponse:'Hola, ¿cómo puedo ayudarte?',
      toolsUsed:   [],
      timestamp:   new Date().toISOString(),
    });

    const [, doc] = addDoc.mock.calls[0];
    expect(doc.userId).toBe('u1');
    expect(doc.toolsUsed).toEqual([]);
    expect(doc.timestamp).toBe('server-ts');
  });
});

// ── getRecentConversationTurns ─────────────────────────────────────────────────

describe('getRecentConversationTurns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no documents found', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    const result = await getRecentConversationTurns('user-42');

    expect(result).toEqual([]);
  });

  it('queries with where(userId) filter', async () => {
    const { getDocs, where } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    await getRecentConversationTurns('user-42');

    expect(where).toHaveBeenCalledWith('userId', '==', 'user-42');
  });

  it('queries with orderBy(timestamp, desc)', async () => {
    const { getDocs, orderBy } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    await getRecentConversationTurns('user-42');

    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');
  });

  it('defaults to limit(10)', async () => {
    const { getDocs, limit } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    await getRecentConversationTurns('user-42');

    expect(limit).toHaveBeenCalledWith(10);
  });

  it('passes custom count to limit()', async () => {
    const { getDocs, limit } = await getFirestore();
    getDocs.mockResolvedValue({ docs: [] });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    await getRecentConversationTurns('user-42', 5);

    expect(limit).toHaveBeenCalledWith(5);
  });

  it('maps returned Firestore docs to ConversationTurn shape', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({
      docs: [{
        id: 'turn-1',
        data: () => ({
          userId:      'user-42',
          sessionId:   'session-abc',
          userQuery:   '¿Cuántos paquetes tiene Juan Pérez?',
          novaResponse:'Juan Pérez tiene 3 paquetes en tránsito.',
          toolsUsed:   ['search_customer'],
          durationMs:  800,
          resultType:  'customer',
          timestamp:   { toDate: () => new Date('2024-03-01T10:00:00.000Z') },
        }),
      }],
    });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    const turns = await getRecentConversationTurns('user-42');

    expect(turns).toHaveLength(1);
    expect(turns[0].id).toBe('turn-1');
    expect(turns[0].userId).toBe('user-42');
    expect(turns[0].sessionId).toBe('session-abc');
    expect(turns[0].userQuery).toBe('¿Cuántos paquetes tiene Juan Pérez?');
    expect(turns[0].toolsUsed).toEqual(['search_customer']);
    expect(turns[0].resultType).toBe('customer');
    expect(turns[0].timestamp).toBe('2024-03-01T10:00:00.000Z');
  });

  it('falls back to raw timestamp string when toDate is absent', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({
      docs: [{
        id: 'turn-2',
        data: () => ({
          userId:      'user-42',
          sessionId:   's1',
          userQuery:   'test',
          novaResponse:'ok',
          toolsUsed:   [],
          timestamp:   '2024-01-15T00:00:00.000Z',
        }),
      }],
    });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    const turns = await getRecentConversationTurns('user-42');

    expect(turns[0].timestamp).toBe('2024-01-15T00:00:00.000Z');
  });

  it('falls back to empty string when timestamp is null', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({
      docs: [{
        id: 'turn-3',
        data: () => ({
          userId: 'user-42', sessionId: 's1',
          userQuery: 'test', novaResponse: 'ok',
          toolsUsed: [], timestamp: null,
        }),
      }],
    });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    const turns = await getRecentConversationTurns('user-42');

    expect(turns[0].timestamp).toBe('');
  });

  it('maps multiple documents and preserves order', async () => {
    const { getDocs } = await getFirestore();
    getDocs.mockResolvedValue({
      docs: [
        { id: 'turn-a', data: () => ({ userId: 'u', sessionId: 's', userQuery: 'q1', novaResponse: 'r1', toolsUsed: ['track_package'], timestamp: null }) },
        { id: 'turn-b', data: () => ({ userId: 'u', sessionId: 's', userQuery: 'q2', novaResponse: 'r2', toolsUsed: [],              timestamp: null }) },
      ],
    });
    const { getRecentConversationTurns } = await import('.././ai-manifest-service');

    const turns = await getRecentConversationTurns('u');

    expect(turns).toHaveLength(2);
    expect(turns[0].id).toBe('turn-a');
    expect(turns[0].toolsUsed).toEqual(['track_package']);
    expect(turns[1].id).toBe('turn-b');
    expect(turns[1].toolsUsed).toEqual([]);
  });
});
