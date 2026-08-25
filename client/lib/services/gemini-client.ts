/**
 * Gemini AI Client for Intelligent Manifest Processing
 * 
 * IMPORTANT: This client handles ONLY:
 * - Name verification and spelling correction
 * - Data validation and anomaly detection
 * - Customer matching (fuzzy search)
 * - Weight error detection
 * 
 * PRICING IS HANDLED BY:
 * - @/lib/pricing module (deterministic functions)
 * - NEVER ask Gemini to calculate prices
 * 
 * Cost Optimization:
 * - Batches multiple items in single requests
 * - Uses gemini-1.5-flash for speed and cost
 * - Caches results to avoid duplicate API calls
 */

import { MATCH_THRESHOLDS } from './matching/thresholds';

// API Key from environment variable for security
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
// Use gemini-flash-latest (latest stable flash model)
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// Cooldown timestamp — AI calls are suspended until this time (ms).
// Reset after GEMINI_COOLDOWN_MS to allow recovery from transient failures.
let geminiDisabledUntil = 0;
const GEMINI_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message: string;
    code: number;
  };
}

interface NameVerificationResult {
  original: string;
  corrected: string;
  confidence: number;
  issues: string[];
}

interface DataValidationResult {
  isValid: boolean;
  issues: Array<{
    field: string;
    type: 'error' | 'warning' | 'suggestion';
    message: string;
    suggestedValue?: string;
  }>;
  suggestions: string[];
}

interface ManifestRowData {
  tracking?: string;
  nombre?: string;
  peso?: number;
  [key: string]: unknown;
}

// Cache for name corrections to avoid duplicate API calls
const nameCorrectionsCache = new Map<string, NameVerificationResult>();

/**
 * Safely parse JSON from AI response, handling truncated/malformed responses
 * Returns null instead of throwing - caller should handle null case
 */
function safeParseJSON<T>(jsonStr: string): T | null {
  if (!jsonStr || typeof jsonStr !== 'string') return null;
  
  try {
    // Clean up markdown wrapping
    let cleaned = jsonStr.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    
    // Try direct parse first
    try {
      return JSON.parse(cleaned);
    } catch {
      // Continue to repair attempts
    }
    
    // Try to fix truncated arrays - find last complete object
    if (cleaned.startsWith('[')) {
      // Try multiple repair strategies
      const strategies = [
        // Strategy 1: Find last },{ and close array
        () => {
          const idx = cleaned.lastIndexOf('},{');
          if (idx > 0) return cleaned.slice(0, idx + 1) + ']';
          return null;
        },
        // Strategy 2: Find last }, and close array
        () => {
          const idx = cleaned.lastIndexOf('},');
          if (idx > 0) return cleaned.slice(0, idx + 1) + ']';
          return null;
        },
        // Strategy 3: Find last complete } and close array
        () => {
          const idx = cleaned.lastIndexOf('}');
          if (idx > 0) return cleaned.slice(0, idx + 1) + ']';
          return null;
        },
      ];
      
      for (const strategy of strategies) {
        const fixed = strategy();
        if (fixed) {
          try {
            return JSON.parse(fixed);
          } catch {
            // Try next strategy
          }
        }
      }
    }
    
    // Try to fix truncated objects
    if (cleaned.startsWith('{')) {
      // Find last complete closing brace
      let braceCount = 0;
      let lastValidEnd = -1;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') braceCount++;
        if (cleaned[i] === '}') {
          braceCount--;
          if (braceCount === 0) lastValidEnd = i;
        }
      }
      if (lastValidEnd > 0) {
        try {
          return JSON.parse(cleaned.slice(0, lastValidEnd + 1));
        } catch {
          // Give up
        }
      }
    }
    
    return null;
  } catch {
    // Catch-all for any unexpected errors
    return null;
  }
}

/**
 * Call Gemini API with retry logic
 */
async function callGeminiAPI(prompt: string, retries = 3): Promise<string> {
  // Skip if in cooldown period from a previous failure
  if (Date.now() < geminiDisabledUntil) {
    throw new Error('Gemini API temporarily unavailable (cooldown)');
  }

  // Check if API key is configured
  if (!GEMINI_API_KEY) {
    geminiDisabledUntil = Infinity; // no key = permanent disable
    console.warn('[Gemini] No API key configured - AI verification disabled');
    throw new Error('Gemini API key not configured');
  }
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1, // Low temperature for consistent results
            maxOutputTokens: 2048,
            topP: 0.8,
            topK: 40,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (!response) {
        throw new Error('Response object is undefined (mock or network failure)');
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        const errMsg = errorData.error?.message || '';
        
        if (status === 400 || status === 403 || errMsg.includes('suspended') || errMsg.includes('API_KEY') || errMsg.includes('key is invalid') || errMsg.includes('KEY_INVALID') || errMsg.includes('blocked')) {
          geminiDisabledUntil = Infinity; // disable permanently for this session
          console.warn(`[Gemini] API Key blocked, invalid, or suspended (Status ${status}: ${errMsg}). Disabling AI services for this session.`);
          throw new Error(`Gemini API permanently disabled for this session: ${status} - ${errMsg}`);
        }
        
        throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data: GeminiResponse = await response.json();
      
      if (data.error) {
        const errMsg = data.error.message || '';
        if (data.error.code === 400 || data.error.code === 403 || errMsg.includes('suspended') || errMsg.includes('API_KEY') || errMsg.includes('key is invalid') || errMsg.includes('KEY_INVALID') || errMsg.includes('blocked')) {
          geminiDisabledUntil = Infinity;
          console.warn(`[Gemini] API Key blocked, invalid, or suspended in body (Code ${data.error.code}: ${errMsg}). Disabling AI services for this session.`);
          throw new Error(`Gemini API permanently disabled for this session: ${data.error.code} - ${errMsg}`);
        }
        throw new Error(`Gemini API error: ${data.error.message}`);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }

      return text;
    } catch (error) {
      if (geminiDisabledUntil === Infinity) {
        throw error; // do not retry if permanently disabled
      }
      if (attempt === retries - 1) {
        // Enter cooldown after all retries fail — recovers automatically after 10 min
        geminiDisabledUntil = Date.now() + GEMINI_COOLDOWN_MS;
        console.warn('[Gemini] API entering 10-min cooldown after repeated failures');
        throw error;
      }
      // Exponential backoff with jitter to avoid thundering herd under rate limits
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000 + Math.random() * 500));
    }
  }
  geminiDisabledUntil = Date.now() + GEMINI_COOLDOWN_MS;
  throw new Error('Max retries reached');
}

