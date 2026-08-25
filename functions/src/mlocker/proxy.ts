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

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as https from "https";
import * as http from "http";
import * as querystring from "querystring";
import { storage } from "../config/firebase";

// ── Credential constants (kept server-side, never exposed to client) ──────────
// HARDCODED - env vars not working reliably: $1 in password gets shell-expanded
// to empty string making bodyLen=40 instead of 43 → API returns 401.
// Same pattern as smart-portal-2/mlcargo-provider.ts _performAuth()
const MLCARGO_API_USER = "spedi";
const MLCARGO_API_PASS = "nshop1_045#$1";

const PORTAL_HOST = "mayoristas.milocker.net";
const PORTAL_USER = process.env.MLOCKER_PORTAL_USER || "darias";
const PORTAL_PASS = process.env.MLOCKER_PORTAL_PASS || "darias";

// ── Token / session caches ────────────────────────────────────────────────────

interface TokenCache { token: string; expiresAt: number }
interface PortalSession { cookies: string; expiresAt: number }

let apiTokenCache: TokenCache | null = null;
let portalSessionCache: PortalSession | null = null;

// ── Lightweight Node https helper ─────────────────────────────────────────────

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

interface HttpBinaryResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  buffer: Buffer;
}

function rawRequest(options: https.RequestOptions, body?: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("Request timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

function rawBinaryRequest(options: https.RequestOptions, body?: string): Promise<HttpBinaryResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => { chunks.push(chunk); });
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        buffer: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Binary request timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

function extractCookies(headers: http.IncomingHttpHeaders): string {
  const setCookie = headers["set-cookie"] as string[] | string | undefined;
  if (!setCookie) return "";
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

// ── ML Cargo API authentication ───────────────────────────────────────────────

async function ensureApiToken(): Promise<string> {
  if (apiTokenCache && Date.now() < apiTokenCache.expiresAt) {
    return apiTokenCache.token;
  }

  const body = JSON.stringify({ user: MLCARGO_API_USER, password: MLCARGO_API_PASS });
  console.log(`[MLockerProxy] API auth: user=${MLCARGO_API_USER} bodyLen=${body.length}`);

  const result = await rawRequest(
    {
      hostname: "api.milocker.net",
      path: "/api/Authenticate/Login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
        "Accept": "application/json",
        "User-Agent": "axios/1.6.0",
      },
    },
    body
  );

  console.log(`[MLockerProxy] API auth response: status=${result.status} body=${result.body.slice(0, 200)}`);

  let parsed: { token?: string };
  try { parsed = JSON.parse(result.body); } catch { parsed = {}; }

  if (!parsed.token) {
    apiTokenCache = null;
    throw new Error(`ML Cargo API auth failed: status=${result.status} body=${result.body.slice(0, 300)}`);
  }

  apiTokenCache = { token: parsed.token, expiresAt: Date.now() + 9 * 60 * 1000 };
  return parsed.token;
}

// ── Portal session authentication ─────────────────────────────────────────────

async function ensurePortalSession(): Promise<string> {
  if (portalSessionCache && Date.now() < portalSessionCache.expiresAt) {
    return portalSessionCache.cookies;
  }

  // Step 1: GET login page to extract CSRF token
  const loginPage = await rawRequest({
    hostname: PORTAL_HOST,
    path: "/",
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
  });

  const csrfMatch = loginPage.body.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";
  if (!csrfToken) throw new Error("Portal: could not extract CSRF token");

  const antiforgeryCookie = extractCookies(loginPage.headers);

  // Step 2: POST login
  const loginBody = querystring.stringify({
    User: PORTAL_USER,
    Password: PORTAL_PASS,
    __RequestVerificationToken: csrfToken,
  });

  const loginRes = await rawRequest(
    {
      hostname: PORTAL_HOST,
      path: "/Login/ValidarUsuario",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(Buffer.byteLength(loginBody)),
        "User-Agent": "Mozilla/5.0",
        "Referer": `https://${PORTAL_HOST}/`,
        "Origin": `https://${PORTAL_HOST}`,
        "Cookie": antiforgeryCookie,
      },
    },
    loginBody
  );

  const redirectLoc = loginRes.headers.location || "";
  console.log(`[MLockerProxy] Login response: status=${loginRes.status} location=${redirectLoc}`);

  // Accept any 302 that is NOT a redirect back to /Login — portal may redirect to
  // /Manifiestos/HistoricoManifiestos, /Home, or / depending on user config.
  // A redirect back to /Login means wrong credentials.
  const loginOk =
    loginRes.status === 302 &&
    !redirectLoc.toLowerCase().includes("/login");

  if (!loginOk) {
    throw new Error(
      `Portal login failed: status=${loginRes.status} location=${redirectLoc || "none"}`
    );
  }

  const sessionCookies = [antiforgeryCookie, extractCookies(loginRes.headers)]
    .filter(Boolean)
    .join("; ");

  portalSessionCache = { cookies: sessionCookies, expiresAt: Date.now() + 25 * 60 * 1000 };
  return sessionCookies;
}

