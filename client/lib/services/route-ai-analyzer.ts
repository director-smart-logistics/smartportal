/**
 * Route AI Analyzer
 *
 * Uses Gemini Vision to analyze a dashboard/odometer photo and extract:
 *  - Odometer/km reading
 *  - Fuel level (descriptive + estimated percentage)
 *
 * Uses the same VITE_GEMINI_API_KEY as the manifest processor.
 */

import type { DashboardAIResult } from './route-session-service';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_VISION_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

const PROMPT = `You are analyzing a photo of a vehicle dashboard/instrument cluster.
Your task is to extract two pieces of information:

1. ODOMETER reading (km or miles shown on the odometer display)
2. FUEL LEVEL (what the fuel gauge shows)

Respond ONLY with a valid JSON object like this (no markdown, no extra text):
{
  "kmReading": <number or null if not visible>,
  "fuelLevel": "<descriptive string: Full, 3/4, 1/2, 1/4, Reserve, Empty, or Unknown>",
  "fuelLevelPercent": <estimated percentage 0-100 or null if not visible>,
  "confidence": <0.0-1.0 — how confident you are in the readings>,
  "notes": "<optional brief note about image quality or anything relevant>"
}

If the odometer is not clearly visible, set kmReading to null.
If the fuel gauge is not clearly visible, set fuelLevel to "Unknown" and fuelLevelPercent to null.`;

interface GeminiVisionResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message: string; code: number };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
}

let geminiVisionDisabledUntil = 0;

/**
 * Checks if dashboard AI vision is enabled with a valid key.
 */
export function isDashboardAIEnabled(): boolean {
  if (geminiVisionDisabledUntil > Date.now()) return false;
  const key = GEMINI_API_KEY;
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed !== '' && trimmed !== 'undefined' && trimmed !== 'null' && trimmed !== 'false' && trimmed.length >= 15;
}

export function disableDashboardAI(reason?: string) {
  console.warn(`[route-ai] Disabling Gemini Vision for 1 hour: ${reason || 'API error'}`);
  geminiVisionDisabledUntil = Date.now() + 60 * 60 * 1000;
}

export async function analyzeDashboardImage(
  base64Image: string,
): Promise<DashboardAIResult> {
  if (!isDashboardAIEnabled()) {
    return {
      kmReading: undefined,
      fuelLevel: undefined,
      fuelLevelPercent: undefined,
      confidence: 0,
      notes: 'Lector inteligente inactivo',
    };
  }

  let mimeType = 'image/jpeg';
  let imageData = base64Image;

  if (base64Image.includes(',')) {
    const parts = base64Image.split(',');
    imageData = parts[1];
    const match = parts[0].match(/data:(image\/[a-zA-Z+.-]+);base64/);
    if (match) {
      mimeType = match[1];
    }
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          {
            inlineData: {
              mimeType,
              data: imageData,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature:     0.1,
      maxOutputTokens: 2048,
    },
  };

  try {
    const res = await fetch(`${GEMINI_VISION_URL}?key=${GEMINI_API_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => `HTTP ${res.status}`);
      console.warn('[route-ai] Gemini error response:', txt);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        disableDashboardAI(`HTTP ${res.status}`);
      }
      return {
        kmReading: undefined,
        fuelLevel: undefined,
        fuelLevelPercent: undefined,
        confidence: 0,
        notes: 'Lector inteligente no disponible',
      };
    }

    const data: GeminiVisionResponse = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!rawText) throw new Error('Respuesta vacía de la API de Gemini');

    try {
      const parsed = JSON.parse(stripMarkdown(rawText));
      return {
        kmReading:          parsed.kmReading   ?? undefined,
        fuelLevel:          parsed.fuelLevel   ?? undefined,
        fuelLevelPercent:   parsed.fuelLevelPercent ?? undefined,
        confidence:         typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        rawText,
      };
    } catch {
      throw new Error('La IA no pudo estructurar la información del tablero correctamente.');
    }
  } catch (err: any) {
    console.error('[route-ai] Error:', err);
    throw new Error(err?.message ?? 'Error de conexión de red.');
  }
}

export function evaluateKmDiscrepancy(
  enteredKm: number,
  aiKm: number | undefined,
): { discrepancy: number; isAcceptable: boolean; message: string } {
  if (aiKm == null || aiKm === 0) {
    return {
      discrepancy: 0,
      isAcceptable: true,
      message: 'No se pudo leer el odómetro en la imagen.',
    };
  }
  const diff = Math.abs(enteredKm - aiKm);
  const isAcceptable = diff <= 50;
  return {
    discrepancy: diff,
    isAcceptable,
    message: isAcceptable
      ? `El AI detectó ${aiKm.toLocaleString()} km (diferencia: ${diff} km ✓)`
      : `⚠ El AI detectó ${aiKm.toLocaleString()} km pero se ingresaron ${enteredKm.toLocaleString()} km (diferencia: ${diff} km)`,
  };
}
