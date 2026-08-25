type UserRole = "ADMIN" | "MANAGER" | "STAFF" | "AGENT" | "DELIVERY" | "CUSTOMER";
interface CreateUserRequest {
    email: string;
    fullName: string;
    role: UserRole;
    phone?: string;
}
interface UpdateUserRequest {
    userId: string;
    email?: string;
    fullName?: string;
    phone?: string;
    role?: UserRole;
    disabled?: boolean;
}
interface ListUsersRequest {
    page?: number;
    limit?: number;
    sortOrder?: "asc" | "desc";
}
export declare const slCreateUser: import("firebase-functions/v2/https").CallableFunction<CreateUserRequest, Promise<{
    success: boolean;
    data: {
        email: string;
        fullName: string;
        role: UserRole;
    };
    message: string;
}>, unknown>;
export declare const slListUsers: import("firebase-functions/v2/https").CallableFunction<ListUsersRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        email: any;
        fullName: any;
        phone: any;
        role: any;
        status: any;
        disabled: any;
        emailVerified: any;
        createdAt: any;
        lastLogin: any;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>, unknown>;
export declare const slGetUser: import("firebase-functions/v2/https").CallableFunction<{
    userId: string;
}, Promise<{
    success: boolean;
    data: {
        id: string;
        email: any;
        fullName: any;
        phone: any;
        role: any;
        status: any;
        disabled: boolean;
        emailVerified: boolean;
        createdAt: any;
        lastLogin: any;
    };
}>, unknown>;
export declare const slUpdateUser: import("firebase-functions/v2/https").CallableFunction<UpdateUserRequest, Promise<{
    success: boolean;
    message: string;
}>, unknown>;
export declare const slDeleteUser: import("firebase-functions/v2/https").CallableFunction<{
    userId: string;
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
    userId: string;
}, Promise<{
    success: boolean;
    message: string;
    link: string;
}>, unknown>;
export {};
//# sourceMappingURL=index.d.ts.map