// ── Tracking variant generation (mirrors mlcargo-provider + TrackingModal) ────

const MIAMI_ZIPS = ["33195", "33166", "33178", "33172", "33126"];
// ML Cargo canonical prefix used for short-tracking AI completion
const ML_CARGO_PREFIX = "9622001900001088650200";

/**
 * Generate all search variants for a tracking number.
 * Priority: exact → 420+ZIP expansions → suffix strips → short completions.
 * Mirrors TrackingModal.generateSearchVariants + mlcargo-provider.generateUSPSPrefixVariants
 */
function generateTrackingVariants(input: string): string[] {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  const seen = new Set<string>();
  const variants: string[] = [];

  const add = (v: string) => {
    if (v && v.length >= 6 && !seen.has(v)) {
      seen.add(v);
      variants.push(v);
    }
  };

  // Always try the original first
  add(cleaned);

  // USPS 20-22 digit base → expand to 30-digit with 420+ZIP prefix
  if (/^9\d{19,21}$/.test(cleaned)) {
    for (const zip of MIAMI_ZIPS) {
      add(`420${zip}${cleaned}`);
    }
  }

  // 30-digit 420+ZIP already provided → also try the 22-digit base
  if (/^420\d{27}$/.test(cleaned)) {
    const base22 = cleaned.slice(8); // strip 420+5zip = 8 chars
    if (/^9/.test(base22)) {
      add(base22);
      // And the other ZIP variants
      for (const zip of MIAMI_ZIPS) {
        add(`420${zip}${base22}`);
      }
    }
  }

  // 34-digit (wrong 12-char prefix stored historically) → strip to 22 → rebuild 30
  if (/^420\d{31}$/.test(cleaned)) {
    const base22 = cleaned.slice(12);
    if (/^9/.test(base22)) {
      add(base22);
      for (const zip of MIAMI_ZIPS) {
        add(`420${zip}${base22}`);
      }
    }
  }

  // FedEx PDF417 barcode extraction
  if (cleaned.includes("[)>") || cleaned.includes("12Z") || cleaned.includes("31Z")) {
    const m12 = cleaned.match(/12Z(\d{12,15})/);
    if (m12) add(m12[1]);
    const m31 = cleaned.match(/31Z(\d{20,40})/);
    if (m31) {
      add(m31[1]);
      const uspsInside = m31[1].match(/(9\d{15,21})/);
      if (uspsInside) add(uspsInside[1]);
    }
    const allNums = cleaned.match(/\d{12,22}/g);
    if (allNums) allNums.forEach(n => add(n));
  }

  // Long numeric (30-40 digits) — extract inner USPS segment
  if (/^\d{30,40}$/.test(cleaned)) {
    const m9 = cleaned.match(/(9\d{15,21})/);
    if (m9) add(m9[1]);
    for (let start = 0; start <= 22; start++) {
      const seg = cleaned.substring(start);
      if (seg.length >= 12 && seg.length <= 22) add(seg);
    }
  }

  // Short numeric completions (10-19 digits) — prepend ML Cargo prefix
  if (/^\d{10,19}$/.test(cleaned)) {
    const targetLen = 34;
    const prefixLen = targetLen - cleaned.length;
    if (prefixLen > 0 && prefixLen <= ML_CARGO_PREFIX.length) {
      add(ML_CARGO_PREFIX.substring(0, prefixLen) + cleaned);
    }
  }

  // Suffix strips — try last N digits in priority order of common tracking lengths
  const suffixLengths = [22, 20, 18, 15, 12, 21, 19, 17, 16, 14, 13];
  for (const len of suffixLengths) {
    if (cleaned.length > len) {
      const suffix = cleaned.slice(-len);
      add(suffix);
      // If suffix looks like USPS, also expand with ZIP prefix
      if (/^9/.test(suffix) && len >= 20 && len <= 22) {
        for (const zip of MIAMI_ZIPS) {
          add(`420${zip}${suffix}`);
        }
      }
    }
  }

  // Sort: longer = more specific = try first
  return variants.sort((a, b) => b.length - a.length);
}

