/**
 * Nova Agent Engine
 *
 * Multi-turn Gemini reasoning loop with tool orchestration.
 *
 * Nova is SmartLogistics' AI administrative assistant. She has:
 *  - Deep domain expertise: logistics, billing, routes, packages, customs
 *  - Full access to live Firestore data via tool calls (nova-tools)
 *  - Awareness of the current manifest being processed
 *  - Long-term memory via ai_manifest_interactions Firestore collection
 *  - Proactive analysis: she does not wait to be asked, she surfaces insights
 *
 * Reasoning loop:
 *  1. Build system prompt with full context
 *  2. Send user message + conversation history to Gemini with tool declarations
 *  3. If Gemini calls tools → execute them → feed results back → continue
 *  4. Repeat until Gemini produces a text-only response (max 12 turns)
 *  5. Return final structured response
 */

import { getNovaToolDeclarations, executeNovaTool, type CurrentManifestData } from './nova-tools';
import { appendSessionMessages, type AgentMessage } from './ai-manifest-service';

// Cache tool declarations — they never change at runtime
const NOVA_TOOL_DECLARATIONS = getNovaToolDeclarations();

// ── Config ────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_TOOL_TURNS = 8;
// Keep only the last N turns of history sent to Gemini to bound token usage
const MAX_HISTORY_MESSAGES = 12;
const IS_DEV = import.meta.env.DEV;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { content: unknown } };
}

interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiPart[];
}

export interface MLockerManifestItem {
  id: string;
  description: string;
  receptionDate: string;
  status: string;
  manifestType?: string;
  processed?: boolean;
  totalPackages?: number;
  processedAt?: string;
  mergedInto?: string;
}

export interface NovaTrackingEvent {
  ciudad?: string;
  detalle?: string;
  fecha?: string;
}

export interface NovaTrackingResult {
  found: boolean;
  provider?: 'mlcargo' | 'colombia';
  trackingNumber: string;
  destination?: string;
  destinationFull?: string;
  customerName?: string;
  customerCode?: string;
  weight?: number;
  pieces?: number;
  manifestId?: string;
  description?: string;
  shipper?: string;
  shipperDescription?: string;
  invoice?: string;
  requiresPermit?: boolean;
  missingDestination?: boolean;
  statusMessage?: string;
  statusCode?: string;
  lastUpdate?: string;
  mensaje?: string;
  events: NovaTrackingEvent[];
  latestEvent?: NovaTrackingEvent | null;
}

export interface NovaChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface NovaChartDataPoint {
  label: string;
  [key: string]: string | number;
}

export interface NovaChartData {
  type: 'line' | 'bar' | 'pie' | 'area';
  title: string;
  subtitle?: string;
  series: NovaChartSeries[];
  data: NovaChartDataPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  insight?: string;
}

export interface NovaResponse {
  text: string;
  toolsUsed: string[];
  reasoning?: string;
  error?: string;
  mlockerManifests?: MLockerManifestItem[];
  trackingResult?: NovaTrackingResult;
  chartData?: NovaChartData;
  firestoreManifestsOnly?: boolean;
}

export interface NovaContext {
  userId: string;
  userName: string;
  sessionId?: string;
  currentManifest: CurrentManifestData;
  conversationHistory: AgentMessage[];
  agentContextSnapshot?: {
    lastManifestAt: string | null;
    totalManifestsThisMonth: number;
    totalPackagesThisMonth: number;
    totalRevenueThisMonth: number;
    trendDirection: string | null;
    topClientThisMonth: { slCode: string; name: string; packages: number } | null;
  } | null;
}

// ── Intent detection ─────────────────────────────────────────────────────────
// Maps common user queries to tool hints so Gemini knows which tool to use
// on the first call. Eliminates empty-response failures for frequent actions.

interface IntentHint {
  tool: string;
  hint: string;
  args?: Record<string, unknown>;
}