/**
 * Verify and correct names using Gemini AI
 * Batches names for cost efficiency
 */
export async function verifyNames(names: string[]): Promise<Map<string, NameVerificationResult>> {
  const results = new Map<string, NameVerificationResult>();
  const namesToProcess: string[] = [];

  // Check cache first
  for (const name of names) {
    const cached = nameCorrectionsCache.get(name.toUpperCase());
    if (cached) {
      results.set(name, cached);
    } else {
      namesToProcess.push(name);
    }
  }

  if (namesToProcess.length === 0) {
    return results;
  }

  // Batch process names (max 50 per batch for optimal performance)
  const batchSize = 50;
  for (let i = 0; i < namesToProcess.length; i += batchSize) {
    const batch = namesToProcess.slice(i, i + batchSize);
    
    const prompt = `TAREA: Verificar ortografía de nombres de clientes.

CONTEXTO: Sistema de paquetería Costa Rica. Nombres de manifiestos USA/México/China/Colombia con posibles errores OCR/digitación.

REGLAS:
1. ACENTOS: Agregar en apellidos hispanos (Pérez, García, González, Rodríguez, López, Martínez, Hernández, Díaz, Sánchez, Ramírez)
2. NÚMEROS: Eliminar si no pertenecen ("JUAN123" → "JUAN")
3. CARACTERES ESPECIALES: Eliminar # * @ % = + y similares. MANTENER guiones entre palabras (García-López → García-López) y apóstrofes de origen (O'Connor → O'Connor). NUNCA eliminar guiones ni apóstrofes válidos.
4. TRUNCADO: Marcar pero no inventar
5. MAYÚSCULAS: Mantener
6. CORRECTO: Devolver igual

NOMBRES:
${batch.map((n, idx) => `${idx + 1}. "${n}"`).join('\n')}

RESPONDE JSON PURO (sin markdown):
[{"original":"NOMBRE","corrected":"CORREGIDO","confidence":0.0-1.0,"issues":[]}]`;

    try {
      const response = await callGeminiAPI(prompt);
      
      // Parse JSON response using safe parser (handles truncated responses)
      const corrections = safeParseJSON<NameVerificationResult[]>(response);
      
      if (!corrections || !Array.isArray(corrections)) {
        throw new Error('Invalid AI response format');
      }
      
      for (const correction of corrections) {
        const result: NameVerificationResult = {
          original: correction.original,
          corrected: correction.corrected?.toUpperCase() || correction.original.toUpperCase(),
          confidence: correction.confidence || 1.0,
          issues: correction.issues || [],
        };
        
        results.set(correction.original, result);
        // Evict cache before it grows unbounded across many manifests
        if (nameCorrectionsCache.size > 2000) nameCorrectionsCache.clear();
        nameCorrectionsCache.set(correction.original.toUpperCase(), result);
      }
    } catch {
      // AI name verification failed - silently use names unchanged
      // On error, return names unchanged
      for (const name of batch) {
        const result: NameVerificationResult = {
          original: name,
          corrected: name.toUpperCase(),
          confidence: 0.5,
          issues: ['No se pudo verificar con IA'],
        };
        results.set(name, result);
      }
    }
  }

  return results;
}

/**
 * Validate manifest data intelligently
 * Detects anomalies, inconsistencies, and suggests corrections
 */
