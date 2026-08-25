// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculatePrice } from '@/lib/utils/pricing';

// ─── Local Mock Firestore Database (Hoisted in memory RAM) ───────────────────
const mockDb: Record<string, Map<string, any>> = {
  customers: new Map(),
  match_feedback: new Map(),
  manifest_learning_patterns: new Map(),
  unmatched_route_learning: new Map(),
  temp_customers: new Map(),
};

// Mock React Hooks to execute inline directly
vi.mock('react', () => ({
  useCallback: (fn: any) => fn,
  useMemo: (fn: any) => fn(),
  useState: (val: any) => [val, vi.fn()],
  useEffect: vi.fn(),
  useRef: (val: any) => ({ current: val }),
}));

// Mock Firebase Config
vi.mock('@/lib/firebase/config', () => ({
  db: { __db: true },
}));

// Mock Firebase Functions
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

// Mock Firestore Services
vi.mock('firebase/firestore', () => {
  return {
    collection: (_db: any, name: string) => ({ __col: name }),
    doc: (_db: any, colName: string, docId?: string) => ({ __col: colName, __doc: docId }),
    getDoc: async (ref: any) => {
      const data = mockDb[ref.__col]?.get(ref.__doc);
      return { exists: () => !!data, data: () => data, ref };
    },
    getDocs: async (q: any) => {
      const colName = q?.__col ?? q?.col ?? '';
      const col = mockDb[colName];
      let docs = col
        ? Array.from(col.entries()).map(([id, data]) => ({
            id,
            ref: { __doc: id, __col: colName },
            data: () => data,
          }))
        : [];

      // Apply mocked where filtering
      if (q?.__filters && q.__filters.length > 0) {
        docs = docs.filter((d) => {
          const itemData = d.data();
          return q.__filters.every((f: any) => itemData[f.field] === f.value);
        });
      }
      return { docs, forEach: (cb: any) => docs.forEach(cb) };
    },
    setDoc: async (ref: any, data: any, opts?: any) => {
      const col = mockDb[ref.__col];
      if (col) {
        if (opts?.merge) {
          const existing = col.get(ref.__doc) || {};
          col.set(ref.__doc, { ...existing, ...data });
        } else {
          col.set(ref.__doc, data);
        }
      }
    },
    deleteDoc: async (ref: any) => {
      mockDb[ref.__col]?.delete(ref.__doc);
    },
    writeBatch: () => ({
      delete: (ref: any) => {
        mockDb[ref.__col]?.delete(ref.__doc);
      },
      commit: async () => {},
    }),
    query: (colRef: any, ...filters: any[]) => {
      const queryObj = { __col: colRef.__col, __filters: [] as any[] };
      filters.forEach((f) => {
        if (f?.__field) {
          queryObj.__filters.push({ field: f.__field, value: f.__value });
        }
      });
      return queryObj;
    },
    where: (field: string, op: string, value: any) => ({ __field: field, __value: value }),
    increment: (val: number) => val,
    serverTimestamp: () => new Date(),
    limit: () => ({}),
    orderBy: () => ({}),
  };
});

