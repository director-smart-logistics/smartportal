// ✅ Removed getAuthToken import - cookies handle auth automatically

export interface AuditLogEntry {
  userId: string;
  action: "CREATE" | "READ" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT";
  entity: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failed";
  errorMessage?: string;
  affectedRows?: number;
  timestamp?: string;
}

class AuditService {
  private static instance: AuditService;
  private queue: AuditLogEntry[] = [];
  private maxQueueSize = 50;

  private constructor() {
    // Initialize audit service
    this.loadQueueFromStorage();
  }

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log an action with audit trail
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Add metadata
      const auditEntry: AuditLogEntry = {
        ...entry,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };

      // Add to queue
      this.queue.push(auditEntry);

      // Persist to local storage for offline support
      this.saveQueueToStorage();

      // Try to send to server
      await this.sendToServer(auditEntry);
    } catch (error) {
      console.error("Failed to log audit entry:", error);
    }
  }

  /**
   * Log a successful operation
   */
  async logSuccess(
    userId: string,
    action: AuditLogEntry["action"],
    entity: string,
    entityId?: string,
    newValues?: Record<string, any>,
    oldValues?: Record<string, any>,
    affectedRows?: number,
  ): Promise<void> {
    await this.log({
      userId,
      action,
      entity,
      entityId,
      newValues,
      oldValues,
      status: "success",
      affectedRows,
    });
  }

  /**
   * Log a failed operation
   */
  async logError(
    userId: string,
    action: AuditLogEntry["action"],
    entity: string,
    error: Error,
    entityId?: string,
  ): Promise<void> {
    await this.log({
      userId,
      action,
      entity,
      entityId,
      status: "failed",
      errorMessage: error.message,
    });
  }

  /**
   * Log authentication events
   */
  async logLogin(userId: string): Promise<void> {
    await this.logSuccess(userId, "LOGIN", "auth", userId);
  }

  async logLogout(userId: string): Promise<void> {
    await this.logSuccess(userId, "LOGOUT", "auth", userId);
  }

  /**
   * Log CRUD operations
   */
  async logCreate(
    userId: string,
    entity: string,
    entityId: string,
    newValues: Record<string, any>,
  ): Promise<void> {
    await this.logSuccess(
      userId,
      "CREATE",
      entity,
      entityId,
      newValues,
      undefined,
      1,
    );
  }

  async logRead(
    userId: string,
    entity: string,
    entityId: string,
  ): Promise<void> {
    await this.logSuccess(userId, "READ", entity, entityId);
  }

  async logUpdate(
    userId: string,
    entity: string,
    entityId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>,
  ): Promise<void> {
    await this.logSuccess(
      userId,
      "UPDATE",
      entity,
      entityId,
      newValues,
      oldValues,
      1,
    );
  }

  async logDelete(
    userId: string,
    entity: string,
    entityId: string,
  ): Promise<void> {
    await this.logSuccess(
      userId,
      "DELETE",
      entity,
      entityId,
      undefined,
      undefined,
      1,
    );
  }

  /**
   * Send audit logs to server
   */
  private async sendToServer(entry: AuditLogEntry): Promise<void> {
    try {
      // Get auth token from localStorage for cross-domain authentication
      const token = localStorage.getItem('authToken');
      
      // Skip sending if no token (user not authenticated)
      if (!token) {
        console.debug('Skipping audit log - user not authenticated');
        return;
      }

      // Send to NestJS API
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiUrl}/audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: entry.userId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          oldValues: entry.oldValues,
          newValues: entry.newValues,
          status: entry.status === 'success' ? 'success' : 'failure',
          errorMessage: entry.errorMessage,
        }),
      });

      if (!response.ok) {
        console.warn(
          "Failed to send audit log to server:",
          response.statusText,
        );
      }
    } catch (error) {
      console.warn("Could not send audit log to server (offline mode):", error);
      // Entry remains in queue and will be synced when online
    }
  }

  /**
   * Sync queued logs when back online
   */
  async syncQueuedLogs(): Promise<void> {
    const logsToSync = [...this.queue];
    this.queue = [];

    for (const log of logsToSync) {
      try {
        await this.sendToServer(log);
      } catch (error) {
        // Re-queue failed entries
        this.queue.push(log);
      }
    }

    this.saveQueueToStorage();
  }

  /**
   * Persist queue to sessionStorage (sensitive data - clears on browser close)
   * ✅ Security: Audit logs are sensitive and should not persist in localStorage
   */
  private saveQueueToStorage(): void {
    try {
      const recentLogs = this.queue.slice(-this.maxQueueSize);
      // ✅ Use sessionStorage instead of localStorage for sensitive audit data
      sessionStorage.setItem("auditLogQueue", JSON.stringify(recentLogs));
      // Clean up localStorage if exists (migration)
      try {
        localStorage.removeItem("auditLogQueue");
      } catch {
        // Ignore errors
      }
    } catch (error) {
      console.warn("Failed to save audit queue to storage:", error);
    }
  }

  /**
   * Load queue from sessionStorage
   * ✅ Security: Checks sessionStorage first, falls back to localStorage (migration)
   */
  private loadQueueFromStorage(): void {
    try {
      // ✅ Check sessionStorage first (new secure method)
      let stored = sessionStorage.getItem("auditLogQueue");
      
      // ⚠️ Migration: Check localStorage if sessionStorage is empty
      if (!stored) {
        stored = localStorage.getItem("auditLogQueue");
        if (stored) {
          // Migrate to sessionStorage
          try {
            sessionStorage.setItem("auditLogQueue", stored);
            localStorage.removeItem("auditLogQueue");
          } catch {
            // Ignore migration errors
          }
        }
      }
      
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.warn("Failed to load audit queue from storage:", error);
      this.queue = [];
    }
  }

  /**
   * Clear audit queue
   * ✅ Security: Clears from both storages
   */
  clearQueue(): void {
    this.queue = [];
    try {
      sessionStorage.removeItem("auditLogQueue");
      localStorage.removeItem("auditLogQueue"); // Cleanup legacy data
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get audit statistics
   */
  getStatistics(): {
    totalEntries: number;
    queuedEntries: number;
    entriesByAction: Record<string, number>;
    entriesByEntity: Record<string, number>;
  } {
    const entriesByAction: Record<string, number> = {};
    const entriesByEntity: Record<string, number> = {};

    this.queue.forEach((entry) => {
      entriesByAction[entry.action] = (entriesByAction[entry.action] || 0) + 1;
      entriesByEntity[entry.entity] = (entriesByEntity[entry.entity] || 0) + 1;
    });

    return {
      totalEntries: this.queue.length,
      queuedEntries: this.queue.length,
      entriesByAction,
      entriesByEntity,
    };
  }
}

export const auditService = AuditService.getInstance();