export async function validateManifestData(
  rows: ManifestRowData[],
  manifestType: string
): Promise<DataValidationResult> {
  const issues: DataValidationResult['issues'] = [];
  const suggestions: string[] = [];

  // Sample rows for AI analysis (max 20 for cost efficiency) — deterministic systematic sampling
  const sampleSize = Math.min(20, rows.length);
  const step = rows.length <= sampleSize ? 1 : Math.floor(rows.length / sampleSize);
  const sampleRows = rows.filter((_, i) => i % step === 0).slice(0, sampleSize);

  // Calculate statistics for weight anomaly detection using median + IQR (Tukey fences).
  // Mean + stdDev is non-robust: a single outlier skews both values so the threshold
  // becomes too wide to flag the outlier itself. IQR is based on the middle 50% of data
  // and remains stable regardless of extreme values.
  const weights = rows.map(r => r.peso || 0).filter(w => w > 0);
  const sortedWeights = [...weights].sort((a, b) => a - b);
  const median = (arr: number[]) => {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };
  const q1 = median(sortedWeights.slice(0, Math.floor(sortedWeights.length / 2)));
  const q3 = median(sortedWeights.slice(Math.ceil(sortedWeights.length / 2)));
  const iqr = q3 - q1;
  const lowerFence = q1 - 3 * iqr;
  const upperFence = q3 + 3 * iqr;
  const medianWeight = median(sortedWeights);

  // Detect weight anomalies (outside Tukey 3×IQR fences)
  rows.forEach((row, idx) => {
    const weight = row.peso || 0;
    if (weight > 0 && (weight < lowerFence || weight > upperFence)) {
      issues.push({
        field: 'peso',
        type: 'warning',
        message: `Fila ${idx + 1}: Peso inusual (${weight}kg). Mediana: ${medianWeight.toFixed(2)}kg`,
      });
    }
  });

  // Detect tracking format issues
  rows.forEach((row, idx) => {
    const tracking = row.tracking || '';
    if (tracking && tracking.length < 5) {
      issues.push({
        field: 'tracking',
        type: 'error',
        message: `Fila ${idx + 1}: Tracking muy corto (${tracking})`,
      });
    }
  });

  // Use AI for pattern detection on sample
  if (sampleRows.length > 0) {
    const manifestTypeDescriptions: Record<string, string> = {
    'usa_air': 'Aéreo desde USA - paquetes pequeños típicos de Amazon, eBay, tiendas online (0.1-30kg)',
    'usa_sea': 'Marítimo desde USA - carga más grande, contenedores (1-500kg)',
    'mexico_air': 'Aéreo desde México - paquetes medianos (0.1-20kg)',
    'mexico_sea': 'Marítimo desde México - carga general (1-200kg)',
    'china_air': 'Aéreo desde China - AliExpress, Temu, Shein (0.05-10kg típico)',
    'china_sea': 'Marítimo desde China - carga consolidada (1-1000kg)',
    'colombia_air': 'Aéreo desde Colombia - paquetes (0.1-20kg)',
    'colombia_sea': 'Marítimo desde Colombia - carga (1-200kg)',
  };

  const typeDesc = manifestTypeDescriptions[manifestType] || 'Envío general';
  
  const prompt = `TAREA: Validar datos de manifiesto de envíos y detectar anomalías.

TIPO DE MANIFIESTO: ${manifestType}
DESCRIPCIÓN: ${typeDesc}

ESTADÍSTICAS:
- Total filas: ${rows.length}
- Peso mediana: ${medianWeight.toFixed(2)}kg
- Rango intercuartil (IQR): ${iqr.toFixed(2)}kg

MUESTRA DE DATOS (${sampleRows.length} filas):
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}

VALIDACIONES A REALIZAR:
1. TRACKING: ¿Formato válido? ¿Longitud apropiada? (mínimo 8 caracteres típico)
2. NOMBRES: ¿Parecen nombres reales? ¿Hay datos corruptos?
3. PESOS: ¿Están en rango razonable para el tipo de envío?
4. DUPLICADOS: ¿Hay trackings repetidos?
5. CONSISTENCIA: ¿Los datos son coherentes entre sí?

CRITERIOS DE PESO POR TIPO:
- Aéreo USA/México: Normal 0.1-30kg, Sospechoso >50kg
- Aéreo China: Normal 0.05-10kg, Sospechoso >20kg
- Marítimo: Normal 1-500kg, Sospechoso >1000kg

RESPONDE SOLO JSON (sin markdown):
{"patterns":["patrones encontrados"],"warnings":["problemas detectados"],"suggestions":["mejoras sugeridas"]}`;

    try {
      const response = await callGeminiAPI(prompt);
      const analysis = safeParseJSON<{ patterns?: string[]; warnings?: string[]; suggestions?: string[] }>(response);
      
      if (!analysis) {
        console.warn('[Gemini] Could not parse validation response');
        return { isValid: true, issues, suggestions };
      }
      
      if (analysis.warnings && Array.isArray(analysis.warnings)) {
        for (const warning of analysis.warnings) {
          issues.push({
            field: 'general',
            type: 'warning',
            message: String(warning),
          });
        }
      }
      
      if (analysis.suggestions && Array.isArray(analysis.suggestions)) {
        suggestions.push(...analysis.suggestions.map(s => String(s)));
      }
    } catch (error) {
      console.error('Error in AI validation:', error);
    }
  }

  return {
    isValid: issues.filter(i => i.type === 'error').length === 0,
    issues,
    suggestions,
  };
}

/**
 * Match customer names to existing customers using fuzzy matching
 */
export async function matchCustomerNames(
  names: string[],
  existingCustomers: Array<{ id: string; fullName: string; slCode: string; route?: string }>
): Promise<Map<string, { customerId: string; slCode: string; route: string; confidence: number }>> {
  const results = new Map<string, { customerId: string; slCode: string; route: string; confidence: number }>();
  
  // Build a lookup map for exact matches first
  const exactMatchMap = new Map<string, typeof existingCustomers[0]>();
  for (const customer of existingCustomers) {
    exactMatchMap.set(customer.fullName.toUpperCase(), customer);
  }

  const namesToMatch: string[] = [];
  
  // Check exact matches first
  for (const name of names) {
    const upperName = name.toUpperCase();
    const exact = exactMatchMap.get(upperName);
    if (exact) {
      results.set(name, {
        customerId: exact.id,
        slCode: exact.slCode || '',
        route: exact.route || '',
        confidence: 1.0,
      });
    } else {
      namesToMatch.push(name);
    }
  }

  if (namesToMatch.length === 0 || existingCustomers.length === 0) {
    return results;
  }

  // Use AI for fuzzy matching remaining names
  const customerList = existingCustomers.map(c => ({
    id: c.id,
    name: c.fullName,
    slCode: c.slCode,
    route: c.route || '',
  }));

  // Batch process (max 30 names per batch)
  const batchSize = 30;
  for (let i = 0; i < namesToMatch.length; i += batchSize) {
    const batch = namesToMatch.slice(i, i + batchSize);
    
    const prompt = `TAREA: Emparejar nombres con clientes en BD.

CLIENTES (${Math.min(100, customerList.length)}):
${JSON.stringify(customerList.slice(0, 100))}

NOMBRES A EMPAREJAR:
${batch.map((n, idx) => `${idx + 1}. "${n}"`).join('\n')}

REGLAS:
- EXACTO (ignorar acentos/mayúsculas): confidence 1.0
- SIMILAR (variaciones ortográficas): confidence 0.8-0.95
- PARCIAL (solo nombre O apellido): confidence 0.6-0.75
- DUDOSO (confidence < 0.6): matchedId = null

VARIACIONES: PEREZ=PÉREZ, orden invertido, MA.=MARIA, DELACRUZ=DE LA CRUZ

JSON PURO (sin markdown):
[{"input":"NOMBRE","matchedId":"ID_O_NULL","matchedSlCode":"SL","matchedRoute":"RUTA","confidence":0.0-1.0}]`;

    try {
      const response = await callGeminiAPI(prompt);
      const matches = safeParseJSON<Array<{ input: string; matchedId: string; matchedSlCode?: string; matchedRoute?: string; confidence: number }>>(response);
      
      if (!matches || !Array.isArray(matches)) {
        console.warn('[Gemini] Could not parse customer matching response');
        return results;
      }
      
      for (const match of matches) {
        if (match.matchedId && match.confidence >= 0.6) {
          results.set(match.input, {
            customerId: match.matchedId,
            slCode: match.matchedSlCode || '',
            route: match.matchedRoute || '',
            confidence: match.confidence,
          });
        }
      }
    } catch (error) {
      console.error('Error in customer matching, falling back to local matcher:', error);
      try {
        const { findCustomerMatch } = await import('./customer-matcher');
        for (const name of batch) {
          const localMatch = await findCustomerMatch(name);
          if (localMatch.bestMatch && localMatch.bestMatch.score >= 0.60) {
            results.set(name, {
              customerId: localMatch.bestMatch.customer.id,
              slCode: localMatch.bestMatch.customer.slCode || '',
              route: localMatch.bestMatch.customer.ruta || '',
              confidence: localMatch.bestMatch.score,
            });
          }
        }
      } catch (fallbackErr) {
        console.error('[Gemini Fallback] Local matching fallback failed:', fallbackErr);
      }
    }
  }

  return results;
}

