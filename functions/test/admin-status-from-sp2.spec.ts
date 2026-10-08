import { describe, it, expect } from 'vitest';
import { allowedTarget } from '../src/packages/admin-status-from-sp2';

describe('SP2 admin package status (owner rule 2026-09-30): only En ruta → Entregado and Entregado → En ruta', () => {
  it('en ruta (any SP1 spelling) → delivered; delivered → on_route', () => {
    for (const s of ['on_route', 'route', 'in_route', 'ON_ROUTE']) expect(allowedTarget(s)).toBe('delivered');
    expect(allowedTarget('delivered')).toBe('on_route');
  });
  it('no other status can be changed from SP2 (Retenido was removed by the owner)', () => {
    for (const s of ['held', 'processed', 'pickup', 'customs', 'consolidated', 'returned', 'pre-alerted', '', null, undefined]) expect(allowedTarget(s)).toBeNull();
  });
});
