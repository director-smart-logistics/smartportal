import { describe, it, expect } from 'vitest';

describe('Packages — filter logic', () => {
  it('filters by manifest number (case-insensitive)', () => {
    const packages = [
      { id: '1', manifestNumber: 'MAN-001', status: 'pending' },
      { id: '2', manifestNumber: 'MAN-002', status: 'delivered' },
    ];
    const filter = (pkgs: typeof packages, manifest: string) =>
      pkgs.filter(p => p.manifestNumber.toLowerCase().includes(manifest.toLowerCase()));

    expect(filter(packages, 'man-001')).toHaveLength(1);
    expect(filter(packages, 'MAN')).toHaveLength(2);
    expect(filter(packages, 'xyz')).toHaveLength(0);
  });

  it('filters by status', () => {
    const packages = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'delivered' },
      { id: '3', status: 'pending' },
    ];
    const filterByStatus = (pkgs: typeof packages, status: string) =>
      status ? pkgs.filter(p => p.status === status) : pkgs;

    expect(filterByStatus(packages, 'pending')).toHaveLength(2);
    expect(filterByStatus(packages, 'delivered')).toHaveLength(1);
    expect(filterByStatus(packages, '')).toHaveLength(3);
  });
});
