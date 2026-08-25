"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthError = void 0;
exports.verifyToken = verifyToken;
exports.requireRole = requireRole;
exports.requireAdmin = requireAdmin;
exports.requireAgent = requireAgent;
exports.requireDelivery = requireDelivery;
const firebase_1 = require("../config/firebase");
class AuthError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "AuthError";
    }
}
exports.AuthError = AuthError;
async function verifyToken(request) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        throw new AuthError("unauthenticated", "Missing or invalid authorization header");
    }
    const token = authHeader.split("Bearer ")[1];
    try {
        const decodedToken = await firebase_1.auth.verifyIdToken(token);
        return {
            uid: decodedToken.uid,
            email: decodedToken.email,
            role: decodedToken.role || "AGENT",
        };
    }
    catch (error) {
        console.error("Token verification failed:", error);
        throw new AuthError("unauthenticated", "Invalid or expired token");
    }
}
function requireRole(allowedRoles) {
    return async (request) => {
        const user = await verifyToken(request);
        if (!user.role || !allowedRoles.includes(user.role)) {
            throw new AuthError("permission-denied", `Access denied. Required roles: ${allowedRoles.join(", ")}`);
        }
        return user;
    };
}
function requireAdmin(request) {
    return requireRole(["SUPER_ADMIN", "ADMIN"])(request);
}
function requireAgent(request) {
    return requireRole(["SUPER_ADMIN", "ADMIN", "AGENT"])(request);
}
function requireDelivery(request) {
    return requireRole(["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY"])(request);
}
//# sourceMappingURL=auth.js.map