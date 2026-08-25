// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healManifestGhostPackages } from '.././heal-manifest-service';

// Mock Firestore Database
const mockDb = {
  manifests: new Map<string, any>(),
};

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: vi.fn(async (ref: any) => {
    const data = mockDb[ref.col]?.get(ref.id);
    return { exists: () => !!data, data: () => data };
  }),
  setDoc: vi.fn(async (ref: any, data: any, opts?: any) => {
    const col = mockDb[ref.col];
    if (col) {
      if (opts?.merge) {
        const existing = col.get(ref.id) || {};
        col.set(ref.id, { ...existing, ...data });
      } else {
        col.set(ref.id, data);
      }
    }
  }),
  serverTimestamp: vi.fn(() => new Date()),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

describe('healManifestGhostPackages', () => {
  beforeEach(() => {
    mockDb.manifests.clear();
  });

  it('should throw error if manifest does not exist', async () => {
    await expect(healManifestGhostPackages('M-NONEXIST', ['TRK1']))
      .rejects.toThrow('El manifiesto no existe.');
  });

  it('should throw error if manifest is not Mega-Man container', async () => {
    mockDb.manifests.set('M-REGULAR', {
      isMegaMan: false,
      packages: [],
    });

    await expect(healManifestGhostPackages('M-REGULAR', ['TRK1']))
      .rejects.toThrow('Solo se permite sanar manifiestos clasificados como Mega-Man.');
  });

  it('should filter ghost packages and update values in database', async () => {
    mockDb.manifests.set('MEGA-MAN-123', {
      isMegaMan: true,
      packages: [
        { tracking: 'TRK1', slCode: 'SL1', weight: 5, price: 10, ruta: 'R1' },
        { tracking: 'TRK2', slCode: 'SL2', weight: 10, price: 20, ruta: 'R2' },
        { tracking: 'TRK3', slCode: 'SL1', weight: 3, price: 5, ruta: 'R1' },
        { tracking: 'TRK4', weight: 1, price: 1 }, // missing slCode to cover line 39
        { tracking: 'TRK5', slCode: 'SL1', weight: 2, price: 4, ruta: 'R1' }, // duplicate slCode to cover line 42
      ],
    });

    await healManifestGhostPackages('MEGA-MAN-123', ['TRK1']);

    const finalDoc = mockDb.manifests.get('MEGA-MAN-123');
    expect(finalDoc.totalPackages).toBe(4);
    expect(finalDoc.totalWeight).toBe(16);
    expect(finalDoc.totalPrice).toBe(30);
    expect(finalDoc.totalCustomers).toBe(2);
    expect(finalDoc.packages.length).toBe(4);
  });

  it('should return early if no packages are ghost packages', async () => {
    mockDb.manifests.set('ENC-MEGA-MAN-456', {
      packages: [
        { tracking: 'TRK1', slCode: 'SL1', weight: 5, price: 10, ruta: 'R1' },
      ],
    });

    // Try to heal with a non-existent tracking
    await healManifestGhostPackages('ENC-MEGA-MAN-456', ['NONEXIST']);
    // No setDoc was called or no changes were saved (manifest remains untouched)
    const doc = mockDb.manifests.get('ENC-MEGA-MAN-456');
    expect(doc.totalPackages).toBeUndefined(); // setDoc wasn't called
  });
});
