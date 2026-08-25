/**
 * MLocker Portal Proxy — Firebase Cloud Function
 *
 * Server-side proxy that handles authentication with mayoristas.milocker.net
 * and api.milocker.net on behalf of the Nova chat agent.
 *
 * Actions supported (via POST body `action` field):
 *  - track_package        → api.milocker.net /Tracking/Get + /GetTrackingRecordsLike
 *  - list_manifests       → mayoristas.milocker.net /Manifiestos/ManifestHistory
 *  - get_manifest_detail  → mayoristas.milocker.net /Manifiestos/ManifestDetail (HTML parse)
 *  - download_manifest_excel → mayoristas.milocker.net /Manifiestos/GenerateExcel
 *
 * Authentication:
 *  - API (api.milocker.net): JWT token via POST /api/Authenticate/Login
 *  - Portal (mayoristas.milocker.net): Session cookie via CSRF form login
 *
 * Both sessions are cached in-memory with TTL.
 */
interface MLockerProxyRequest {
    action: "track_package" | "list_manifests" | "get_manifest_detail" | "download_manifest_excel";
    trackingNumber?: string;
    start?: number;
    length?: number;
    manifestNumber?: string;
    description?: string;
    status?: number;
    startDate?: string;
    endDate?: string;
    manifestId?: string;
    excelType?: "summary" | "detail";
}
export declare const slMLockerProxy: import("firebase-functions/v2/https").CallableFunction<MLockerProxyRequest, Promise<Record<string, unknown>>, unknown>;
export {};
//# sourceMappingURL=proxy.d.ts.map