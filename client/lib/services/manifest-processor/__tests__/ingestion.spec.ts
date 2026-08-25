import { describe, it, expect } from 'vitest';
import { checkPreAlertIntegrity } from '.././ingestion';
import { ManifestRow } from '.././types';

describe('checkPreAlertIntegrity index alignment and resolution', () => {
  const mockPreAlerts = new Map<string, any>([
    [
      'TRACKING_A',
      { found: true, slCode: 'SL1001', email: 'a@example.com', status: 'transit' }
    ],
    [
      'TRACKING_B',
      { found: true, slCode: 'SL1002', email: 'b@example.com', status: 'transit' }
    ]
  ]);

  const rowA: ManifestRow = {
    tracking: 'TRACKING_A',
    nombre: 'CLIENT A',
    guia: 'G1',
    manifiesto: 'M1',
    peso: 1,
    precio: 8,
    slCode: 'SL1001',
    nombreCliente: 'CLIENT A',
    ruta: 'Heredia',
    consolidacion: false,
    descripcion: 'ROPA',
    permisos: false,
    pesoRedondeo: 1,
    diferenciaRedondeo: 0,
    pesoConsolidacion: 0,
    precioSinPermiso: 8,
    precioConPermiso: 15,
    matchScore: 1,
    originalData: {}
  };

  const rowB: ManifestRow = {
    tracking: 'TRACKING_B',
    nombre: 'CLIENT B',
    guia: 'G1',
    manifiesto: 'M1',
    peso: 2,
    precio: 16,
    slCode: 'SL1002',
    nombreCliente: 'CLIENT B',
    ruta: 'Heredia',
    consolidacion: false,
    descripcion: 'ZAPATOS',
    permisos: false,
    pesoRedondeo: 2,
    diferenciaRedondeo: 0,
    pesoConsolidacion: 0,
    precioSinPermiso: 16,
    precioConPermiso: 23,
    matchScore: 1,
    originalData: {}
  };

  it('detects no conflicts when slCode aligns with pre-alert and no overrides exist', () => {
    const conflicts = checkPreAlertIntegrity([rowA, rowB], mockPreAlerts, {});
    expect(conflicts).toHaveLength(0);
  });

  it('detects a conflict when an override diverges the assignment from the pre-alert owner (full array)', () => {
    // Override row B (index 1) to SL9999
    const matchOverrides = {
      1: { slCode: 'SL9999', fullName: 'Override Client', ruta: 'Heredia' }
    };
    const conflicts = checkPreAlertIntegrity([rowA, rowB], mockPreAlerts, { matchOverrides });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].tracking).toBe('TRACKING_B');
    expect(conflicts[0].preAlertSlCode).toBe('SL1002');
    expect(conflicts[0].targetSlCode).toBe('SL9999');
    expect(conflicts[0].rowIndex).toBe(1);
  });

  it('demonstrates the index mismatch bug with filtered subsets if originalIndex is not used', () => {
    // If the operator filters/selects only Row B, the array passed has length 1.
    // So the loop index for Row B is 0.
    // An override exists for Row A (index 0) to SL312.
    // An override exists for Row B (index 1) to SL1002 (meaning it aligns with pre-alert).
    const matchOverrides = {
      0: { slCode: 'SL312', fullName: 'Gerson Montenegro', ruta: 'Coronado' },
      1: { slCode: 'SL1002', fullName: 'CLIENT B', ruta: 'Heredia' }
    };

    // Subset without originalIndex: loop index 0 checks matchOverrides[0], which is SL312.
    // It falsely claims that Row B is assigned to SL312, throwing a false positive conflict!
    const subsetWithoutIndex = [rowB];
    const conflicts = checkPreAlertIntegrity(subsetWithoutIndex, mockPreAlerts, { matchOverrides });
    
    // We expect 1 conflict (the false positive SL312 vs SL1002)
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].tracking).toBe('TRACKING_B');
    expect(conflicts[0].targetSlCode).toBe('SL312'); // Falsely read from index 0 override!
    expect(conflicts[0].rowIndex).toBe(0);
  });

  it('resolves the index mismatch bug when originalIndex is provided on the rows', () => {
    const matchOverrides = {
      0: { slCode: 'SL312', fullName: 'Gerson Montenegro', ruta: 'Coronado' },
      1: { slCode: 'SL1002', fullName: 'CLIENT B', ruta: 'Heredia' }
    };

    // Subset WITH originalIndex:
    const subsetWithIndex = [
      { ...rowB, originalIndex: 1 } as ManifestRow
    ];

    const conflicts = checkPreAlertIntegrity(subsetWithIndex, mockPreAlerts, { matchOverrides });
    
    // Since originalIndex: 1 is used, it correctly checks matchOverrides[1] (which is SL1002).
    // SL1002 matches pre-alert owner SL1002, so there should be no conflict!
    expect(conflicts).toHaveLength(0);
  });
});
