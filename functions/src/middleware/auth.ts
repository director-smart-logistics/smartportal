import { Request } from "express";
import { auth } from "../config/firebase";
import { UserRole } from "../types";

export interface DecodedToken {
  uid: string;
  email?: string;
  role?: UserRole;
}

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function verifyToken(
  request: Request
): Promise<DecodedToken> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("unauthenticated", "Missing or invalid authorization header");
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: (decodedToken.role as UserRole) || "AGENT",
    };
  } catch (error) {
    console.error("Token verification failed:", error);
    throw new AuthError("unauthenticated", "Invalid or expired token");
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return async (request: Request): Promise<DecodedToken> => {
    const user = await verifyToken(request);

    if (!user.role || !allowedRoles.includes(user.role)) {
      throw new AuthError(
        "permission-denied",
        `Access denied. Required roles: ${allowedRoles.join(", ")}`
      );
    }

    return user;
  };
}

export function requireAdmin(request: Request): Promise<DecodedToken> {
  return requireRole(["SUPER_ADMIN", "ADMIN"])(request);
}

export function requireAgent(request: Request): Promise<DecodedToken> {
  return requireRole(["SUPER_ADMIN", "ADMIN", "AGENT"])(request);
}

export function requireDelivery(request: Request): Promise<DecodedToken> {
  return requireRole(["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY"])(request);
}
