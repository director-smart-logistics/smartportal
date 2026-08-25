import { UserRole } from "../types";
/**
 * Sync Google user to Firestore after authentication
 * Called automatically after Google Sign-In
 */
export declare const slSyncGoogleUser: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    user: Record<string, any>;
    isNewUser: boolean;
}>, unknown>;
/**
 * Get user profile
 */
export declare const slGetProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    data: {
        id: string;
        email: any;
        fullName: any;
        role: any;
        status: any;
        createdAt: any;
    };
}>, unknown>;
/**
 * Update last login timestamp
 */
export declare const slUpdateLastLogin: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    updated: boolean;
}>, unknown>;
/**
 * Set user role (admin only)
 */
export declare const slSetUserRole: import("firebase-functions/v2/https").CallableFunction<{
    userId: string;
    role: UserRole;
}, Promise<{
    success: boolean;
    userId: string;
    role: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "DELIVERY" | "VIEWER";
}>, unknown>;
//# sourceMappingURL=handlers.d.ts.map