/**
 * Intelligent weight correction
 * Detects common weight entry errors and suggests corrections
 */
export async function correctWeights(
  weights: Array<{ row: number; value: number; tracking: string }>
): Promise<Map<number, { corrected: number; reason: string }>> {
  const results = new Map<number, { corrected: number; reason: string }>();
  
  // Calculate statistics for anomaly detection
  const values = weights.map(w => w.value).filter(v => v > 0);
  const avgWeight = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 1;
  const stdDev = values.length > 1 
    ? Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avgWeight, 2), 0) / values.length)
    : avgWeight * 0.5;
  
  // Common patterns: decimal point errors (0.25 vs 25, 1.5 vs 150)
  const anomalies = weights.filter(w => {
    // Statistical anomaly: more than 3 standard deviations from mean
    const isStatisticalAnomaly = Math.abs(w.value - avgWeight) > 3 * stdDev;
    // Fixed threshold anomalies
    const isFixedAnomaly = w.value > 50 || w.value < 0.01;
    // Suspicious patterns (likely decimal errors)
    const isSuspiciousPattern = w.value > 100 || (w.value > 10 && w.value === Math.floor(w.value) && avgWeight < 5);
    
    return isStatisticalAnomaly || isFixedAnomaly || isSuspiciousPattern;
  });

  if (anomalies.length === 0) {
    return results;
  }

  const prompt = `TAREA: Detectar y corregir errores en pesos de paquetes.

CONTEXTO:
- Paquetes de envío aéreo (rango normal: 0.1kg - 30kg)
- Los errores comunes incluyen:
  * Punto decimal mal ubicado (150 debería ser 1.50, 25 debería ser 2.5)
  * Unidades incorrectas (libras ingresadas como kg)
  * Ceros extra o faltantes

PESOS ANÓMALOS DETECTADOS:
${anomalies.map(a => `Fila ${a.row}: ${a.value}kg (tracking: ${a.tracking})`).join('\n')}

REGLAS DE CORRECCIÓN:
1. Si peso > 100 y parece error decimal: dividir por 100 (ej: 150 → 1.5)
2. Si peso > 30 y < 100: posible error de factor 10 (ej: 25 → 2.5)
3. Si peso parece en libras (>30 pero razonable): convertir a kg (÷ 2.205)
4. Si peso < 0.01: posible error, multiplicar por 100
5. Si peso parece correcto para carga especial: mantener y marcar "OK"

RESPONDE SOLO JSON ARRAY:
[{"row":NUMERO,"original":PESO_ORIGINAL,"corrected":PESO_CORREGIDO,"reason":"EXPLICACION"}]

EJEMPLOS:
- 150 → 1.5 ("Error decimal: dividido por 100")
- 25 → 2.5 ("Error decimal: dividido por 10")
- 45 → 20.4 ("Convertido de libras a kg")
- 0.001 → 0.1 ("Error decimal: multiplicado por 100")`;

  try {
    const response = await callGeminiAPI(prompt);
    const corrections = safeParseJSON<Array<{ row: number; original: number; corrected: number; reason: string }>>(response);
    
    if (!corrections || !Array.isArray(corrections)) {
      console.warn('[Gemini] Could not parse weight correction response');
      return results;
    }
    
    for (const correction of corrections) {
      if (correction.original !== correction.corrected) {
        results.set(correction.row, {
          corrected: correction.corrected,
          reason: correction.reason,
        });
      }
    }
  } catch (err) {
    console.error('Error in weight correction, falling back to local heuristic:', err);
    for (const a of anomalies) {
      if (a.value > 100) {
        results.set(a.row, { corrected: Number((a.value / 100).toFixed(3)), reason: 'Ajuste decimal local (÷100)' });
      } else if (a.value > 30) {
        results.set(a.row, { corrected: Number((a.value / 10).toFixed(3)), reason: 'Ajuste decimal local (÷10)' });
      } else if (a.value < 0.01 && a.value > 0) {
        results.set(a.row, { corrected: Number((a.value * 100).toFixed(3)), reason: 'Ajuste decimal local (×100)' });
      }
    }
  }

  return results;
}