// ── Single API lookup (info + events) for one candidate ──────────────────────

async function fetchOneTracking(
  candidate: string,
  authHeaders: Record<string, string>,
  isRetry = false
): Promise<{ packageInfo: Record<string, unknown> | null; events: Array<Record<string, unknown>> }> {
  const [infoRes, eventsRes] = await Promise.all([
    rawRequest({
      hostname: "api.milocker.net",
      path: `/Tracking/Get?number=${encodeURIComponent(candidate)}`,
      method: "GET",
      headers: authHeaders,
    }).catch(() => null),
    rawRequest({
      hostname: "api.milocker.net",
      path: `/Tracking/GetTrackingRecordsLike?number=${encodeURIComponent(candidate)}`,
      method: "GET",
      headers: authHeaders,
    }).catch(() => null),
  ]);

  // If either request returned 401, bust cache and retry with fresh token once
  if (!isRetry && (infoRes?.status === 401 || eventsRes?.status === 401)) {
    console.log(`[MLockerProxy] 401 on tracking request — busting token cache and retrying`);
    apiTokenCache = null;
    const freshToken = await ensureApiToken();
    const freshHeaders = { ...authHeaders, "Authorization": `Bearer ${freshToken}` };
    return fetchOneTracking(candidate, freshHeaders, true);
  }

  let packageInfo: Record<string, unknown> | null = null;
  let events: Array<Record<string, unknown>> = [];

  if (infoRes?.status === 200) {
    try {
      const parsed = JSON.parse(infoRes.body);
      if (parsed && parsed.trackingNumber) packageInfo = parsed;
    } catch { /* ignore */ }
  }

  if (eventsRes?.status === 200) {
    try {
      const parsed = JSON.parse(eventsRes.body);
      if (Array.isArray(parsed) && parsed.length > 0) events = parsed;
    } catch { /* ignore */ }
  }

  return { packageInfo, events };
}

// ── Manifest type helpers (ported from smart-portal-2 mlcargo-provider.ts) ────

/**
 * Detect if a package requires import permit based on manifestId.
 * Permisos patterns: DANP suffix, PER suffix, or text contains PERMISOS/PERMIT.
 * Examples: 06-03-2026DANP, 06-03-2026PER, PermisosDan P
 */
function detectRequiresPermit(manifestId: string | null | undefined): boolean {
  if (!manifestId) return false;
  const n = manifestId.toUpperCase().trim();
  // Text contains — these are full distinct words, not ambiguous suffixes
  if (n.includes("PERMISOS") || n.includes("PERMIT")) return true;
  // Suffix-only match: must be the trailing alphabetic characters of the ID
  // e.g. "06-03-2026DANP" → suffix="DANP" ✓, "06-03-2026DAN" → suffix="DAN" ✗
  const suffix = n.match(/[A-Z]+$/)?.[0] ?? "";
  return suffix === "DANP" || suffix === "PER";
}

/**
 * Detect if a package is missing destination (Sin Destino — needs pre-alert).
 * Sin Destino patterns:
 *   - destino / codigoCliente = "SD"
 *   - manifestId suffix: DANS, SD, SIND
 *   - manifestId contains: SINDESTINO
 * Examples: 06-03-2026DANS, 06-03-2026SD, destino=SD
 */