describe('Nova Massive Emulation & Integrity Suite', () => {
  beforeEach(() => {
    // Clear in-memory collections before each test run
    Object.keys(mockDb).forEach((k) => mockDb[k].clear());
  });

  describe('Bloque A: Emulación Secuencial de Aprendizaje y Olvido (1000 iteraciones)', () => {
    it('debería aprender, asociar y borrar correctamente sin falsos positivos residuales en 1000 iteraciones', async () => {
      const { saveMatchFeedback, forgetMatchFeedback, loadLearnedMatches } = await import(
        '../../match-learning'
      );
      const { approveNameAssociation } = await import('../../manifest-learning-service');

      for (let i = 0; i < 1000; i++) {
        const rawName = `JUAN PEREZ AUTOMATION ${i}`;
        const normalizedName = `JUAN PEREZ AUTOMATION ${i}`;
        const slCode = `SL${10000 + i}`;

        // 1. Guardar mapeo en match_feedback
        await saveMatchFeedback({
          manifestName: rawName,
          slCode,
          fullName: rawName,
          consolidationEnabled: false,
          source: 'admin_manual',
          confirmedBy: 'test-user',
        });

        // Verificar que el mapeo existe en match_feedback
        const mfId = `${normalizedName.replace(/\s+/g, '_')}_${slCode}`;
        expect(mockDb.match_feedback.has(mfId)).toBe(true);

        // 2. Guardar ThumbsUp en manifest_learning_patterns (aprobación)
        await approveNameAssociation({
          rawName,
          matchedName: rawName,
          slCode,
          matchScore: 0.95,
          approvedBy: 'test-user',
        });

        // Verificar que el patrón existe en manifest_learning_patterns
        const patternId = `assoc_${slCode}_${rawName.toLowerCase().replace(/\s+/g, '_').substring(0, 40)}`;
        expect(mockDb.manifest_learning_patterns.has(patternId)).toBe(true);

        // Verificar que el campo normalizedName se guardó correctamente
        const savedPattern = mockDb.manifest_learning_patterns.get(patternId);
        expect(savedPattern.normalizedName).toBe(normalizedName);

        // 3. Simular pre-carga y match en caliente
        const matches = await loadLearnedMatches();
        const learned = matches.find((m) => m.normalizedName === normalizedName);
        expect(learned).toBeDefined();
        expect(learned?.slCode).toBe(slCode);

        // 4. Ejecutar desvínculo (forgetMatchFeedback)
        await forgetMatchFeedback(rawName);

        // 5. Verificar borrado total e inmunidad contra falsos positivos
        expect(mockDb.match_feedback.has(mfId)).toBe(false);
        expect(mockDb.manifest_learning_patterns.has(patternId)).toBe(false);

        const updatedMatches = await loadLearnedMatches();
        expect(updatedMatches.some((m) => m.normalizedName === normalizedName)).toBe(false);
      }
    });

    it('debería borrar patrones legados que no tienen el campo normalizedName usando la consulta de fallback', async () => {
      const { forgetMatchFeedback, loadLearnedMatches } = await import('../../match-learning');

      const rawName = 'LEGACY USER WITH NO NORMALIZED NAME';
      const normalizedName = 'LEGACY USER WITH NO NORMALIZED NAME';
      const slCode = 'SL9999';

      // Sembrar patrón legado en el mock (sin campo normalizedName)
      const patternId = `assoc_${slCode}_${rawName.toLowerCase().replace(/\s+/g, '_').substring(0, 40)}`;
      mockDb.manifest_learning_patterns.set(patternId, {
        type: 'name_association',
        rawName,
        matchedName: rawName,
        slCode,
        matchScore: 0.9,
      });

      expect(mockDb.manifest_learning_patterns.has(patternId)).toBe(true);
      expect(mockDb.manifest_learning_patterns.get(patternId).normalizedName).toBeUndefined();

      // Ejecutar desvínculo
      await forgetMatchFeedback(rawName);

      // El patrón legado debe ser borrado gracias a la consulta por rawName
      expect(mockDb.manifest_learning_patterns.has(patternId)).toBe(false);
    });
  });

  describe('Bloque B: Emulación de Rutas y Precios (500 casos combinatorios)', () => {
    it('debería preservar rutas y precios originales cuando loadedFromFirestore es true', async () => {
      const { useNovaResolvedRows } = await import('../../../../hooks/use-nova-resolved-rows');

      const contactMap = new Map<string, { ruta?: string }>();
      contactMap.set('SL100', { ruta: 'San Jose' });

      for (let i = 0; i < 250; i++) {
        // Filas ficticias de manifiesto cargado de Firestore
        const rows = [
          {
            tracking: `TRK${i}`,
            nombre: `CLIENTE TEST ${i}`,
            slCode: 'SL100',
            ruta: 'Heredia', // Ruta personalizada guardada en el paquete
            peso: 1.5,
            precio: 15.0, // Tarifa personalizada guardada
            precioSinPermiso: 15.0,
            precioConPermiso: 18.0,
            ajustePrecio: undefined,
            originalIndex: 0,
          } as any,
        ];

        // 1. Resolver con loadedFromFirestore = true
        const { buildResolvedRows } = useNovaResolvedRows({
          resultDataRows: rows,
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: {},
          computedPrices: [10.0], // Precio estándar calculado en base a peso 1.5kg
          separateInvoices: {},
          manifestCountry: 'usa',
          manifestShipping: 'air',
          customerContactMap: contactMap,
          loadedFromFirestore: true,
        });

        const resolved = buildResolvedRows(rows);
        const resRow = resolved[0];

        // Verificar que preservó la ruta guardada ('Heredia') en lugar de usar la del contacto ('San Jose')
        expect(resRow.ruta).toBe('Heredia');

        // Verificar que preservó el precio guardado (15.0) en lugar del calculado (10.0)
        expect(resRow.precio).toBe(15.0);
      }
    });

    it('debería pre-popular rutas de contacto y usar precios calculados cuando loadedFromFirestore es false', async () => {
      const { useNovaResolvedRows } = await import('../../../../hooks/use-nova-resolved-rows');

      const contactMap = new Map<string, { ruta?: string }>();
      contactMap.set('SL100', { ruta: 'San Jose' });

      for (let i = 0; i < 250; i++) {
        const rows = [
          {
            tracking: `TRK_NEW_${i}`,
            nombre: `NUEVO CLIENTE ${i}`,
            slCode: 'SL100',
            ruta: '',
            peso: 1.5,
            precio: 0,
            ajustePrecio: undefined,
            originalIndex: 0,
          } as any,
        ];

        // 2. Resolver con loadedFromFirestore = false (Manifiesto de Excel nuevo)
        const { buildResolvedRows } = useNovaResolvedRows({
          resultDataRows: rows,
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: {},
          computedPrices: [10.0],
          separateInvoices: {},
          manifestCountry: 'usa',
          manifestShipping: 'air',
          customerContactMap: contactMap,
          loadedFromFirestore: false,
        });

        const resolved = buildResolvedRows(rows);
        const resRow = resolved[0];

        // Debe pre-popular con la ruta predeterminada del cliente
        expect(resRow.ruta).toBe('San Jose');

        // Debe aplicar el precio calculado por peso
        expect(resRow.precio).toBe(10.0);
      }
    });
  });
});
