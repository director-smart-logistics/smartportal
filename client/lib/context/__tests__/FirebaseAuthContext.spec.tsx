// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { FirebaseAuthProvider, useFirebaseAuth } from '../FirebaseAuthContext';

const mocks = vi.hoisted(() => ({
  mockSignInWithGoogle: vi.fn(),
  mockSignOut: vi.fn(),
  authHolder: { callback: null as any },
}));

vi.mock('@/lib/firebase', () => ({
  signInWithGoogle: mocks.mockSignInWithGoogle,
  signInWithGoogleRedirect: vi.fn(),
  signOut: mocks.mockSignOut,
  onAuthChange: (cb: (user: any) => Promise<void>) => {
    mocks.authHolder.callback = cb;
    return () => { mocks.authHolder.callback = null; };
  },
  mapFirebaseUserToAuthUser: vi.fn((fbUser) => Promise.resolve({
    id: fbUser.uid,
    email: fbUser.email,
    fullName: fbUser.displayName,
    role: 'admin',
  })),
  getIdToken: vi.fn(() => Promise.resolve('test-token-123')),
  getGoogleRedirectResult: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../firebase', () => ({
  signInWithGoogle: mocks.mockSignInWithGoogle,
  signInWithGoogleRedirect: vi.fn(),
  signOut: mocks.mockSignOut,
  onAuthChange: (cb: (user: any) => Promise<void>) => {
    mocks.authHolder.callback = cb;
    return () => { mocks.authHolder.callback = null; };
  },
  mapFirebaseUserToAuthUser: vi.fn((fbUser) => Promise.resolve({
    id: fbUser.uid,
    email: fbUser.email,
    fullName: fbUser.displayName,
    role: 'admin',
  })),
  getIdToken: vi.fn(() => Promise.resolve('test-token-123')),
  getGoogleRedirectResult: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/services/audit-service', () => ({
  logAction: vi.fn(),
  flushAuditQueue: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {
    auth: {
      syncGoogleUser: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  },
}));

describe('FirebaseAuthContext — Authentication Lifecycle & Session Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authHolder.callback = null;
  });

  it('initializes in loading state and transitions when authChange fires', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FirebaseAuthProvider>{children}</FirebaseAuthProvider>
    );

    const { result } = renderHook(() => useFirebaseAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    // Simulate Firebase reporting a logged-in user
    await act(async () => {
      if (mocks.authHolder.callback) {
        await mocks.authHolder.callback({
          uid: 'user-001',
          email: 'admin@smartlogistics.cr',
          displayName: 'Admin User',
          emailVerified: true,
          getIdToken: vi.fn(() => Promise.resolve('test-token-123')),
        });
      }
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe('admin@smartlogistics.cr');
    });
  });

  it('handles logout and clears auth state', async () => {
    mocks.mockSignOut.mockResolvedValueOnce(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FirebaseAuthProvider>{children}</FirebaseAuthProvider>
    );

    const { result } = renderHook(() => useFirebaseAuth(), { wrapper });

    // Login user first
    await act(async () => {
      if (mocks.authHolder.callback) {
        await mocks.authHolder.callback({
          uid: 'user-001',
          email: 'admin@smartlogistics.cr',
          displayName: 'Admin User',
          getIdToken: vi.fn(() => Promise.resolve('test-token-123')),
        });
      }
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    // Now logout
    await act(async () => {
      await result.current.logout();
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });
});
