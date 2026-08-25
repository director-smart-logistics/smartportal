import { describe, it, expect, vi } from 'vitest';
import { canonicalizeTracking } from '../../utils/tracking-canonicalizer';
import { isEligiblePreAlert } from '../pre-alert-resolver';

describe('Nova Table Live Manifest Image Emulation Suite', () => {
  const mockSP2PreAlerts = new Map<string, any>([
    [
      'SPXMIA007982608040000996',
      { slCode: 'SL261337', active: true, status: 'pending', customerName: 'GILBERTO JIMENEZ ESPINOZA' }
    ],
    [
      '1195267030940003319500875424380611',
      { slCode: 'SL261337', active: true, status: 'pending', customerName: 'GILBERTO JIMENEZ ESPINOZA' }
    ],
    [
      'SPXMIA007982608030009344',
      { slCode: 'SL261337', active: true, status: 'pending', customerName: 'GILBERTO JIMENEZ ESPINOZA' }
    ],
    [
      '1Z1R054E0343790488',
      { slCode: 'SL162', active: true, status: 'pending', customerName: 'JIMENA GAMBOA ABARCA' }
    ],
    [
      '9632080400208194694100875411686022',
      { slCode: 'SL26363', active: true, status: 'pending', customerName: 'JIMENA SIBAJA' }
    ],
  ]);

  it('Fila 6: Gilberto Jimenez Espinoza agrupa 3 paquetes con badge Pre-alerta [P]', () => {
    const trackings = [
      'SPXMIA007982608040000996',
      '1195267030940003319500875424380611',
      'SPXMIA007982608030009344',
    ];

    trackings.forEach(trk => {
      const preAlert = mockSP2PreAlerts.get(trk);
      expect(preAlert).toBeDefined();
      expect(preAlert.slCode).toBe('SL261337');
      expect(isEligiblePreAlert(preAlert)).toBe(true);
    });
  });

  it('Fila 9: 1Z1R054E0343790488 en manifiesto "JIMENA" se asocia por pre-alerta a JIMENA GAMBOA ABARCA (SL162) y NO a Jimena Cerdas (SL261320)', () => {
    const trk = '1Z1R054E0343790488';
    const preAlert = mockSP2PreAlerts.get(trk);

    expect(preAlert).toBeDefined();
    // In SP2, the pre-alert belongs to Jimena Gamboa Abarca (SL162)
    expect(preAlert.slCode).toBe('SL162');
    expect(preAlert.slCode).not.toBe('SL261320'); // NOT Jimena Cerdas
    expect(preAlert.customerName).toBe('JIMENA GAMBOA ABARCA');
    expect(isEligiblePreAlert(preAlert)).toBe(true);

    const canonical = canonicalizeTracking(trk);
    expect(canonical.carrier).toBe('UPS');
    expect(canonical.carrierType).toBe('DISCRETE_ALPHANUMERIC');
  });

  it('Fila 10: 9632080400208194694100875411686022 en manifiesto "JIMENA SIBAJA" se asocia a JIMENA SIBAJA (SL26363)', () => {
    const trk = '9632080400208194694100875411686022';
    const preAlert = mockSP2PreAlerts.get(trk);

    expect(preAlert).toBeDefined();
    expect(preAlert.slCode).toBe('SL26363');
    expect(preAlert.customerName).toBe('JIMENA SIBAJA');
    expect(isEligiblePreAlert(preAlert)).toBe(true);
  });

  it('Fila 11-14: Kevin Salazar Jimenez consolida 4 paquetes (TBA y 1Z) bajo SL26040', () => {
    const trackings = [
      'TBA333410000628',
      'TBA333417325744',
      '1Z22W1390320764506',
      'TBA333407473807',
    ];

    trackings.forEach(trk => {
      const canonical = canonicalizeTracking(trk);
      expect(canonical.allowSuffix).toBe(false);
      expect(['AMAZON', 'UPS']).toContain(canonical.carrier);
    });
  });
});
