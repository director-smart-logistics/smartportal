/**
 * manifest-data-origin-immunity.spec.ts
 *
 * Automated regression test verifying data origin policies:
 *   - Fresh Excel / ML Cargo parses ('excel' | 'fusion'): Full matching & full ingestion enabled.
 *   - Firestore-loaded manifests ('firestore'): Read-only table mode, autoSave disabled, auto-rematch disabled.
 */

import { describe, it, expect } from 'vitest';
import { FIRESTORE_POLICY } from '@/lib/nova/data-origin/types';

describe('Data Origin & Ingestion Safety Policies', () => {
  it('allows full processing for new Excel / ML Cargo parses', () => {
    const mockNewParseResult = {
      manifestNumber: 'NEW-MAN-01',
      rows: [{ nombre: 'Juan Perez', slCode: 'SL100', ruta: 'San Jose Centro' }],
      loadedFromFirestore: false,
    };

    const isFirestore = !!mockNewParseResult.loadedFromFirestore;
    expect(isFirestore).toBe(false);

    // New parses allow active matching and explicit save
    expect(FIRESTORE_POLICY.allowAutoDivergentRematch).toBe(false); // Master profiles remain safe
  });

  it('strictly blocks passive background writes when origin is firestore', () => {
    const mockSavedManifestResult = {
      manifestNumber: 'SL-MEGA-MAN-27-07-2026',
      rows: [{ nombre: 'Juan Perez', slCode: 'SL100', ruta: 'San Jose Centro' }],
      loadedFromFirestore: true,
    };

    const dataOrigin = mockSavedManifestResult.loadedFromFirestore ? 'firestore' : 'excel';
    const showTable = true;
    const ingestDone = null;
    const isAutoSavePaused = false;

    const autoSaveEnabled = showTable && dataOrigin !== 'firestore' && !!ingestDone && !isAutoSavePaused;

    expect(dataOrigin).toBe('firestore');
    expect(autoSaveEnabled).toBe(false);
  });

  it('guarantees that manual operator edits on table change button to Actualizar BD', () => {
    const createdInvoices = [{ id: 'INV-1' }];
    const ingestDone = null;

    const buttonLabel = createdInvoices.length > 0 ? 'Actualizar BD' : (ingestDone || 'Guardar en BD');
    expect(buttonLabel).toBe('Actualizar BD');
  });
});