/**
 * AI-assisted customer matching
 * Uses Gemini to find best match when algorithmic matching is uncertain
 */
export interface AIMatchCandidate {
  slCode: string;
  name: string;
  score: number;
}

export interface AIMatchResult {
  searchName: string;
  bestMatch: {
    slCode: string;
    name: string;
    confidence: number;
    reasoning: string;
  } | null;
  alternativeMatches: Array<{
    slCode: string;
    name: string;
    confidence: number;
  }>;
}

/**
 * Use AI to select best customer match from candidates
 * Smart prompt designed for Spanish name matching
 */
export async function aiSelectBestMatch(
  searchName: string,
  candidates: AIMatchCandidate[],
  additionalContext?: string
): Promise<AIMatchResult> {
  const result: AIMatchResult = {
    searchName,
    bestMatch: null,
    alternativeMatches: []
  };

  if (candidates.length === 0) {
    return result;
  }

  // If only one candidate with high score, return it directly
  if (candidates.length === 1 && candidates[0].score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN * 100) {
    result.bestMatch = {
      slCode: candidates[0].slCode,
      name: candidates[0].name,
      confidence: candidates[0].score,
      reasoning: 'Único candidato con alta coincidencia'
    };
    return result;
  }

  const prompt = `Eres un experto en coincidencia de nombres en Costa Rica. Tu tarea es seleccionar el mejor candidato de forma estricta.
Si hay cualquier duda o ambigüedad, pon bestMatch: null. Está PROHIBIDO adivinar.

NOMBRE A BUSCAR: "${searchName}"

CANDIDATOS (slCode | nombre | score_algoritmo):
${candidates.map((c, i) => `${i + 1}. ${c.slCode} | ${c.name} | ${c.score}%`).join('\n')}

${additionalContext ? `CONTEXTO ADICIONAL: ${additionalContext}` : ''}

REGLAS DE DECISIÓN:
1. VARIACIONES VÁLIDAS: Orden invertido (apellido/nombre), apodos comunes (pepe=jose, kike=enrique), errores tipográficos menores (1-2 letras).
2. REGLA ANTI-HOMÓNIMO: Si hay candidatos con apellidos parecidos y el nombre buscado no tiene suficiente detalle para distinguir cuál es (ej. solo apellidos o inicial ambigua), pon "bestMatch": null.
3. NO ADIVINES: Si no estás seguro al 98% o más, pon "bestMatch": null.
4. CONFIDENCIA: Si la confianza calculada es menor al 98%, pon "bestMatch": null.

RESPONDE SOLO EN JSON (sin markdown):
{
  "bestMatch": {
    "index": 1,
    "confidence": 95,
    "reasoning": "Razón breve"
  },
  "alternatives": []
}

Si no estás seguro o ningún candidato es excelente, responde: {"bestMatch": null, "alternatives": []}`;

  try {
    const response = await callGeminiAPI(prompt);
    const parsed = safeParseJSON<{ bestMatch?: { index: number; confidence: number; reasoning?: string }; alternatives?: Array<{ index: number; confidence: number }> }>(response);
    
    if (parsed && parsed.bestMatch && parsed.bestMatch.index >= 1 && parsed.bestMatch.index <= candidates.length) {
      const selected = candidates[parsed.bestMatch.index - 1];
      result.bestMatch = {
        slCode: selected.slCode,
        name: selected.name,
        confidence: parsed.bestMatch.confidence || selected.score,
        reasoning: parsed.bestMatch.reasoning || ''
      };
    }
    
    if (parsed && parsed.alternatives && Array.isArray(parsed.alternatives)) {
      result.alternativeMatches = parsed.alternatives
        .filter((alt: any) => alt.index >= 1 && alt.index <= candidates.length)
        .map((alt: any) => ({
          slCode: candidates[alt.index - 1].slCode,
          name: candidates[alt.index - 1].name,
          confidence: alt.confidence || 50
        }));
    }
  } catch {
    // AI parsing failed - silently fall back to algorithmic best (this is expected behavior)
    // Fallback: use highest scoring candidate
    const best = candidates.reduce((a, b) => a.score > b.score ? a : b);
    if (best.score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN * 100) {
      result.bestMatch = {
        slCode: best.slCode,
        name: best.name,
        confidence: best.score,
        reasoning: 'Selección algorítmica (AI no disponible)'
      };
    } else {
      result.bestMatch = null;
    }
  }

  return result;
}

/**
 * Use AI to find potential matches from a customer list
 * For cases where algorithmic matching found nothing
 */
export async function aiFindPotentialMatches(
  searchName: string,
  customerNames: Array<{ slCode: string; name: string }>,
  maxResults: number = 5
): Promise<Array<{ slCode: string; name: string; confidence: number; reasoning: string }>> {
  if (customerNames.length === 0) return [];

  // Limit customers sent to AI to avoid token limits
  const sampleSize = Math.min(customerNames.length, 100);
  const sample = customerNames.slice(0, sampleSize);

  const prompt = `Eres un experto en coincidencia de nombres. Tu tarea es buscar posibles coincidencias de forma estricta.
NUNCA adivines. Si no hay coincidencia clara con alta seguridad, responde un arreglo vacío [].

BUSCAR: "${searchName}"

LISTA DE CLIENTES:
${sample.map((c, i) => `${c.slCode} | ${c.name}`).join('\n')}

REGLAS DE DECISIÓN:
1. Solo empareja si hay alta seguridad (orden invertido, apodos comunes, typos menores).
2. REGLA ANTI-HOMÓNIMO: Si hay múltiples clientes con apellidos parecidos y el nombre a buscar no los diferencia claramente, NO los listes (devuelve []).
3. Confianza: Solo reporta matches con confianza >= 98%.

RESPONDE SOLO JSON (sin markdown):
[
  {"slCode": "SL123", "confidence": 95, "reasoning": "Mismo nombre invertido"}
]

Si no hay un candidato seguro, responde: []`;

  try {
    const response = await callGeminiAPI(prompt);
    const parsed = safeParseJSON<Array<{ slCode: string; confidence: number; reasoning?: string }>>(response);
    
    if (parsed && Array.isArray(parsed)) {
      return parsed
        .filter((m: any) => m.slCode && m.confidence >= MATCH_THRESHOLDS.AI_SEARCH_ACCEPT_CONFIDENCE)
        .slice(0, maxResults)
        .map((m: any) => {
          const customer = sample.find(c => c.slCode === m.slCode);
          return {
            slCode: m.slCode,
            name: customer?.name || '',
            confidence: m.confidence,
            reasoning: m.reasoning || ''
          };
        });
    }
  } catch {
    // AI search failed - silently return empty results
  }

  return [];
}

