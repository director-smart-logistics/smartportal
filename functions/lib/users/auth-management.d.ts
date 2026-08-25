type UserRole = "ADMIN" | "MANAGER" | "STAFF" | "AGENT" | "DELIVERY" | "CUSTOMER";
interface CreateUserRequest {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    phone?: string;
    sendVerificationEmail?: boolean;
}
interface UpdateUserRequest {
    uid: string;
    email?: string;
    fullName?: string;
    role?: UserRole;
    phone?: string;
    disabled?: boolean;
}
export declare const slCreateUser: import("firebase-functions/v2/https").CallableFunction<CreateUserRequest, Promise<{
    success: boolean;
    data: {
        uid: string;
        email: string | undefined;
        fullName: string;
        role: UserRole;
        emailVerified: boolean;
    };
    message: string;
}>, unknown>;
export declare const slUpdateUser: import("firebase-functions/v2/https").CallableFunction<UpdateUserRequest, Promise<{
    success: boolean;
    message: string;
}>, unknown>;
export declare const slDeleteUser: import("firebase-functions/v2/https").CallableFunction<{
    uid: string;
}, Promise<{
    success: boolean;
    message: string;
}>, unknown>;
export declare const slSendPasswordReset: import("firebase-functions/v2/https").CallableFunction<{
    email: string;
}, Promise<{
    success: boolean;
    message: string;
    link: string;
}>, unknown>;
export declare const slSendEmailVerification: import("firebase-functions/v2/https").CallableFunction<{
    uid: string;
}, Promise<{
    success: boolean;
    message: string;
    link: string;
}>, unknown>;
export declare const slListUsers: import("firebase-functions/v2/https").CallableFunction<{
    limit?: number;
    pageToken?: string;
}, Promise<{
    success: boolean;
    data: {
        uid: string;
        email: string | undefined;
        fullName: any;
        role: any;
        phone: any;
        emailVerified: boolean;
        disabled: boolean;
        status: any;
        createdAt: string;
        lastLoginAt: string;
    }[];
    pagination: {
        nextPageToken: string | undefined;
        total: number;
    };
}>, unknown>;
export declare const slGetUser: import("firebase-functions/v2/https").CallableFunction<{
    uid: string;
}, Promise<{
    success: boolean;
    data: {
        uid: string;
        email: string | undefined;
        fullName: any;
        role: any;
        phone: any;
        emailVerified: boolean;
        disabled: boolean;
        status: any;
        createdAt: string;
        lastLoginAt: string;
        customClaims: {
            [key: string]: any;
        } | undefined;
    };
}>, unknown>;
export {};
//# sourceMappingURL=auth-management.d.ts.map