function detectMissingDestination(
  destino: string | null | undefined,
  codigoCliente: string | null | undefined,
  manifestId: string | null | undefined
): boolean {
  if (destino && destino.toUpperCase() === "SD") return true;
  if (codigoCliente && codigoCliente.toUpperCase() === "SD") return true;
  if (manifestId) {
    const n = manifestId.toUpperCase();
    if (n.includes("SINDESTINO")) return true;
    const suffix = n.match(/[A-Z]+$/)?.[0] ?? "";
    if (suffix === "DANS" || suffix === "SD" || suffix === "SIND") return true;
  }
  return false;
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function trackPackage(trackingNumber: string): Promise<Record<string, unknown>> {
  const token = await ensureApiToken();
  const normalized = trackingNumber.trim().toUpperCase().replace(/\s+/g, "");

  const authHeaders = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "User-Agent": "axios/1.6.0",
  };

  // Run top 3 most-specific variants in parallel — dramatically faster than serial
  const allVariants = generateTrackingVariants(normalized);
  const topVariants = allVariants.slice(0, 3);
  console.log(`[MLockerProxy] track_package: ${normalized} → trying ${topVariants.length}/${allVariants.length} variants (parallel)`);

  const parallelResults = await Promise.all(
    topVariants.map(async (candidate) => ({ candidate, ...(await fetchOneTracking(candidate, authHeaders)) }))
  );

  // Pick the best result: prefer packageInfo, then most events
  let packageInfo: Record<string, unknown> | null = null;
  let events: Array<Record<string, unknown>> = [];
  let matchedTracking = normalized;

  for (const res of parallelResults) {
    if (res.packageInfo && !packageInfo) {
      packageInfo = res.packageInfo;
      events = res.events.length > 0 ? res.events : events;
      matchedTracking = res.candidate;
    }
    if (!packageInfo && res.events.length > events.length) {
      events = res.events;
      matchedTracking = res.candidate;
    }
  }
  console.log(`[MLockerProxy] ✅ Best match: ${matchedTracking} — packageInfo=${!!packageInfo} events=${events.length}`);

  if (!packageInfo && events.length === 0) {
    return {
      found: false,
      trackingNumber: normalized,
      message: "No encontré información para ese número de seguimiento en ML Cargo.",
    };
  }

  // Build clean summary for Nova
  const info = packageInfo as Record<string, unknown> | null;
  const manifestId = (info?.idManifest as string) ?? "";
  const destino    = (info?.destino as string) ?? "";
  const clientCode = (info?.codigoCliente as string) ?? "";

  return {
    found: true,
    trackingNumber: (info?.trackingNumber as string) ?? matchedTracking,
    originalInput: normalized,
    // Core package fields Nova needs
    destination: (destino || (info?.destinoCompleto as string)) ?? "",
    destinationFull: (info?.destinoCompleto as string) ?? "",
    shipper: (info?.shipper as string) ?? "",
    shipperDescription: (info?.shipperDescripcion as string) ?? "",
    weight: (info?.peso as number) ?? 0,
    pieces: (info?.bultos as number) ?? 0,
    customerCode: clientCode,
    customerName: (info?.nombreCliente as string) ?? "",
    manifestId,
    description: (info?.descripcionArticulo as string) ?? "",
    invoice: (info?.factura as string) ?? "",
    notes: (info?.notas as string) ?? "",
    // Ported from smart-portal-2 mlcargo-provider.ts detectRequiresPermit / detectMissingDestination
    requiresPermit: detectRequiresPermit(manifestId),
    missingDestination: detectMissingDestination(destino, clientCode, manifestId),
    // Events (most recent last)
    eventCount: events.length,
    latestEvent: events.length > 0 ? events[events.length - 1] : null,
    events: events.slice(-15), // last 15 events for Nova context
  };
}

