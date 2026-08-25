import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as https from "https";

const TICABOX_BASE = "https://ticabox.managercargo.com/public";
const TOKEN_TTL_MS = 55 * 60 * 1000;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
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

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const raw = await httpsPost(
    `${TICABOX_BASE}/web/webindex/tokengenerar/`,
    "{}",
    {}
  );

  let parsed: { ok?: boolean; token?: string | null; mensaje?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpsError("unavailable", "Ticabox token endpoint returned non-JSON");
  }

  if (!parsed.ok || !parsed.token) {
    throw new HttpsError("unavailable", `Ticabox token failed: ${parsed.mensaje || "unknown"}`);
  }

  tokenCache = { token: parsed.token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return parsed.token;
}

function parseTicaboxDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString();
  const isoAttempt = new Date(dateStr.replace(" ", "T"));
  if (!isNaN(isoAttempt.getTime())) return isoAttempt.toISOString();
  const match = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const monthMap: Record<string, number> = {
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

function mapStatus(name: string): string {
  const s = name.toLowerCase().trim();
  if (s.includes("entregado") || s.includes("delivered")) return "delivered";
  if (s.includes("ruta") || s.includes("reparto") || s.includes("mensajero")) return "route";
  if (s.includes("aduana") || s.includes("customs")) return "customs";
  if (s.includes("retenido") || s.includes("devuelto") || s.includes("novedad")) return "held";
  if (s.includes("consolidado")) return "consolidated";
  if (s.includes("tránsito") || s.includes("transito") || s.includes("vuelo") || s.includes("enviado")) return "transit";
  if (s.includes("recibid") || s.includes("bodega") || s.includes("agencia") || s.includes("ingreso")) return "received";
  if (s.includes("registrad") || s.includes("generad") || s.includes("cread")) return "pre-alerted";
  return "unknown";
}

const STATUS_MESSAGES: Record<string, string> = {
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

export const slTrackColombia = onCall(
  { cors: true, timeoutSeconds: 30 },
  async (request: CallableRequest<{ trackingNumber: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { trackingNumber } = request.data || {};
    if (!trackingNumber || typeof trackingNumber !== "string") {
      throw new HttpsError("invalid-argument", "trackingNumber is required");
    }

    const token = await getToken();
    const body = JSON.stringify({ numguia: trackingNumber.trim(), rastreo: 1 });
    const raw = await httpsPost(
      `${TICABOX_BASE}/web/apigeneral/index/`,
      body,
      { "X-Token": token }
    );

    let data: any[];
    try {
      data = JSON.parse(raw);
    } catch {
      return { found: false, error: "Respuesta inválida de Ticabox" };
    }

    if (!Array.isArray(data) || data.length === 0) {
      return { found: false };
    }

    const guide = data[0];
    if (!guide.factura_codigo || guide.mensaje === "No existe la guia") {
      return { found: false };
    }

    const guiaStatus: any[] = Array.isArray(guide.guia_status) ? guide.guia_status : [];
    const validStatuses = guiaStatus.filter((s: any) => s.status_name);

    const events = validStatuses.map((s: any) => ({
      timestamp: parseTicaboxDate(s.status_fecha || s.fecha),
      description: `${s.status_name || ""}${s.status_porcentaje ? ` (${s.status_porcentaje}%)` : ""}`,
      statusCode: mapStatus(s.status_name || ""),
    })).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const latestStatusName = validStatuses.length > 0
      ? [...validStatuses].sort((a: any, b: any) =>
          parseInt(b.status_porcentaje || "0") - parseInt(a.status_porcentaje || "0")
        )[0].status_name || ""
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
  }
);
