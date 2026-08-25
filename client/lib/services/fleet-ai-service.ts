/**
 * Fleet AI Service
 *
 * Provides on-demand AI analysis of driver performance, route efficiency,
 * fuel consumption patterns, and behavioral anomalies using Google Gemini.
 *
 * Data flows:
 *   route_sessions → buildFleetPrompt → Gemini → FleetInsight → Firestore fleet_ai_analyses
 *
 * GPS waypoints are stored in: route_sessions/{sessionId}/waypoints/{waypointId}
 */

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { RouteSession } from '@/lib/services/route-session-service';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GPSWaypoint {
  lat: number;
  lng: number;
  ts: string;           // ISO timestamp
  speed?: number;       // km/h between this and previous point
  accuracy?: number;    // meters
}

export interface FleetInsight {
  id?: string;
  analysisType: 'fleet' | 'driver' | 'route';
  generatedAt: string;
  promptSummary: string;   // brief description of what was analyzed
  insights: InsightCard[];
  rawResponse?: string;    // full Gemini response for audit
  sessionIds?: string[];
  driverIds?: string[];
}

export interface InsightCard {
  category: 'efficiency' | 'anomaly' | 'pattern' | 'fuel' | 'recommendation' | 'performance';
  severity: 'info' | 'warning' | 'critical' | 'positive';
  title: string;
  description: string;
  metric?: string;         // e.g. "82% delivery rate"
  actionable?: string;     // suggested action for admin
  driverName?: string;
  routeName?: string;
}

// ── Gemini API ─────────────────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

let geminiDisabledUntil = 0;
const GEMINI_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown if API key fails

/**
 * Checks if Fleet AI is enabled and configured with a valid Gemini API key.
 */
export function isFleetAIEnabled(): boolean {
  if (geminiDisabledUntil > Date.now()) return false;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string') return false;
  const trimmed = apiKey.trim();
  if (
    trimmed === '' ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === 'false' ||
    trimmed === '0' ||
    trimmed.startsWith('placeholder') ||
    trimmed.startsWith('test-') ||
    trimmed.length < 15
  ) {
    return false;
  }
  return true;
}

export function disableFleetAI(reason?: string) {
  console.warn(`[Fleet AI] Disabling Gemini for 1 hour: ${reason || 'API error'}`);
  geminiDisabledUntil = Date.now() + GEMINI_COOLDOWN_MS;
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!isFleetAIEnabled()) throw new Error('El Asistente de Inteligencia de Flota está temporalmente inactivo.');

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      disableFleetAI(`HTTP ${response.status}`);
    }
    throw new Error('El Asistente de Inteligencia de Flota está temporalmente inactivo. Por favor, intenta de nuevo más tarde.');
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text;
}

// ── Prompt builders ────────────────────────────────────────────────────────────

