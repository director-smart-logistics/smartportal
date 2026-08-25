"use strict";
/**
 * Pre-Alert Sync Functions
 *
 * Syncs pre-alerts from smart-portal-2 (shipments where source='prealert')
 * to smart-portal-1 pre_alerts collection (portal database).
 *
 * Enrichment flow per tracking:
 *   1. Mayorista portal SearchByNumber (variants) → portalTracking (from JSON)
 *   2. Mayorista portal DetailByNumber  → extract canonicalTracking from HTML
 *      (30-digit 420XXXXX... form that api.milocker.net resolves)
 *   3. MLCargo API /Tracking/Get with canonicalTracking → weight, manifest, description
 *   4. MLCargo API /Tracking/GetTrackingRecordsLike   → status history events
 *
 * Stores both:
 *   - tracking         → original tracking entered by user in SP2
 *   - canonicalTracking → resolved 30-digit USPS canonical (for MLCargo lookup)
 *
 * Schedule: 4x/day — 00:00, 06:00, 12:00, 18:00 Costa Rica time
 * Key: SP2 shipment doc ID (stable: {trackingNorm}_{userId8})
 *
 * @module functions/prealerts/sync
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerPreAlertSync = exports.syncPreAlertsFromSP2 = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const https = __importStar(require("https"));
const querystring = __importStar(require("querystring"));
// ── Constants ─────────────────────────────────────────────────────────────────
const SP2_PROJECT_ID = "smart-portal-2";
const MLCARGO_API_USER = "spedi";
const MLCARGO_API_PASS = "nshop1_045#$1";
const PORTAL_HOST = "mayoristas.milocker.net";
const PORTAL_USER = process.env.MLOCKER_PORTAL_USER || "darias";
const PORTAL_PASS = process.env.MLOCKER_PORTAL_PASS || "darias";
const MIAMI_ZIPS = ["33195", "33166", "33178", "33172", "33126"];
const SYNC_CONCURRENCY = 8;
const MIDDLEWARE_SKIP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
// Carriers that never appear in Mayorista/MLCargo — skip enrichment entirely
const NON_MLCARGO_PATTERNS = [
    /^1Z[A-Z0-9]{16}$/, // UPS
    /^TBA\d{9,}$/, // Amazon Logistics
    /^(GFUS|SFUS)[0-9A-Z]{6,}$/, // Shein
    /^[0-9]{12}$/, // FedEx 12-digit
    /^[0-9]{15}$/, // FedEx 15-digit
    /^[0-9]{10}$/, // DHL
    /^\d{3}-\d{7}-\d{7}$/, // Amazon order ID (111-xxxxxxx-xxxxxxx)
    /^[A-Z]{3}\d{7,10}$/, // Colombia (e.g. ALA2500185)
    /^4PX\d+[A-Z]{2}$/, // 4PX China logistics (4PXxxxxxxxxCN)
    /^[A-Z]{2}\d{9}[A-Z]{2}$/, // International ePacket (e.g. UA123456789CN)
    /^JD\d{18,22}$/, // JD Logistics
    /^SF\d{12,15}$/, // SF Express
    /^JCZ\d{10,14}[A-Z]{2}$/, // DHL Express China (JCZxxxxxxxxDH)
    /^[A-Z]{2}\d{8,12}[A-Z]{2}$/, // Generic postal (LM/LY/RR/RA/RB... CN/US etc.)
    /^SPXMIA\d{9,}/, // ShipX Miami / Shein SPX (SPXMIA...)
    /^LP\d{12,}/, // LaserShip/OnTrac
    /^1LS[A-Z0-9]{8,}/, // LaserShip legacy
];
function isMLCargoCandidate(tracking) {
    const t = tracking.toUpperCase().trim();
    return !NON_MLCARGO_PATTERNS.some(p => p.test(t));
}
/**
 * Suffix lengths exposed for array-contains-any matching. Each pre-alert
 * persists every applicable suffix (8 / 10 / 12 numeric digits) so the
 * Nova matcher can probe whichever length survives carrier prefix /
 * service-tag / check-digit drift. 8 is the floor — any shorter and
 * collisions explode (any 7-digit run is too generic).
 */
const TRACKING_SUFFIX_LENGTHS = [8, 10, 12];
/**
 * Build the suffix-array indexed on each pre-alert. We strip everything
 * except digits and emit ONE entry per supported length, prefixed with
 * "L<n>:" so an 8-digit suffix from one tracking can never collide with
 * a 10-digit suffix from another that happens to end in those same 8.
 *
 * Returns an empty array when the digits-only tracking is shorter than
 * the minimum supported length — those are not unique enough to
 * disambiguate and must NOT participate in suffix matching.
 *
 * Used to recover matches when the operator scans a carrier label whose
 * prefix or check digits differ from what the customer typed in SP2
 * (USPS routing prefix, FedEx service tag, UPS 1Z leader, DHL leading
 * zeros, SpeedLogistics SL-prefixed numbers, etc.).
 */
