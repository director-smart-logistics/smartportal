export interface Sp2BulkSyncResult {
    total: number;
    updated: number;
    created: number;
    skipped: number;
    errors: number;
    details: Array<{
        tracking: string;
        outcome: string;
        reason?: string;
    }>;
    error?: string;
}
/**
 * Route Management → SP2 (2026-09-28): the new status of every package is pushed to SP2 and AWAITED (a
 * fire-and-forget fetch can be cut when the function answers). `force` (Route Management's explicit admin
 * actions only) = forceSync: SP1 governs, SP2's regression guard must not keep a package "En ruta" or
 * "Facturado". Other callers keep the guard (e.g. a label reprint never moves a delivered package back).
 * One retry on a network/5xx error.
 * The per-package outcome goes back to the admin (why a package was skipped).
 */
export declare function pushBulkStatusToSP2(packages: Array<{
    trackingNumber?: string;
    slCode?: string;
    status: string;
    weight?: number;
    description?: string;
    ruta?: string;
    manifestNumber?: string;
    requiresPermit?: boolean;
    calculatedCost?: number;
    cost?: number;
    currency?: string;
}>, force: boolean): Promise<Sp2BulkSyncResult>;
interface ListRoutesRequest {
    status?: string;
    limit?: number;
}
interface RouteVehicle {
    type: string;
    plate: string;
    capacity?: number;
    notes?: string;
    driverId?: string;
    driverName?: string;
}
interface CreateRouteRequest {
    name: string;
    description?: string;
    originLocation?: string;
    destinationLocation?: string;
    vehiclePlate?: string;
    vehicleType?: string;
    vehicles?: RouteVehicle[];
    estimatedDistance?: number;
    estimatedDuration?: string;
    status?: "active" | "inactive";
    areas?: string[];
    cantons?: string[];
    province?: string;
    color?: string;
    type?: "metropolitan" | "encomienda";
    assignedAgentId?: string | null;
    totalPackages?: number;
    completedPackages?: number;
}
interface UpdateRouteRequest extends Partial<CreateRouteRequest> {
    routeId: string;
}
interface SeedRoutesRequest {
    routes: CreateRouteRequest[];
}
interface ListPackagesByRouteRequest {
    route: string;
    status?: string;
    limit?: number;
}
interface BulkUpdateStatusRequest {
    packageIds: string[];
    status: string;
    extraFields?: Record<string, unknown>;
    /** Route Management: the admin's explicit status wins in SP2 (forceSync). */
    forceSp2?: boolean;
}
export declare const slListRoutes: import("firebase-functions/v2/https").CallableFunction<ListRoutesRequest, Promise<{
    success: boolean;
    data: {
        status: any;
        createdAt: any;
        updatedAt: any;
        id: string;
    }[];
    pagination: {
        total: number;
        limit: number;
    };
}>, unknown>;
export declare const slGetRoute: import("firebase-functions/v2/https").CallableFunction<{
    routeId: string;
}, Promise<{
    success: boolean;
    data: {
        createdAt: any;
        updatedAt: any;
        id: string;
    };
}>, unknown>;
export declare const slCreateRoute: import("firebase-functions/v2/https").CallableFunction<CreateRouteRequest, Promise<{
    success: boolean;
    data: {
        createdAt: string;
        updatedAt: string;
        name: string;
        description: string | null;
        originLocation: string | null;
        destinationLocation: string | null;
        vehiclePlate: string | null;
        vehicleType: string;
        vehicles: RouteVehicle[];
        estimatedDistance: number | null;
        estimatedDuration: string | null;
        status: "active" | "inactive";
        areas: string[];
        cantons: string[];
        province: string | null;
        color: string | null;
        type: "encomienda" | "metropolitan";
        assignedAgentId: string | null;
        totalPackages: number;
        completedPackages: number;
        createdBy: string;
        id: string;
    };
}>, unknown>;
export declare const slUpdateRoute: import("firebase-functions/v2/https").CallableFunction<UpdateRouteRequest, Promise<{
    name?: string | undefined;
    description?: string | undefined;
    originLocation?: string | undefined;
    destinationLocation?: string | undefined;
    vehiclePlate?: string | undefined;
    vehicleType?: string | undefined;
    vehicles?: RouteVehicle[] | undefined;
    estimatedDistance?: number | undefined;
    estimatedDuration?: string | undefined;
    status?: "active" | "inactive" | undefined;
    areas?: string[] | undefined;
    cantons?: string[] | undefined;
    province?: string | undefined;
    color?: string | undefined;
    type?: "metropolitan" | "encomienda" | undefined;
    assignedAgentId?: string | null | undefined;
    totalPackages?: number | undefined;
    completedPackages?: number | undefined;
    success: boolean;
    id: string;
}>, unknown>;
export declare const slDeleteRoute: import("firebase-functions/v2/https").CallableFunction<{
    routeId: string;
}, Promise<{
    success: boolean;
    id: string;
}>, unknown>;
export declare const slSeedRoutes: import("firebase-functions/v2/https").CallableFunction<SeedRoutesRequest, Promise<{
    success: boolean;
    seeded: number;
}>, unknown>;
export declare const slListPackagesByRoute: import("firebase-functions/v2/https").CallableFunction<ListPackagesByRouteRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        tracking: any;
        slCode: any;
        customerName: any;
        status: any;
        ruta: any;
        weight: any;
        value: any;
        description: any;
        manifiesto: any;
        createdAt: any;
        updatedAt: any;
    }[];
    pagination: {
        total: number;
        limit: number;
    };
}>, unknown>;
export declare const slBulkUpdatePackageStatus: import("firebase-functions/v2/https").CallableFunction<BulkUpdateStatusRequest, Promise<{
    success: boolean;
    updated: number;
    sp2: Sp2BulkSyncResult;
}>, unknown>;
export {};
//# sourceMappingURL=callable.d.ts.map