function formatSessionForPrompt(session: RouteSession): string {
  const delivered = (session.packages || []).filter(p => p.deliveryStatus === 'delivered').length;
  const returned = (session.packages || []).filter(p => p.deliveryStatus === 'returned').length;
  const attempted = (session.packages || []).filter(p => p.deliveryStatus === 'attempted').length;
  const pending = (session.packages || []).filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending').length;

  const startAt = session.startAt ? new Date(session.startAt).toLocaleString('es-CR') : 'N/A';
  const endAt = session.endAt ? new Date(session.endAt).toLocaleString('es-CR') : 'En curso';

  const kmDriven = session.endKm && session.startKm
    ? (session.endKm - session.startKm)
    : null;

  const fuelDelta = session.endFuelLevel && session.startFuelLevel
    ? `${session.startFuelLevel}% → ${session.endFuelLevel}%`
    : null;

  const durationHours = session.startAt && session.endAt
    ? ((new Date(session.endAt).getTime() - new Date(session.startAt).getTime()) / 3_600_000).toFixed(1)
    : null;

  // Return reasons breakdown
  const returnReasons: Record<string, number> = {};
  (session.packages || []).forEach(p => {
    if (p.returnReason) {
      returnReasons[p.returnReason] = (returnReasons[p.returnReason] || 0) + 1;
    }
  });

  // Audit events timeline (just types and times for AI context)
  const eventSummary = (session.events || [])
    .slice(0, 30)
    .map(e => `  ${e.type} @ ${new Date(e.timestamp).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`)
    .join('\n');

  let cashCollected = 0;
  (session.packages || []).forEach(p => {
    if (p.deliveryStatus === 'delivered' && p.cashPaid) {
      cashCollected += p.cashPaid;
    }
  });
  const cashFaltante = session.cashToCollect ? Math.max(0, session.cashToCollect - cashCollected) : 0;

  return `
SESION_ID: ${session.id}
CHOFER: ${session.driverName} (ID: ${session.driverId})
RUTA: ${session.routeName}
PLACA: ${session.vehiclePlate || 'N/A'}
INICIO: ${startAt}
FIN: ${endAt}
DURACION: ${durationHours ? `${durationHours}h` : 'En curso'}
PAQUETES_TOTAL: ${session.totalPackages}
ENTREGADOS: ${delivered}
DEVUELTOS: ${returned}
INTENTADOS: ${attempted}
PENDIENTES: ${pending}
TASA_ENTREGA: ${session.totalPackages ? Math.round((delivered / session.totalPackages) * 100) : 0}%
KM_RECORRIDOS: ${kmDriven !== null ? `${kmDriven} km` : 'N/A'}
NIVEL_COMBUSTIBLE: ${fuelDelta || 'N/A'}
EFECTIVO_COBRADO: ${cashCollected > 0 ? `₡${cashCollected.toLocaleString('es-CR')}` : 'N/A'}
FALTANTE_EFECTIVO: ${cashFaltante > 0 ? `₡${cashFaltante.toLocaleString('es-CR')}` : '₡0'}
MOTIVOS_DEVOLUCION: ${JSON.stringify(returnReasons)}
EVENTOS_AUDITORIA:
${eventSummary || '  (sin eventos)'}
`.trim();
}

function buildFleetAnalysisPrompt(sessions: RouteSession[]): string {
  const sessionData = sessions.map(s => formatSessionForPrompt(s)).join('\n\n---\n\n');

  return `
Eres un experto en logística y análisis de flotas de reparto. Analiza los siguientes datos de sesiones de entrega de una empresa de courier en Costa Rica y genera insights accionables en español.

DATOS DE SESIONES:
${sessionData}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta (sin texto adicional, sin markdown):
{
  "insights": [
    {
      "category": "efficiency|anomaly|pattern|fuel|recommendation|performance",
      "severity": "info|warning|critical|positive",
      "title": "Título corto del insight (máx 60 chars)",
      "description": "Descripción detallada con datos concretos del análisis",
      "metric": "Métrica clave si aplica (ej: '78% tasa entrega')",
      "actionable": "Acción concreta recomendada para el administrador",
      "driverName": "Nombre del chofer si aplica",
      "routeName": "Nombre de la ruta si aplica"
    }
  ]
}

Analiza y genera entre 5 y 12 insights cubriendo:
1. Choferes con tasas de entrega fuera del promedio (buenas o malas)
2. Rutas con mayor consumo de combustible (delta % por km recorrido)
3. Motivos de devolución más frecuentes y patrones
4. Faltantes de efectivo sospechosos
5. Choferes con muchos intentos fallidos (posible problema de zona o conducta)
6. Duración de sesiones fuera de lo normal (muy cortas o muy largas)
7. Recomendaciones concretas para mejorar la operación
8. Cualquier anomalía o patrón que detectes en los datos

Sé específico, usa los datos reales del JSON. No inventes datos.
`.trim();
}

function buildDriverAnalysisPrompt(session: RouteSession, history: RouteSession[]): string {
  const current = formatSessionForPrompt(session);
  const historyData = history.slice(0, 10).map(s => formatSessionForPrompt(s)).join('\n\n---\n\n');

  return `
Eres un experto en logística. Analiza el desempeño de este chofer de reparto en Costa Rica y genera un reporte individual detallado en español.

SESION_ACTUAL:
${current}

HISTORIAL_PREVIO (últimas ${history.length} sesiones):
${historyData || 'No hay historial disponible'}

Responde ÚNICAMENTE con JSON válido sin texto adicional:
{
  "insights": [
    {
      "category": "efficiency|anomaly|pattern|fuel|recommendation|performance",
      "severity": "info|warning|critical|positive",
      "title": "Título del insight",
      "description": "Análisis detallado con comparaciones al historial si disponible",
      "metric": "Métrica si aplica",
      "actionable": "Acción recomendada"
    }
  ]
}

Analiza:
1. Comparación de tasa de entrega vs su propio historial
2. Tendencia de combustible (¿consume más que sesiones previas?)
3. Patrones de devolución recurrentes
4. Eficiencia horaria (entregas por hora)
5. Manejo de efectivo (faltantes)
6. Duración vs km recorridos (¿la ruta es eficiente?)
7. Recomendaciones personalizadas
`.trim();
}