function computeTrackingSuffixes(tracking) {
    if (!tracking)
        return [];
    const digits = String(tracking).replace(/\D+/g, "");
    if (digits.length < TRACKING_SUFFIX_LENGTHS[0])
        return [];
    const out = [];
    for (const len of TRACKING_SUFFIX_LENGTHS) {
        if (digits.length >= len)
            out.push(`L${len}:${digits.slice(-len)}`);
    }
    return out;
}
/** Legacy single-suffix accessor preserved for any historical reader. */
function computeTrackingSuffix12(tracking) {
    if (!tracking)
        return null;
    const digits = String(tracking).replace(/\D+/g, "");
    if (digits.length < 4)
        return null;
    return digits.slice(-12);
}
// ── Module-level caches ───────────────────────────────────────────────────────
let sp2Db = null;
let apiTokenCache = null;
let portalSessionCache = null;
// ── Firestore helpers ─────────────────────────────────────────────────────────
function getSp2Firestore() {
    if (sp2Db)
        return sp2Db;
    const appName = "smart-portal-2-prealerts";
    const existing = (0, app_1.getApps)().find(a => a.name === appName);
    if (existing) {
        sp2Db = (0, firestore_1.getFirestore)(existing);
    }
    else {
        const app = (0, app_1.initializeApp)({ projectId: SP2_PROJECT_ID }, appName);
        sp2Db = (0, firestore_1.getFirestore)(app);
    }
    return sp2Db;
}
const sp1Db = (0, firestore_1.getFirestore)((0, app_1.getApp)(), "portal");
// ── HTTP helper ───────────────────────────────────────────────────────────────
function rawRequest(options, body, timeoutMs = 12_000) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk.toString(); });
            res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
        });
        req.on("error", reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Request timeout")); });
        if (body)
            req.write(body);
        req.end();
    });
}
function extractCookies(headers) {
    const sc = headers["set-cookie"];
    if (!sc)
        return "";
    const arr = Array.isArray(sc) ? sc : [sc];
    return arr.map((c) => c.split(";")[0]).join("; ");
}
// ── MLCargo API auth ──────────────────────────────────────────────────────────
async function ensureApiToken() {
    if (apiTokenCache && Date.now() < apiTokenCache.expiresAt)
        return apiTokenCache.token;
    const body = JSON.stringify({ user: MLCARGO_API_USER, password: MLCARGO_API_PASS });
    const res = await rawRequest({
        hostname: "api.milocker.net",
        path: "/api/Authenticate/Login",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": String(Buffer.byteLength(body)),
            "Accept": "application/json",
            "User-Agent": "axios/1.6.0",
        },
    }, body);
    let parsed = {};
    try {
        parsed = JSON.parse(res.body);
    }
    catch { /**/ }
    if (!parsed.token)
        throw new Error(`MLCargo auth failed: status=${res.status}`);
    apiTokenCache = { token: parsed.token, expiresAt: Date.now() + 9 * 60 * 1000 };
    return parsed.token;
}
// ── Mayorista portal auth ─────────────────────────────────────────────────────
async function ensurePortalSession() {
    if (portalSessionCache && Date.now() < portalSessionCache.expiresAt)
        return portalSessionCache.cookies;
    const loginPage = await rawRequest({
        hostname: PORTAL_HOST, path: "/", method: "GET",
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
    });
    const csrfMatch = loginPage.body.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
    if (!csrfMatch)
        throw new Error("Portal: could not extract CSRF token");
    const antiforgeryCookie = extractCookies(loginPage.headers);
    const loginBody = querystring.stringify({
        User: PORTAL_USER, Password: PORTAL_PASS,
        __RequestVerificationToken: csrfMatch[1],
    });
    const loginRes = await rawRequest({
        hostname: PORTAL_HOST, path: "/Login/ValidarUsuario", method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": String(Buffer.byteLength(loginBody)),
            "User-Agent": "Mozilla/5.0",
            "Referer": `https://${PORTAL_HOST}/`,
            "Origin": `https://${PORTAL_HOST}`,
            "Cookie": antiforgeryCookie,
        },
    }, loginBody);
    const loc = loginRes.headers.location || "";
    if (loginRes.status !== 302 || loc.toLowerCase().includes("/login")) {
        throw new Error(`Portal login failed: status=${loginRes.status} location=${loc}`);
    }
    const cookies = [antiforgeryCookie, extractCookies(loginRes.headers)].filter(Boolean).join("; ");
    portalSessionCache = { cookies, expiresAt: Date.now() + 25 * 60 * 1000 };
    return cookies;
}
// ── Tracking variant generation (USPS-focused) ────────────────────────────────
function generateVariants(input) {
    const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
    const seen = new Set();
    const out = [];
    const add = (v) => { if (v && v.length >= 6 && !seen.has(v)) {
        seen.add(v);
        out.push(v);
    } };
    add(cleaned);
    // 20-22 digit USPS base → try 420+ZIP prefix
    if (/^9\d{19,21}$/.test(cleaned)) {
        for (const zip of MIAMI_ZIPS)
            add(`420${zip}${cleaned}`);
    }
    // 30-digit routed → also try the 22-digit base
    if (/^420\d{27}$/.test(cleaned)) {
        const base = cleaned.slice(8);
        if (/^9/.test(base)) {
            add(base);
            for (const zip of MIAMI_ZIPS)
                add(`420${zip}${base}`);
        }
    }
    return out;
}
// ── Detect permit/missing-destination from manifestId ─────────────────────────
function detectRequiresPermit(manifestId) {
    if (!manifestId)
        return false;
    const n = manifestId.toUpperCase().trim();
    if (n.includes("PERMISOS") || n.includes("PERMIT"))
        return true;
    const suffix = n.match(/[A-Z]+$/)?.[0] ?? "";
    return suffix === "DANP" || suffix === "PER";
}
function detectMissingDest(destino, codigoCliente, manifestId) {
    if (destino.toUpperCase() === "SD")
        return true;
    if (codigoCliente.toUpperCase() === "SD")
        return true;
    if (manifestId) {
        const n = manifestId.toUpperCase();
        if (n.includes("SINDESTINO"))
            return true;
        const s = n.match(/[A-Z]+$/)?.[0] ?? "";
        if (s === "DANS" || s === "SD" || s === "SIND")
            return true;
    }
    return false;
}
// ── Canonical tracking extraction from HTML ────────────────────────────────────
function extractCanonicalFromHtml(html, searchedTracking) {
    if (!html)
        return undefined;
    const text = html.replace(/<[^>]+>/g, " ");
    const matches = text.match(/\b\d{20,34}\b/g);
    if (!matches)
        return undefined;
    // Prefer 30-digit 420XXXXX (USPS canonical form api.milocker.net resolves)
    const canonical = matches.find(m => /^420\d{27}$/.test(m) && m !== searchedTracking);
    if (canonical)
        return canonical;
    // Fallback: longest numeric sequence that differs from input
    return [...new Set(matches)]
        .filter(m => m !== searchedTracking)
        .sort((a, b) => b.length - a.length)[0];
}
// ── Portal search → canonical tracking ────────────────────────────────────────
async function resolveViaPortal(originalTracking) {
    let cookies;
    try {
        cookies = await ensurePortalSession();
    }
    catch (e) {
        console.warn(`[PreAlertSync] Portal auth failed for ${originalTracking}:`, e);
        return { portalTracking: null, canonicalTracking: null, searchData: null };
    }
    const variants = generateVariants(originalTracking);
    // Try top 3 variants in parallel (original always first)
    const top = [originalTracking, ...variants.filter(v => v !== originalTracking)].slice(0, 3);
    const results = await Promise.all(top.map(async (candidate) => {
        try {
            const res = await rawRequest({
                hostname: PORTAL_HOST,
                path: `/Tracking/SearchByNumber?FilterNumber=${encodeURIComponent(candidate)}`,
                method: "GET",
                headers: {
                    "Accept": "*/*",
                    "X-Requested-With": "XMLHttpRequest",
                    "User-Agent": "Mozilla/5.0",
                    "Referer": `https://${PORTAL_HOST}/Tracking`,
                    "Cookie": cookies,
                },
            });
            if (res.status === 401 || res.status === 302) {
                portalSessionCache = null;
                return null;
            }
            let data = {};
            try {
                data = JSON.parse(res.body);
            }
            catch {
                return null;
            }
            const tk = data.TrackingNumber || data.trackingNumber || data.Tracking || data.tracking || "";
            const hasData = tk || data.idManifest || data.IdManifest || data.destino || data.Destino;
            if (!hasData)
                return null;
            return { candidate, data, portalTracking: String(tk || candidate).trim() };
        }
        catch {
            return null;
        }
    }));
    const hit = results.find(r => r !== null);
    if (!hit)
        return { portalTracking: null, canonicalTracking: null, searchData: null };
    // DetailByNumber with portal's tracking → extract canonical
    let canonicalTracking = null;
    try {
        const detailRes = await rawRequest({
            hostname: PORTAL_HOST,
            path: `/Tracking/DetailByNumber?number=${encodeURIComponent(hit.portalTracking)}`,
            method: "GET",
            headers: {
                "Accept": "text/html, */*",
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": "Mozilla/5.0",
                "Referer": `https://${PORTAL_HOST}/Tracking`,
                "Cookie": cookies,
            },
        });
        if (detailRes.status === 200 && detailRes.body) {
            canonicalTracking = extractCanonicalFromHtml(detailRes.body, hit.portalTracking) ?? null;
            if (canonicalTracking) {
                console.log(`[PreAlertSync] 🔑 ${originalTracking} → portalTracking=${hit.portalTracking} → canonical=${canonicalTracking}`);
            }
        }
    }
    catch (e) {
        console.warn(`[PreAlertSync] DetailByNumber failed for ${hit.portalTracking}:`, e);
    }
    return {
        portalTracking: hit.portalTracking,
        canonicalTracking: canonicalTracking ?? hit.portalTracking,
        searchData: hit.data,
    };
}
// ── MLCargo API enrichment ────────────────────────────────────────────────────
async function fetchMLCargoData(canonicalTracking, originalTracking) {
    let token;
    try {
        token = await ensureApiToken();
    }
    catch (e) {
        console.warn(`[PreAlertSync] MLCargo auth failed:`, e);
        return { weight: null, manifestId: null, description: null, shipper: null, requiresPermit: false, missingDestination: false, events: [], found: false };
    }
    const authHeaders = {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": "axios/1.6.0",
    };
    const [infoRes, eventsRes] = await Promise.all([
        rawRequest({ hostname: "api.milocker.net", path: `/Tracking/Get?number=${encodeURIComponent(canonicalTracking)}`, method: "GET", headers: authHeaders }).catch(() => null),
        rawRequest({ hostname: "api.milocker.net", path: `/Tracking/GetTrackingRecordsLike?number=${encodeURIComponent(canonicalTracking)}`, method: "GET", headers: authHeaders }).catch(() => null),
    ]);
    // Handle 401: bust token and retry once
    if (infoRes?.status === 401 || eventsRes?.status === 401) {
        apiTokenCache = null;
        return fetchMLCargoData(canonicalTracking, originalTracking);
    }
    let packageInfo = null;
    let rawEvents = [];
    if (infoRes?.status === 200) {
        try {
            const p = JSON.parse(infoRes.body);
            if (p?.trackingNumber)
                packageInfo = p;
        }
        catch { /**/ }
    }
    if (eventsRes?.status === 200) {
        try {
            const p = JSON.parse(eventsRes.body);
            if (Array.isArray(p))
                rawEvents = p;
        }
        catch { /**/ }
    }
    if (!packageInfo && rawEvents.length === 0) {
        console.log(`[PreAlertSync] MLCargo: not found for canonical=${canonicalTracking} (original=${originalTracking})`);
        return { weight: null, manifestId: null, description: null, shipper: null, requiresPermit: false, missingDestination: false, events: [], found: false };
    }
    const manifestId = String(packageInfo?.idManifest ?? "");
    const destino = String(packageInfo?.destino ?? "");
    const codigoCliente = String(packageInfo?.codigoCliente ?? "");
    const events = rawEvents.map((e) => ({
        fecha: String(e.fecha || e.date || ""),
        ciudad: String(e.ciudad || e.location || ""),
        detalle: String(e.detalle || e.description || ""),
    }));
    return {
        weight: typeof packageInfo?.peso === "number" ? packageInfo.peso : null,
        manifestId: manifestId || null,
        description: String(packageInfo?.descripcionArticulo ?? "") || null,
        shipper: String(packageInfo?.shipperDescripcion ?? packageInfo?.shipper ?? "") || null,
        requiresPermit: detectRequiresPermit(manifestId),
        missingDestination: detectMissingDest(destino, codigoCliente, manifestId),
        events,
        found: true,
    };
}
// ── Full enrichment: portal + MLCargo ─────────────────────────────────────────
async function enrichTracking(originalTracking) {
    const { portalTracking, canonicalTracking, searchData } = await resolveViaPortal(originalTracking);
    if (!canonicalTracking) {
        return { canonicalTracking: null, portalTracking, weight: null, manifestId: null, description: null, shipper: null, requiresPermit: false, missingDestination: false, events: [], found: false };
    }
    // If the portal searchData already has package info, use it as base
    const portalWeight = searchData ? (searchData.peso ?? searchData.Peso ?? null) : null;
    const portalManifest = searchData ? String(searchData.idManifest ?? searchData.IdManifest ?? "") : "";
    const portalDescription = searchData ? String(searchData.descripcionArticulo ?? searchData.DescripcionArticulo ?? "") : "";
    const portalShipper = searchData ? String(searchData.shipperDescripcion ?? searchData.ShipperDescripcion ?? searchData.shipper ?? "") : "";
    // Then enrich with MLCargo API using canonical tracking
    const mlcargo = await fetchMLCargoData(canonicalTracking, originalTracking);
    return {
        canonicalTracking,
        portalTracking,
        weight: mlcargo.weight ?? portalWeight,
        manifestId: mlcargo.manifestId || portalManifest || null,
        description: mlcargo.description || portalDescription || null,
        shipper: mlcargo.shipper || portalShipper || null,
        requiresPermit: mlcargo.requiresPermit || detectRequiresPermit(portalManifest),
        missingDestination: mlcargo.missingDestination,
        events: mlcargo.events,
        found: mlcargo.found || !!searchData,
    };
}
// ── Data sanitization helpers ─────────────────────────────────────────────────
/** Safe string: trims, rejects "null"/"undefined" literals, returns fallback */
function str(v, fallback = "") {
    if (v == null)
        return fallback;
    const s = String(v).trim();
    return s === "undefined" || s === "null" || s === "" ? fallback : s;
}
/** Safe number: parses numeric strings, returns null for NaN/Infinity */
function safeNum(v) {
    if (v == null)
        return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isFinite(n) ? n : null;
}
/**
 * Merge SP2 and SP1 statusHistory arrays, deduplicated by (timestamp, description).
 * Keeps all unique events sorted oldest-first.
 */