async function listManifests(params: {
  start?: number;
  length?: number;
  manifestNumber?: string;
  description?: string;
  status?: number;
  startDate?: string;
  endDate?: string;
}): Promise<Record<string, unknown>> {
  const cookies = await ensurePortalSession();

  const draw = 1;
  const start = params.start ?? 0;
  const length = params.length ?? 50;

  const formData = querystring.stringify({
    draw: String(draw),
    "columns[0][data]": "NumeroManifiesto",
    "columns[0][searchable]": "true",
    "columns[0][orderable]": "false",
    "columns[0][search][value]": "",
    "columns[0][search][regex]": "false",
    "columns[1][data]": "Descripcion",
    "columns[1][searchable]": "true",
    "columns[1][orderable]": "false",
    "columns[1][search][value]": "",
    "columns[1][search][regex]": "false",
    "columns[2][data]": "FechaRecepcion",
    "columns[2][searchable]": "true",
    "columns[2][orderable]": "true",
    "columns[2][search][value]": "",
    "columns[2][search][regex]": "false",
    "columns[3][data]": "Estado",
    "columns[3][searchable]": "true",
    "columns[3][orderable]": "true",
    "columns[3][search][value]": "",
    "columns[3][search][regex]": "false",
    "columns[4][data]": "NumeroManifiesto",
    "columns[4][searchable]": "true",
    "columns[4][orderable]": "false",
    "columns[4][search][value]": "",
    "columns[4][search][regex]": "false",
    "order[0][column]": "2",
    "order[0][dir]": "desc",
    "order[1][column]": "3",
    "order[1][dir]": "asc",
    start: String(start),
    length: String(length),
    "search[value]": "",
    "search[regex]": "false",
    Description: params.description ?? "",
    ManifestNumber: params.manifestNumber ?? "",
    Status: String(params.status ?? -1),
    StartDate: params.startDate ?? "",
    EndDate: params.endDate ?? "",
  });

  const result = await rawRequest(
    {
      hostname: PORTAL_HOST,
      path: "/Manifiestos/ManifestHistory",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Content-Length": Buffer.byteLength(formData),
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
        "Referer": `https://${PORTAL_HOST}/Manifiestos/HistoricoManifiestos`,
        "Cookie": cookies,
        "Origin": `https://${PORTAL_HOST}`,
      },
    },
    formData
  );

  if (result.status === 401) {
    // Session expired — clear and retry once
    portalSessionCache = null;
    return listManifests(params);
  }

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(result.body); } catch {
    throw new Error(`Portal manifest list parse error: ${result.status}`);
  }

  const data = (parsed.data as Array<Record<string, unknown>>) || [];
  const recordsTotal = parsed.recordsTotal as number || 0;

  // Log first row to discover all available fields
  if (data.length > 0) {
    console.log('[MLockerProxy] listManifests first row keys:', Object.keys(data[0]).join(', '));
    console.log('[MLockerProxy] listManifests first row:', JSON.stringify(data[0]));
  }

  return {
    total: recordsTotal,
    count: data.length,
    manifests: data.map((m) => {
      const id = String(m.NumeroManifiesto ?? m.numeroManifiesto ?? "");
      // Derive type from suffix: DAN=Regular, PER=Permisos, SIND=Sin Destino
      const rawType = String(
        m.TipoManifiesto ?? m.tipoManifiesto ?? m.Tipo ?? m.tipo ?? ""
      );
      const suffix = id.match(/[A-Z]+$/)?.[0] ?? "";
      const manifestType = rawType || (
        suffix === "DANP" ? "Permisos" :
        suffix === "PER"  ? "Permisos" :
        suffix === "DANS" ? "Sin Destino" :
        suffix === "SD"   ? "Sin Destino" :
        suffix === "SIND" ? "Sin Destino" :
        suffix === "DAN"  ? "Regular" :
        suffix ? "Regular" : ""
      );
      return {
        id,
        description: String(m.Descripcion ?? m.descripcion ?? ""),
        receptionDate: String(m.FechaRecepcion ?? m.fechaRecepcion ?? ""),
        status: String(m.Estado ?? m.estado ?? ""),
        manifestType,
      };
    }),
  };
}

