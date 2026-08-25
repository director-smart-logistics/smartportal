/**
 * Firebase Callable Functions Client
 * Uses native Firebase SDK instead of HTTP API calls
 */

import { getFunctions, httpsCallable, HttpsCallableResult } from "firebase/functions";
import { app, sp2App } from "./config";

const functions = getFunctions(app, "us-central1");
const functionsSP2 = sp2App ? getFunctions(sp2App, "us-central1") : null;

/**
 * Generic callable function wrapper with error handling
 */
async function callFunction<TRequest, TResponse>(
  functionName: string,
  data?: TRequest
): Promise<{ success: boolean; data?: TResponse; error?: string }> {
  try {
    const callable = httpsCallable<TRequest, any>(
      functions,
      functionName
    );
    const result: HttpsCallableResult<any> = await callable(data as TRequest);
    const resData = result.data;
    if (resData && typeof resData === "object") {
      if (resData.success === false) {
        return {
          success: false,
          error: resData.error || resData.message || "Action failed",
        };
      }
      if ("data" in resData) {
        return resData;
      }
      return {
        success: true,
        data: resData as TResponse,
      };
    }
    return {
      success: true,
      data: resData as TResponse,
    };
  } catch (error: any) {
    console.error(`Firebase function ${functionName} error:`, error);
    
    // Handle Firebase function errors
    if (error.code === "functions/unauthenticated") {
      return { success: false, error: "Please login to continue" };
    }
    if (error.code === "functions/permission-denied") {
      return { success: false, error: "You don't have permission to perform this action" };
    }
    if (error.code === "functions/not-found") {
      return { success: false, error: "Resource not found" };
    }
    if (error.code === "functions/already-exists") {
      return { success: false, error: "Resource already exists" };
    }
    
    return { 
      success: false, 
      error: error.message || "An unexpected error occurred" 
    };
  }
}

/**
 * Firebase Callable Functions API
 */
