import { describe, it, expect } from 'vitest';

describe('Customers — search logic', () => {
  it('filters customers by name', () => {
    const customers = [
      { id: '1', name: 'Juan Pérez', slCode: 'JP001' },
      { id: '2', name: 'María García', slCode: 'MG002' },
      { id: '3', name: 'Juan Carlos', slCode: 'JC003' },
    ];
    const search = (list: typeof customers, query: string) =>
      list.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

    expect(search(customers, 'juan')).toHaveLength(2);
    expect(search(customers, 'garcía')).toHaveLength(1);
    expect(search(customers, '')).toHaveLength(3);
  });

  it('filters customers by slCode', () => {
    const customers = [
      { id: '1', slCode: 'JP001' },
      { id: '2', slCode: 'MG002' },
    ];
    const filterByCode = (list: typeof customers, code: string) =>
      list.filter(c => c.slCode.includes(code));

    expect(filterByCode(customers, 'JP')).toHaveLength(1);
    expect(filterByCode(customers, '00')).toHaveLength(2);
  });
});
