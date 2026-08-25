"use strict";
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
exports.slTrackColombia = void 0;
const https_1 = require("firebase-functions/v2/https");
const https = __importStar(require("https"));
const TICABOX_BASE = "https://ticabox.managercargo.com/public";
const TOKEN_TTL_MS = 55 * 60 * 1000;
let tokenCache = null;
function httpsPost(url, body, headers) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers },
            timeout: 12000,
        };
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => resolve(data));
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
        req.write(body);
        req.end();
    });
}
async function getToken() {
    if (tokenCache && Date.now() < tokenCache.expiresAt) {
        return tokenCache.token;
    }
    const raw = await httpsPost(`${TICABOX_BASE}/web/webindex/tokengenerar/`, "{}", {});
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new https_1.HttpsError("unavailable", "Ticabox token endpoint returned non-JSON");
    }
    if (!parsed.ok || !parsed.token) {
        throw new https_1.HttpsError("unavailable", `Ticabox token failed: ${parsed.mensaje || "unknown"}`);
    }
    tokenCache = { token: parsed.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return parsed.token;
}
function parseTicaboxDate(dateStr) {
    if (!dateStr)
        return new Date().toISOString();
    const isoAttempt = new Date(dateStr.replace(" ", "T"));
    if (!isNaN(isoAttempt.getTime()))
        return isoAttempt.toISOString();
    const match = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (match) {
        const monthMap = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
            ene: 0, abr: 3, ago: 7, dic: 11,
        };
        const idx = monthMap[match[2].toLowerCase()];
        if (idx !== undefined) {
            return new Date(parseInt(match[3]), idx, parseInt(match[1])).toISOString();
        }
    }
    return new Date().toISOString();
}
function mapStatus(name) {
    const s = name.toLowerCase().trim();
    if (s.includes("entregado") || s.includes("delivered"))
        return "delivered";
    if (s.includes("ruta") || s.includes("reparto") || s.includes("mensajero"))
        return "route";
    if (s.includes("aduana") || s.includes("customs"))
        return "customs";
    if (s.includes("retenido") || s.includes("devuelto") || s.includes("novedad"))
        return "held";
    if (s.includes("consolidado"))
        return "consolidated";
    if (s.includes("tránsito") || s.includes("transito") || s.includes("vuelo") || s.includes("enviado"))
        return "transit";
    if (s.includes("recibid") || s.includes("bodega") || s.includes("agencia") || s.includes("ingreso"))
        return "received";
    if (s.includes("registrad") || s.includes("generad") || s.includes("cread"))
        return "pre-alerted";
    return "unknown";
}
const STATUS_MESSAGES = {
    "delivered": "Entregado",
    "route": "En Ruta de Entrega",
    "customs": "En Aduanas",
    "held": "Retenido en Aduana",
    "consolidated": "Consolidado",
    "transit": "En Tránsito",
    "received": "Recibido en Bodega Colombia",
    "pre-alerted": "Pre-Alertado",
    "unknown": "Estado desconocido",
};
exports.slTrackColombia = (0, https_1.onCall)({ cors: true, timeoutSeconds: 30 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { trackingNumber } = request.data || {};
    if (!trackingNumber || typeof trackingNumber !== "string") {
        throw new https_1.HttpsError("invalid-argument", "trackingNumber is required");
    }
    const token = await getToken();
    const body = JSON.stringify({ numguia: trackingNumber.trim(), rastreo: 1 });
    const raw = await httpsPost(`${TICABOX_BASE}/web/apigeneral/index/`, body, { "X-Token": token });
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        return { found: false, error: "Respuesta inválida de Ticabox" };
    }
    if (!Array.isArray(data) || data.length === 0) {
        return { found: false };
    }
    const guide = data[0];
    if (!guide.factura_codigo || guide.mensaje === "No existe la guia") {
        return { found: false };
    }
    const guiaStatus = Array.isArray(guide.guia_status) ? guide.guia_status : [];
    const validStatuses = guiaStatus.filter((s) => s.status_name);
    const events = validStatuses.map((s) => ({
        timestamp: parseTicaboxDate(s.status_fecha || s.fecha),
        description: `${s.status_name || ""}${s.status_porcentaje ? ` (${s.status_porcentaje}%)` : ""}`,
        statusCode: mapStatus(s.status_name || ""),
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latestStatusName = validStatuses.length > 0
        ? [...validStatuses].sort((a, b) => parseInt(b.status_porcentaje || "0") - parseInt(a.status_porcentaje || "0"))[0].status_name || ""
        : "";
    const statusCode = mapStatus(latestStatusName);
    return {
        found: true,
        trackingNumber: guide.factura_codigo,
        originalTracking: trackingNumber,
        providerId: "colombia",
        providerName: "Colombia (Ticabox)",
        statusCode,
        statusMessage: STATUS_MESSAGES[statusCode] || latestStatusName,
        manifestId: guide.consolidado || null,
        lastUpdate: guide.factura_fecha || new Date().toISOString(),
        events,
        mensaje: guide.mensaje,
    };
});
//# sourceMappingURL=callable.js.map