async function getManifestDetail(manifestId: string): Promise<Record<string, unknown>> {
  const cookies = await ensurePortalSession();

  // The detail page is server-side rendered — all rows are in the HTML <tbody>.
  // Table columns (0-indexed): tracking, cliente, nombreCliente, tipo, nombreTipo, valor, guia, saco, peso
  const result = await rawRequest({
    hostname: PORTAL_HOST,
    path: `/Manifiestos/ManifestDetail?IdManifest=${encodeURIComponent(manifestId)}`,
    method: "GET",
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0",
      "Referer": `https://${PORTAL_HOST}/Manifiestos/HistoricoManifiestos`,
      "Cookie": cookies,
    },
  });

  console.log(`[MLockerProxy] ManifestDetail HTML: status=${result.status} bodyLen=${result.body.length}`);

  if (result.status === 401 || result.status === 302) {
    portalSessionCache = null;
    return getManifestDetail(manifestId);
  }

  if (result.status !== 200) {
    throw new Error(`Manifest detail fetch failed: ${result.status}`);
  }

  const html = result.body;
  const packages: Array<Record<string, unknown>> = [];

  // Find the #details-table tbody — cells may contain newlines and extra spaces
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (tbodyMatch) {
    const tbody = tbodyMatch[1];
    // Match each <tr> block
    const rowMatches = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const rowMatch of rowMatches) {
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
      // Strip HTML tags and collapse whitespace in each cell
      const cellTexts = cells.map((c) =>
        c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      );
      if (cellTexts.length >= 3) {
        packages.push({
          tracking:      cellTexts[0] ?? "",
          cliente:       cellTexts[1] ?? "",
          nombreCliente: cellTexts[2] ?? "",
          tipo:          cellTexts[3] ?? "",
          nombreTipo:    cellTexts[4] ?? "",
          valor:         cellTexts[5] ?? "",
          guia:          cellTexts[6] ?? "",
          saco:          cellTexts[7] ?? "",
          peso:          cellTexts[8] ?? "",
        });
      }
    }
  }

  console.log(`[MLockerProxy] ManifestDetail parsed ${packages.length} packages for ${manifestId}`);

  // Total weight
  let totalWeight: number | null = null;
  if (packages.length > 0) {
    const sum = packages.reduce((acc, p) => {
      const w = parseFloat(String(p.peso).replace(/[^0-9.]/g, ""));
      return acc + (isNaN(w) ? 0 : w);
    }, 0);
    totalWeight = Math.round(sum * 100) / 100;
  }

  return {
    manifestId,
    packageCount: packages.length,
    totalPackages: packages.length,
    totalWeight,
    packages,
  };
}