// ─── Batch disambiguation ──────────────────────────────────────────────────────

export interface BatchMatchItem {
  id: number;
  searchName: string;
  candidates: AIMatchCandidate[];
  learnedHint?: string;
}

export interface BatchMatchResult {
  id: number;
  slCode: string | null;
  confidence: number;
}

/**
 * Disambiguate up to 15 uncertain manifest names in ONE Gemini call.
 *
 * Replaces the previous pattern of 1 AI call per name (5 concurrent) with
 * 15 names per call (3 concurrent batches) — roughly 10× fewer API round-trips
 * for the same manifest, reducing AI-pass latency from ~12 s to ~2-3 s.
 */
export async function aiSelectBestMatchBatch(
  items: BatchMatchItem[]
): Promise<BatchMatchResult[]> {
  if (items.length === 0) return [];

  const resolved: BatchMatchResult[] = [];
  const toProcess: BatchMatchItem[] = [];

  for (const item of items) {
    if (item.candidates.length === 1 && item.candidates[0].score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN * 100) {
      resolved.push({ id: item.id, slCode: item.candidates[0].slCode, confidence: item.candidates[0].score });
    } else {
      toProcess.push(item);
    }
  }

  if (toProcess.length === 0) return resolved;

  // ── Token-overflow guard ────────────────────────────────────────────────────
  // 12 items × 4 candidates × ~40 chars each ≈ 1 920 chars — well within limits.
  // Truncate candidate names to 35 chars to prevent runaway context.
  const safeItems = toProcess.slice(0, 12).map(item => ({
    ...item,
    candidates: item.candidates.slice(0, 4).map(c => ({
      ...c,
      name: c.name.slice(0, 35),
    })),
  }));

  const caseBlocks = safeItems.map(item => {
    const hint = item.learnedHint ? `\n  [CONFIRMADO ANTES: ${item.learnedHint}]` : '';
    const cands = item.candidates.map((c, i) => `${i + 1}) ${c.slCode}="${c.name}"(${c.score}%)`).join(' | ');
    return `CASO ${item.id}: "${item.searchName}"${hint}\n  Candidatos: ${cands}`;
  }).join('\n\n');

  const prompt = `Eres experto en nombres de Costa Rica. Tu objetivo es CERO errores de asignación en manifiestos de ruta y bodega. Ante la menor duda o ambigüedad, devuelve null.

${caseBlocks}

REGLAS DE NO-ADIVINACIÓN (CRÍTICAS):
1. REGLA ANTI-HOMÓNIMO: Si dos o más candidatos comparten apellido(s) y el nombre buscado no tiene suficiente detalle para distinguir cuál es (ej. sólo apellidos, o sólo inicial de nombre), SIEMPRE devuelve slCode null. Está prohibido adivinar.
2. Si no estás seguro con al menos 98% de confianza, devuelve slCode null y confidence 0.
3. Equivalencias permitidas si no hay ambigüedad: Orden invertido (apellido/nombre), apodos comunes (Pepe=Jose, Kike=Enrique, Chema=Jose Maria), typos leves de 1 letra.
4. Calibración: exacto=98, invertido=98, apodo conocido=98, typo leve=98. Si calculas una confianza menor a 98, usa slCode null.

RESPONDE ÚNICAMENTE JSON puro (sin markdown, sin código, sin texto extra):
[{"id":1,"slCode":"SL123","confidence":95},{"id":2,"slCode":null,"confidence":0}]`;

  try {
    const response = await callGeminiAPI(prompt);
    const parsed = safeParseJSON<Array<{ id: number; slCode: string | null; confidence: number }>>(response);
    if (parsed && Array.isArray(parsed)) {
      const batchResults: BatchMatchResult[] = parsed.map(r => ({
        id: r.id,
        slCode: r.slCode && (r.confidence ?? 0) >= MATCH_THRESHOLDS.AI_ACCEPT_CONFIDENCE ? r.slCode : null,
        confidence: r.confidence ?? 0,
      }));
      return [...resolved, ...batchResults];
    }
  } catch {
    // Fall through — caller keeps algorithmic best
  }
  return [...resolved, ...safeItems.map(item => ({ id: item.id, slCode: null, confidence: 0 }))];
}

// ─── Batch search for no-match names ──────────────────────────────────────────

export interface BatchSearchItem {
  id: number;
  searchName: string;
  candidates: Array<{ slCode: string; name: string }>;
}

/**
 * Find potential matches for multiple no-match names in ONE Gemini call.
 *
 * Each item has its own candidate subset (built by token/phonetic pre-filter).
 * Replaces the previous pattern of 10 concurrent individual aiFindPotentialMatches
 * calls with 1 batched call — dramatically reduces API round-trips.
 *
 * Returns a Map<id, matches[]> for the caller to apply per-name.
 */