function mergeStatusHistories(sp2History, existingHistory) {
    const seen = new Set();
    const merged = [];
    for (const entry of [...(existingHistory || []), ...(sp2History || [])]) {
        const key = `${str(entry?.timestamp ?? entry?.date)}::${str(entry?.description ?? entry?.label ?? entry?.status)}`;
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(entry);
        }
    }
    return merged.sort((a, b) => {
        const ta = new Date(a.timestamp ?? a.date ?? 0).getTime();
        const tb = new Date(b.timestamp ?? b.date ?? 0).getTime();
        return isNaN(ta) || isNaN(tb) ? 0 : ta - tb;
    });
}
// ── Main sync logic ───────────────────────────────────────────────────────────
async function performPreAlertSync(forceFullSync = false) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const stats = {
        created: 0, updated: 0, skipped: 0, enriched: 0,
        errors: 0, errorDetails: [], mode: "incremental", startedAt, completedAt: "", durationMs: 0,
    };
    const sp2 = getSp2Firestore();
    const metaRef = sp1Db.collection("_sync_metadata").doc("pre_alerts");
    const metaDoc = await metaRef.get();
    const lastSyncAt = (!forceFullSync && metaDoc.exists)
        ? (metaDoc.data()?.lastSyncAt?.toDate?.() ?? null)
        : null;
    stats.mode = lastSyncAt ? "incremental" : "full";
    console.log(`[PreAlertSync] ${stats.mode} sync${lastSyncAt ? ` since ${lastSyncAt.toISOString()}` : ""}`);
    // Checkpoint: record sync start time NOW so that if we timeout mid-run,
    // the next invocation picks up only records updated after this moment.
    // This prevents repeated full syncs on timeout.
    await metaRef.set({ lastSyncAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
    // ── Step 1: Query SP2 shipments ─────────────────────────────────────────────
    // SP2 creates pre-alert shipments with two possible source values:
    //   'prealert'       → slPreAlertCreated Cloud Function trigger
    //   'smart_prealert' → slSmartPreAlert callable (forms.ts)
    // Two separate equality queries are used instead of a single IN query to
    // avoid the Firestore FAILED_PRECONDITION error: IN + range filter on a
    // different field requires a composite index with __name__ that may not exist.
    // Each equality query uses the existing source+updatedAt composite index in SP2.
    const PRE_ALERT_SOURCES = ["prealert", "smart_prealert"];
    const sp2Col = sp2.collection("shipments");
    const [snap1, snap2] = await Promise.all(PRE_ALERT_SOURCES.map(src => {
        let q = sp2Col.where("source", "==", src);
        if (lastSyncAt) {
            q = q.where("updatedAt", ">", lastSyncAt);
        }
        return q.get();
    }));
    // Merge and deduplicate by doc ID
    const seenIds = new Set();
    const sp2Docs = [];
    for (const snap of [snap1, snap2]) {
        for (const doc of snap.docs) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                sp2Docs.push(doc);
            }
        }
    }
    console.log(`[PreAlertSync] SP2 returned ${sp2Docs.length} shipments (${snap1.size} prealert + ${snap2.size} smart_prealert)`);
    if (sp2Docs.length === 0) {
        await metaRef.set({ lastSyncAt: firestore_1.FieldValue.serverTimestamp(), totalProcessed: 0, stats }, { merge: true });
        stats.completedAt = new Date().toISOString();
        stats.durationMs = Date.now() - startMs;
        return stats;
    }
    // ── Step 2: Batch-load SP2 users (10 at a time, Firestore getAll limit) ──────
    const userIds = [...new Set(sp2Docs.map((d) => str(d.data().userId)).filter(Boolean))];
    const userMap = new Map();
    for (let i = 0; i < userIds.length; i += 10) {
        const batchIds = userIds.slice(i, i + 10);
        const snaps = await Promise.all(batchIds.map(uid => sp2.collection("users").doc(uid).get()));
        for (const snap of snaps) {
            if (!snap.exists)
                continue;
            const d = snap.data();
            const firstName = str(d.firstName);
            const lastName = str(d.lastName);
            userMap.set(snap.id, {
                firstName,
                lastName,
                displayName: str(d.displayName) || `${firstName} ${lastName}`.trim(),
                email: str(d.email),
                dni: str(d.dni ?? d.cedula ?? d.nationalId),
                phone: str(d.phone ?? d.phoneNumber ?? d.celular),
            });
        }
    }
    // ── Step 3: Batch-read ALL existing SP1 pre_alerts in one round-trip ─────────
    // getAll() is faster and prevents N individual reads inside the processing loop.
    const sp2DocIds = sp2Docs.map((d) => d.id);
    const existingMap = new Map();
    for (let i = 0; i < sp2DocIds.length; i += 100) {
        const batchIds = sp2DocIds.slice(i, i + 100);
        const refs = batchIds.map(id => sp1Db.collection("pre_alerts").doc(id));
        const existingSnaps = await sp1Db.getAll(...refs);
        for (const snap of existingSnaps) {
            if (snap.exists)
                existingMap.set(snap.id, snap.data());
        }
    }
    console.log(`[PreAlertSync] ${existingMap.size} existing SP1 pre_alerts pre-loaded`);
    // ── Step 4: Enrich + build payloads (concurrent, SYNC_CONCURRENCY at a time) ─
    const docs = sp2Docs;
    const now = Date.now();
    const writeQueue = [];
    for (let i = 0; i < docs.length; i += SYNC_CONCURRENCY) {
        const chunk = docs.slice(i, i + SYNC_CONCURRENCY);
        const results = await Promise.allSettled(chunk.map(async (doc) => {
            const sp2Doc = doc.data();
            const sp2DocId = doc.id;
            // ── Validate required fields ───────────────────────────────────────────
            const tracking = str(sp2Doc.tracking);
            const slCode = str(sp2Doc.slCode);
            if (!tracking || !slCode) {
                stats.skipped++;
                console.warn(`[PreAlertSync] Skipped ${sp2DocId}: missing tracking="${tracking}" slCode="${slCode}"`);
                return null;
            }
            const existing = existingMap.get(sp2DocId) ?? null;
            const user = userMap.get(str(sp2Doc.userId)) ?? {
                firstName: "", lastName: "", displayName: "", email: "", dni: "", phone: "",
            };
            // ── Enrichment decision ────────────────────────────────────────────────
            // Skip enrichment if:
            //   1. Carrier is not MLCargo-compatible (UPS, Amazon, FedEx, DHL, etc.)
            //   2. Package is terminal + canonical resolved + recently checked
            const isMLCargo = isMLCargoCandidate(tracking);
            const isTerminalStatus = ["delivered", "returned"].includes(str(sp2Doc.status));
            const hasCanonical = !!existing?.canonicalTracking;
            const recentlyChecked = existing?.lastMiddlewareCheck
                ? (now - new Date(existing.lastMiddlewareCheck).getTime()) < MIDDLEWARE_SKIP_WINDOW_MS
                : false;
            const shouldEnrich = isMLCargo && !(isTerminalStatus && hasCanonical && recentlyChecked);
            let enrichment = null;
            if (shouldEnrich) {
                try {
                    enrichment = await enrichTracking(tracking);
                    if (enrichment.found)
                        stats.enriched++;
                    console.log(`[PreAlertSync] ${tracking} → canonical=${enrichment.canonicalTracking ?? "none"} found=${enrichment.found}`);
                }
                catch (e) {
                    console.warn(`[PreAlertSync] Enrichment failed for ${tracking}:`, e);
                }
            }
            // ── Resolve final field values ─────────────────────────────────────────
            // Priority: enrichment result > SP2 data > existing SP1 data
            const canonicalTracking = enrichment?.canonicalTracking ?? existing?.canonicalTracking ?? null;
            const resolvedManifest = str(enrichment?.manifestId ?? sp2Doc.manifestId ?? existing?.manifestId);
            // requiresPermit / missingDestination: NEVER downgrade true→false.
            // Boolean OR chain: once any source marks true, it stays true.
            const requiresPermit = !!(enrichment?.requiresPermit || sp2Doc.requiresPermit || existing?.requiresPermit);
            const missingDestination = !!(enrichment?.missingDestination || sp2Doc.missingDestination || existing?.missingDestination);
            // statusHistory: merge SP2 + existing SP1, deduplicated by (timestamp, description)
            const statusHistory = mergeStatusHistories(sp2Doc.statusHistory ?? [], existing?.statusHistory ?? []);
            // middlewareEvents: prefer fresh enrichment if available; never erase existing events
            const middlewareEvents = (enrichment?.events && enrichment.events.length > 0)
                ? enrichment.events
                : (existing?.middlewareEvents ?? []);
            // searchTokens: cover all queryable text fields (prefix tokens for starts-with search)
            const searchTokens = generateSearchTokens([
                tracking,
                canonicalTracking ?? "",
                slCode,
                user.displayName,
                user.firstName,
                user.lastName,
                user.email,
                user.dni,
                resolvedManifest,
            ]);
            // ── Tracking-suffix index for partial matching (Nova manifest reload) ───
            // BUG-PRE-ALERT-EXACT-MISMATCH 2026-05-16: USPS/FedEx/UPS/DHL/SpeedLogistics
            // tracking strings often diverge between what the customer pre-alerts and
            // what MLCargo prints on the manifest (carrier prefix, leading zeros,
            // service code, check digit). Persisting the last 12 digits — extracted
            // verbatim, no carrier-specific normalization — lets the Nova matcher do a
            // safe suffix lookup with a single equality query, while keeping a sharp
            // ambiguity guard (>1 hit ⇒ refuse the match) on the client side.
            const trackingSuffix12 = computeTrackingSuffix12(canonicalTracking || tracking);
            // Emit one suffix per supported length so the Nova matcher can probe
            // whichever length survives the courier's prefix / service-tag drift
            // via a single `array-contains-any` query (see nova-tools.ts).
            const trackingSuffixes = computeTrackingSuffixes(canonicalTracking || tracking);
            // ── Core payload (shared between create and update) ─────────────────────
            const corePayload = {
                id: sp2DocId,
                sp2ShipmentId: sp2DocId,
                sp2PreAlertId: str(sp2Doc.prealertId) || null,
                sp2UpdatedAt: sp2Doc.updatedAt ?? null, // SP2 source timestamp for future delta detection
                // Tracking
                tracking,
                canonicalTracking,
                trackingSuffix12, // legacy single-value (kept for older clients / queries)
                trackingSuffixes, // ["L8:12345678","L10:1234567890","L12:..."] — drives the new fallback
                carrier: str(sp2Doc.carrier ?? existing?.carrier) || null,
                // Customer — fully denormalized (all fields embedded, zero joins needed)
                slCode,
                userId: str(sp2Doc.userId),
                firstName: user.firstName,
                lastName: user.lastName,
                displayName: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
                dni: user.dni,
                phone: user.phone,
                // Package info
                description: str(enrichment?.description ?? sp2Doc.description ?? existing?.description) || "Paquete",
                weight: safeNum(enrichment?.weight ?? sp2Doc.weight ?? existing?.weight),
                origin: str(sp2Doc.origin ?? existing?.origin) || "USA",
                destinationCountry: str(sp2Doc.destinationCountry ?? existing?.destinationCountry) || "Costa Rica",
                shipper: str(enrichment?.shipper ?? existing?.shipper) || null,
                manifestId: resolvedManifest || null,
                requiresPermit,
                missingDestination,
                // Status (SP2 is source of truth)
                status: str(sp2Doc.status) || "pre-alerted",
                statusLabel: str(sp2Doc.statusLabel) || "Pre-Alertado",
                statusHistory,
                middlewareEvents,
                // Search
                searchTokens,
                // Sync metadata
                preAlertCreatedAt: sp2Doc.createdAt ?? null,
                lastMiddlewareCheck: shouldEnrich ? new Date().toISOString() : (existing?.lastMiddlewareCheck ?? null),
                syncedAt: new Date().toISOString(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
            return { docId: sp2DocId, payload: corePayload, isNew: !existing };
        }));
        // Collect results; errors are isolated per document
        for (const result of results) {
            if (result.status === "rejected") {
                stats.errors++;
                const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
                stats.errorDetails.push(msg);
                console.error("[PreAlertSync] Processing error:", msg);
                continue;
            }
            if (result.value)
                writeQueue.push(result.value);
        }
    }
    // ── Step 5: Atomic batch writes (WriteBatch, max 500 ops per commit) ──────────
    // set(payload) for new docs; set(payload, { merge: true }) for updates.
    // merge=true on update: preserves existing SP1-only fields (notes, labels, etc.)
    // and never overwrites createdAt since it is excluded from the update payload.
    const BATCH_LIMIT = 400;
    for (let i = 0; i < writeQueue.length; i += BATCH_LIMIT) {
        const batch = sp1Db.batch();
        const slice = writeQueue.slice(i, i + BATCH_LIMIT);
        for (const item of slice) {
            const ref = sp1Db.collection("pre_alerts").doc(item.docId);
            if (item.isNew) {
                // Full document set — includes createdAt for new records
                batch.set(ref, removeUndefined({ ...item.payload, createdAt: firestore_1.FieldValue.serverTimestamp() }));
                stats.created++;
            }
            else {
                // Merge update — createdAt is NOT in payload so it is never overwritten
                batch.set(ref, removeUndefined(item.payload), { merge: true });
                stats.updated++;
            }
        }
        await batch.commit();
        console.log(`[PreAlertSync] Committed batch ${Math.floor(i / BATCH_LIMIT) + 1}: ${slice.length} writes`);
    }
    // ── Step 6: Update sync metadata ─────────────────────────────────────────────
    stats.completedAt = new Date().toISOString();
    stats.durationMs = Date.now() - startMs;
    await metaRef.set({
        lastSyncAt: firestore_1.FieldValue.serverTimestamp(),
        totalProcessed: stats.created + stats.updated,
        lastStats: stats,
    }, { merge: true });
    return stats;
}
function removeUndefined(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
// ── Search token generation ──────────────────────────────────────────────────
function generateSearchTokens(fields) {
    const tokens = new Set();
    for (const field of fields) {
        if (!field)
            continue;
        const normalized = field.toLowerCase().trim();
        // Add substrings of 3+ chars (prefix indexing for starts-with search)
        for (let len = 3; len <= normalized.length; len++) {
            tokens.add(normalized.substring(0, len));
        }
        // Also add the full value lowercased for exact match
        tokens.add(normalized);
    }
    return [...tokens];
}
// ── Audit logging ─────────────────────────────────────────────────────────────
async function logSyncResults(stats) {
    try {
        await sp1Db.collection("_sync_logs").add({
            type: "pre_alerts",
            ...stats,
            loggedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    catch (e) {
        console.warn("[PreAlertSync] Could not write sync log:", e);
    }
}
// ── Exported Cloud Functions ──────────────────────────────────────────────────
/**
 * Scheduled function: Sync pre-alerts 4 times per day
 * 00:00, 06:00, 12:00, 18:00 Costa Rica time
 */
exports.syncPreAlertsFromSP2 = (0, scheduler_1.onSchedule)({
    schedule: "0 0,6,12,18 * * *",
    timeZone: "America/Costa_Rica",
    memory: "512MiB",
    timeoutSeconds: 1800,
    retryCount: 1,
}, async (_event) => {
    console.log("[PreAlertSync] Starting scheduled sync...");
    const stats = await performPreAlertSync();
    await logSyncResults(stats);
    console.log(`[PreAlertSync] Completed [${stats.mode}]: ` +
        `${stats.created} created, ${stats.updated} updated, ` +
        `${stats.enriched} enriched, ${stats.skipped} skipped, ` +
        `${stats.errors} errors | ${(stats.durationMs / 1000).toFixed(1)}s`);
});
/**
 * Callable function: Manual pre-alert sync trigger
 * Supports: { force: true } for full sync
 */
exports.triggerPreAlertSync = (0, https_1.onCall)({
    memory: "512MiB",
    timeoutSeconds: 1800,
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    const force = request.data?.force === true;
    console.log(`[PreAlertSync] Manual trigger by ${request.auth.uid} force=${force}`);
    const stats = await performPreAlertSync(force);
    await logSyncResults(stats);
    return { success: true, stats };
});
//# sourceMappingURL=sync.js.map