async function downloadManifestExcel(
  manifestId: string,
  type: "summary" | "detail" = "summary"
): Promise<Record<string, unknown>> {
  const cookies = await ensurePortalSession();

  const formData = querystring.stringify({
    type,
    manifestType: "Manifest",
    id: manifestId,
  });

  const result = await rawRequest(
    {
      hostname: PORTAL_HOST,
      path: "/Manifiestos/GenerateExcel",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Content-Length": Buffer.byteLength(formData),
        "Accept": "*/*",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
        "Referer": `https://${PORTAL_HOST}/Manifiestos/ManifestDetail?IdManifest=${encodeURIComponent(manifestId)}`,
        "Cookie": cookies,
        "Origin": `https://${PORTAL_HOST}`,
      },
    },
    formData
  );

  if (result.status === 401) {
    portalSessionCache = null;
    return downloadManifestExcel(manifestId, type);
  }

  // Response is JSON: {"url": "SomeFileName.xlsx"}
  // Must then fetch /Reports/<url> to get the actual binary
  let fileRelPath: string | null = null;
  try {
    const parsed = JSON.parse(result.body);
    fileRelPath = String(parsed.url || parsed.Url || parsed.fileUrl || "");
  } catch { /* ignore */ }

  if (!fileRelPath) {
    throw new Error(`GenerateExcel returned unexpected response: ${result.body.slice(0, 200)}`);
  }

  console.log(`[MLockerProxy] Fetching Excel file: /Reports/${fileRelPath}`);

  // Fetch the actual Excel binary — use rawBinaryRequest to collect raw Buffer
  // chunks directly, avoiding UTF-8 string corruption from rawRequest.
  const fileResult = await rawBinaryRequest({
    hostname: PORTAL_HOST,
    path: `/Reports/${fileRelPath}`,
    method: "GET",
    headers: {
      "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*",
      "User-Agent": "Mozilla/5.0",
      "Referer": `https://${PORTAL_HOST}/Manifiestos/ManifestDetail?IdManifest=${encodeURIComponent(manifestId)}`,
      "Cookie": cookies,
    },
  });

  if (fileResult.status !== 200) {
    throw new Error(`Excel file fetch failed: ${fileResult.status} path=/Reports/${fileRelPath}`);
  }

  const excelBuffer = fileResult.buffer;
  const base64 = excelBuffer.toString("base64");
  const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const filename = `MiLocker_Report_Manifest_${type}_${manifestId}.xlsx`;

  // ── Upload to Firebase Storage: MLCARGO/<date>/<manifestId>.xlsx ──
  // Extract date part from manifestId (e.g. "06-03-2026DAN" → "06-03-2026")
  const datePart = manifestId.match(/^(\d{2}-\d{2}-\d{4})/)?.[1] ?? new Date().toISOString().slice(0, 10);
  const storagePath = `MLCARGO/${datePart}/${manifestId}.xlsx`;

  let downloadUrl: string | null = null;
  try {
    const BUCKET = "smart-portal-admin.firebasestorage.app";
    const bucket = storage.bucket(BUCKET);
    const file = bucket.file(storagePath);
    await file.save(excelBuffer, {
      metadata: {
        contentType,
        metadata: {
          manifestId,
          type,
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    // Signed URL valid for 7 days
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    downloadUrl = url;
    console.log(`[MLockerProxy] Uploaded Excel to Storage: gs://${BUCKET}/${storagePath}`);
  } catch (storageErr) {
    console.error(`[MLockerProxy] Storage upload failed: ${(storageErr as Error)?.message ?? storageErr}`);
  }

  return {
    success: true,
    manifestId,
    type,
    base64,
    contentType,
    filename,
    storagePath,
    downloadUrl,
  };
}

// ── Request payload types ─────────────────────────────────────────────────────

interface MLockerProxyRequest {
  action: "track_package" | "list_manifests" | "get_manifest_detail" | "download_manifest_excel";
  // track_package
  trackingNumber?: string;
  // list_manifests
  start?: number;
  length?: number;
  manifestNumber?: string;
  description?: string;
  status?: number;
  startDate?: string;
  endDate?: string;
  // get_manifest_detail / download_manifest_excel
  manifestId?: string;
  excelType?: "summary" | "detail";
}

// ── Callable function ─────────────────────────────────────────────────────────

export const slMLockerProxy = onCall(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request: CallableRequest<MLockerProxyRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const data = request.data;
    if (!data || !data.action) {
      throw new HttpsError("invalid-argument", "Missing required field: action");
    }

    try {
      switch (data.action) {
        case "track_package": {
          if (!data.trackingNumber) {
            throw new HttpsError("invalid-argument", "trackingNumber is required");
          }
          return await trackPackage(data.trackingNumber);
        }

        case "list_manifests": {
          return await listManifests({
            start: data.start,
            length: data.length,
            manifestNumber: data.manifestNumber,
            description: data.description,
            status: data.status,
            startDate: data.startDate,
            endDate: data.endDate,
          });
        }

        case "get_manifest_detail": {
          if (!data.manifestId) {
            throw new HttpsError("invalid-argument", "manifestId is required");
          }
          return await getManifestDetail(data.manifestId);
        }

        case "download_manifest_excel": {
          if (!data.manifestId) {
            throw new HttpsError("invalid-argument", "manifestId is required");
          }
          return await downloadManifestExcel(data.manifestId, data.excelType ?? "summary");
        }

        default:
          throw new HttpsError("invalid-argument", `Unknown action: ${data.action}`);
      }
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[slMLockerProxy] Error:", msg);
      throw new HttpsError("internal", `MLocker proxy error: ${msg}`);
    }
  }
);
