/**
 * Auth Security Utilities
 * Provides password validation, rate limiting tracking, and security helpers
 */

export interface PasswordStrengthResult {
  isValid: boolean;
  strength: "weak" | "fair" | "good" | "strong";
  errors: string[];
  suggestions: string[];
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number; // in milliseconds
}

/**
 * Validate password strength and requirements
 */
export function validatePasswordStrength(
  password: string,
): PasswordStrengthResult {
  const errors: string[] = [];
  const suggestions: string[] = [];
  let strength: PasswordStrengthResult["strength"] = "weak";

  // Check minimum length
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  } else if (password.length >= 12) {
    strength = "fair";
  }

  // Check for uppercase letters
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter (A-Z)");
  } else {
    strength = "fair";
  }

  // Check for lowercase letters
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter (a-z)");
  } else {
    strength = "fair";
  }

  // Check for numbers
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number (0-9)");
  } else {
    strength = "fair";
  }

  // Check for special characters
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    suggestions.push(
      "Adding special characters would make your password stronger",
    );
  } else {
    strength = "good";
  }

  // Check for common patterns
  if (isCommonPassword(password)) {
    errors.push(
      "This password is too common. Please choose a more unique password",
    );
  }

  // Check for sequential characters
  if (hasSequentialCharacters(password)) {
    suggestions.push('Avoid sequential characters like "abc" or "123"');
  }

  // Check for repeated characters
  if (hasRepeatedCharacters(password)) {
    suggestions.push("Avoid repeating the same character multiple times");
  }

  // Determine final strength
  if (errors.length === 0) {
    if (
      password.length >= 12 &&
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    ) {
      strength = "strong";
    } else if (password.length >= 10) {
      strength = "good";
    }
  }

  return {
    isValid: errors.length === 0,
    strength,
    errors,
    suggestions,
  };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if password is common (basic check)
 */
function isCommonPassword(password: string): boolean {
  const commonPasswords = [
    "password",
    "password123",
    "12345678",
    "qwerty",
    "abc123",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "123456",
    "passw0rd",
    "pass123",
    "admin",
    "admin123",
    "root",
  ];

  return commonPasswords.some((common) =>
    password.toLowerCase().includes(common),
  );
}

/**
 * Check for sequential characters
 */
function hasSequentialCharacters(password: string): boolean {
  const patterns = [
    "abc",
    "bcd",
    "cde",
    "def",
    "efg",
    "fgh",
    "ghi",
    "hij",
    "ijk",
    "jkl",
    "klm",
    "lmn",
    "mno",
    "nop",
    "opq",
    "pqr",
    "qrs",
    "rst",
    "stu",
    "tuv",
    "uvw",
    "vwx",
    "wxy",
    "xyz",
    "012",
    "123",
    "234",
    "345",
    "456",
    "567",
    "678",
    "789",
    "890",
  ];

  const lowerPassword = password.toLowerCase();
  return patterns.some((pattern) => lowerPassword.includes(pattern));
}

/**
 * Check for repeated characters
 */
function hasRepeatedCharacters(password: string): boolean {
  return /(.)\1{2,}/.test(password);
}

/**
 * Rate limiting helper - track login attempts
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(
    config: RateLimitConfig = { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  ) {
    this.config = config;
  }

  /**
   * Check if rate limit is exceeded
   */
  isLimitExceeded(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const attempts = this.attempts.get(key) || [];
    const recentAttempts = attempts.filter((time) => time > windowStart);

    this.attempts.set(key, recentAttempts);

    return recentAttempts.length >= this.config.maxAttempts;
  }

  /**
   * Record an attempt
   */
  recordAttempt(key: string): void {
    const attempts = this.attempts.get(key) || [];
    attempts.push(Date.now());
    this.attempts.set(key, attempts);
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(key: string): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const attempts = this.attempts.get(key) || [];
    const recentAttempts = attempts.filter((time) => time > windowStart);

    return Math.max(0, this.config.maxAttempts - recentAttempts.length);
  }

  /**
   * Reset attempts for a key
   */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Clear all attempts
   */
  clearAll(): void {
    this.attempts.clear();
  }
}

// Global rate limiter instance
const loginRateLimiter = new RateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

/**
 * Check if login is rate limited
 */
export function isLoginRateLimited(email: string): boolean {
  return loginRateLimiter.isLimitExceeded(email);
}

/**
 * Record a login attempt
 */
export function recordLoginAttempt(email: string): void {
  loginRateLimiter.recordAttempt(email);
}

/**
 * Get remaining login attempts
 */
export function getRemainingLoginAttempts(email: string): number {
  return loginRateLimiter.getRemainingAttempts(email);
}

/**
 * Reset login attempts for an email
 */
export function resetLoginAttempts(email: string): void {
  loginRateLimiter.reset(email);
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return input.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Generate a secure random token (for password reset, etc.)
 */
export function generateSecureToken(length: number = 32): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    token += charset[randomIndex];
  }

  return token;
}
