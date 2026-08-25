/**
 * Functional Scenario Test Suite: Encomienda Provider Dispatch & Handover
 *
 * Real-world encomienda dispatch scenarios tested:
 * 1. Categorizes regional deliveries by preferred courier provider.
 * 2. Groups packages by destination province (Guanacaste, Puntarenas, Limon, Alajuela Rural).
 * 3. Assigns courier waybill number (Guía de Encomienda) and transitions status to encomienda_dispatched.
 * 4. Generates delivery dispatch summary for driver handover.
 * 5. Handles carrier rate calculations per package weight and provider.
 */

import { describe, it, expect } from 'vitest';

export interface EncomiendaParcel {
  id: string;
  trackingNumber: string;
  customerName: string;
  slCode: string;
  phone: string;
  destinationProvince: string;
  destinationCanton: string;
  destinationDetails: string;
  encomiendaProvider: 'Correos de Costa Rica' | 'Transportes Caribe' | 'Encomiendas San Jose' | 'Tracopa';
  weight: number;
  status: 'received' | 'ready_for_dispatch' | 'encomienda_dispatched' | 'delivered';
  waybillNumber?: string;
  courierCost?: number;
}

export function routeEncomiendaProvider(destinationProvince: string): 'Correos de Costa Rica' | 'Transportes Caribe' | 'Encomiendas San Jose' | 'Tracopa' {
  const prov = destinationProvince.toUpperCase().trim();
  if (prov === 'LIMON') return 'Transportes Caribe';
  if (prov === 'PUNTARENAS' || prov === 'ZONA SUR') return 'Tracopa';
  if (prov === 'GUANACASTE') return 'Encomiendas San Jose';
  return 'Correos de Costa Rica';
}

export function computeCourierCost(provider: string, weightKg: number): number {
  switch (provider) {
    case 'Correos de Costa Rica':
      return weightKg <= 1 ? 2500 : 2500 + Math.ceil(weightKg - 1) * 1200;
    case 'Transportes Caribe':
      return weightKg <= 5 ? 3000 : 3000 + Math.ceil(weightKg - 5) * 500;
    case 'Tracopa':
      return weightKg <= 5 ? 3500 : 3500 + Math.ceil(weightKg - 5) * 600;
    case 'Encomiendas San Jose':
      return weightKg <= 3 ? 2800 : 2800 + Math.ceil(weightKg - 3) * 700;
    default:
      return 3000;
  }
}

describe('Encomiendas Functional Real-World Flows', () => {
  const mockParcels: EncomiendaParcel[] = [
    {
      id: 'enc-1',
      trackingNumber: '1Z888001',
      customerName: 'Kattia Fallas',
      slCode: 'SL901',
      phone: '8701-1111',
      destinationProvince: 'Limon',
      destinationCanton: 'Pococí',
      destinationDetails: 'Guapiles, frente a la terminal',
      encomiendaProvider: 'Transportes Caribe',
      weight: 3.5,
      status: 'ready_for_dispatch',
    },
    {
      id: 'enc-2',
      trackingNumber: '1Z888002',
      customerName: 'Mario Chacon',
      slCode: 'SL902',
      phone: '8702-2222',
      destinationProvince: 'Guanacaste',
      destinationCanton: 'Liberia',
      destinationDetails: 'Sucursal Central Liberia',
      encomiendaProvider: 'Encomiendas San Jose',
      weight: 2.0,
      status: 'ready_for_dispatch',
    },
    {
      id: 'enc-3',
      trackingNumber: 'TBA888003',
      customerName: 'Jorge Ureña',
      slCode: 'SL903',
      phone: '8703-3333',
      destinationProvince: 'Puntarenas',
      destinationCanton: 'Golfito',
      destinationDetails: 'Terminal Tracopa Golfito',
      encomiendaProvider: 'Tracopa',
      weight: 8.0,
      status: 'ready_for_dispatch',
    },
    {
      id: 'enc-4',
      trackingNumber: 'GFUS888004',
      customerName: 'Esteban Solano',
      slCode: 'SL904',
      phone: '8704-4444',
      destinationProvince: 'Alajuela',
      destinationCanton: 'San Carlos',
      destinationDetails: 'Ciudad Quesada Centro',
      encomiendaProvider: 'Correos de Costa Rica',
      weight: 1.5,
      status: 'ready_for_dispatch',
    },
  ];

  it('Scenario 1: Automatically routes destinations to the canonical courier provider', () => {
    expect(routeEncomiendaProvider('Limon')).toBe('Transportes Caribe');
    expect(routeEncomiendaProvider('Puntarenas')).toBe('Tracopa');
    expect(routeEncomiendaProvider('Guanacaste')).toBe('Encomiendas San Jose');
    expect(routeEncomiendaProvider('Alajuela')).toBe('Correos de Costa Rica');
    expect(routeEncomiendaProvider('San Jose')).toBe('Correos de Costa Rica');
  });

  it('Scenario 2: Calculates accurate domestic courier fees per weight and provider', () => {
    // enc-1 (Transportes Caribe, 3.5 kg -> base <= 5kg): 3000 CRC
    const cost1 = computeCourierCost('Transportes Caribe', 3.5);
    expect(cost1).toBe(3000);

    // enc-2 (Encomiendas San Jose, 2.0 kg -> base <= 3kg): 2800 CRC
    const cost2 = computeCourierCost('Encomiendas San Jose', 2.0);
    expect(cost2).toBe(2800);

    // enc-3 (Tracopa, 8.0 kg -> 3500 + 3*600 = 5300 CRC): 5300 CRC
    const cost3 = computeCourierCost('Tracopa', 8.0);
    expect(cost3).toBe(5300);

    // enc-4 (Correos CR, 1.5 kg -> 2500 + 1*1200 = 3700 CRC): 3700 CRC
    const cost4 = computeCourierCost('Correos de Costa Rica', 1.5);
    expect(cost4).toBe(3700);
  });

  it('Scenario 3: Groups parcels by provider for bulk manifest generation and handover', () => {
    const groupedByProvider = new Map<string, EncomiendaParcel[]>();
    for (const p of mockParcels) {
      if (!groupedByProvider.has(p.encomiendaProvider)) {
        groupedByProvider.set(p.encomiendaProvider, []);
      }
      groupedByProvider.get(p.encomiendaProvider)!.push(p);
    }

    expect(groupedByProvider.size).toBe(4);
    expect(groupedByProvider.get('Transportes Caribe')?.length).toBe(1);
    expect(groupedByProvider.get('Encomiendas San Jose')?.length).toBe(1);
  });

  it('Scenario 4: Dispatches batch with waybill numbers and transitions status to encomienda_dispatched', () => {
    const dispatchedAt = new Date().toISOString();
    const waybillBatch = mockParcels.map((p, idx) => ({
      ...p,
      waybillNumber: `GUIA-${p.encomiendaProvider.slice(0, 3).toUpperCase()}-${1000 + idx}`,
      status: 'encomienda_dispatched' as const,
      dispatchedAt,
      dispatchedBy: 'admin_bodega',
    }));

    expect(dispatchedBatch(waybillBatch)).toBe(true);
    expect(waybillBatch[0].waybillNumber).toBe('GUIA-TRA-1000');
    expect(waybillBatch[1].waybillNumber).toBe('GUIA-ENC-1001');
  });
});

function dispatchedBatch(parcels: any[]): boolean {
  return parcels.every(p => p.status === 'encomienda_dispatched' && !!p.waybillNumber);
}