export async function aiFindPotentialMatchesBatch(
  items: BatchSearchItem[]
): Promise<Map<number, Array<{ slCode: string; name: string; confidence: number }>>> {
  const resultMap = new Map<number, Array<{ slCode: string; name: string; confidence: number }>>();
  if (items.length === 0) return resultMap;

  // Guard: 10 items × ~25 candidates × 25 chars ≈ safe context
  const safeItems = items.slice(0, 10).map(item => ({
    ...item,
    candidates: item.candidates.slice(0, 25).map(c => ({
      slCode: c.slCode,
      name: c.name.slice(0, 30),
    })),
  }));

  const caseBlocks = safeItems.map(item => {
    const cands = item.candidates.map(c => `${c.slCode}="${c.name}"`).join(' | ');
    return `CASO ${item.id}: "${item.searchName}"\n  Lista: ${cands || '(sin candidatos — devuelve matches vacío [])'}`;
  }).join('\n\n');

  const prompt = `Eres experto en nombres de Costa Rica. Encuentra el candidato correcto de la lista para cada caso. CERO tolerancia a errores de asignación.
CRÍTICO: NUNCA inventes slCodes. Solo usa slCodes de la Lista de cada caso.

${caseBlocks}

REGLAS DE NO-ADIVINACIÓN (CRÍTICAS):
1. REGLA ANTI-HOMÓNIMO: Si hay dos o más candidatos con apellidos parecidos y el nombre buscado no tiene suficiente detalle para distinguir cuál es, devuelve matches vacío [] para ese caso.
2. Si no estás seguro con al menos 98% de confianza, devuelve matches vacío []. Está prohibido adivinar.
3. Calibración: exacto=98, invertido=98, apodo conocido=98, typo leve=98. Si confidence es menor a 98, devuelve matches vacío [].

RESPONDE SOLO JSON puro (sin markdown):
[{"id":1,"matches":[{"slCode":"SL123","confidence":95}]},{"id":2,"matches":[]}]`;

  try {
    const response = await callGeminiAPI(prompt);
    const parsed = safeParseJSON<Array<{ id: number; matches: Array<{ slCode: string; confidence: number }> }>>(response);
    if (parsed && Array.isArray(parsed)) {
      for (const item of parsed) {
        const original = safeItems.find(i => i.id === item.id);
        if (!original) continue;
        const results = (item.matches || [])
          .filter(m => m.slCode && (m.confidence ?? 0) >= MATCH_THRESHOLDS.AI_SEARCH_ACCEPT_CONFIDENCE)
          .map(m => ({
            slCode: m.slCode,
            name: original.candidates.find(c => c.slCode === m.slCode)?.name ?? '',
            confidence: m.confidence ?? 0,
          }));
        resultMap.set(item.id, results);
      }
    }
  } catch {
    // Fall through — caller handles empty results
  }

  // Ensure every input id has an entry (empty array = no match found)
  for (const item of safeItems) {
    if (!resultMap.has(item.id)) resultMap.set(item.id, []);
  }
  return resultMap;
}

export interface EncomiendaServiceSuggestion {
  description: string;
  amount: number;
  confidence: number;
  reasoning: string;
}

/**
 * Uses Gemini to analyze past third-party service entries for an encomienda
 * customer and suggest the most appropriate service charge for the next manifest.
 *
 * Returns null if Gemini is unavailable or the history is too sparse.
 */