// ── Parse Gemini response ──────────────────────────────────────────────────────

function parseGeminiResponse(raw: string): InsightCard[] {
  try {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed.insights || [];
  } catch {
    // Fallback: if parsing fails, return a single error insight
    console.error('Failed to parse Gemini response:', raw);
    return [{
      category: 'anomaly',
      severity: 'warning',
      title: 'Error al parsear respuesta AI',
      description: 'La respuesta del modelo no pudo ser procesada. Intenta de nuevo.',
      actionable: 'Revisa los logs de consola para detalles.',
    }];
  }
}

// ── Local Fallback Helpers ─────────────────────────────────────────────────────

function buildLocalFleetInsights(sessions: RouteSession[]): InsightCard[] {
  let totalPkgs = 0;
  let delivered = 0;
  let returned = 0;
  let attempted = 0;
  let kmDriven = 0;
  
  for (const s of sessions) {
    const pkgs = s.packages || [];
    totalPkgs += pkgs.length;
    delivered += pkgs.filter(p => p.deliveryStatus === 'delivered').length;
    returned += pkgs.filter(p => p.deliveryStatus === 'returned').length;
    attempted += pkgs.filter(p => p.deliveryStatus === 'attempted').length;
    if (s.endKm && s.startKm) {
      kmDriven += (s.endKm - s.startKm);
    }
  }

  const rate = totalPkgs > 0 ? (delivered / totalPkgs) * 100 : 100;
  const cards: InsightCard[] = [
    {
      category: 'performance',
      severity: 'info',
      title: 'Resumen Operacional (Local - IA Inactiva)',
      description: `Se procesaron un total de ${sessions.length} rutas con ${totalPkgs} paquetes totales. Kilómetros totales recorridos: ${kmDriven} km.`,
      metric: `${rate.toFixed(1)}% de éxito`,
      actionable: 'Monitorear las rutas activas para verificar que no haya demoras.'
    }
  ];

  if (returned > 0) {
    cards.push({
      category: 'anomaly',
      severity: 'warning',
      title: 'Paquetes Devueltos Detectados',
      description: `Se detectaron ${returned} paquetes devueltos en las rutas. Esto incrementa costos logísticos.`,
      metric: `${returned} devueltos`,
      actionable: 'Revisar las razones de devolución con los conductores correspondientes.'
    });
  }

  if (attempted > 0) {
    cards.push({
      category: 'pattern',
      severity: 'info',
      title: 'Intentos Fallidos de Entrega',
      description: `Hay ${attempted} paquetes con intento fallido de entrega.`,
      metric: `${attempted} intentos`,
      actionable: 'Programar re-entrega en el próximo ciclo de ruta.'
    });
  }

  return cards;
}

function buildLocalDriverInsights(session: RouteSession, history: RouteSession[] = []): InsightCard[] {
  const pkgs = session.packages || [];
  const total = pkgs.length;
  const delivered = pkgs.filter(p => p.deliveryStatus === 'delivered').length;
  const returned = pkgs.filter(p => p.deliveryStatus === 'returned').length;
  const rate = total > 0 ? (delivered / total) * 100 : 100;
  
  const cards: InsightCard[] = [
    {
      category: 'performance',
      severity: 'info',
      title: `Desempeño de ${session.driverName} (Local - IA Inactiva)`,
      description: `Entregó ${delivered} de ${total} paquetes en la ruta ${session.routeName || 'N/A'}.`,
      metric: `${rate.toFixed(1)}% de éxito`,
      actionable: 'Monitorear la finalización de la jornada.'
    }
  ];

  if (returned > 0) {
    cards.push({
      category: 'anomaly',
      severity: 'warning',
      title: 'Devoluciones en la ruta del conductor',
      description: `El conductor reportó ${returned} devoluciones hoy.`,
      metric: `${returned} devueltos`,
      actionable: 'Validar la dirección e intentar contacto telefónico con el cliente.'
    });
  }

  return cards;
}

