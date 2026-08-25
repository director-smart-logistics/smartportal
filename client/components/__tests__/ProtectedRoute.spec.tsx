// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';

// Mock hooks
const mockUseAuth = vi.fn();
const mockUsePermissions = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/hooks/usePermissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

describe('ProtectedRoute — Rules of Hooks & Navigation Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner without hook order violations when auth is loading', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: true,
    });
    mockUsePermissions.mockReturnValue({
      hasPermission: vi.fn().mockReturnValue(false),
      isLoading: false,
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Contenido Seguro</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('img[src="/logo.svg"]') || container.querySelector('img')).toBeTruthy();
    expect(screen.queryByText('Contenido Seguro')).toBeNull();
  });

  it('renders children when user is authenticated and authorized', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u1', role: 'admin', fullName: 'Admin User' },
      isLoading: false,
    });
    mockUsePermissions.mockReturnValue({
      hasPermission: vi.fn().mockReturnValue(true),
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={['/deliveries']}>
        <Routes>
          <Route
            path="/deliveries"
            element={
              <ProtectedRoute resource="deliveries">
                <div>Panel de Entregas</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Panel de Entregas')).toBeTruthy();
  });

  it('redirects to login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    });
    mockUsePermissions.mockReturnValue({
      hasPermission: vi.fn().mockReturnValue(false),
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={['/deliveries']}>
        <Routes>
          <Route
            path="/deliveries"
            element={
              <ProtectedRoute resource="deliveries">
                <div>Panel de Entregas</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Página de Login</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Página de Login')).toBeTruthy();
  });
});