export async function suggestEncomiendaService(
  customerName: string,
  history: Array<{ description: string; amount: number }>,
): Promise<EncomiendaServiceSuggestion | null> {
  if (!history.length) return null;
  const historyText = history
    .map((h, i) => `${i + 1}. "${h.description}" = $${h.amount.toFixed(2)}`)
    .join('\n');
  const prompt = `Eres un asistente de logística costarricense. Analiza el historial de cargos de servicio de terceros para un cliente de encomiendas y sugiere el cargo más apropiado para el próximo manifiesto.

Cliente: ${customerName}

Historial de cargos de servicios manuales en facturas anteriores:
${historyText}

Basado en este historial, devuelve UN único objeto JSON (sin markdown) con la sugerencia más apropiada:
{
  "description": "descripción del servicio en español",
  "amount": 4.21,
  "confidence": 0.85,
  "reasoning": "breve explicación en español de por qué se sugiere esto"
}

Reglas ESTRICTAS:
- PRESERVA el sufijo de colones exactamente como aparece en el historial, por ejemplo: "SERVICIO DE TERCERO (₡2,000 TC:475)"
- NO elimines ni modifiques el formato (₡X TC:Y) — es parte fundamental de la descripción
- Si hay variaciones del sufijo CRC, usa el monto CRC más frecuente
- El campo "amount" debe ser el monto en USD (monto CRC dividido entre el TC)
- Quita solo los números de tracking largos entre paréntesis (ej: (TBA123456789))
- Si hay patrones claros usa el más frecuente
- confidence entre 0 y 1`;
  try {
    const raw = await callGeminiAPI(prompt, 2);
    const parsed = safeParseJSON<EncomiendaServiceSuggestion>(raw);
    if (
      parsed &&
      typeof parsed.description === 'string' &&
      typeof parsed.amount === 'number' &&
      parsed.amount > 0
    ) {
      return {
        description: parsed.description,
        amount: Math.round(parsed.amount * 100) / 100,
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.7)),
        reasoning: parsed.reasoning ?? '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the name corrections cache and reset the disabled flag.
 * Primarily used in tests to restore a clean state between runs.
 */
export function clearNameCache(): void {
  nameCorrectionsCache.clear();
  geminiDisabledUntil = 0;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { nameCorrections: number } {
  return {
    nameCorrections: nameCorrectionsCache.size,
  };
}

/**
 * Translates a natural language search query into JQL for packages filtering.
 */
export async function translateToJQL(naturalQuery: string): Promise<string> {
  const prompt = `You are a helper that translates natural language queries into a precise Jira-like Query Language (JQL) for packages.
The supported fields are:
- tracking (aliases: t) - tracking number (e.g. 1Z9999999999999999 or suffix like 1234)
- status (aliases: s) - state of the package (pre_alerted, received, in_transit, customs, retained, consolidated, processed, on_route, pickup, delivered, returned)
- route (aliases: r, ruta) - route name
- weight (aliases: w, peso) - weight in kg (numeric)
- customer (aliases: client, name, c) - customer name
- code (aliases: slcode) - client SL ID code (e.g. SL-1234 or SL1234)
- manifest (aliases: m) - manifest number
- flag (aliases: f) - flag status (normal, requires_documents, stuck_in_customs, clear_to_proceed)
- dni (aliases: cedula) - client ID/DNI
- invoice (aliases: factura) - invoice number
- email (aliases: correo) - client email

Operators:
- = (exact match or suffix match for tracking/manifest/code/dni/invoice)
- != (not equals)
- ~ (contains, case-insensitive like)
- !~ (does not contain)
- >, <, >=, <= (for weight / numeric fields)

Logical operators:
- AND (all rules must match)
- OR (any rule can match)

Rules:
1. Always output ONLY the raw JQL query string. Do not write explanations, markdown wrappers, backticks, or any HTML tags.
2. If the user mentions relative time words like "más reciente", "último", "primero", JQL does not support ORDER BY or LIMIT. Simply extract the other criteria (e.g. customer/code/status) and ignore the sorting/relative word.
3. Clean and normalize SL Codes: if the user types sl4859, translate it to code = "sl4859" or code = "SL-4859" depending on exact matching. If the code has no hyphen, preserve the format user entered or standard.
4. If the user query cannot be translated to any valid JQL filter, output an empty string.
5. Handle both English and Spanish queries.

Examples:
- User: "recibidos que pesen mas de 5 kilos" -> status = "received" AND weight > 5
- User: "paquetes de Juan Perez en aduanas" -> customer ~ "Juan Perez" AND status = "customs"
- User: "Miami Aereo con documentos pendientes" -> route ~ "Aereo" AND flag = "requires_documents"
- User: "de la ruta encomiendas o peso menor a 1" -> route ~ "encomiendas" OR weight < 1
- User: "del cliente SL-8832 y tracking que tenga 1Z9" -> code = "SL-8832" AND tracking ~ "1Z9"
- User: "ocupo el ultimo paquete del cliente sl4859" -> code = "sl4859"
- User: "paquete con tracking terminado en 5678" -> tracking = "5678"
- User: "cedula 123456" -> dni = "123456"

Translate the following user query:
"${naturalQuery}"`;

  try {
    const responseText = await callGeminiAPI(prompt);
    return responseText.trim();
  } catch (error) {
    console.error("Failed to translate to JQL:", error);
    return "";
  }
}

/**
 * Translates a natural language search query into JQL for invoices filtering.
 */
export async function translateInvoiceToJQL(naturalQuery: string): Promise<string> {
  const prompt = `You are a helper that translates natural language queries into a precise Jira-like Query Language (JQL) for invoices.
The supported fields are:
- invoice (aliases: id, number, factura) - invoice number (e.g. SL26111-20240101 or suffix like 1234)
- status (aliases: s, estado) - state of the invoice (draft, sent, paid, annulled)
- customer (aliases: client, name, c, cliente) - customer full name
- code (aliases: slcode, smartid) - client SL ID code (e.g. SL-1234 or SL1234)
- manifest (aliases: m, manifiesto) - manifest number
- route (aliases: r, ruta) - route name
- total (aliases: amount, t, totalAmount) - total amount of the invoice in USD (numeric)
- currency (aliases: moneda) - invoice currency (USD, CRC)
- exchangeRate (aliases: tc, tipoCambio) - exchange rate used (numeric)
- dni (aliases: cedula) - client ID/DNI
- email (aliases: correo) - client email
- phone (aliases: telefono) - client phone
- tracking (aliases: t_number) - tracking number associated with the invoice or its items

Operators:
- = (exact match or suffix match for invoice/manifest/code/dni/tracking/phone)
- != (not equals)
- ~ (contains, case-insensitive like)
- !~ (does not contain)
- >, <, >=, <= (for total / exchangeRate / numeric fields)

Logical operators:
- AND (all rules must match)
- OR (any rule can match)

Rules:
1. Always output ONLY the raw JQL query string. Do not write explanations, markdown wrappers, backticks, or any HTML tags.
2. If the user mentions relative time words like "más reciente", "último", "de hoy", "esta semana", JQL does not support ORDER BY, LIMIT, or dates logic. Simply extract the other criteria (e.g. customer/code/status) and ignore the sorting/relative word.
3. Clean and normalize SL Codes: if the user types sl4859, translate it to code = "sl4859" or code = "SL-4859". If the code has no hyphen, output it as entered.
4. If the user query cannot be translated to any JQL filter, output an empty string.
5. Handle both English and Spanish queries.

Examples:
- User: "facturas pagadas de Juan Perez" -> status = "paid" AND customer ~ "Juan Perez"
- User: "facturas en borrador del manifiesto 14-03-2026ANP" -> status = "draft" AND manifest = "14-03-2026ANP"
- User: "facturas de mas de 500 dolares" -> total > 500
- User: "del cliente SL-8832 y tipo de cambio mayor a 500" -> code = "SL-8832" AND exchangeRate > 500
- User: "facturas anuladas" -> status = "annulled"
- User: "Ocupo la factura mas reciente de sl4859" -> code = "sl4859"
- User: "facturas con tracking terminado en 5678" -> tracking = "5678"
- User: "cedula 123456" -> dni = "123456"

Translate the following user query:
"${naturalQuery}"`;

  try {
    const responseText = await callGeminiAPI(prompt);
    return responseText.trim();
  } catch (error) {
    console.error("Failed to translate invoice to JQL:", error);
    return "";
  }
}


