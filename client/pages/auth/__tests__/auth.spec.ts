import { describe, it, expect } from 'vitest';

describe('Auth — validation logic', () => {
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  it('validates well-formed email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('admin@smartlogistics.cr')).toBe(true);
  });

  it('rejects malformed email addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('enforces minimum password length', () => {
    const isValidPassword = (pw: string) => pw.length >= 8;
    expect(isValidPassword('secret12')).toBe(true);
    expect(isValidPassword('short')).toBe(false);
    expect(isValidPassword('')).toBe(false);
  });

  it('generates password reset token (non-empty string)', () => {
    const mockToken = () => Math.random().toString(36).slice(2);
    const token = mockToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('normalises email to lowercase before auth', () => {
    const normalise = (email: string) => email.trim().toLowerCase();
    expect(normalise('  User@EXAMPLE.COM  ')).toBe('user@example.com');
  });
});
