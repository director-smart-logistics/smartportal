// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PermissionsProvider } from '../PermissionsContext';
import { usePermissions } from '../../hooks/usePermissions';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock firestore
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn((_ref, cb) => {
    // Return empty permissions doc
    cb({ exists: () => false, data: () => null });
    return () => {};
  }),
  doc: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

describe('PermissionsContext & usePermissions — RBAC Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants full wildcard access to ADMIN role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-admin', role: 'ADMIN', email: 'admin@smartlogistics.cr' },
      isAuthenticated: true,
      isLoading: false,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PermissionsProvider>{children}</PermissionsProvider>
    );

    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.hasPermission('deliveries', 'view')).toBe(true);
    expect(result.current.hasPermission('ai', 'view')).toBe(true);
    expect(result.current.hasPermission('invoices', 'delete')).toBe(true);
    expect(result.current.hasPermission('any-unregistered-resource', 'manage')).toBe(true);
  });

  it('restricts STAFF role from administrative actions like delete users or manage roles', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-staff', role: 'STAFF', email: 'staff@smartlogistics.cr' },
      isAuthenticated: true,
      isLoading: false,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PermissionsProvider>{children}</PermissionsProvider>
    );

    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.hasPermission('deliveries', 'view')).toBe(true);
    expect(result.current.hasPermission('packages', 'view')).toBe(true);
    expect(result.current.hasPermission('users', 'delete')).toBe(false);
  });

  it('denies permissions when user is unauthenticated or has no role', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PermissionsProvider>{children}</PermissionsProvider>
    );

    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.hasPermission('dashboard', 'view')).toBe(false);
    expect(result.current.hasPermission('deliveries', 'view')).toBe(false);
  });
});