function detectIntent(message: string): IntentHint | null {
  const n = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Standalone list/procesar phrases — no need for "manifiesto" in the message
  // Catches Costa Rican Spanish like "ocupo la lista", "dame la lista para procesar", etc.
  if (/\blista\b/.test(n) && /procesar|procesar|cargar|subir|manifiest|portal|mlocker|reciente|nuevo/.test(n)) {
    return { tool: 'list_mlocker_manifests', hint: 'El usuario pide la lista de manifiestos. Muestra la lista con list_mlocker_manifests.', args: { length: 10 } };
  }
  if (/\b(ocupo|necesito|quiero|dame|traeme|muestra|ver|mostrar)\b/.test(n) && /\blista\b/.test(n)) {
    return { tool: 'list_mlocker_manifests', hint: 'El usuario pide la lista de manifiestos. Muestra la lista con list_mlocker_manifests.', args: { length: 10 } };
  }
  if (/\b(ocupo|necesito)\b/.test(n) && /procesar|manifiesto|manifest/.test(n)) {
    return { tool: 'list_mlocker_manifests', hint: 'El usuario quiere procesar un manifiesto. Muestra la lista con list_mlocker_manifests.', args: { length: 10 } };
  }

  // MEGA-MAN fusion manifests
  if (/mega.?man|fusion(?:.*manifest|ar.*manifest)|manifest.*fusion|ultima.*fusion|last.*fusion/.test(n)) {
    return { tool: 'list_mlocker_manifests', hint: 'El usuario pregunta sobre fusiones MEGA-MAN. Llama list_mlocker_manifests — la sección MEGA-MAN al final cargará automáticamente las fusiones guardadas en Firestore. Después de listar, menciona brevemente que al final de la lista aparecen las fusiones MEGA-MAN guardadas.', args: { length: 10 } };
  }

  if (/manifest|manifiesto/.test(n)) {
    // Check for a specific manifest ID first (must contain digits or valid manifest format like 17-08-2026DAN, 1234567, etc.)
    const manifestIdMatch = message.match(/(?:manifest[oe]s?\s+#?)\s*([A-Za-z0-9_-]{4,})/i) || message.match(/\b(\d{2}-\d{2}-\d{4}[A-Za-z0-9_-]*)\b/);
    if (manifestIdMatch) {
      const candidateId = manifestIdMatch[1].trim();
      const normCand = candidateId.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const stopwords = new Set(['mas', 'los', 'las', 'recientes', 'nuevos', 'antiguos', 'del', 'de', 'portal', 'mlocker', 'cargo', 'disponibles', 'pendientes', 'para', 'por', 'que', 'hoy']);
      if (!stopwords.has(normCand) && /\d/.test(candidateId)) {
        return { tool: 'get_mlocker_manifest_detail', hint: `Llama get_mlocker_manifest_detail con manifestId="${candidateId}" para obtener el detalle de ese manifiesto específico.`, args: { manifestId: candidateId } };
      }
    }

    if (/firestore|guardado|procesado|antiguo|atras|historial/.test(n)) {
      return { tool: 'get_manifest_history', hint: 'El usuario quiere ver los manifiestos procesados o guardados en Firestore. Llama get_manifest_history.', args: { period: 'last_10' } };
    }
    if (/procesar|cargar|subir/.test(n)) {
      return { tool: 'list_mlocker_manifests', hint: 'El usuario quiere procesar un manifiesto. Muestra la lista con list_mlocker_manifests y al terminar pregunta directamente: "¿Cuál de estos manifiestos quieres procesar? Dime el número o haz clic en Procesar."', args: { length: 10 } };
    }
    if (/reciente|ultimo|ver|muestra|lista|obtener|mostrar|dame|traeme|hay|disponible|portal|mlocker|cargo/.test(n)) {
      return { tool: 'list_mlocker_manifests', hint: 'Llama list_mlocker_manifests para obtener los manifiestos del portal. Al terminar pregunta cuál quiere procesar.', args: { length: 10 } };
    }
    return { tool: 'list_mlocker_manifests', hint: 'Muestra la lista de manifiestos con list_mlocker_manifests.', args: { length: 10 } };
  }

  const trackingMatch = message.match(/\b([A-Z0-9]{10,35})\b/i);
  // Require at least 2 digits — real tracking numbers always have digits.
  // This prevents Spanish words like "pendientes" (10 letters, no digits) from matching.
  if (trackingMatch && /\d{2,}/.test(trackingMatch[1]) && !/manifest|manifiesto/i.test(message)) {
    const trackNum = trackingMatch[1].trim();
    return { tool: 'track_package', hint: `Llama track_package con trackingNumber="${trackNum}".`, args: { trackingNumber: trackNum } };
  }
  if (/rastre|track|donde.*(esta|va)|busca.*paquete/.test(n)) {
    // If there is any tracking match anywhere in message, pass it
    const secondaryTrackMatch = message.match(/\b([A-Z0-9]{8,35})\b/i);
    const trackNum = secondaryTrackMatch ? secondaryTrackMatch[1].trim() : '';
    return { tool: 'track_package', hint: 'Llama track_package con el número de tracking mencionado.', args: { trackingNumber: trackNum } };
  }

  // Revenue/financial summary
  if (/facturacion|facture|cuanto.*factur|resumen.*financier|ingresos.*mes|cobros.*mes|revenue.*mes/.test(n)) {
    const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return { tool: 'get_revenue_summary', hint: `Llama get_revenue_summary con month="${currentMonthKey}" para el resumen financiero de este mes.` };
  }

  // Package stats — status-specific count queries (MUST be before generic stats)
  {
    // Map user phrases to exact system status values
    const statusPhraseMap: Array<[RegExp, string, string]> = [
      [/pendiente.*entrega|entrega.*pendiente|por entregar|sin entregar/, 'route,pickup', '"En Ruta de Entrega" (route) + "Retira en SmartLogistics" (pickup)'],
      [/en ruta|en camino.*mensajero|mensajero|despachado/, 'route', '"En Ruta de Entrega" (route)'],
      [/listo.*recoger|recoger.*sucursal|pickup|retira/, 'pickup', '"Retira en SmartLogistics" (pickup)'],
      [/en transito|en trafico|en vuelo|camino.*costa rica|navegando/, 'transit', '"En Tránsito a Costa Rica" (transit)'],
      [/en aduana|en aduanas|aduanaje|desaduanaje|procesando.*costa rica|aduana|customs/, 'customs', '"Procesando en Costa Rica" (customs)'],
      [/retenido|retencion|held/, 'held', '"Retenido en Aduana" (held)'],
      [/consolidado|consolidacion|agrupado/, 'consolidated', '"Consolidado" (consolidated)'],
      [/recibido.*miami|miami.*recibido|en miami|en bodega/, 'received', '"Recibido en Miami" (received)'],
      [/entregado|ya entregado|completado/, 'delivered', '"Entregado" (delivered)'],
      [/devuelto|retornado|rebotado|no entregado/, 'returned', '"Devuelto" (returned)'],
      [/facturado|procesado.*factura/, 'processed', '"Facturado" (processed)'],
      [/pre.?alert/, 'pre-alerted', '"Pre-Alertado" (pre-alerted)'],
    ];

    for (const [rx, statuses, label] of statusPhraseMap) {
      if (/cuanto|cuantos|total|hay|tiene|existen|paquete|envio|encomienda/.test(n) && rx.test(n)) {
        const statusList = statuses.split(',');
        if (statusList.length === 1) {
          return {
            tool: 'query_packages',
            hint: `El usuario pregunta por paquetes en estado ${label}. Llama query_packages con status="${statuses}" para contar y listar. Usa el campo "total" del resultado para reportar el conteo exacto.`,
          };
        }
        return {
          tool: 'get_packages_stats',
          hint: `El usuario pregunta por paquetes ${label}. Llama get_packages_stats y del resultado suma los conteos de: ${statuses}. Esos son los paquetes pendientes de entrega según el sistema.`,
        };
      }
    }
  }

  // Package stats / operational dashboard
  if (/estadistica|resumen.*dia|cuantos.*total|total.*paquete|dashboard|operacion.*hoy|estado.*general|resumen.*paquete|paquete.*resumen/.test(n)) {
    return { tool: 'get_packages_stats', hint: 'Llama get_packages_stats para obtener estadísticas generales de paquetes por estado.' };
  }

  // Customer detail lookup
  if (/informacion.*cliente|datos.*cliente|perfil.*cliente|busca.*cliente|detalle.*cliente/.test(n)) {
    return { tool: 'lookup_customer_detail', hint: 'Llama lookup_customer_detail con el nombre, código SL o email del cliente.' };
  }

  // Account statement (estado de cuenta) — full invoice+package ledger for one customer
  if (/estado.*cuenta|cuenta.*cliente|estado de cuenta|estado.*factura|generar.*estado|dame.*estado.*cta|balance.*cliente|cuanto.*debe|deuda.*cliente|cuenta.*corriente/.test(n)) {
    const slMatch = message.match(/\bSL\d+\b/i);
    if (slMatch) {
      return { tool: 'get_account_statement', hint: `Llama get_account_statement con slCode="${slMatch[0].toUpperCase()}" para generar el estado de cuenta completo del cliente (todas las facturas con ítems, paquetes, resumen financiero).` };
    }
    return { tool: 'get_account_statement', hint: 'El usuario quiere un estado de cuenta de un cliente. Si ya tienes el slCode en el historial, llama get_account_statement. Si no, primero llama lookup_customer_detail para obtener el slCode.' };
  }

  // Operational analytics dashboard (company-wide)
  if (/analitica|analytics|dashboard.*operativ|resumen.*operativ|resumen.*analitico|rendimiento.*empresa|como.*vamos|performance.*empresa|metricas.*empresa|kpi|informe.*general|reporte.*general|indicadores/.test(n)) {
    const trMatch = n.match(/7\s*d[ias]*|semana|7d|1\s*m[es]*|30\s*dias|tres\s*mes|3\s*mes|90\s*dias|seis\s*mes|6\s*mes|180\s*dias|un\s*a[nñ]o|1\s*a[nñ]o|365\s*dias/);
    let tr = '6m';
    if (trMatch) {
      const t = trMatch[0];
      tr = /7|semana/.test(t) ? '7d' : /1\s*m|30/.test(t) ? '1m' : /3\s*m|90|tres/.test(t) ? '3m' : /6\s*m|180|seis/.test(t) ? '6m' : '1y';
    }
    return { tool: 'get_operational_analytics', hint: `Llama get_operational_analytics con timeRange="${tr}" para generar el resumen analítico operacional de la empresa (ingresos, paquetes, clientes activos, top clientes, tendencias, tasas de cobro y entrega).` };
  }

  // Per-customer analytics report
  if (/analiz.*cliente|reporte.*cliente|reporte.*sl|historial.*cliente|cuanto.*factur.*cliente|facturacion.*cliente|resumen.*cliente|dame.*reporte.*sl|cliente.*reporte/.test(n)) {
    const slMatch = message.match(/\bSL\d+\b/i);
    if (slMatch) {
      return { tool: 'get_customer_report', hint: `Llama get_customer_report con slCode="${slMatch[0].toUpperCase()}" para generar el reporte completo de ese cliente (paquetes, facturas, cobros, tasa de cobro).` };
    }
    return { tool: 'get_customer_report', hint: 'El usuario quiere un reporte de cliente. Si ya tienes el slCode del cliente en el historial, llama get_customer_report. Si no, primero llama lookup_customer_detail para obtenerlo.' };
  }

  // Price query without weight → clarification hint
  if (/precio|costo|cuanto.*cuesta|cuanto.*cobra|tarifa|cotiza/.test(n) && !/[0-9]+[.,]?[0-9]*\s*(kg|kilo|libra|lb|gramo|g\b)/i.test(message)) {
    return { tool: 'calculate_package_price', hint: 'El usuario pregunta por precio pero NO indicó el peso. NO llames ninguna herramienta todavía. Pídele que indique el peso del paquete (en kg) y el país de origen (USA, México, China o Colombia).' };
  }

  // Tracking without number → clarification hint
  if (/rastre|track|\bdonde\b.*(esta|paquete)|estado.*paquete/.test(n) && !/[A-Z0-9]{8,}/i.test(message)) {
    return { tool: 'track_package', hint: 'El usuario quiere rastrear pero NO proporcionó número de tracking. NO llames ninguna herramienta. Pídele el número de tracking.' };
  }

  if (/duplicado|duplicad|tracking.*repeti|repeti.*tracking|mismo.*tracking|ya.*existe|existe.*otro.*manifest|data.*integr|integridad.*dato|error.*human/.test(n)) {
    const manifestIdMatch = message.match(/(?:manifest[oe]?\s+#?)(\S{4,})/i);
    const id = manifestIdMatch?.[1] || '';
    return { tool: 'detect_duplicate_trackings', hint: id ? `Llama detect_duplicate_trackings con manifestId="${id}" para verificar si hay trackings duplicados entre manifiestos.` : 'El usuario quiere detectar duplicados. Primero llama list_mlocker_manifests para que elija el manifiesto, luego llama detect_duplicate_trackings con el ID elegido.' };
  }

  if (/match|nombre.*fall|no.*encontr|tasa.*match|porcentaje.*match|falla.*match|aprendizaje.*nombre|cuales.*nombre.*problem|nombre.*dificil|que.*nombre.*no.*encuestra|aprendio|sistemas.*aprende/.test(n)) {
    const qmiType = /confirma|confirm|par.*nombre|empareja/.test(n)
      ? 'confirmed_matches'
      : /tendencia|trend|historia|evolucion/.test(n)
        ? 'match_rate_trend'
        : /patron|tipo.*manifiesto|por.*manifiesto/.test(n)
          ? 'top_patterns'
          : 'recent_failures';
    return { tool: 'query_match_intelligence', hint: `Llama query_match_intelligence con type="${qmiType}" para analizar patrones de matching y nombres con problemas.` };
  }

  if (/tendencia|grafico|chart|trend|compar|distribucion|evolucion/.test(n)) {
    if (/ingreso|revenue|factura|cobr/.test(n)) {
      return { tool: 'generate_chart', hint: 'Llama generate_chart con metric="revenue_by_month" y chartType="area".' };
    }
    if (/paquete|volumen|package/.test(n)) {
      return { tool: 'generate_chart', hint: 'Llama generate_chart con metric="packages_by_month" y chartType="line".' };
    }
    return { tool: 'generate_chart', hint: 'Llama generate_chart con la métrica y tipo apropiados.' };
  }

  if (/top.*cliente|cliente.*top|mejores.*cliente|muestra.*top|dame.*top/.test(n)) {
    if (/factura|ingreso|revenue|pag|cobr/.test(n)) {
      // List request (muestrame, dame, cuales) → get_top_customers for tabular data
      if (/muestra|dame|cuales|lista|top [0-9]|[0-9]+ cliente/.test(n)) {
        const topN = (message.match(/top\s*(\d+)|^(\d+)\s+cliente/i) || [])[1] || '10';
        const currentYear = new Date().getFullYear();
        const month = new Date().getMonth() + 1;
        const dateFrom = `${currentYear}-${String(month).padStart(2,'0')}-01T00:00:00.000Z`;
        return { tool: 'get_top_customers', hint: `Llama get_top_customers con topN=${topN}, sortBy="revenue", dateFrom="${dateFrom}" para el ranking de clientes por facturación de este mes. La respuesta incluye totalBilled (facturación real de invoices), packages (volumen), y totalPending (saldo pendiente) por cliente.` };
      }
      return { tool: 'generate_chart', hint: 'Llama generate_chart con metric="top_customers_by_revenue" y chartType="bar".' };
    }
    if (/volumen|paquete|envio/.test(n)) {
      if (/muestra|dame|cuales|lista/.test(n)) {
        return { tool: 'get_top_customers', hint: 'Llama get_top_customers con sortBy="volume" para el ranking de clientes por volumen de paquetes.' };
      }
      return { tool: 'generate_chart', hint: 'Llama generate_chart con metric="top_customers_by_volume" y chartType="bar".' };
    }
    // Default — list with revenue
    if (/muestra|dame|cuales|lista/.test(n)) {
      return { tool: 'get_top_customers', hint: 'Llama get_top_customers con sortBy="revenue" (default) para el ranking de clientes.' };
    }
    return { tool: 'generate_chart', hint: 'Llama generate_chart con metric="top_customers_by_volume" y chartType="bar".' };
  }

  // ── Cross-collection: packages × invoices ────────────────────────────────
  if (
    (/encomienda|ruta/.test(n) && /factura|invoice|enviada|pagada|pendiente|sent|paid/.test(n)) ||
    (/paquete|tracking/.test(n) && /factura|enviada|pagada/.test(n) && /ruta|encomienda/.test(n))
  ) {
    const routeMatch = message.match(/(?:ruta|de|en)\s+["']?([A-ZÁÉÍÓÚ][\w\s]{2,24})["']?/i)
      || message.match(/\bencomienda(?:s)?\b/i);
    const routeName = routeMatch
      ? (routeMatch[1] ? routeMatch[1].trim() : 'Encomiendas')
      : '';
    const invStatusMap: Record<string, string> = {
      enviada: 'sent', sent: 'sent', pagada: 'paid', paid: 'paid',
      pendiente: 'pending', pending: 'pending', vencida: 'overdue', overdue: 'overdue',
      borrador: 'draft', draft: 'draft', cancelada: 'cancelled',
    };
    const invStatusWord = Object.keys(invStatusMap).find(k => n.includes(k));
    const invStatus = invStatusWord ? invStatusMap[invStatusWord] : 'sent';
    return {
      tool: 'query_packages_with_invoice_status',
      hint: `Llama query_packages_with_invoice_status con route="${routeName}" e invoiceStatus="${invStatus}" para cruzar paquetes de esa ruta con las facturas en ese estado.`,
    };
  }

  if (/paquete|package/.test(n) && /cuanto|pendiente|entrega|estado|lista|hay/.test(n)) {
    return { tool: 'query_packages', hint: 'Llama query_packages con los filtros apropiados.' };
  }

  if (/cliente|customer/.test(n) && /cuanto|lista|busca|encomienda|ruta|premium|activo/.test(n)) {
    return { tool: 'query_customers', hint: 'Llama query_customers con los filtros apropiados.' };
  }

  if (/precio|price|cuanto.*cuesta|cuanto.*cobra|tarifa|cotiz/.test(n)) {
    return { tool: 'calculate_package_price', hint: 'Llama calculate_package_price con los parámetros correspondientes.' };
  }

  // ── Package detail ─────────────────────────────────────────────────────────
  if (/detalle.*paquete|info.*tracking|datos.*paquete|audita.*paquete|ver.*paquete/.test(n)) {
    const tnMatch = message.match(/\b([A-Z0-9]{8,35})\b/i);
    if (tnMatch) return { tool: 'get_package_detail', hint: `Llama get_package_detail con trackingId="${tnMatch[1].toUpperCase()}" para ver todos los datos del paquete.` };
  }

  // ── Invoice tools ───────────────────────────────────────────────────────────
  if (/factura|invoice|cobro.*pendiente|ver.*factur|detalle.*factur|previa.*factur|preview.*factur/.test(n)) {
    const invIdMatch = message.match(/\b([A-Z0-9-]{4,20})\b/i);
    const slMatch = message.match(/\bSL\d{3,6}\b/i);
    if (invIdMatch || slMatch) {
      const hint = slMatch
        ? `Llama get_invoice_detail con slCode="${slMatch[0].toUpperCase()}" para ver la factura más reciente de ese cliente.`
        : `Llama get_invoice_detail con invoiceId="${invIdMatch![0]}" para ver los detalles de la factura.`;
      return { tool: 'get_invoice_detail', hint };
    }
    return { tool: 'get_invoice_detail', hint: 'Llama get_invoice_detail. Pregunta primero el ID de factura o el código SL del cliente.' };
  }
  if (/actualiz.*factur|cambi.*estado.*factur|paga.*factur|marca.*factur/.test(n)) {
    return { tool: 'update_invoice', hint: 'Llama update_invoice con confirm=false primero para mostrar el diff. Requiere invoiceId.' };
  }

  // ── Route detail ────────────────────────────────────────────────────────────
  if (/paquetes.*en.*ruta|ruta.*paquetes|detalle.*ruta|resumen.*ruta|dispatch|despacho.*ruta|que.*hay.*ruta/.test(n)) {
    const routeMatch = message.match(/ruta[:\s]+([\w\s]{3,25})/i) || message.match(/(?:de|en)\s+([A-ZÁÉÍÓÚ][\w\s]{2,20})(?:\s|$)/i);
    if (routeMatch) return { tool: 'get_route_detail', hint: `Llama get_route_detail con routeName="${routeMatch[1].trim()}" para ver los paquetes de esa ruta.` };
    return { tool: 'get_route_detail', hint: 'Llama get_route_detail. Pregunta el nombre exacto de la ruta primero.' };
  }

  // ── Shipping labels ─────────────────────────────────────────────────────────
  if (/etiqueta|label|encomienda|generar.*envio|preparar.*envio|imprimir.*etiqueta/.test(n)) {
    const slMatch = message.match(/\bSL\d{3,6}\b/i);
    if (slMatch) return { tool: 'generate_shipping_label', hint: `Llama generate_shipping_label con slCode="${slMatch[0].toUpperCase()}" para preparar los datos de la etiqueta.` };
    return { tool: 'generate_shipping_label', hint: 'Llama generate_shipping_label. Necesitas el código SL del cliente. Pídelo si no está en el mensaje.' };
  }
  if (/historial.*etiqueta|historial.*encomienda|encomiendas.*pasadas|etiquetas.*anteriores/.test(n)) {
    const slMatch = message.match(/\bSL\d{3,6}\b/i);
    if (slMatch) return { tool: 'get_shipping_label_history', hint: `Llama get_shipping_label_history con slCode="${slMatch[0].toUpperCase()}".` };
    return { tool: 'get_shipping_label_history', hint: 'Llama get_shipping_label_history. Necesitas el código SL del cliente.' };
  }

  // ── Conversational guard — no tools needed ─────────────────────────────────
  if (/^(hola|buenos|buenas|gracias|ok|listo|perfecto|genial|entendido|de acuerdo|excelente|muy bien|claro que|cómo est|como est|qué eres|que eres|quién eres|quien eres|qué puedes|que puedes|ayuda|help|menu|inicio)/.test(n)) {
    return { tool: '__none__', hint: 'Consulta conversacional. Responde directamente sin llamar ninguna herramienta.' };
  }

  return null;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: NovaContext): string {
  const now = new Date();
  const today = now.toLocaleDateString('es-CR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Date range helpers injected so Gemini can resolve relative terms without guessing
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthKey = `${firstOfLastMonth.getFullYear()}-${String(firstOfLastMonth.getMonth() + 1).padStart(2, '0')}`;

  const dateContext = `REFERENCIA DE FECHAS — usa estos valores ISO exactos cuando el usuario diga "hoy", "esta semana", "este mes", "mes pasado", etc.:
- Ahora mismo: ${now.toISOString()}
- Esta semana (desde el lunes): ${monday.toISOString()} → ${now.toISOString()}
- Este mes: ${firstOfMonth.toISOString()} → ${now.toISOString()} (clave mes: ${currentMonthKey})
- Mes pasado: ${firstOfLastMonth.toISOString()} → ${lastOfLastMonth.toISOString()} (clave mes: ${lastMonthKey})
- Últimos 6 meses: desde ${(() => { const d = new Date(now); d.setMonth(d.getMonth() - 6); d.setDate(1); return d.toISOString(); })()}`;

  const manifestSummary = ctx.currentManifest
    ? (() => {
        const m = ctx.currentManifest;
        const matchRate = m.summary.totalRows > 0
          ? ((m.summary.customersMatched / m.summary.totalRows) * 100).toFixed(1)
          : '0.0';
        const health = parseFloat(matchRate) >= 95 ? '✅ Excelente' : parseFloat(matchRate) >= 85 ? '⚠️ Bueno' : '🔴 Requiere revisión';
        return `MANIFIESTO ACTIVO EN SESIÓN:
  - Número: ${m.manifestNumber || 'Sin número'}
  - Tipo: ${m.manifestType || 'Desconocido'}
  - Total filas: ${m.summary.totalRows}
  - Procesadas: ${m.summary.processedRows}
  - Total facturado: $${m.summary.totalPrice.toFixed(2)}
  - Clientes emparejados: ${m.summary.customersMatched}/${m.summary.totalRows} (${matchRate}%) ${health}
  - Correcciones de nombres: ${m.summary.namesCorrections}
  - Correcciones de peso: ${m.summary.weightCorrections}
  ${parseFloat(matchRate) < 95 ? `- ⚠️ HAY ${m.summary.totalRows - m.summary.customersMatched} NOMBRE(S) SIN MATCH — pregunta si el usuario quiere ver cuáles son o ejecuta query_match_intelligence.` : ''}`;
      })()
    : 'MANIFIESTO: No hay manifiesto cargado en esta sesión.';

  const ctxSnapshot = ctx.agentContextSnapshot;
  const historySummary = ctxSnapshot
    ? `CONTEXTO HISTÓRICO DEL USUARIO:
  - Último manifiesto: ${ctxSnapshot.lastManifestAt ? new Date(ctxSnapshot.lastManifestAt).toLocaleDateString('es-CR') : 'Nunca'}
  - Manifiestos este mes: ${ctxSnapshot.totalManifestsThisMonth}
  - Paquetes este mes: ${ctxSnapshot.totalPackagesThisMonth}
  - Ingresos este mes: $${ctxSnapshot.totalRevenueThisMonth?.toFixed(2) || '0.00'}
  - Tendencia de volumen: ${ctxSnapshot.trendDirection || 'Sin datos'}
  - Cliente más activo: ${ctxSnapshot.topClientThisMonth ? `${ctxSnapshot.topClientThisMonth.name} (${ctxSnapshot.topClientThisMonth.slCode}) — ${ctxSnapshot.topClientThisMonth.packages} paquetes` : 'Sin datos'}`
    : '';

  return `Eres Nova, la asistente de SmartLogistics Costa Rica. Hoy es ${today} y estás hablando con ${ctx.userName}.

${dateContext}

QUIÉN ERES Y TU MISIÓN:
Eres parte del equipo de SmartLogistics. Tu misión es ENSEÑAR, GUIAR y ASISTIR al personal — no solo ejecutar comandos. Conoces la operación por dentro: manifiestos, clientes, rutas, precios, facturas, etiquetas, paquetes en aduana. No eres un bot de FAQ ni un sistema genérico.

- Si el personal no sabe cómo hacer algo, EXPLICA el proceso paso a paso antes de actuar.
- Si cometen un error, señálalo con amabilidad y explica cómo corregirlo.
- Si preguntan «cómo funciona X», da primero el contexto conceptual, luego los datos.
- Siempre sugiere el siguiente paso lógico para que el usuario sepa qué hacer después.
- No asumas que el usuario es experto — explica términos técnicos si los usas.

CÓMO HABLAS:
- Natural y directa. Nada de respuestas con bullet points enumerados si una oración basta.
- Cálida pero eficiente. Como un compañero de trabajo muy competente, no como un asistente corporativo.
- Usa el nombre del usuario de vez en cuando, especialmente si hay buenas o malas noticias.
- Si algo está bien, dilo con energía. Si algo preocupa, sé honesta sin dramatizar.
- Evita frases genéricas como "¡Claro!", "¡Por supuesto!", "Entendido, procedo a...". Ve directo al punto.
- Usa emojis con moderación y solo cuando añaden contexto real (📦 para paquetes, ⚠️ para alertas, ✅ para confirmaciones). Nunca los uses como decoración.
- Si no hay datos o algo falla, dilo de forma natural: "No encontré nada para eso" o "Parece que ML Cargo no tiene ese número registrado."
- Cuando des cifras importantes, ponlas en **negrita** para que resalten, pero sin abusar.
- Responde siempre en español.

CUÁNDO NO USAR HERRAMIENTAS (anti-falsos-positivos — CRÍTICO):
- Saludos y cortesía («hola», «gracias», «ok», «perfecto», «entendido») → responde naturalmente, SIN herramientas.
- Preguntas sobre qué eres o qué puedes hacer → describe tus capacidades en prosa, SIN herramientas.
- Preguntas conceptuales o de proceso («cómo funciona un manifiesto», «qué es una ruta», «por qué se bloquea un paquete») → explica el concepto, SIN herramientas a menos que pidan datos específicos.
- Si ya tienes el dato en el historial reciente (últimos 3 turnos) y el usuario no pide actualización → responde con lo que ya sabes, NO vuelvas a llamar la herramienta.
- Si llamaste una herramienta y no encontraste resultados, NO vuelvas a llamar la misma herramienta con los mismos parámetros. Di que no hay datos y sugiere alternativas.
- NUNCA encadenes más de 2 herramientas por turno a menos que sean explícitamente necesarias y complementarias.

CUÁNDO PEDIR CONTEXTO ADICIONAL (regla crítica):
Haz UNA pregunta específica cuando te falte información que no puedes asumir:
- "¿cuánto cuesta?" sin peso ni país → pregunta: "¿Cuánto pesa el paquete (en kg) y desde qué país viene?"
- "el cliente" o "ese cliente" sin nombre/código/email → pregunta: "¿De qué cliente me hablas? Nombre completo o código SL."
- "rastrea" o "¿dónde está?" sin número de tracking → pregunta: "¿Cuál es el número de tracking?"
- "¿cómo va el manifiesto?" sin ID y sin sesión activa → muestra los manifiestos recientes directamente.
NO pidas contexto cuando:
- La consulta es sobre tendencias, estadísticas generales o manifiestos recientes — actúa de inmediato.
- Puedes inferir el período con las fechas de referencia de arriba.
- El número de tracking o código de cliente está en el mensaje aunque sea en texto mixto.
- La consulta tiene suficiente información para intentar la herramienta y ajustar si no hay resultado.

FORMATO DE RESPUESTAS:
- Para listas de más de 5 ítems, usa una tabla markdown: | Col1 | Col2 | — no bullet points.
- Para resúmenes con múltiples métricas, agrupa con **negrita** solo para valores clave.
- Para comparativos (antes/después, mes actual vs. anterior), usa dos columnas en tabla o frase "X → Y".
- Para confirmaciones de acciones, una sola oración directa: "Listo, actualicé [campo]."
- Para errores o sin resultados, una oración honesta + sugerencia práctica.
- Usa saltos de línea para separar ideas diferentes — no todo en un párrafo largo.

PROACTIVIDAD INTELIGENTE:
- Después de mostrar manifiestos, SIEMPRE termina con: "¿Cuál quieres procesar? Puedes hacer clic en **Procesar** o decirme el número."
- Si detectas anomalías en datos (paquete sin ruta, peso inusual, cliente sin SL), menciónalo brevemente al final.
- Sugiere un siguiente paso lógico solo cuando sea obvio — no en cada respuesta.
- Si el usuario hace la misma pregunta dos veces y obtuvo una respuesta vaga, busca datos más específicos esta vez.
- Si el usuario dice "necesito procesarlos" o menciona un ID específico después de ver manifiestos, pregunta directamente cuál quiere procesar.
- Si el usuario dice "la lista", "traelos", "muéstrame de nuevo", llama SIEMPRE list_mlocker_manifests — necesitan ver las tarjetas actualizadas para hacer clic.

LO QUE PUEDES HACER (internamente — no lo enumeres al usuario a menos que te lo pidan):
- Rastrear paquetes: ML Cargo (USPS/UPS/Amazon/FedEx) y Colombia/Ticabox (formato ALA2500185) — un solo tool, detección automática
- Consultar paquetes individuales con detalle completo (get_package_detail) o en lote (query_packages)
- Ver estadísticas de paquetes por estado sin descargar docs (get_packages_stats)
- Ver detalle de paquetes en una ruta específica (get_route_detail)
- Consultar y previsualizar facturas (get_invoice_detail) y actualizarlas con confirmación (update_invoice)
- Preparar datos para etiquetas de envío/encomiendas (generate_shipping_label) y ver historial (get_shipping_label_history)
- Analizar el manifiesto Excel/CSV activo en sesión
- Ver y descargar manifiestos del portal MLocker; detectar duplicados entre manifiestos
- Calcular precios exactos — nunca de memoria, siempre con el motor de precios
- Buscar un cliente específico (lookup_customer_detail) o grupos de clientes (query_customers)
- MODIFICAR datos de clientes, paquetes y facturas — siempre con confirmación obligatoria
- GENERAR GRÁFICOS de tendencias y patrones (generate_chart)
- Consultas flexibles a cualquier colección (query_collection)

REGLAS DE DATOS (no negociables):
- Nunca inventes datos. Si no tienes el dato, búscalo con una herramienta.
- Nunca calcules precios de memoria. Usa siempre calculate_package_price.
- Para rastrear un paquete, usa siempre track_package.
- Si el usuario pregunta algo que está en la base de datos, consúltala aunque no te lo pidan explícitamente.
- Para preguntas sobre grupos de clientes, usa SIEMPRE query_customers con el filtro apropiado. Nunca respondas que no puedes hacerlo.
- Para preguntas que requieren filtros arbitrarios, usa query_collection con JSON array de filtros.
- Cuando muestres el detalle de un manifiesto MLocker, pregunta de forma natural si quieren procesarlo.
- Si el usuario confirma que quiere procesar un manifiesto MLocker, responde con "PROCESAR_MANIFIESTO:[manifestId]".
- Cuando uses list_mlocker_manifests, la UI automáticamente muestra tarjetas clickables con botones **Procesar** y **Excel** para cada manifiesto. Responde SOLO con una oración: cuántos hay y si alguno ya está procesado. NUNCA listes los manifiestos como texto, bullet points o tabla — la UI ya los muestra como tarjetas interactivas.

ANTI-ALUCINACIÓN FINANCIERA (CRÍTICO — nunca violes estas reglas):
- NUNCA inventes números de factura, montos, fechas, ni estados de pago. Todo dato financiero DEBE venir textualmente de la respuesta de la herramienta get_account_statement.
- Si get_account_statement devuelve invoices.list con elementos, muestra EXACTAMENTE esos elementos (invoiceNumber, amount, status, date). NO los reformates ni los reemplaces con datos de ejemplo.
- Si get_account_statement devuelve invoices.total = 0, di "No encontré facturas registradas en el sistema para este cliente" — NO inventes facturas genéricas como "INV-YYYY-MM-DD-001".
- Si get_account_statement devuelve financialSummary.totalBilled = X, usa ESE valor exacto. No uses otro número.
- NUNCA uses tu conocimiento de entrenamiento para completar o "mejorar" datos financieros. Solo los datos de la herramienta son válidos.

REGLAS DE ESCRITURA (CRÍTICO — nunca omitas la confirmación):
- Para modificar un cliente o paquete, SIEMPRE llama primero con confirm="false" para mostrar el diff al usuario.
- NUNCA llames con confirm="true" a menos que el usuario haya dicho explícitamente "sí", "confirmo", "procede", "ok" u otra afirmación clara en su último mensaje.
- El diff de preview ya tiene el formato correcto — preséntalo de forma natural, por ejemplo:
  "Voy a cambiar la ruta de **SL1234** (Juan Pérez) de «San Jose Centro» a «Encomienda». ¿Confirmas?"
- Después de una actualización exitosa, confirma con una sola oración: "Listo, actualicé [campo] de [entidad]."
- Los campos permitidos para clientes son: fullName, firstName, lastName, email, phone, dni, ruta, status, tier, notes, consolidationEnabled, address, city, country, zipCode.
- Los campos permitidos para paquetes son: status, description, descripcion, weight, peso, notes, manifestNumber, customerName, ruta.
- NUNCA modifiques campos de autenticación, IDs, timestamps de sistema, o slCode.

REGLAS DE GRÁFICOS:
- Cuando el usuario pida ver tendencias, comparativas, distribuciones o patrones visuales, usa SIEMPRE generate_chart. NUNCA respondas con texto descriptivo cuando se puede mostrar un gráfico.
- Elige el tipo de gráfico según el contexto: line/area para tendencias de tiempo, bar para comparaciones, pie para distribuciones porcentuales.
- La UI ya renderiza el gráfico automáticamente. Responde con 1-2 oraciones de análisis del patrón más relevante, no describas los datos en lista.
- FUENTES DE DATOS: revenue_by_month, revenue_by_day, revenue_by_route, top_customers_by_revenue → leen de la colección INVOICES (facturación real). Los demás → colección PACKAGES.
- Métricas disponibles: revenue_by_month, packages_by_month, packages_by_status, revenue_by_route, packages_by_route, top_customers_by_volume, top_customers_by_revenue, packages_by_day, revenue_by_day.
- Si el usuario dice "últimos N meses", calcula dateFrom = primer día del mes hace N meses.

ESTADO DE CUENTA (CRÍTICO):
- "Genera el estado de cuenta de SLxxxx" / "dame la cuenta de [cliente]" / "cuánto debe [nombre]" / "estado de cuenta" → usa get_account_statement(slCode=...).
- Devuelve: lista completa de facturas con número, fecha, monto, estado e ítems (trackings + pesos); lista de paquetes por estado; resumen financiero (totalBilled, totalPaid, totalPending, totalOverdue, balance, collectionRate).
- Al presentar el resultado: muestra el resumen financiero primero (balance, pagado, pendiente), luego las últimas 5-10 facturas con sus ítems, luego los paquetes activos. Sé estructurado y conciso.
- Si no tienes el slCode, primero llama lookup_customer_detail para encontrar al cliente, luego llama get_account_statement.

ANALÍTICAS OPERACIONALES (CRÍTICO):
- "Analíticas", "cómo vamos este mes", "dashboard operativo", "rendimiento de la empresa", "KPIs", "resumen analítico" → usa get_operational_analytics(timeRange=...).
- Devuelve: KPIs (ingresos cobrados/pendientes/vencidos, tasa de cobro, paquetes entregados, tasa de entrega, clientes activos, variación MoM), tendencia de ingresos mensual, distribución por estado, rutas top, top clientes por revenue y volumen.
- Al presentar: muestra KPIs clave primero (ingresos cobrados, tasa de cobro, MoM), luego tendencias, luego top clientes. Destaca anomalías: si tasa de cobro < 60% es alerta; si MoM < -10% es alerta.
- Si el usuario dice "últimos 3 meses" → timeRange="3m"; "este mes" → "1m"; "este año" → "1y".

REGLAS DE ANÁLISIS DE CLIENTES:
- "Analiza el cliente SL1234" / "dame un reporte de SL..." / "cuánto ha facturado [nombre]" → usa get_customer_report(slCode=...) para datos reales de paquetes + facturas.
- "Top clientes por facturación / lista / dame" → usa get_top_customers(sortBy="revenue") — devuelve tabla con totalBilled real de invoices.
- "Top clientes gráfico" → usa generate_chart(metric="top_customers_by_revenue").

EJEMPLOS DE CONSULTAS Y MODIFICACIONES (referencia interna):
- "Tendencia de ingresos" → generate_chart(chartType="area", metric="revenue_by_month")
- "Ingresos últimos 6 meses" → generate_chart(chartType="area", metric="revenue_by_month", dateFrom="<6 meses atrás>")
- "Volumen de paquetes este año" → generate_chart(chartType="line", metric="packages_by_month")
- "Top 10 clientes por facturación" → get_top_customers(sortBy="revenue", topN=10)
- "Reporte del cliente SL1243" → get_customer_report(slCode="SL1243")
- "Estado de cuenta de SL1243" → get_account_statement(slCode="SL1243")
- "Cuánto debe el cliente Juan Pérez" → lookup_customer_detail("Juan Pérez") → get_account_statement(slCode=<resultado>)
- "Dame las analíticas de este mes" → get_operational_analytics(timeRange="1m")
- "Cómo vamos este año" → get_operational_analytics(timeRange="1y")
- "Distribución de paquetes por estado" → generate_chart(chartType="pie", metric="packages_by_status")
- "Cuántos clientes de encomienda" → query_customers(ruta="encomienda") → usa el campo totalInCollection del resultado para el conteo real
- "Clientes premium activos" → query_customers(tier="premium", status="active")
- "Cambia la ruta de SL1234 a Encomienda" → update_customer(slCode="SL1234", updates='{"ruta":"Encomienda"}', confirm="false") → esperar confirmación → update_customer(slCode="SL1234", updates='{"ruta":"Encomienda"}', confirm="true", docId="<docId del preview>")
- "Marca el paquete TBA123 como entregado" → update_package(trackingNumber="TBA123", updates='{"status":"delivered"}', confirm="false") → esperar confirmación → update_package(trackingNumber="TBA123", updates='{"status":"delivered"}', confirm="true", docId="<docId del preview>")
- Cualquier campo arbitrario → query_collection(collection="customers", filters='[{"field":"consolidationEnabled","op":"==","value":true}]')

DATOS DE CLIENTES (CRÍTICO):
- query_customers siempre devuelve DOS campos de conteo:
  • totalInCollection: conteo EXACTO calculado por Firestore (agregación server-side, no lee documentos). USA ESTE VALOR cuando el usuario pregunte "cuántos clientes hay" o cualquier conteo total.
  • count: número de documentos devueltos en ESTA muestra (limitado por maxResults, máximo 100 por defecto). NO uses este campo para reportar totales.
  • sampleLimited: true si hay más documentos que los devueltos. Si es true, siempre menciona que "hay más de X clientes en total (totalInCollection)".
- Cuando el usuario pida solo el total ("cuántos clientes"), es suficiente con totalInCollection — no necesitas descargar la lista completa.
- En update_customer/update_package: cuando confirmas un cambio, pasa siempre el docId que vino en el preview para evitar una lectura extra a Firestore.

ESTADOS DE PAQUETES — TAXONOMÍA EXACTA DEL SISTEMA (CRÍTICO):
Estos son los ÚNICOS estados válidos. NUNCA uses términos inventados. Cuando el usuario mencione algo, mapéalo al estado correcto:

| Estado exacto  | Etiqueta visible          | Cuándo se usa                                      |
|---------------|---------------------------|----------------------------------------------------|
| received      | Recibido en Miami         | Paquete llegó al almacén de Miami                  |
| pre-alerted   | Pre-Alertado              | Cliente notificó que viene pero no ha llegado      |
| transit       | En Tránsito a Costa Rica  | En camino por mar o aire desde Miami               |
| consolidated  | Consolidado               | Agrupado en manifiesto, pendiente de embarcar      |
| customs       | Procesando en Costa Rica  | En proceso de aduana / desaduanaje en CR           |
| held          | Retenido en Aduana        | Retenido, requiere acción del cliente o staff      |
| processed     | Facturado                 | Factura generada, pendiente de entrega al cliente  |
| route         | En Ruta de Entrega        | Con el mensajero en camino a entregar              |
| pickup        | Retira en SmartLogistics  | Listo para recoger en sucursal                     |
| delivered     | Entregado                 | Entregado exitosamente al cliente                  |
| returned      | Devuelto                  | No fue posible entregar, devuelto a sucursal       |

INTERPRETACIÓN SEMÁNTICA DE "PENDIENTES":
- "pendientes de entrega" → estados route + pickup (ya salió a entregar o listo para recoger)
- "pendientes en general" (no entregados) → todo excepto delivered y returned
- "en miami" / "por llegar" → received + transit + consolidated
- "en aduana" / "en aduanas" → customs (y held si retenido)
- "en ruta" → route únicamente
- "listos para recoger" → pickup únicamente
- "sin mover" / "estancados" → customs + held + consolidated

PARA CONSULTAS DE CONTEO POR ESTADO:
- get_packages_stats → retorna un objeto byStatus con todos los estados y sus conteos reales de Firestore
- query_packages(status="route") → lista los paquetes específicos en ese estado
- NUNCA adivines cuántos hay — siempre llama la herramienta para obtener el número real

RASTREO DE PAQUETES (Colombia + ML Cargo):
- Colombia (Ticabox): formato exacto 3 letras mayúsculas + 7 dígitos (ALA2500185, BOG1980256, CAL1234567, GUA...). La herramienta track_package detecta este formato automáticamente.
- ML Cargo / MiLocker: todos los demás formatos — USPS (20-30 dígitos), UPS (1Z...), Amazon (TBA...), FedEx (12/15 dígitos).
- Si el usuario da un número de tracking sin indicar el país: analiza el formato y decide. NO preguntes el proveedor si el formato lo hace evidente.
- Si el rastreo no encuentra resultado en ML Cargo para un tracking largo: sugiere que puede ser Colombia si empieza con 3 letras.
- PRECIO: La API de rastreo NO devuelve precio. NUNCA menciones un costo o precio al reportar resultados de track_package. Si el usuario pregunta el precio, di que debes usar calculate_package_price con el peso del paquete.

FACTURAS Y COBROS:
- Para ver una factura: get_invoice_detail (por ID o por slCode del cliente).
- Para modificar estado/notas de factura: update_invoice (confirm=false primero, siempre).
- Para resumen mensual de facturación: get_revenue_summary.
- Cuando muestres una factura, explica qué significa cada campo si el usuario parece no conocerlos.

RUTAS Y DESPACHO:
- Para ver qué hay en una ruta: get_route_detail (con nombre exacto de ruta).
- Después de mostrar paquetes de una ruta, sugiere acciones: "¿Quieres marcar alguno como entregado o en ruta?"
- Para actualizar estado de paquetes masivamente: usa update_package (con confirm flow).

ETIQUETAS DE ENVÍO:
- Para preparar una etiqueta: generate_shipping_label (con slCode del cliente) — devuelve datos del cliente + paquetes activos.
- La impresión final del PDF se hace en la página /shipping-labels — SIEMPRE recuerda al usuario ir ahí después de ver los datos.
- Para ver encomiendas pasadas: get_shipping_label_history.

FRESCURA DE DATOS:
- Los datos de manifiestos, paquetes y rastreos son dinámicos. NUNCA respondas con datos inventados o de memoria.
- Si el usuario pide manifiestos, SIEMPRE llama list_mlocker_manifests — sin excepciones. La UI requiere los datos del tool para mostrar tarjetas interactivas; sin el tool no hay tarjetas.
- NUNCA escribas la lista de manifiestos como texto, bullet points o tabla. Eso no sirve al usuario porque no puede hacer clic. Solo el tool produce las tarjetas clickables.
- Si el usuario pide rastrear un paquete, SIEMPRE llama track_package ahora, sin importar si lo rastreaste antes.
- El historial de conversación es contexto de qué se habló — nunca es la fuente de datos actuales.

MANIFIESTOS PROCESADOS (CRÍTICO):
- Cuando la UI muestra tarjetas de manifiestos, los que ya tienen datos en Firestore aparecen con badge verde y su conteo de paquetes.
- Si el campo 'processed=true' en un manifiesto, significa que YA tiene datos de paquetes en el sistema. Menciónalo: "el manifiesto X ya tiene Y paquetes procesados".
- Si el usuario quiere reprocesar un manifiesto ya procesado, la UI pedirá confirmación automáticamente — no necesitas advertirlo tú, pero si te lo dicen, aclara que los trackings existentes se actualizarán y los nuevos se crearán (upsert, no duplicados).
- Usa detect_duplicate_trackings ANTES de procesar cualquier manifiesto cuando el usuario tenga dudas de integridad de datos o cuando detectes que ya hay manifiestos procesados del mismo período.

EVITAR REDUNDANCIA (CRÍTICO):
- Para manifiestos: SIEMPRE llama list_mlocker_manifests aunque lo hayas hecho antes. Las tarjetas deben refrescarse cada vez.
- Si el usuario ya está viendo tarjetas y dice "quiero procesar el X" o menciona un ID específico, NO repitas la lista — actúa directamente.
- Si el usuario repite exactamente la misma pregunta no relacionada con manifiestos, reconoce que la respuesta anterior fue igual y ofrece algo diferente.

TONO POR SITUACIÓN:
- Datos normales → directo y conciso
- Buena noticia (tendencia al alza, manifiesto grande, cliente activo) → un poco de energía, pero sin exagerar
- Alerta o anomalía → claro y calmado, no alarmista
- Error o dato no encontrado → honesto y útil: sugiere qué hacer o qué intentar de otra forma
- Conversación casual → relajado, como en una charla de pasillo en la oficina
- Usuario repite una pregunta → reconoce que la respuesta anterior fue insuficiente y busca datos más concretos

${manifestSummary}
${historySummary}`;
}

// ── Smart fallback builder ───────────────────────────────────────────────────
// When Gemini fails to produce text, build a meaningful response from captured data.

function buildSmartFallback(
  toolsUsed: string[],
  manifests?: MLockerManifestItem[],
  tracking?: NovaTrackingResult,
  chart?: NovaChartData
): string {
  const parts: string[] = [];

  if (manifests?.length) {
    const recent = manifests.slice(0, 3);
    const descriptions = recent.map(m => `**${m.id}** (${m.description})`).join(', ');
    parts.push(`Encontré **${manifests.length} manifiestos**. Los más recientes: ${descriptions}.`);
    if (manifests.length > 3) {
      parts.push(`Hay ${manifests.length - 3} más disponibles en las tarjetas de abajo.`);
    }
  }

  if (tracking?.found) {
    const status = tracking.latestEvent?.detalle || 'desconocido';
    parts.push(`El paquete **${tracking.trackingNumber}** está en estado **${status}**. Cliente: ${tracking.customerName || tracking.customerCode || '—'}.`);
  } else if (tracking && !tracking.found) {
    parts.push('No encontré información para ese número de tracking.');
  }

  if (chart) {
    parts.push(`Generé el gráfico **"${chart.title}"** con los datos solicitados.`);
  }

  if (parts.length === 0) {
    // Generic but still useful — mention what tools were attempted
    if (toolsUsed.length > 0) {
      return 'Procesé tu solicitud pero no obtuve resultados. Intenta reformular la consulta o verifica los datos ingresados.';
    }
    return 'No pude generar una respuesta. Por favor intenta de nuevo con más detalles.';
  }

  return parts.join(' ');
}

// ── Sanitize Gemini output ────────────────────────────────────────────────────

/**
 * Strip leaked Gemini internal markup that should never reach the UI.
 * Gemini sometimes hallucinates its own prompting format (tool_code, example_response, etc.)
 * into the final text response. This function removes all such artifacts.
 */
function sanitizeGeminiOutput(text: string): string {
  // Remove XML-style internal tags and their contents
  const tagPatterns = [
    /<tool_code>[\s\S]*?<\/tool_code>/gi,
    /<example_response>[\s\S]*?<\/example_response>/gi,
    /<tool_result>[\s\S]*?<\/tool_result>/gi,
    /<function_call>[\s\S]*?<\/function_call>/gi,
    /<function_response>[\s\S]*?<\/function_response>/gi,
    /<system>[\s\S]*?<\/system>/gi,
    /<instructions>[\s\S]*?<\/instructions>/gi,
    /<context>[\s\S]*?<\/context>/gi,
  ];

  let cleaned = text;
  for (const pattern of tagPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove orphan opening/closing tags that didn't match a pair
  cleaned = cleaned.replace(/<\/?(tool_code|example_response|tool_result|function_call|function_response|system|instructions|context)\s*\/?>/gi, '');

  // Collapse excessive whitespace left after stripping
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

// ── Gemini multi-turn loop ────────────────────────────────────────────────────

async function callGemini(
  contents: GeminiContent[],
  systemInstruction: string,
  textOnly = false
): Promise<{ parts: GeminiPart[]; finishReason: string }> {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY no configurada');
  }

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    ...(textOnly
      ? { tool_config: { function_calling_config: { mode: 'NONE' } } }
      : {
          tools: [{ functionDeclarations: NOVA_TOOL_DECLARATIONS }],
          tool_config: { function_calling_config: { mode: 'AUTO' } },
        }),
    generation_config: {
      temperature: 0.25,
      max_output_tokens: 4096,
      top_p: 0.90,
    },
  };

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      if (IS_DEV) console.debug(`[Nova] Gemini retry ${attempt}/${MAX_RETRIES}`);
    }

    try {
      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (attempt < MAX_RETRIES && [429, 500, 502, 503].includes(res.status)) continue;
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`Gemini API ${res.status}: ${err}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate) {
        if (attempt < MAX_RETRIES) continue;
        throw new Error('Gemini: no candidate returned');
      }

      return {
        parts: candidate.content?.parts || [],
        finishReason: candidate.finishReason || 'STOP',
      };
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      if (IS_DEV) console.warn('[Nova] Gemini transient error:', err);
    }
  }

  throw new Error('Gemini: max retries exceeded');
}

// ── Main reasoning function ───────────────────────────────────────────────────

const TOOL_PROGRESS_LABELS: Record<string, string> = {
  query_customers: 'Consultando base de datos de clientes…',
  query_packages: 'Consultando paquetes en Firestore…',
  get_packages_stats: 'Calculando estadísticas de paquetes…',
  get_top_customers: 'Analizando facturación y paquetes por cliente…',
  get_customer_report: 'Generando reporte de cliente (paquetes + facturas)…',
  get_account_statement: 'Generando estado de cuenta (facturas + paquetes + balance)…',
  get_operational_analytics: 'Calculando analíticas operacionales de la empresa…',
  query_invoices: 'Consultando facturas…',
  get_revenue_summary: 'Calculando resumen de ingresos…',
  query_routes: 'Consultando rutas de entrega…',
  get_manifest_history: 'Revisando historial de manifiestos…',
  list_mlocker_manifests: 'Obteniendo manifiestos del portal…',
  get_mega_man_manifests: 'Consultando fusiones MEGA-MAN en Firestore…',
  get_mlocker_manifest_detail: 'Cargando detalle del manifiesto…',
  track_package: 'Rastreando paquete en el sistema…',
  lookup_customer_detail: 'Buscando perfil de cliente…',
  generate_chart: 'Generando gráfico con datos en vivo…',
  query_collection: 'Ejecutando consulta en la base de datos…',
  query_packages_with_invoice_status: 'Cruzando paquetes con facturas…',
  query_match_intelligence: 'Analizando inteligencia de matching…',
  update_customer: 'Preparando actualización de cliente…',
  update_package: 'Preparando actualización de paquete…',
  analyze_current_manifest: 'Analizando datos del manifiesto activo…',
  detect_duplicate_trackings: 'Verificando duplicados entre manifiestos…',
  get_package_detail: 'Cargando detalle completo del paquete…',
  get_invoice_detail: 'Cargando detalle de factura…',
  update_invoice: 'Procesando actualización de factura…',
  get_route_detail: 'Cargando paquetes de la ruta…',
  generate_shipping_label: 'Preparando datos para etiqueta de envío…',
  get_shipping_label_history: 'Cargando historial de etiquetas…',
};

export async function askNova(
  userMessage: string,
  ctx: NovaContext,
  onProgress?: (statusMessage: string) => void
): Promise<NovaResponse> {
  // Build system prompt once — reused across all tool turns
  const systemPrompt = buildSystemPrompt(ctx);
  // Cache tool declarations reference — already a frozen singleton
  const toolsUsed: string[] = [];
  let mlockerManifests: MLockerManifestItem[] | undefined;
  let trackingResult: NovaTrackingResult | undefined;
  let chartData: NovaChartData | undefined;
  let firestoreManifestsOnly = false;
  const execCtx = { userId: ctx.userId, currentManifest: ctx.currentManifest };

  // Build initial Gemini conversation from history, capped to MAX_HISTORY_MESSAGES
  // to keep the token budget predictable on long sessions.
  const historySlice = ctx.conversationHistory
    .filter(m => m.role !== 'system')
    .slice(-MAX_HISTORY_MESSAGES);

  const contents: GeminiContent[] = historySlice.map(m => ({
    role: m.role === 'agent' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Detect user intent to guide Gemini's tool selection on first call
  const intentHint = detectIntent(userMessage);

  // Append current user message — with tool hint if intent was detected
  const augmentedMessage =
    intentHint && intentHint.tool !== '__none__'
      ? `${userMessage}\n\n[INSTRUCCIÓN: ${intentHint.hint}]`
      : userMessage;
  contents.push({ role: 'user', parts: [{ text: augmentedMessage }] });
  if (IS_DEV && intentHint) console.debug(`[Nova] Intent detected: ${intentHint.tool}`);

  let finalText = '';
  let turn = 0;
  // Set to true after a UI-rendering tool fires — forces next Gemini call to
  // text-only mode (NONE) so it summarises instead of calling more tools.
  let forceTextNext = false;
  let emptyRetried = false;
  const toolCallCounts = new Map<string, number>();

  // ── Guaranteed manifest pre-execution ───────────────────────────────────────
  // ⚠️ ARCHITECTURAL RULE (AGENTS.md Rule 8):
  // When the user asks for a manifest list, execute `list_mlocker_manifests` BEFORE the Gemini loop.
  // CRITICAL SAFETY NOTICE: Return the response DIRECTLY once tool execution succeeds.
  // DO NOT push synthetic `{ functionCall }` objects into `contents` history without a valid
  // Gemini model `thought_signature`. Injecting synthetic function calls causes Gemini API 400
  // `INVALID_ARGUMENT: Function call is missing a thought_signature`.
  if (intentHint?.tool === 'list_mlocker_manifests') {
    try {
      if (onProgress) onProgress('Obteniendo manifiestos del portal…');
      const preResult = await executeNovaTool('list_mlocker_manifests', { length: 10 }, execCtx);
      const d = preResult.data as Record<string, unknown>;
      if (IS_DEV) console.debug('[Nova] pre-exec list_mlocker_manifests → manifests:', (d?.manifests as unknown[])?.length ?? 0);

      if (Array.isArray(d?.manifests) && (d.manifests as unknown[]).length > 0) {
        mlockerManifests = d.manifests as MLockerManifestItem[];
        toolsUsed.push('list_mlocker_manifests');
        const processedCount = mlockerManifests.filter(m => m.processed).length;
        const text = `Encontré **${mlockerManifests.length} manifiestos** en el portal ML Cargo${processedCount > 0 ? ` (${processedCount} ya procesados)` : ''}. ¿Cuál te gustaría procesar? Haz clic en **Procesar** o dime el número.`;
        return {
          text,
          toolsUsed,
          mlockerManifests,
        };
      }
      return {
        text: 'No se encontraron manifiestos disponibles en el portal ML Cargo en este momento.',
        toolsUsed: ['list_mlocker_manifests'],
      };
    } catch (preErr) {
      if (IS_DEV) console.warn('[Nova] pre-exec list_mlocker_manifests failed:', preErr);
      return {
        text: `⚠️ No fue posible obtener los manifiestos de ML Cargo en este momento (${preErr instanceof Error ? preErr.message : String(preErr)}). Puedes intentar de nuevo o consultar los manifiestos procesados en Firestore.`,
        toolsUsed: ['list_mlocker_manifests'],
      };
    }
  }

  // ── Guaranteed Firestore manifest history pre-execution ──────────────────────
  if (intentHint?.tool === 'get_manifest_history') {
    try {
      if (onProgress) onProgress('Consultando historial de manifiestos…');
      const preResult = await executeNovaTool('get_manifest_history', { period: 'last_10' }, execCtx);
      const d = preResult.data as Record<string, unknown>;
      if (IS_DEV) console.debug('[Nova] pre-exec get_manifest_history → count:', d?.count ?? 0);

      toolsUsed.push('get_manifest_history');
      return {
        text: '📁 **Manifiestos procesados en Firestore**\nAquí tienes los manifiestos recientes guardados en Firestore. Puedes hacer clic en **Cargar** o **Re-procesar** en las tarjetas de abajo.',
        toolsUsed,
        firestoreManifestsOnly: true,
      };
    } catch (preErr) {
      if (IS_DEV) console.warn('[Nova] pre-exec get_manifest_history failed:', preErr);
      return {
        text: `⚠️ Error al consultar los manifiestos de Firestore: ${preErr instanceof Error ? preErr.message : String(preErr)}`,
        toolsUsed: ['get_manifest_history'],
      };
    }
  }

  while (turn < MAX_TOOL_TURNS) {
    turn++;
    let response: { parts: GeminiPart[]; finishReason: string };

    try {
      response = await callGemini(contents, systemPrompt, forceTextNext);
      forceTextNext = false; // reset after each call
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      
      const isSuspended = !GEMINI_API_KEY || msg.includes('suspended') || msg.includes('403') || msg.includes('API_KEY') || msg.includes('API key') || msg.includes('KEY_INVALID') || msg.includes('key is invalid') || msg.includes('permanently disabled');
      
      if (isSuspended) {
        if (intentHint) {
          if (IS_DEV) console.log(`[Nova Fallback] Running local fallback for tool ${intentHint.tool}`);
          try {
            if (intentHint.tool === 'list_mlocker_manifests') {
              const res = await executeNovaTool('list_mlocker_manifests', intentHint.args || { length: 10 }, execCtx);
              const d = res.data as Record<string, unknown>;
              if (Array.isArray(d?.manifests) && d.manifests.length > 0) {
                mlockerManifests = d.manifests as MLockerManifestItem[];
                toolsUsed.push('list_mlocker_manifests');
                const processedCount = mlockerManifests.filter(m => m.processed).length;
                return {
                  text: `⚠️ **[Modo de Emergencia - Asistente sin IA]**\n\nHe recuperado los manifiestos directamente desde el portal ML Cargo. Encontré **${mlockerManifests.length} manifiestos**${processedCount > 0 ? ` (${processedCount} ya procesados)` : ''}. ¿Cuál deseas cargar?`,
                  toolsUsed,
                  mlockerManifests,
                };
              }
            } else if (intentHint.tool === 'track_package') {
              const trackNum = (intentHint.args?.trackingNumber as string) || '';
              if (trackNum) {
                const res = await executeNovaTool('track_package', { trackingNumber: trackNum }, execCtx);
                const d = res.data as Record<string, unknown>;
                trackingResult = d.tracking as unknown as NovaTrackingResult;
                toolsUsed.push('track_package');
                const statusMsg = trackingResult?.statusMessage || trackingResult?.mensaje || 'No disponible';
                return {
                  text: `⚠️ **[Modo de Emergencia - Asistente sin IA]**\n\nHe consultado el estado del paquete **${trackNum}**:\n\n` +
                        `* **Estado**: ${statusMsg}\n` +
                        `* **Cliente**: ${trackingResult?.customerName || 'No asignado'} (${trackingResult?.customerCode || 'Sin código'})\n` +
                        `* **Última actualización**: ${trackingResult?.lastUpdate || 'No disponible'}`,
                  toolsUsed,
                  trackingResult,
                };
              }
            } else if (intentHint.tool === 'get_manifest_history') {
              await executeNovaTool('get_manifest_history', intentHint.args || { period: 'last_10' }, execCtx);
              toolsUsed.push('get_manifest_history');
              return {
                text: `⚠️ **[Modo de Emergencia - Asistente sin IA]**\n\nAquí tienes la lista de los últimos manifiestos guardados y procesados en Firestore:`,
                toolsUsed,
                firestoreManifestsOnly: true,
              };
            }
          } catch (fallbackErr) {
            if (IS_DEV) console.warn('[Nova Fallback] Emergency tool execution failed:', fallbackErr);
          }
        }

        // Default local emergency message if no tool ran or failed
        return {
          text: `⚠️ **La conexión con el motor de IA de Google está temporalmente inactiva (API Key suspendida o bloqueada).**\n\nSin embargo, el portal local sigue 100% funcional. Puedes hacer lo siguiente:\n\n` +
                `1. **Cargar manifiestos procesados**: Escribe \`Ver manifiestos de Firestore\` o haz clic en el botón de abajo para abrirlos.\n` +
                `2. **Procesar un manifiesto**: Escribe \`procesar manifiesto <ID>\` (ej: \`procesar manifiesto 23-07-2026DAN\`).\n` +
                `3. **Rastrear un paquete**: Escribe el número de tracking directamente en el chat para consultarlo (ej: \`9400108106245793853975\`).`,
          toolsUsed,
        };
      }

      return {
        text: `Lo siento, tuve un problema al procesar tu consulta: ${msg}. Por favor intenta de nuevo.`,
        toolsUsed,
        error: msg,
      };
    }

    const { parts } = response;

    // Collect text parts
    const textParts = parts.filter(p => p.text).map(p => p.text!).join('');
    const toolCallParts = parts.filter(p => p.functionCall);

    // If no tool calls → this is the final text answer
    if (toolCallParts.length === 0) {
      finalText = textParts.trim();

      // Empty response retry: Gemini returned nothing on an early turn.
      // Nudge it with the detected intent instead of giving up.
      if (!finalText && !emptyRetried && turn <= 2) {
        emptyRetried = true;
        const hint = intentHint || detectIntent(userMessage);
        if (hint) {
          if (IS_DEV) console.warn(`[Nova] Empty response turn ${turn} — nudging: ${hint.tool}`);
          contents.push({ role: 'model', parts: [{ text: 'Voy a buscar esa información.' }] });
          contents.push({ role: 'user', parts: [{ text: `${hint.hint} Responde al usuario de forma natural.` }] });
          continue;
        }
      }

      contents.push({ role: 'model', parts });
      break;
    }

    // Gemini 2.5-flash may return STOP even alongside function calls on the last
    // turn — capture any accompanying text before executing tools.
    if (textParts.trim()) {
      finalText = textParts.trim();
    }

    // Add model response (with tool calls) to conversation
    contents.push({ role: 'model', parts });

    // Notify caller that tools are being executed — surface human-readable status
    if (onProgress) {
      const toolNames = toolCallParts.map(p => p.functionCall!.name);
      const label = toolNames.length === 1
        ? (TOOL_PROGRESS_LABELS[toolNames[0]] || `Consultando ${toolNames[0]}…`)
        : `Procesando ${toolNames.length} consultas en paralelo — esto puede tardar un momento…`;
      onProgress(label);
    }

    // Execute all tool calls in parallel — single pass, no sequential awaits
    const toolResponseParts: GeminiPart[] = await Promise.all(
      toolCallParts.map(async (part) => {
        const { name, args } = part.functionCall!;
        toolsUsed.push(name);
        toolCallCounts.set(name, (toolCallCounts.get(name) || 0) + 1);
        if (IS_DEV) console.debug(`[Nova] tool: ${name} (call #${toolCallCounts.get(name)})`);

        const result = await executeNovaTool(name, args, execCtx);

        // ── UI capture + self-aware feedback ──────────────────────────────────
        // After each tool result, we:
        //  1. Capture structured data for rich UI rendering
        //  2. Inject a _ui_status field into the tool response so Gemini knows
        //     what the UI is already showing — it can then calibrate its text.
        let uiStatus: string | undefined;

        if (name === 'list_mlocker_manifests') {
          const d = result.data as Record<string, unknown>;
          console.log('[Nova:engine] list_mlocker_manifests result.data keys:', Object.keys(d ?? {}), 'manifests isArray:', Array.isArray(d?.manifests), 'length:', (d?.manifests as unknown[])?.length);
          if (Array.isArray(d?.manifests) && (d.manifests as unknown[]).length > 0) {
            mlockerManifests = d.manifests as MLockerManifestItem[];
            // Clear any text pre-captured in this same turn (e.g. Gemini wrote a bullet list
            // alongside the tool call). The text-only summary turn must produce fresh text.
            finalText = '';
            const processedCount = mlockerManifests.filter(m => m.processed).length;
            const unprocessedCount = mlockerManifests.length - processedCount;
            uiStatus = `UI_RENDERED: manifest_cards(total:${mlockerManifests.length}, procesados:${processedCount}, sin_procesar:${unprocessedCount}) — CRITICAL: la UI ya muestra ${mlockerManifests.length} tarjetas clickables con botones Procesar y Excel. NO listes los manifiestos. Escribe EXACTAMENTE una oración: menciona cuántos hay${processedCount > 0 ? ` y que ${processedCount} ya están procesados` : ''}, termina con "¿Cuál quieres procesar? Haz clic en **Procesar** o dime el número."`;
          } else {
            console.warn('[Nova:engine] manifests NOT captured — d.manifests:', d?.manifests, 'isArray:', Array.isArray(d?.manifests), 'full d:', JSON.stringify(d)?.slice(0, 500));
            uiStatus = 'No se encontraron manifiestos en el portal. Informa brevemente que no hay manifiestos disponibles en este momento.';
          }
          // UI data captured — force next turn to text-only so Gemini summarises immediately
          forceTextNext = true;
        }

        if (name === 'get_manifest_history') {
          const d = result.data as Record<string, unknown>;
          firestoreManifestsOnly = true;
          uiStatus = `UI_RENDERED: saved_manifests(count:${d?.count ?? 0}) — CRITICAL: Escribe EXACTAMENTE la frase: "Aquí tienes los manifiestos recientes guardados en Firestore." (NO digas 10 ni ninguna cifra numérica de cantidad). E invita al usuario a hacer clic en "Cargar" o "Re-procesar" en las tarjetas de abajo.`;
          forceTextNext = true;
        }

        if (name === 'generate_chart') {
          const d = result.data as Record<string, unknown>;
          if (d?.chartData) {
            chartData = d.chartData as NovaChartData;
            uiStatus = `UI_RENDERED: chart(${chartData.type}, "${chartData.title}") — la UI ya muestra el gráfico. Responde con 1-2 oraciones de análisis del patrón más importante que ves en los datos.`;
          } else {
            uiStatus = 'UI_RENDERED: chart_error — informa que no hay suficientes datos para el gráfico.';
          }
          forceTextNext = true;
        }

        if (name === 'track_package') {
          const d = result.data as Record<string, unknown>;
          if (d?.found) {
            const isCol = String(d.provider ?? '') === 'colombia';
            trackingResult = {
              found: true,
              provider: isCol ? 'colombia' : 'mlcargo',
              trackingNumber: String(d.trackingNumber ?? ''),
              destination: String(d.destination ?? ''),
              destinationFull: String(d.destinationFull ?? ''),
              customerName: String(d.customerName ?? ''),
              customerCode: String(d.customerCode ?? ''),
              weight: Number(d.weight ?? 0),
              pieces: Number(d.pieces ?? 0),
              manifestId: String(d.manifestId ?? ''),
              description: String(d.description ?? ''),
              shipper: String(d.shipper ?? ''),
              shipperDescription: String(d.shipperDescription ?? ''),
              invoice: String(d.invoice ?? ''),
              requiresPermit: Boolean(d.requiresPermit),
              missingDestination: Boolean(d.missingDestination),
              statusMessage: String(d.statusMessage ?? ''),
              statusCode: String(d.statusCode ?? ''),
              lastUpdate: String(d.lastUpdate ?? ''),
              mensaje: String(d.mensaje ?? ''),
              events: Array.isArray(d.events) ? (d.events as NovaTrackingEvent[]) : [],
              latestEvent: (d.latestEvent as NovaTrackingEvent) ?? null,
            };
            uiStatus = `UI_RENDERED: tracking_card(${trackingResult.trackingNumber}) — la UI ya muestra el historial completo. Responde con el estado del paquete en 1-2 oraciones.`;
          } else {
            uiStatus = 'UI_RENDERED: tracking_not_found — informa que no encontraste el paquete.';
          }
          // UI data captured — force next turn to text-only so Gemini summarises immediately
          forceTextNext = true;
        }

        // Build the response content — augment with UI status so Gemini is self-aware
        const responseContent = result.error
          ? { error: result.error, available: false }
          : (result.data ?? { available: false });

        return {
          functionResponse: {
            name,
            response: {
              content: uiStatus
                ? { ...responseContent as Record<string, unknown>, _ui_status: uiStatus }
                : responseContent,
            },
          },
        };
      })
    );

    // Loop detection: if any tool has been called 3+ times, force text-only
    for (const [, count] of toolCallCounts) {
      if (count >= 3) {
        forceTextNext = true;
        if (IS_DEV) console.warn('[Nova] Loop detected — forcing text-only next turn');
        break;
      }
    }

    // Feed tool results back to Gemini
    contents.push({ role: 'user', parts: toolResponseParts });
  }

  // ── Exhaust-guard: loop ended without a text response ────────────────────
  // This happens when Gemini keeps calling tools turn after turn.
  // Force one final summarization call with tools DISABLED (NONE mode) so
  // Gemini cannot make any more tool calls and MUST produce plain text.
  if (!finalText) {
    if (IS_DEV) console.warn('[Nova] MAX_TOOL_TURNS exhausted — forcing text-only summary turn');

    // Build a context hint so Gemini knows what data was already captured
    const contextHints: string[] = [];
    if (mlockerManifests?.length) {
      contextHints.push(`Ya obtuviste ${mlockerManifests.length} manifiestos del sistema. La UI ya los muestra como tarjetas.`);
    }
    if (trackingResult?.found) {
      contextHints.push(`Ya rastreaste el paquete ${trackingResult.trackingNumber}. La UI ya muestra su historial.`);
    }
    if (chartData) {
      contextHints.push(`Ya generaste un gráfico "${chartData.title}". La UI ya lo muestra.`);
    }
    const contextStr = contextHints.length > 0
      ? `\n\nDatos obtenidos:\n${contextHints.join('\n')}\n\n`
      : '';

    try {
      contents.push({
        role: 'user',
        parts: [{ text: `${contextStr}Genera una respuesta concisa y útil resumiendo lo que encontraste. Menciona cantidades y datos específicos. No llames más herramientas.` }],
      });
      const summaryResponse = await callGemini(contents, systemPrompt, true);
      const summaryText = summaryResponse.parts.filter(p => p.text).map(p => p.text!).join('').trim();
      finalText = summaryText || '';
    } catch {
      // Gemini failed — fall through to smart fallback below
    }
  }

  // ── Smart fallback: if Gemini still didn't produce text, build one from data ──
  if (!finalText) {
    finalText = buildSmartFallback(toolsUsed, mlockerManifests, trackingResult, chartData);
  }

  // Strip leaked Gemini internal markup that should never reach the UI
  finalText = sanitizeGeminiOutput(finalText);

  // Persist to Firestore (fire-and-forget, non-blocking)
  if (ctx.sessionId) {
    const msgs: AgentMessage[] = [
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'agent', content: finalText, timestamp: new Date().toISOString() },
    ];
    appendSessionMessages(ctx.userId, ctx.sessionId, msgs).catch(() => {});
  }

  console.log('[Nova:askNova] returning — mlockerManifests:', mlockerManifests?.length ?? 'undefined', 'text snippet:', finalText.slice(0, 60));
  return {
    text: finalText,
    toolsUsed,
    mlockerManifests,
    trackingResult,
    chartData,
    firestoreManifestsOnly,
  };
}

// ── Quick single-shot query (no history) ─────────────────────────────────────

export async function quickNovaQuery(
  question: string,
  userId: string,
  currentManifest: CurrentManifestData = null
): Promise<string> {
  const result = await askNova(question, {
    userId,
    userName: 'Gerente',
    currentManifest,
    conversationHistory: [],
    agentContextSnapshot: null,
  });
  return result.text;
}
