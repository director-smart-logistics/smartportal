import { Request } from "express";
import { UserRole } from "../types";
export interface DecodedToken {
    uid: string;
    email?: string;
    role?: UserRole;
}
export declare class AuthError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export declare function verifyToken(request: Request): Promise<DecodedToken>;
export declare function requireRole(allowedRoles: UserRole[]): (request: Request) => Promise<DecodedToken>;
export declare function requireAdmin(request: Request): Promise<DecodedToken>;
export declare function requireAgent(request: Request): Promise<DecodedToken>;
export declare function requireDelivery(request: Request): Promise<DecodedToken>;
//# sourceMappingURL=auth.d.ts.map