// ── Save analysis to Firestore ─────────────────────────────────────────────────

async function saveAnalysis(insight: Omit<FleetInsight, 'id'>): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'fleet_ai_analyses'), {
      ...insight,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.warn('[Fleet AI] Failed to save analysis to Firestore:', err);
    return `local-${Date.now()}`;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Analyzes the entire fleet based on the provided sessions.
 * Calls Gemini and saves result to Firestore.
 */
export async function analyzeFleet(sessions: RouteSession[]): Promise<FleetInsight> {
  if (sessions.length === 0) {
    throw new Error('No hay sesiones para analizar');
  }

  let insights: InsightCard[];
  let rawResponse = '';
  
  try {
    const prompt = buildFleetAnalysisPrompt(sessions);
    rawResponse = await callGemini(prompt);
    insights = parseGeminiResponse(rawResponse);
  } catch (err) {
    console.error('[Fleet AI] Gemini analysis failed, generating local report:', err);
    insights = buildLocalFleetInsights(sessions);
    rawResponse = `Local analysis fallback (Gemini inactive): ${err instanceof Error ? err.message : String(err)}`;
  }

  const analysis: Omit<FleetInsight, 'id'> = {
    analysisType: 'fleet',
    generatedAt: new Date().toISOString(),
    promptSummary: `Análisis de ${sessions.length} sesiones (${sessions.filter(s => s.status === 'open').length} activas) [Local Fallback]`,
    insights,
    rawResponse,
    sessionIds: sessions.map(s => s.id!).filter(Boolean),
    driverIds: [...new Set(sessions.map(s => s.driverId))],
  };

  const id = await saveAnalysis(analysis);
  return { id, ...analysis };
}

/**
 * Analyzes a single driver session with their historical context.
 */
export async function analyzeDriver(
  session: RouteSession,
  history: RouteSession[] = [],
): Promise<FleetInsight> {
  let insights: InsightCard[];
  let rawResponse = '';

  try {
    const prompt = buildDriverAnalysisPrompt(session, history);
    rawResponse = await callGemini(prompt);
    insights = parseGeminiResponse(rawResponse);
  } catch (err) {
    console.error('[Fleet AI] Driver Gemini analysis failed, generating local report:', err);
    insights = buildLocalDriverInsights(session, history);
    rawResponse = `Local analysis fallback (Gemini inactive): ${err instanceof Error ? err.message : String(err)}`;
  }

  const analysis: Omit<FleetInsight, 'id'> = {
    analysisType: 'driver',
    generatedAt: new Date().toISOString(),
    promptSummary: `Análisis individual: ${session.driverName} — Ruta ${session.routeName}`,
    insights,
    rawResponse,
    sessionIds: [session.id!],
    driverIds: [session.driverId],
  };

  const id = await saveAnalysis(analysis);
  return { id, ...analysis };
}

/**
 * Fetches the last N AI analyses from Firestore.
 */
export async function getRecentAnalyses(limitN = 10): Promise<FleetInsight[]> {
  const q = query(
    collection(db, 'fleet_ai_analyses'),
    orderBy('createdAt', 'desc'),
    limit(limitN),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FleetInsight));
}

// ── GPS Waypoint helpers ───────────────────────────────────────────────────────

/**
 * Saves a GPS waypoint to a session's waypoints subcollection.
 */
export async function saveWaypoint(sessionId: string, waypoint: GPSWaypoint): Promise<void> {
  await addDoc(collection(db, 'route_sessions', sessionId, 'waypoints'), {
    ...waypoint,
    savedAt: serverTimestamp(),
  });
}

/**
 * Fetches all waypoints for a session (for map replay or AI analysis).
 */
export async function getSessionWaypoints(sessionId: string): Promise<GPSWaypoint[]> {
  const q = query(
    collection(db, 'route_sessions', sessionId, 'waypoints'),
    orderBy('ts', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as GPSWaypoint);
}

/**
 * Subscribes to real-time waypoints for a session.
 */
export function subscribeToWaypoints(
  sessionId: string,
  callback: (waypoints: GPSWaypoint[]) => void,
) {
  const q = query(
    collection(db, 'route_sessions', sessionId, 'waypoints'),
    orderBy('ts', 'asc'),
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => d.data() as GPSWaypoint));
  });
}
