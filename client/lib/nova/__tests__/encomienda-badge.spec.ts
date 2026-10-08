import { describe, it, expect } from 'vitest';
import { novaEncomiendaBadge, isEncomiendaRoute, THIRD_PARTY_LABEL } from '../encomienda-badge';

const known = new Map([['correos', 'Correos de Costa Rica'], ['correos de costa rica', 'Correos de Costa Rica']]);
const lookup = { ready: true, isKnown: (n: string) => known.has(n.toLowerCase()), resolve: (n: string) => known.get(n.toLowerCase()) || n };

describe('F8.3 novaEncomiendaBadge', () => {
  it('Encomiendas route + known service → the service', () => {
    expect(novaEncomiendaBadge({ ruta: 'Encomiendas', encomiendaServiceName: 'correos' }, lookup)).toMatchObject({ kind: 'service', label: 'Correos de Costa Rica' });
  });
  it('Encomiendas route + service not in the list → Servicio de terceros (with the name in the tooltip)', () => {
    const b = novaEncomiendaBadge({ ruta: 'Encomiendas', encomiendaServiceName: 'Transportes Tico' }, lookup);
    expect(b).toMatchObject({ kind: 'third-party', label: THIRD_PARTY_LABEL });
    expect(b!.title).toContain('Transportes Tico');
  });
  it('Encomiendas route without a service → Servicio de terceros; the customer proposal goes in the tooltip', () => {
    expect(novaEncomiendaBadge({ ruta: 'Encomiendas', encomiendaServiceName: '' }, lookup)).toMatchObject({ kind: 'third-party', label: THIRD_PARTY_LABEL });
    expect(novaEncomiendaBadge({ ruta: 'Encomiendas', defaultAddress: { encomiendaSuggestedName: 'Tico Express' } }, lookup)!.title).toContain('Tico Express');
  });
  it('other routes → no badge (G5)', () => {
    expect(novaEncomiendaBadge({ ruta: 'Ruta 1', encomiendaServiceName: 'correos' }, lookup)).toBeNull();
    expect(novaEncomiendaBadge({ ruta: '', encomiendaServiceName: 'correos' }, lookup)).toBeNull();
    expect(novaEncomiendaBadge(null, lookup)).toBeNull();
  });
  it('list not loaded yet → the name as is, never a false "terceros"', () => {
    expect(novaEncomiendaBadge({ ruta: 'Encomiendas', encomiendaServiceName: 'Transportes Tico' }, { ...lookup, ready: false })).toMatchObject({ kind: 'service', label: 'Transportes Tico' });
  });
  it('route name variants', () => {
    expect(isEncomiendaRoute('ENCOMIENDAS')).toBe(true);
    expect(isEncomiendaRoute('Encomienda')).toBe(true);
    expect(isEncomiendaRoute('GAM')).toBe(false);
  });
});