export const firebaseApi = {
  // ============================================
  // Auth Functions
  // ============================================
  auth: {
    // IMPORTANT: syncGoogleUser must NOT use callFunction() wrapper because that
    // swallows errors (returns { success: false } instead of throwing).
    // FirebaseAuthContext depends on this throwing a FunctionsError with
    // code "functions/permission-denied" to block unauthorized users.
    syncGoogleUser: async (): Promise<{ success: boolean; user?: any; isNewUser?: boolean }> => {
      const fn = httpsCallable<void, { success: boolean; user: any; isNewUser: boolean }>(
        functions,
        "slSyncGoogleUser"
      );
      const result = await fn(); // Throws FunctionsError on permission-denied
      return result.data;
    },
    
    getProfile: () => 
      callFunction<void, any>("slGetProfile"),
    
    updateLastLogin: () => 
      callFunction<void, { updated: boolean }>("slUpdateLastLogin"),
    
    setUserRole: (userId: string, role: string) => 
      callFunction<{ userId: string; role: string }, { userId: string; role: string }>(
        "slSetUserRole", 
        { userId, role }
      ),
  },

  // ============================================
  // Users (Firebase Auth + Firestore)
  // ============================================
  users: {
    create: (data: {
      email: string;
      fullName: string;
      role: "ADMIN" | "MANAGER" | "STAFF" | "AGENT" | "DELIVERY" | "CUSTOMER";
      phone?: string;
    }) => callFunction<typeof data, any>("slCreateUser", data),

    list: (params?: { page?: number; limit?: number; sortOrder?: "asc" | "desc" }) => 
      callFunction<typeof params, { data: any[]; pagination: any }>("slListUsers", params),
    
    getById: (userId: string) => 
      callFunction<{ userId: string }, any>("slGetUser", { userId }),
    
    update: (data: {
      userId: string;
      email?: string;
      fullName?: string;
      phone?: string;
      role?: "ADMIN" | "MANAGER" | "STAFF" | "AGENT" | "DELIVERY" | "CUSTOMER";
      disabled?: boolean;
    }) => callFunction<typeof data, any>("slUpdateUser", data),
    
    delete: (userId: string) => 
      callFunction<{ userId: string }, { id: string }>("slDeleteUser", { userId }),

    sendPasswordReset: (email: string) =>
      callFunction<{ email: string }, { success: boolean; message: string; link: string }>(
        "slSendPasswordReset",
        { email }
      ),

    sendEmailVerification: (userId: string) =>
      callFunction<{ userId: string }, { success: boolean; message: string; link: string }>(
        "slSendEmailVerification",
        { userId }
      ),
  },

  // ============================================
  // Customers
  // ============================================
  customers: {
    list: (params?: { page?: number; limit?: number; sortOrder?: "asc" | "desc"; q?: string; status?: string }) => 
      callFunction<typeof params, { data: any[]; pagination: any }>("slListCustomers", params),
    
    getById: (customerId: string) => 
      callFunction<{ customerId: string }, any>("slGetCustomer", { customerId }),
    
    getBySlCode: (slCode: string) => 
      callFunction<{ slCode: string }, any>("slGetCustomerBySlCode", { slCode }),
    
    create: (data: any) => 
      callFunction<any, any>("slCreateCustomer", data),
    
    update: (customerId: string, data: any) => 
      callFunction<any, any>("slUpdateCustomer", { customerId, ...data }),
    
    delete: (customerId: string) => 
      callFunction<{ customerId: string }, { id: string }>("slDeleteCustomer", { customerId }),

    /** Trigger a manual SP2→SP1 customer sync (admin only). full=true forces a full re-sync. */
    sync: (full = false) =>
      callFunction<{ full: boolean }, { success: boolean; stats: any }>("triggerCustomerSync", { full }),

    recreateSp2Account: (slCode: string) =>
      callFunction<{ slCode: string }, { success: boolean; message?: string }>("slRecreateSp2UserAccount", { slCode }),

    /**
     * Manually recreate a customer doc at `customers/{slCode}` from a typed
     * payload. Used when both SP1 and SP2 lost the account but orphan data
     * (packages, invoices, pre-alerts) is still pinned to the slCode.
     */
    recreate: (params: {
      slCode: string;
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      dni?: string;
      ruta?: string;
      nationality?: string;
      birthDate?: string;
      country?: string;
      reason?: string;
      force?: boolean;
    }) =>
      callFunction<typeof params, {
        success: true;
        customer: { id: string; slCode: string; email: string; fullName: string };
      }>("slRecreateCustomerBySlCode", params),

    /**
     * Force sync a customer from SP2 into SP1 using their slCode.
     * Fetches fresh data from SP2 and applies the sync rules immediately.
     */
    forceSyncFromSP2: (slCode: string) =>
      callFunction<{ slCode: string }, {
        success: true;
        customer: { id: string; slCode: string; email: string; fullName: string };
      }>("slForceSyncCustomerFromSP2", { slCode }),
  },

  // ============================================
  // Pre-alerts
  // ============================================
  prealerts: {
    /**
     * Move a pre-alert (and its mirrored SP2 shipment) to a different
     * customer SL Code. Used to recover trackings created under a
     * duplicate or wrongly-deleted account.
     */
    reassign: (params: { preAlertId: string; newSlCode: string; reason?: string }) =>
      callFunction<typeof params, {
        success: true;
        preAlertId: string;
        from: { slCode: string; displayName: string };
        to:   { slCode: string; displayName: string; userId: string | null };
        sp2:  { pushed: boolean; outcome?: string; error?: string };
      }>("slReassignPreAlert", params),

    /** Bulk-move many pre-alerts to the same destination customer in one call. */
    reassignBulk: (params: { preAlertIds: string[]; newSlCode: string; reason?: string }) =>
      callFunction<typeof params, {
        success: true;
        target: { slCode: string; displayName: string; userId: string | null };
        total: number;
        succeeded: number;
        failed: number;
        sp2Pushed: number;
        results: Array<{
          preAlertId: string;
          tracking: string | null;
          ok: boolean;
          fromSlCode: string | null;
          toSlCode: string | null;
          sp2: { pushed: boolean; outcome?: string; error?: string };
          error?: string;
        }>;
      }>("slReassignPreAlertsBulk", params),
  },

  // ============================================
  // Packages
  // ============================================
  packages: {
    list: (params?: { page?: number; limit?: number; sortOrder?: "asc" | "desc"; q?: string; status?: string }) => 
      callFunction<typeof params, { data: any[]; pagination: any }>("slListPackages", params),
    
    listByRoute: (params: { route: string; status?: string; limit?: number }) =>
      callFunction<typeof params, { data: any[]; pagination: any }>("slListPackagesByRoute", params),
    
    getById: (packageId: string) => 
      callFunction<{ packageId: string }, any>("slGetPackage", { packageId }),
    
    getByTracking: (tracking: string) => 
      callFunction<{ tracking: string }, any>("slGetPackageByTracking", { tracking }),
    
    create: (data: any) => 
      callFunction<any, any>("slCreatePackage", data),
    
    update: (packageId: string, data: any) => 
      callFunction<any, any>("slUpdatePackage", { packageId, ...data }),
    
    updateStatus: (
      packageId: string,
      status: string,
      location?: string,
      notes?: string,
      deliverySignature?: string,
      paymentCollected?: boolean
    ) => 
      callFunction<{
        packageId: string;
        status: string;
        location?: string;
        notes?: string;
        deliverySignature?: string;
        paymentCollected?: boolean;
      }, any>(
        "slUpdatePackageStatus", 
        { packageId, status, location, notes, deliverySignature, paymentCollected }
      ),
    
    bulkUpdateStatus: (packageIds: string[], status: string, extraFields?: Record<string, any>) =>
      callFunction<{ packageIds: string[]; status: string; extraFields?: Record<string, any> }, { updated: number }>(
        "slBulkUpdatePackageStatus",
        { packageIds, status, extraFields }
      ),
    
    delete: (packageId: string) => 
      callFunction<{ packageId: string }, { id: string }>("slDeletePackage", { packageId }),

    /**
     * Lifecycle trace for a tracking number across packages, invoices and
     * audit logs. Used by the consolidation UI to diagnose orphan items.
     */
    trace: (tracking: string) =>
      callFunction<{ tracking: string }, {
        tracking: string;
        packages: Array<Record<string, any>>;
        invoices: Array<Record<string, any>>;
        audits: Array<Record<string, any>>;
        ownershipMismatch: boolean;
        mismatchDetail: string | null;
        resolutionPlan: Array<{
          pkgId: string;
          pkgSlCode: string | null;
          pkgCustomerName: string | null;
          tracking: string;
          currentInvoiceId: string | null;
          currentInvoiceNumber: string | null;
          currentInvoiceStatus: string | null;
          targetInvoiceId: string | null;
          targetInvoiceNumber: string | null;
          targetInvoiceStatus: string | null;
          reason: string;
          willChange: boolean;
        }>;
      }>("slTraceTracking", { tracking }),

    /**
     * On-demand enforcement of the package <-> invoice link invariant for
     * a single tracking. Re-binds every package carrying the tracking to
     * the most recent active invoice for the same customer.
     */
    resolveLinks: (tracking: string) =>
      callFunction<{ tracking: string }, {
        tracking: string;
        changed: Array<{ pkgId: string; from: string | null; to: string | null; toNumber: string | null }>;
        skipped: number;
      }>("slResolveTrackingLinks", { tracking }),

    /**
     * Audit a package and its associated invoices in SP2.
     */
    auditSp2: (params: {
      trackingNumber: string;
      invoicesList: Array<{
        id: string;
        invoiceNumber: string;
        status: string;
        totalAmount: number;
      }>;
      packagesList?: Array<{
        id: string;
        trackingNumber: string;
        status: string;
      }>;
    }) =>
      callFunction<typeof params, {
        package: {
          exists: boolean;
          statusSp1?: string;
          statusSp2: string;
          isDuplicate: boolean;
          sp2DocsCount: number;
          mismatch?: boolean;
        };
        packages?: Array<{
          id: string;
          trackingNumber: string;
          existsSp2: boolean;
          isDuplicate: boolean;
          statusSp1: string;
          statusSp2: string;
          mismatch: boolean;
          sp2Docs: Array<{
            id: string;
            tracking: string;
            status: string;
            slCode: string;
            createdAt?: any;
          }>;
        }>;
        invoices: Array<{
          id: string;
          invoiceNumber: string;
          existsSp1: boolean;
          existsSp2: boolean;
          statusSp1: string;
          statusSp2: string;
          amountSp1: number;
          amountSp2: number;
          mismatch: boolean;
        }>;
        hasIssues?: boolean;
      }>("slAuditSp2Package", params),

    /**
     * Delete a shipment in SP2.
     */
    deleteSp2Shipment: (params: {
      shipmentId: string;
    }) =>
      callFunction<typeof params, { success: boolean }>("slDeleteSp2Shipment", params),
  },

  // ============================================
  // Routes (Rutas)
  // ============================================
  routes: {
    list: (params?: { status?: string; limit?: number }) =>
      callFunction<typeof params, { data: any[]; pagination: any }>("slListRoutes", params),

    getById: (routeId: string) =>
      callFunction<{ routeId: string }, any>("slGetRoute", { routeId }),

    create: (data: any) =>
      callFunction<any, any>("slCreateRoute", data),

    update: (routeId: string, data: any) =>
      callFunction<any, any>("slUpdateRoute", { routeId, ...data }),

    delete: (routeId: string) =>
      callFunction<{ routeId: string }, { id: string }>("slDeleteRoute", { routeId }),

    seedFromJson: (routes: any[]) =>
      callFunction<{ routes: any[] }, { seeded: number }>("slSeedRoutes", { routes }),
  },

  // ============================================
  // Invoices
  // ============================================
  invoices: {
    list: (params?: { page?: number; limit?: number; sortOrder?: "asc" | "desc"; q?: string; status?: string }) => 
      callFunction<typeof params, { data: any[]; pagination: any }>("slListInvoices", params),
    
    getById: (invoiceId: string) => 
      callFunction<{ invoiceId: string }, any>("slGetInvoice", { invoiceId }),
    
    create: (data: any) => 
      callFunction<any, any>("slCreateInvoice", data),
    
    update: (invoiceId: string, data: any) => 
      callFunction<any, any>("slUpdateInvoice", { invoiceId, ...data }),
    
    markPaid: (invoiceId: string, paymentMethod?: string, paymentReference?: string) => 
      callFunction<{ invoiceId: string; paymentMethod?: string; paymentReference?: string }, any>(
        "slMarkInvoicePaid", 
        { invoiceId, paymentMethod, paymentReference }
      ),
    
    delete: (invoiceId: string) => 
      callFunction<{ invoiceId: string }, { id: string }>("slDeleteInvoice", { invoiceId }),
  },

  // ============================================
  // Analytics
  // ============================================
  analytics: {
    getDashboardStats: () => 
      callFunction<void, any>("slGetDashboardStats"),
    
    getPackagesByStatus: () => 
      callFunction<void, Record<string, number>>("slGetPackagesByStatus"),
    
    getInvoicesByStatus: () => 
      callFunction<void, Record<string, number>>("slGetInvoicesByStatus"),
    
    getRecentActivity: (limit?: number) => 
      callFunction<{ limit?: number }, any[]>("slGetRecentActivity", { limit }),

    getMonthlyAnalytics: (month: string) =>
      callFunction<{ month: string }, any>("slGetMonthlyAnalytics", { month }),

    initializeDashboardCounters: () =>
      callFunction<void, { success: boolean }>("slInitializeDashboardCounters"),
  },

  // ============================================
  // Email
  // ============================================
  email: {
    sendInvoice: (data: {
      customerEmail: string;
      customerName: string;
      customerDni: string;
      customerAddress: string;
      invoiceNumber: string;
      invoiceDate: string;
      dueDate: string;
      paymentStatus: 'pending' | 'paid' | 'overdue';
      items: { tracking: string; description?: string; weight?: number; amount: number }[];
      subtotal: number;
      tax: number;
      total: number;
      currencySymbol: string;
      ivaEnabled: boolean;
      exchangeRate?: number;
      totalCRC?: number;
      notes?: string;
    }) => callFunction<typeof data, { success: boolean; messageId?: string }>("sendInvoiceEmailFunction", data),

    sendEmail: (data: {
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string;
      cc?: string | string[];
      bcc?: string | string[];
    }) => callFunction<typeof data, { success: boolean; messageId?: string; error?: string }>("sendEmailFunction", data),

    getEmailStatus: (messageId: string) =>
      callFunction<{ messageId: string }, {
        success: boolean;
        status?: {
          id: string;
          from: string;
          to: string[];
          subject: string;
          created_at: string;
          last_event: string;
        };
      }>("getEmailStatusFunction", { messageId }),

    refreshStatus: (invoiceId: string) =>
      callFunction<{ invoiceId: string }, { success: boolean; status?: string; reason?: string }>(
        "slRefreshEmailStatus",
        { invoiceId }
      ),

    getEmailStatusBatch: (messageIds: string[]) =>
      callFunction<{ messageIds: string[] }, {
        success: boolean;
        results: Array<{
          messageId: string;
          success: boolean;
          status?: {
            id: string;
            from: string;
            to: string[];
            subject: string;
            created_at: string;
            last_event: string;
          };
          error?: string;
        }>;
      }>("getEmailStatusBatchFunction", { messageIds }),
  },

  // ============================================
  // MLocker Proxy (MLCargo / MiLocker API)
  // ============================================
  mlocker: {
    trackPackage: (trackingNumber: string) =>
      callFunction<{ action: string; trackingNumber: string }, any>(
        'slMLockerProxy',
        { action: 'track_package', trackingNumber }
      ),
    listManifests: (params?: { start?: number; length?: number; manifestNumber?: string; description?: string; status?: number; startDate?: string; endDate?: string }) =>
      callFunction<any, any>('slMLockerProxy', { action: 'list_manifests', ...params }),
    getManifestDetail: (manifestId: string) =>
      callFunction<{ action: string; manifestId: string }, any>(
        'slMLockerProxy',
        { action: 'get_manifest_detail', manifestId }
      ),
  },

  // ============================================
  // Colombia Tracking (Ticabox / ManagerCargo)
  // ============================================
  colombia: {
    track: (trackingNumber: string) =>
      callFunction<{ trackingNumber: string }, any>('slTrackColombia', { trackingNumber }),
  },

  // ============================================
  // Settings
  // ============================================
  settings: {
    list: (params?: { category?: string; isPublic?: boolean }) => 
      callFunction<typeof params, any[]>("slListSettings", params),
    
    getByKey: (key: string) => 
      callFunction<{ key: string }, any>("slGetSetting", { key }),
    
    create: (data: { key: string; value: string; type?: string; category?: string; description?: string; isPublic?: boolean }) => 
      callFunction<typeof data, any>("slCreateSetting", data),
    
    update: (key: string, data: any) => 
      callFunction<any, any>("slUpdateSetting", { key, ...data }),
    
    delete: (key: string) => 
      callFunction<{ key: string }, any>("slDeleteSetting", { key }),
    
    bulkGet: (keys: string[]) => 
      callFunction<{ keys: string[] }, Record<string, string>>("slBulkGetSettings", { keys }),
  },

  // ============================================
  // Shipping Labels
  // ============================================
  shippingLabels: {
    create: (data: {
      customerId: string;
      customerName: string;
      customerSlCode: string;
      recipientName: string;
      recipientAddress: string;
      recipientCity: string;
      recipientCountry?: string;
      recipientPhone?: string;
      packageIds: string[];
      deliveryMethod: "home_delivery" | "pickup" | "route";
      routeId?: string;
      routeName?: string;
      notes?: string;
      deliveryInstructions?: string;
    }) => callFunction<typeof data, any>("slCreateShippingLabel", data),

    list: (params?: {
      page?: number;
      limit?: number;
      status?: string;
      customerId?: string;
      customerSlCode?: string;
      routeId?: string;
      dateFrom?: string;
      dateTo?: string;
      q?: string;
    }) => callFunction<typeof params, any>("slListShippingLabels", params),

    updateStatus: (data: {
      labelId: string;
      status: "pending" | "printed" | "in_transit" | "delivered" | "cancelled";
      notes?: string;
    }) => callFunction<typeof data, any>("slUpdateLabelStatus", data),

    cancel: (data: {
      labelId: string;
      reason: string;
    }) => callFunction<typeof data, any>("slCancelShippingLabel", data),
  },

  // ============================================
  // Manifests
  // ============================================
  manifests: {
    sendSeaManifestInvoice: (data: {
      customerEmail: string;
      customerName: string;
      customerDni: string;
      customerAddress: string;
      invoiceNumber: string;
      invoiceDate: string;
      tracking: string;
      length?: string;
      width?: string;
      height?: string;
      volume?: number;
      peso?: string;
      permisos?: boolean;
      basePrice: number;
      bodegajeCost: number;
      permisoCost: number;
      subtotal: number;
      tax: number;
      total: number;
      exchangeRate: number;
      totalCRC: number;
      ivaEnabled: boolean;
    }) => callFunction<typeof data, { success: boolean; messageId?: string }>("slSendSeaManifestInvoiceEmail", data),
  },
};

export const sp2Api = {
  tse: {
    consultarCedula: async (cedula: string): Promise<any> => {
      if (!functionsSP2) {
        throw new Error("Conexión con SP2 no inicializada.");
      }
      const fn = httpsCallable<{ cedula: string }, { success: boolean; persona: any }>(
        functionsSP2,
        "slConsultarCedula"
      );
      const result = await fn({ cedula });
      if (!result.data?.success || !result.data?.persona) {
        throw new Error("No se pudo obtener información del Registro Civil.");
      }
      return result.data.persona;
    },
    formatCedula: (cedula: string): string => {
      const clean = cedula.trim().replace(/\D/g, "");
      if (clean.length !== 9) return cedula;
      return `${clean.charAt(0)}-${clean.slice(1, 5)}-${clean.slice(5)}`;
    }
  }
};

export type FirebaseApi = typeof firebaseApi;
export type Sp2Api = typeof sp2Api;
