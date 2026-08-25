/**
 * Secure Storage Utility
 * 
 * Categorizes storage usage based on sensitivity:
 * - SENSITIVE: Use sessionStorage (clears on browser close)
 * - NON-SENSITIVE: Use localStorage (persists across sessions)
 * 
 * This prevents sensitive data from persisting in localStorage where it could
 * be accessed by malicious scripts or remain after logout.
 */

// Keys that contain sensitive data - should use sessionStorage
const SENSITIVE_KEYS = [
  'authToken',
  'token', // Legacy token key
  'userData',
  'userEmail',
  'userRole',
  'auditLogQueue',
  'sessionData',
];

/**
 * Secure storage utility that automatically chooses the right storage
 * based on data sensitivity
 */
export const secureStorage = {
  /**
   * Set item - automatically chooses storage based on sensitivity
   * @param key Storage key
   * @param value Value to store (will be JSON stringified if object)
   */
  setItem(key: string, value: string | object): void {
    const isSensitive = SENSITIVE_KEYS.includes(key);
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    try {
      if (isSensitive) {
        // ✅ Sensitive: Use sessionStorage (clears on browser close)
        sessionStorage.setItem(key, stringValue);
        // Remove from localStorage if exists (migration cleanup)
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore errors
        }
      } else {
        // ✅ Non-sensitive: Use localStorage (persists)
        localStorage.setItem(key, stringValue);
      }
    } catch (error) {
      console.error(`Failed to set ${key} in storage:`, error);
      // Don't throw - storage might be unavailable (private browsing, etc.)
    }
  },

  /**
   * Get item - checks both storages
   * @param key Storage key
   * @returns Stored value or null
   */
  getItem(key: string): string | null {
    try {
      // Check sessionStorage first (for sensitive data)
      const sessionValue = sessionStorage.getItem(key);
      if (sessionValue !== null) return sessionValue;
      
      // Fallback to localStorage (for preferences)
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Failed to get ${key} from storage:`, error);
      return null;
    }
  },

  /**
   * Get item as parsed JSON
   * @param key Storage key
   * @returns Parsed object or null
   */
  getItemAsJSON<T>(key: string): T | null {
    try {
      const value = this.getItem(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Failed to parse ${key} from storage:`, error);
      return null;
    }
  },

  /**
   * Remove item from both storages
   * @param key Storage key
   */
  removeItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove ${key} from storage:`, error);
    }
  },

  /**
   * Clear all sensitive data
   * Useful for logout or security cleanup
   */
  clearSensitive(): void {
    SENSITIVE_KEYS.forEach(key => {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch {
        // Ignore errors
      }
    });
  },

  /**
   * Check if a key is considered sensitive
   * @param key Storage key
   * @returns true if key is sensitive
   */
  isSensitive(key: string): boolean {
    return SENSITIVE_KEYS.includes(key);
  },
};

/**
 * Legacy localStorage helpers for backward compatibility
 * These will automatically use secure storage
 */
export const storage = {
  getItem: (key: string) => secureStorage.getItem(key),
  setItem: (key: string, value: string) => secureStorage.setItem(key, value),
  removeItem: (key: string) => secureStorage.removeItem(key),
};

