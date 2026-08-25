import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { type Country, type ShippingType, type ItemCategory } from '@/lib/pricing';
import { calculatePrice } from '@/lib/utils/pricing';
import { validateManifestData } from '../gemini-client';
import { 
  batchFindCustomerMatchesWithAI, 
  findCustomerBySlCode,
  getCustomerBySlCode,
  type CustomerMatchResponse,
  type MatchResult,
} from '../customer-matcher';
import { batchResolvePreAlerts } from '../pre-alert-resolver';
import { detectPermit, detectPermitFromManifestId, detectPermitFromDescription } from '../permit-detector';
import { 
  loadUnmatchedRouteCache, 
  lookupLearnedRoute, 
  lookupLearned, 
  getLearnedIndex, 
  hasLearnedCollision, 
  isDominantCollisionWinner 
} from '../match-learning';
import { logAction } from '../audit-service';
import { 
  collection, 
  doc, 
  writeBatch, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { areNicknameEquivalent, areDistinctGivenNames, normalize, meaningfulTokens } from '../matching';
import { MATCH_THRESHOLDS } from '../matching/thresholds';

import {
  type ManifestRow,
  type ManifestRecord,
  type ProcessingResult,
  type ManifestType,
  type ManifestConfig,
  type ProcessingStep,
  type StepCallback,
  type AjustePrecio,
  type MultiMatchRow
} from './types';

import { getRecentManifests } from './queries';

const COLUMN_MAPPINGS: Record<string, string[]> = {
  tracking: [
    'tracking', 'tracking number', 'numero de rastreo', 'rastreo', 'track', 
    'guia_origen', 'tracking_number', 'numero_tracking', 'no_tracking',
    'shipment', 'awb', 'hawb', 'mawb', 'bl', 'bill_of_lading', 'guia_aerea',
    'numero_guia', 'trackingno', 'tracking_no', 'codigo_rastreo', 'ref',
    'referencia', 'reference', 'numero_envio', 'shipment_number',
  ],
  nombre: [
    'nombre', 'name', 'cliente', 'customer', 'destinatario', 'recipient', 
    'nombre_cliente', 'nombre_del_cliente', 'customer_name', 'consignee', 'consignatario',
    'receiver', 'receptor', 'beneficiario', 'destinatary', 'client_name',
    'full_name', 'nombre_completo', 'nombre_destinatario', 'receiver_name',
  ],
  guia: [
    'guia', 'guide', 'numero de guia', 'guide number', 'guia_local', 'local_guide',
    'guia_destino', 'guia_interna', 'internal_guide', 'no_guia', 'guia_numero',
  ],
  peso: [
    'peso', 'weight', 'peso_kg', 'weight_kg', 'peso_lbs', 'lb', 'lbs', 'kg',
    'weight_lbs', 'peso_real', 'actual_weight', 'gross_weight', 'peso_bruto',
    'chargeable_weight', 'peso_cobrable', 'peso_vol', 'volumetric_weight',
    'libras', 'kilos', 'kilogramos', 'pounds', 'wt', 'wgt',
  ],
  slCode: [
    'sl_code', 'slcode', 'codigo_sl', 'sl', 'customer_code', 'codigo_cliente', 
    'codigo', 'client_code', 'account', 'cuenta', 'account_number', 'no_cuenta',
    'customer_id', 'id_cliente', 'locker', 'milocker', 'casillero',
  ],
  ruta: [
    'ruta', 'route', 'zona', 'zone', 'destino', 'destination', 'area', 
    'sector', 'region', 'delivery_zone', 'zona_entrega', 'direccion_entrega',
    'delivery_route', 'ruta_entrega', 'location', 'ubicacion',
  ],
  numeroCliente: [
    'numero_cliente', 'client_number', 'no_cliente', 'customer_number', 
    'id_cliente', 'customer_id', 'client_id', 'account_id',
  ],
  descripcion: [
    'descripcion', 'description', 'contenido', 'content', 'items', 'articulos',
    'mercancia', 'goods', 'producto', 'product', 'detalle', 'detail',
  ],
  valor: [
    'valor', 'value', 'precio', 'price', 'monto', 'amount', 'declarado',
    'declared_value', 'valor_declarado', 'usd', 'costo', 'cost',
  ],
  piezas: [
    'piezas', 'pieces', 'qty', 'quantity', 'cantidad', 'unidades', 'units',
    'bultos', 'packages', 'cajas', 'boxes', 'pcs',
  ],
};

export function isDivergentMatch(manifestName: string, customerName: string): boolean {
  if (!manifestName || !customerName) return false;
  const norm = (s: string) =>
    s.toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const aTokens = norm(manifestName).split(' ').filter(t => t.length >= 3);
  const bTokens = norm(customerName).split(' ').filter(t => t.length >= 3);
  // Cannot judge if either name resolves to fewer than 2 significant tokens
  if (aTokens.length < 2 || bTokens.length < 2) return false;

  const levenshtein = (a: string, b: string) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let i = 1; i <= a.length; i++) matrix[0][i] = i;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
      }
    }
    return matrix[b.length][a.length];
  };

  const isSimilar = (s1: string, s2: string) => {
    // Distinct given names (e.g. DANIEL vs DANIELA) are NEVER similar
    if (areDistinctGivenNames(s1, s2)) return false;
    // Tolerate a distance of up to 2 (handles typos, transpositions, insertions, deletions)
    return levenshtein(s1, s2) <= 2;
  };

  // Distinct given name veto on first token
  const firstA = aTokens[0];
  const firstB = bTokens[0];
  if (areDistinctGivenNames(firstA, firstB)) {
    return true;
  }

  // Consume matched tokens from a copy of bTokens
  const availB = [...bTokens];
  const matchedA: string[] = [];
  const unmatchedA: string[] = [];

  for (const tA of aTokens) {
    const idx = availB.findIndex(tB => tA === tB || isSimilar(tA, tB) || areNicknameEquivalent(tA, tB));
    if (idx !== -1) {
      matchedA.push(tA);
      availB.splice(idx, 1);
    } else {
      unmatchedA.push(tA);
    }
  }

  // Case 1: Zero shared tokens → definitely divergent
  if (matchedA.length === 0) return true;

  // Case 2: Unshared tokens exist on both sides and cannot be matched
  // e.g. "BRYAN SOLIS SOLIS" vs "BRAYAN ROLANDO CONEJO SOLIS"
  // unmatchedA has "SOLIS", availB has "ROLANDO", "CONEJO"
  // If unmatchedA has surnames and availB has conflicting surnames that are not similar → divergent!
  if (unmatchedA.length > 0 && availB.length > 0) {
    let hasSimilar = false;
    for (const uA of unmatchedA) {
      for (const uB of availB) {
        if (isSimilar(uA, uB) || areNicknameEquivalent(uA, uB)) {
          hasSimilar = true;
          break;
        }
      }
      if (hasSimilar) break;
    }
    if (!hasSimilar) return true;
  }

  // Case 3: Only surname tokens shared, but neither first name token matches the other
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  if (!bSet.has(firstA) && !aSet.has(firstB)) {
    if (isSimilar(firstA, firstB) || areNicknameEquivalent(firstA, firstB)) {
      return false;
    }
    return true;
  }

  return false;
}

export async function readExcelFile(file: File): Promise<{ data: unknown[][]; headers: string[]; rawData: unknown[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays
        const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        
        // Find headers (first row with multiple columns - typically "Código del Cliente", "Nombre", etc.)
        let headerIndex = 0;
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i] as unknown[];
          // Look for a row that has typical header names
          if (row && row.length > 3) {
            const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
            if (
              rowStr.includes('cliente') || rowStr.includes('nombre') ||
              rowStr.includes('tracking') || rowStr.includes('peso') ||
              rowStr.includes('weight') || rowStr.includes('lbs') ||
              rowStr.includes(' lb ') || rowStr.includes('libras') ||
              rowStr.includes('guia') || rowStr.includes('codigo')
            ) {
              headerIndex = i;
              break;
            }
          }
        }
        
        const headers = (jsonData[headerIndex] as string[]).map(h => String(h || ''));
        const dataRows = jsonData.slice(headerIndex + 1).filter(row =>
          Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== '')
        );
        
        // Return rawData (all rows including headers) for manifest number extraction
        resolve({ data: dataRows, headers, rawData: jsonData });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsArrayBuffer(file);
  });
}

export async function readCSVFile(file: File): Promise<{ data: unknown[][]; headers: string[]; rawData: unknown[][] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => {
        const data = results.data as unknown[][];
        if (data.length === 0) {
          reject(new Error('Empty CSV file'));
          return;
        }
        
        const headers = (data[0] as string[]).map(h => String(h || ''));
        const dataRows = data.slice(1).filter(row => 
          Array.isArray(row) && row.some(cell => cell !== null && cell !== '')
        );
        
        resolve({ data: dataRows, headers, rawData: data });
      },
      error: (error) => reject(error),
    });
  });
}

export function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove accents (normalize to NFD, then strip combining diacritical marks)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '_');
}

export function findColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  
  headers.forEach((header, index) => {
    const normalizedHeader = normalizeColumnName(header);
    
    for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
      if (aliases.some(alias => normalizedHeader.includes(normalizeColumnName(alias)))) {
        if (!mapping[field]) {
          mapping[field] = index;
        }
      }
    }
  });
  
  return mapping;
}

export function extractManifestNumber(data: unknown[][], filename: string, rawData?: unknown[][]): string {
  // First priority: Try to find "Manifiesto Número" in header rows (rows 1-10)
  // This captures values like "28-02-2026DANP" from "Manifiesto Número 28-02-2026DANP"
  const searchData = rawData || data;
  for (let i = 0; i < Math.min(10, searchData.length); i++) {
    const row = searchData[i];
    if (Array.isArray(row)) {
      for (const cell of row) {
        if (typeof cell === 'string') {
          // Match "Manifiesto Número XXXXX" or "Manifiesto Numero XXXXX"
          const manifestMatch = cell.match(/manifiesto\s+n[uú]mero\s+([\w\-]+)/i);
          if (manifestMatch) {
            // Remove any trailing date suffix like _2026-03-05
            let manifestNum = manifestMatch[1].toUpperCase();
            manifestNum = manifestNum.replace(/_\d{4}-\d{2}-\d{2}.*$/i, '');
            return manifestNum;
          }
        }
      }
    }
  }
  
  // Second priority: Try to extract from filename
  // Pattern: look for DANP/PERMISOS patterns or date-based manifest names
  // Stop at underscore followed by date pattern (e.g., _2026-03-05)
  const filenameWithoutExt = filename.replace(/\.(xlsx?|csv)$/i, '');

  // MEGA-MAN fusion manifest — e.g. "MEGA-MAN-09-04-2026" or "SL-MEGA-MAN-09-04-2026"
  const megaManMatch = filenameWithoutExt.match(/^((?:SL-)?MEGA-MAN-\d{2}-\d{2}-\d{4})/i);
  if (megaManMatch) {
    return megaManMatch[1].toUpperCase();
  }
  
  // Try to find manifest pattern like "08-04-2026DAN", "11-04-2026DANP", "25-03-2026DAND" in filename
  // Capture any alphabetic suffix after the date (DAN, DAND, DANP, PERMISOS, etc.)
  const danpMatch = filenameWithoutExt.match(/(\d{1,2}-\d{1,2}-\d{4}[A-Z]*)/i);
  if (danpMatch) {
    return danpMatch[1].toUpperCase();
  }
  
  // Try generic manifest pattern but exclude trailing date
  const filenameMatch = filenameWithoutExt.match(/(?:manifiesto|manifest|MF)[-_\s]?([^_]+)/i);
  if (filenameMatch) {
    let manifestNum = filenameMatch[1].toUpperCase();
    // Remove trailing date suffix
    manifestNum = manifestNum.replace(/_\d{4}-\d{2}-\d{2}.*$/i, '');
    return manifestNum;
  }
  
  // Third priority: Try to find MF pattern in header rows
  for (let i = 0; i < Math.min(5, searchData.length); i++) {
    const row = searchData[i];
    if (Array.isArray(row)) {
      for (const cell of row) {
        if (typeof cell === 'string') {
          const match = cell.match(/(?:manifiesto|manifest|MF)[-_:\s]?([\w\-]+)/i);
          if (match) {
            let manifestNum = match[1].toUpperCase();
            manifestNum = manifestNum.replace(/_\d{4}-\d{2}-\d{2}.*$/i, '');
            return manifestNum;
          }
        }
      }
    }
  }
  
  // Fallback: Generate from date
  const today = new Date();
  return `MF${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
}

export function parseWeight(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // Remove common weight units and parse
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
    const weight = parseFloat(cleaned);
    return isNaN(weight) ? 0 : weight;
  }
  return 0;
}

export function formatTracking(value: unknown): string {
  if (!value) return '';
  return String(value).trim().toUpperCase().replace(/\//g, '-');
}

export function formatName(value: unknown): string {
  if (!value) return '';
  let name = String(value).trim();

  // Decode HTML numeric entities: &#209; → Ñ, &#225; → á, etc.
  name = name.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)));
  // Decode common named HTML entities that appear in CSV exports
  name = name.replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');

  name = name.toUpperCase();

  // Normalize accents early so ñ/Ñ → n/N before pattern matching
  name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Strip parenthetical annotations: (CARTAGO), (CONSOLIDADO), (CR), (VIP) etc.
  name = name.replace(/\s*\([^)]{1,60}\)\s*/g, ' ');

  // Handle comma-separated reversed names: "PEREZ, JUAN CARLOS" → "JUAN CARLOS PEREZ"
  const commaMatch = name.match(/^([A-Z][A-Z\s]{0,40}),\s*([A-Z][A-Z\s]{0,40})$/);
  if (commaMatch) {
    name = `${commaMatch[2].trim()} ${commaMatch[1].trim()}`;
  } else {
    name = name.replace(/,/g, ' ');
  }

  // Replace slashes with spaces: "JUAN/PEREZ" or "JUAN / PEREZ" → "JUAN PEREZ"
  name = name.replace(/\s*\/\s*/g, ' ');

  // Strip leading SL codes or numeric identifiers: "SL001 JUAN", "CL-45 PEREZ", "1234 - JUAN"
  name = name.replace(/^[A-Z]{0,3}\d{2,8}[-\s]+/g, '');

  // Strip trailing reference/special markers: "#4524", "*VIP", "&admin"
  name = name.replace(/\s*[#*&@%]\S*\s*$/g, '');

  // Strip trailing pure numeric sequences (appended tracking/reference): "JUAN PEREZ 98745"
  name = name.replace(/\s+\d{3,}\s*$/g, '');

  // Strip trailing date patterns (DD-MM-YY, DD/MM/YYYY, etc.)
  name = name.replace(/\s+\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\s*$/g, '');

  // Collapse multiple whitespace
  const cleaned = name.replace(/\s+/g, ' ').trim();

  // Guard: if what remains is purely numeric or a single char, it's noise — discard
  if (!cleaned || /^\d+$/.test(cleaned) || cleaned.length === 1) return '';

  return cleaned;
}

export async function loadPricingConfig(_country: Country, _deliveryType: ShippingType): Promise<any> {
  // Using default pricing from pricing.ts for now
  // Firebase pricing config can be implemented later if needed
  return null;
}

export function detectManifestType(filename: string, headers: string[]): ManifestConfig {
  const lowerFilename = filename.toLowerCase();
  const headerStr = headers.join(' ').toLowerCase();
  const combined = `${lowerFilename} ${headerStr}`;
  
  // Default to USA Air regular
  let config: ManifestConfig = {
    country: 'usa',
    shippingType: 'air',
    category: 'regular',
    requiresPermit: false,
  };
  
  // Country detection patterns (order matters - more specific first)
  const countryPatterns: Array<{ patterns: RegExp[]; country: Country }> = [
    {
      patterns: [
        /mexico|mx_|_mx|mex_|_mex|mexicano|cdmx|guadalajara|monterrey/i,
        /aeromexico|estafeta|fedex_mx/i,
      ],
      country: 'mexico',
    },
    {
      patterns: [
        /china|cn_|_cn|chinese|shenzhen|guangzhou|shanghai|hongkong|hk_|_hk/i,
        /aliexpress|alibaba|taobao|wish|temu|shein/i,
      ],
      country: 'china',
    },
    {
      patterns: [
        /colombia|co_|_co|colombiano|bogota|medellin|cali|barranquilla/i,
        /servientrega|envia|coordinadora/i,
      ],
      country: 'colombia',
    },
    {
      patterns: [
        /usa|us_|_us|united_states|america|miami|new_york|los_angeles/i,
        /milocker|regular|standard|normal|aereo_usa|air_usa/i,
        /usps|ups|fedex|dhl|amazon/i,
      ],
      country: 'usa',
    },
  ];
  
  // Find matching country
  for (const { patterns, country } of countryPatterns) {
    if (patterns.some(p => p.test(combined))) {
      config.country = country;
      break;
    }
  }
  
  // Shipping type detection — MUST use precise patterns.
  // WARNING: do NOT add bare 'ship' or 'shipping' — those appear in every air manifest
  // ('shipment', 'shipping address', etc.) and would misclassify air manifests as sea.
  const seaPatterns = [
    /maritimo|maritim|barco|ocean_freight|sea_freight|flete_maritimo/i,
    /fcl|lcl|buque|vessel|naviera|shipping_line|bl_number|bill_of_lading/i,
    /\bsea\b|contenedor|container_number|cbm\b/i,
  ];
  
  if (seaPatterns.some(p => p.test(combined))) {
    config.shippingType = 'sea';
  }
  
  // Permit/Restricted detection using permit-detector service
  // Logic from tracking-middleware.ts:
  // - DANP suffix = requires permit (P = Permisos)
  // - PERMISOS or PERMIT anywhere = requires permit
  // - DAN alone is just destination code, NOT permit
  const filenamePermitResult = detectPermit({ filename });
  
  if (filenamePermitResult.requiresPermit) {
    config.category = 'restricted';
    config.requiresPermit = true;
  }
  
  // Special detection for MiLocker files (common naming convention)
  if (/milocker.*regular/i.test(lowerFilename) && !filenamePermitResult.requiresPermit) {
    config.country = 'usa';
    config.shippingType = 'air';
    config.category = 'regular';
    config.requiresPermit = false;
  } else if (filenamePermitResult.requiresPermit) {
    config.country = 'usa';
    config.shippingType = 'air';
    config.category = 'restricted';
    config.requiresPermit = true;
  }
  
  return config;
}

export async function processManifestFile(
  file: File,
  token: string | null,
  onStepUpdate?: StepCallback,
  manifestTypeHint?: ManifestType
): Promise<ProcessingResult> {
  const steps: ProcessingStep[] = [
    { id: '1', step: 'Leyendo archivo y detectando tipo', status: 'pending', timestamp: '' },
    { id: '2', step: 'Cargando datos de clientes', status: 'pending', timestamp: '' },
    { id: '3', step: 'Formateando tracking y nombres', status: 'pending', timestamp: '' },
    { id: '4', step: 'Verificando nombres con IA (Gemini)', status: 'pending', timestamp: '' },
    { id: '5', step: 'Detectando anomalías de peso con IA', status: 'pending', timestamp: '' },
    { id: '6', step: 'Realizando proceso de asociación de clientes', status: 'pending', timestamp: '' },
    { id: '7', step: 'Calculando precios dinámicos', status: 'pending', timestamp: '' },
    { id: '8', step: 'Validando datos con IA', status: 'pending', timestamp: '' },
    { id: '9', step: 'Generando resultado final', status: 'pending', timestamp: '' },
  ];
  
  const updateStep = (stepId: string, status: ProcessingStep['status'], message?: string) => {
    const step = steps.find(s => s.id === stepId);
    if (step) {
      step.status = status;
      step.timestamp = new Date().toISOString();
      step.message = message;
    }
    onStepUpdate?.(steps, step?.step || '', message);
  };
  
  const corrections: ProcessingResult['corrections'] = [];
  const rows: ManifestRow[] = [];
  let manifestNumber = '';
  let customersMatched = 0;
  let namesCorrections = 0;
  let weightCorrections = 0;
  
  try {
    // Step 1: Read file and detect manifest type
    updateStep('1', 'processing');
    const isCSV = file.name.toLowerCase().endsWith('.csv');
    const { data, headers, rawData } = isCSV 
      ? await readCSVFile(file) 
      : await readExcelFile(file);
    
    let manifestConfig = detectManifestType(file.name, headers);
    // If a type hint was provided by the wizard, it takes precedence over auto-detection
    if (manifestTypeHint) {
      const hintParts = manifestTypeHint.split('_');
      manifestConfig = {
        ...manifestConfig,
        country: hintParts[0] as ManifestConfig['country'],
        shippingType: (hintParts[1] ?? 'air') as ManifestConfig['shippingType'],
      };
    }
    // Pass rawData to extract manifest number from header rows (e.g., "Manifiesto Número 28-02-2026DANP")
    manifestNumber = extractManifestNumber(data, file.name, rawData);
    
    // Use permit-detector service to check manifest number for permit patterns
    // Logic from tracking-middleware.ts:
    // - DANP suffix = requires permit (P = Permisos)
    // - PERMISOS or PERMIT anywhere = requires permit
    // - DAN alone is just destination code, NOT permit
    const manifestPermitResult = detectPermitFromManifestId(manifestNumber);
    if (manifestPermitResult.requiresPermit) {
      manifestConfig.category = 'restricted';
      manifestConfig.requiresPermit = true;
      console.log(`[ManifestProcessor] Permit detected from manifest: ${manifestNumber} (${manifestPermitResult.reason})`);
    }
    
    const manifestType: ManifestType = `${manifestConfig.country}_${manifestConfig.shippingType}` as ManifestType;
    
    updateStep('1', 'completed', `${data.length} filas | Tipo: ${manifestConfig.country.toUpperCase()} ${manifestConfig.shippingType.toUpperCase()}`);
    
    const columnMapping = findColumnMapping(headers);
    const trackingCol = columnMapping.tracking;
    const nombreCol = columnMapping.nombre;
    const pesoCol = columnMapping.peso;
    const slCodeCol = columnMapping.slCode;
    const rutaCol = columnMapping.ruta;
    const guiaCol = columnMapping.guia;
    const descripcionCol = columnMapping.descripcion;

    console.log('[ManifestProcessor] Headers detected:', headers);
    console.log('[ManifestProcessor] Column mapping:', {
      tracking: trackingCol !== undefined ? `col ${trackingCol} = "${headers[trackingCol]}"` : 'NOT FOUND',
      nombre:   nombreCol   !== undefined ? `col ${nombreCol}   = "${headers[nombreCol]}"` : 'NOT FOUND',
      peso:     pesoCol     !== undefined ? `col ${pesoCol}     = "${headers[pesoCol]}"` : 'NOT FOUND ⚠️',
      slCode:   slCodeCol   !== undefined ? `col ${slCodeCol}   = "${headers[slCodeCol]}"` : 'NOT FOUND',
      ruta:     rutaCol     !== undefined ? `col ${rutaCol}     = "${headers[rutaCol]}"` : 'NOT FOUND',
    });
    
    // Step 2: Format tracking and names to UPPERCASE (customer loading handled by customer-matcher.ts)
    updateStep('3', 'processing');
    const allNames: string[] = [];
    const allWeights: Array<{ row: number; value: number; tracking: string }> = [];
    
    data.forEach((row, idx) => {
      if (Array.isArray(row) && row.some(cell => cell)) {
        if (nombreCol !== undefined) {
          const name = formatName(row[nombreCol]);
          if (name) allNames.push(name);
        }
        if (pesoCol !== undefined) {
          const weight = parseWeight(row[pesoCol]);
          const tracking = trackingCol !== undefined ? formatTracking(row[trackingCol]) : '';
          if (weight > 0) {
            allWeights.push({ row: idx + 2, value: weight, tracking });
          }
        }
      }
    });
    updateStep('3', 'completed', `${allNames.length} nombres procesados`);
    
    // Step 4: Skip AI verification - use algorithmic matching only
    // AI is now only used at the end for analysis suggestions
    updateStep('4', 'completed', 'Usando matching algorítmico');
    const nameVerificationResults = new Map<string, { original: string; corrected: string; confidence: number; issues: string[] }>();
    
    // Step 5: Skip AI weight correction - use original weights
    updateStep('5', 'completed', 'Usando pesos originales');
    const weightCorrectionResults = new Map<number, { corrected: number; reason: string }>();
    
    // Step 6: Match customers for slCode, ruta and consolidation using enhanced matcher
    updateStep('6', 'processing');
    let customerMatchResults = new Map<number, CustomerMatchResponse>();
    const multiMatchRows: MultiMatchRow[] = [];
    // Pre-alert overrides: rowIndex → { slCode, ruta, consolidacion, nombreCliente, preAlertCreatedAt, preAlertKey, preAlertId }
    const preAlertOverrideMap = new Map<number, { slCode: string; ruta: string; consolidacion: boolean; nombreCliente: string; preAlertCreatedAt?: string; preAlertKey?: string; preAlertId?: string }>();
    
    // Build list of ALL names to match with their row indices
    // We always match by name to get customer data (slCode, ruta, consolidacion, nombreCliente)
    const namesNeedingMatchWithIndex: Array<{ index: number; name: string; tracking: string; peso: number }> = [];
    
    data.forEach((row, idx) => {
      if (!Array.isArray(row) || row.every(cell => !cell)) return;
      const nombre = nombreCol !== undefined ? formatName(row[nombreCol]) : '';
      const tracking = trackingCol !== undefined ? formatTracking(row[trackingCol]) : '';
      const peso = pesoCol !== undefined ? parseWeight(row[pesoCol]) : 0;
      
      // Always match if there's a name - we need customer data for every row
      if (nombre) {
        namesNeedingMatchWithIndex.push({ index: idx, name: nombre, tracking, peso });
      }
    });
    
    // ── Pre-alert batch check (parallel with name matching) ─────────────────────
    // For every unique tracking in this manifest, query the pre_alerts collection.
    // If a hit is found and has an slCode, it overrides the name-based match for
    // that row — the customer who pre-alerted owns the package.
    const uniqueTrackings = [...new Set(
      namesNeedingMatchWithIndex.map(n => n.tracking).filter(Boolean)
    )];

    if (namesNeedingMatchWithIndex.length > 0) {
      try {
        // Run name matching and pre-alert checks concurrently
        const [nameMatchMap, preAlertMap] = await Promise.all([
          batchFindCustomerMatchesWithAI(
            namesNeedingMatchWithIndex.map(n => ({ index: n.index, name: n.name })),
            true
          ),
          batchResolvePreAlerts(uniqueTrackings),
        ]);
        customerMatchResults = nameMatchMap;

        // Build tracking → slCode map from pre-alert hits
        const preAlertSlCodeMap = new Map<string, string>();
        for (const [tracking, info] of preAlertMap.entries()) {
          if (info.found && info.slCode) preAlertSlCodeMap.set(tracking, info.slCode);
        }


        // Resolve customer data for pre-alerted trackings (cache is warm after name match)
        const preAlertCustomerEntries = await Promise.all(
          [...preAlertSlCodeMap.entries()].map(async ([tracking, slCode]) => {
            const customer = await findCustomerBySlCode(slCode);
            return { tracking, slCode, customer };
          })
        );

        // Build per-row override map keyed by row index
        for (const { tracking, slCode, customer } of preAlertCustomerEntries) {
          const info = preAlertMap.get(tracking);
          const rawDate = info?.preAlertCreatedAt;
          let dateStr: string | undefined;
          if (rawDate) {
            if (typeof rawDate.toDate === 'function') dateStr = rawDate.toDate().toISOString();
            else if (typeof rawDate === 'string' || typeof rawDate === 'number') dateStr = new Date(rawDate).toISOString();
          }
          const preAlertKey = `${info?.canonicalTracking || tracking}_${slCode}`;

          namesNeedingMatchWithIndex
            .filter(n => n.tracking === tracking)
            .forEach(n => {
              const fallbackName = customer?.fullName || customer?.name || info?.clientName || `Cliente Pre-alertado (${slCode})`;
              preAlertOverrideMap.set(n.index, {
                slCode,
                ruta: customer?.ruta || '',
                consolidacion: customer?.consolidationEnabled ?? false,
                nombreCliente: fallbackName,
                preAlertCreatedAt: dateStr,
                preAlertKey,
                preAlertId: info?.sp2PreAlertId,
              });
              console.log(`[ManifestProcessor] [P] Pre-alert override row ${n.index + 2}: tracking ${tracking} → slCode ${slCode} (${fallbackName})`);
            });
        }
        
        // Count matches and identify rows requiring user choice
        for (const [idx, result] of nameMatchMap.entries()) {
          if (result.exactMatch || (result.bestMatch && result.bestMatch.score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN)) {
            customersMatched++;
          }
          
          // Track rows needing review: user_choice, low_score (65-79%), or por_definir
          const rowInfo = namesNeedingMatchWithIndex.find(n => n.index === idx);
          const bestScore = result.bestMatch?.score ?? 0;
          const LOW_SCORE_MAX = MATCH_THRESHOLDS.AUTO_ACCEPT_MIN;
          const MIN_SCORE = 0.65;
          const matchedCustomer = result.bestMatch?.customer;
          const matchedRuta = (matchedCustomer?.ruta || '').toLowerCase().trim();
          const isPorDefinir = matchedCustomer && (!matchedCustomer.ruta || matchedRuta === 'por definir' || matchedRuta === '');
          const isLowScore = bestScore >= MIN_SCORE && bestScore < LOW_SCORE_MAX && !result.requiresUserChoice;

          // Pre-compute pricing for modal display (same canonical function as step 9)
          const rowPeso = rowInfo?.peso ?? 0;
          const { country, shippingType, requiresPermit } = manifestConfig;
          const _sinR = calculatePrice(rowPeso, country, shippingType, 'regular', false);
          const _conR = calculatePrice(rowPeso, country, shippingType, 'regular', true);
          const _rowPesoRedondeo = Math.ceil(rowPeso);
          const _rowDiferencia   = Math.max(0, Math.round((_rowPesoRedondeo - rowPeso) * 1000) / 1000);
          const rowPricingFields = {
            peso:              rowPeso,
            pesoRedondeo:      _rowPesoRedondeo,
            diferenciaRedondeo:_rowDiferencia,
            precioSinPermiso:  _sinR.quoteRequired ? 0 : Math.round(_sinR.price * 100) / 100,
            precioConPermiso:  _conR.quoteRequired ? 0 : Math.round(_conR.price * 100) / 100,
            permisos:          requiresPermit,
          };

          const candidatesList = result.candidates.slice(0, 5).map(c => ({
            slCode: c.customer.slCode,
            fullName: c.customer.fullName || c.customer.name,
            ruta: c.customer.ruta || '',
            consolidation: c.customer.consolidationEnabled,
            score: c.score,
          }));

          if (result.requiresUserChoice && result.candidates.length > 1) {
            multiMatchRows.push({
              rowIndex: idx + 2,
              tracking: rowInfo?.tracking || '',
              nombre: rowInfo?.name || '',
              needsReview: 'user_choice',
              matchedSlCode: matchedCustomer?.slCode,
              matchedName: matchedCustomer?.fullName || matchedCustomer?.name,
              matchScore: bestScore,
              ...rowPricingFields,
              candidates: candidatesList,
            });
          } else if (isLowScore) {
            multiMatchRows.push({
              rowIndex: idx + 2,
              tracking: rowInfo?.tracking || '',
              nombre: rowInfo?.name || '',
              needsReview: 'low_score',
              matchedSlCode: matchedCustomer?.slCode,
              matchedName: matchedCustomer?.fullName || matchedCustomer?.name,
              matchScore: bestScore,
              ...rowPricingFields,
              candidates: candidatesList,
            });
          } else if (isPorDefinir) {
            multiMatchRows.push({
              rowIndex: idx + 2,
              tracking: rowInfo?.tracking || '',
              nombre: rowInfo?.name || '',
              needsReview: 'por_definir',
              matchedSlCode: matchedCustomer?.slCode,
              matchedName: matchedCustomer?.fullName || matchedCustomer?.name,
              matchScore: bestScore,
              ...rowPricingFields,
              candidates: candidatesList,
            });
          }
        }
      } catch (error) {
        console.warn('Customer matching error:', error);
      }
    }
    updateStep('6', 'completed', `${customersMatched} clientes emparejados${multiMatchRows.length > 0 ? `, ${multiMatchRows.length} requieren revisión` : ''}`);
    
    // Step 7: Dynamic pricing uses calculatePrice() deterministic engine — no Firebase read needed
    updateStep('7', 'completed', `Precios: ${manifestConfig.country.toUpperCase()} ${manifestConfig.shippingType.toUpperCase()}`);
    
    // Step 8: Validate data with AI
    updateStep('8', 'processing');
    let validation: ProcessingResult['validation'] = {
      isValid: true,
      issues: [],
      suggestions: [],
    };
    
    try {
      const rowsForValidation = data.slice(0, 100).map((row, idx) => {
        if (!Array.isArray(row)) return {};
        return {
          tracking: trackingCol !== undefined ? formatTracking(row[trackingCol]) : '',
          nombre: nombreCol !== undefined ? formatName(row[nombreCol]) : '',
          peso: pesoCol !== undefined ? parseWeight(row[pesoCol]) : 0,
        };
      });
      
      const validationResult = await validateManifestData(rowsForValidation, manifestType);
      validation = {
        isValid: validationResult.isValid,
        issues: validationResult.issues.map(i => ({
          field: i.field,
          type: i.type,
          message: i.message,
        })),
        suggestions: validationResult.suggestions,
      };
    } catch (error) {
      console.warn('AI validation skipped:', error);
    }
    updateStep('8', 'completed', `${validation.issues.length} observaciones`);
    
    // Step 9: Generate final results
    updateStep('9', 'processing');

    // Pre-load learned route cache so unmatched rows get their previously-assigned routes baked in
    await loadUnmatchedRouteCache();
    
    let totalPrice = 0;
    let processedCount = 0;
    let errorCount = 0;
    
    data.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.every(cell => !cell)) {
        return;
      }
      
      try {
        const tracking = trackingCol !== undefined ? formatTracking(row[trackingCol]) : '';
        let nombre = nombreCol !== undefined ? formatName(row[nombreCol]) : '';
        
        // Apply AI name corrections
        const nameVerification = nameVerificationResults.get(nombre);
        if (nameVerification && nameVerification.original.toUpperCase() !== nameVerification.corrected.toUpperCase()) {
          corrections.push({
            field: 'nombre',
            original: nombre,
            corrected: nameVerification.corrected,
            row: rowIndex + 2,
            confidence: nameVerification.confidence,
          });
          nombre = nameVerification.corrected;
        }
        
        const guia = guiaCol !== undefined ? String(row[guiaCol] || '').toUpperCase() : '';
        let peso = pesoCol !== undefined ? parseWeight(row[pesoCol]) : 0;
        
        // Apply AI weight corrections
        const weightCorrection = weightCorrectionResults.get(rowIndex + 2);
        if (weightCorrection) {
          corrections.push({
            field: 'peso',
            original: String(peso),
            corrected: String(weightCorrection.corrected),
            row: rowIndex + 2,
          });
          peso = weightCorrection.corrected;
        }
        
        // Get slCode, ruta, consolidacion and nombreCliente.
        // Priority 1: pre-alert slCode (customer self-declared the package)
        // Priority 2: name-based algorithmic/AI match (≥ 85% confidence)
        let slCode = '';
        let ruta = '';
        let consolidacion = false;
        let nombreCliente = '';
        let matchScore = 0;
        let matchSource: 'pre_alert' | 'name' | '' = '';

        const preAlertOverride = preAlertOverrideMap.get(rowIndex);
        let preAlertAccepted = false;
        
        if (preAlertOverride && preAlertOverride.slCode) {
          slCode = preAlertOverride.slCode;
          ruta = preAlertOverride.ruta;
          consolidacion = preAlertOverride.consolidacion;
          nombreCliente = preAlertOverride.nombreCliente;
          matchScore = 1.0;
          matchSource = 'pre_alert';
          preAlertAccepted = true;
          console.log(`Row ${rowIndex + 2}: [P] Pre-alert → "${slCode}" (${nombreCliente})`);
        }
        
        if (!preAlertAccepted) {
          // Priority 2: Nova Learning (learned match) - Human/admin confirmed takes precedent over fuzzy matcher
          const learnedIndex = getLearnedIndex();
          const learnedEntry = lookupLearned(nombre, Array.from(learnedIndex.values()));
          const hasCollision = learnedEntry ? hasLearnedCollision(learnedEntry.normalizedName) : false;
          const collisionIsDominant = hasCollision && learnedEntry
            ? isDominantCollisionWinner(learnedEntry.normalizedName, learnedEntry.slCode)
            : false;
          if (
            learnedEntry &&
            learnedEntry.score >= MATCH_THRESHOLDS.LEARNED_ACCEPT_MIN &&
            learnedEntry.slCode &&
            (!hasCollision || collisionIsDominant)
          ) {
            slCode = learnedEntry.slCode;
            const liveCustomer = getCustomerBySlCode(learnedEntry.slCode);
            ruta = liveCustomer ? (liveCustomer.ruta || '') : (learnedEntry.ruta || ruta);
            consolidacion = liveCustomer ? (liveCustomer.consolidationEnabled ?? false) : (learnedEntry.consolidationEnabled ?? false);
            nombreCliente = liveCustomer ? (liveCustomer.fullName || liveCustomer.name) : (learnedEntry.fullName || nombre);
            matchScore = learnedEntry.score;
            matchSource = 'name';
            console.log(`Row ${rowIndex + 2}: 🎓 Learned match applied${collisionIsDominant ? ' (dominant)' : ''}: "${nombre}" → "${slCode}" (${(learnedEntry.score * 100).toFixed(0)}%)`);
          }
        }

        if (!preAlertAccepted && !slCode) {
          // Priority 3: Name-based algorithmic/AI match (fuzzy match)
          const matchResult = customerMatchResults.get(rowIndex);
          const MIN_MATCH_SCORE = MATCH_THRESHOLDS.AUTO_ACCEPT_MIN;
          const searchNorm = normalize(nombre);
          const searchMeaningful = meaningfulTokens(searchNorm.split(' '));
          const isSingleTokenGeneric = searchMeaningful.length < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN_TOKENS;

          if (matchResult && matchResult.bestMatch && matchResult.bestMatch.score >= MIN_MATCH_SCORE) {
            const customer = matchResult.bestMatch.customer;
            const candidateNombre = customer.fullName || customer.name || '';
            const isSingleTokenExact1to1 = isSingleTokenGeneric && normalize(candidateNombre) === searchNorm;

            // Single token protection: do NOT auto-assign single tokens (e.g. "VICTOR", "VALVERDE") unless 1:1 exact match
            if (isSingleTokenGeneric && !isSingleTokenExact1to1) {
              console.log(`Row ${rowIndex + 2}: ✋ Single-token generic name "${nombre}" kept unlinked for operator review`);
            } else if (isDivergentMatch(nombre, candidateNombre)) {
              console.warn(`Row ${rowIndex + 2}: ⚠️ Divergent match rejected — "${nombre}" → "${candidateNombre}" (${(matchResult.bestMatch.score * 100).toFixed(0)}%) — token divergence`);
            } else {
              slCode = customer.slCode || '';
              ruta = customer.ruta || '';
              consolidacion = customer.consolidationEnabled ?? false;
              nombreCliente = candidateNombre;
              matchScore = matchResult.bestMatch.score;
              matchSource = 'name';
              console.log(`Row ${rowIndex + 2}: ✓ Matched "${nombre}" -> "${nombreCliente}" (slCode: ${slCode}, score: ${(matchScore * 100).toFixed(0)}%)`);
            }
          } else {
            const bestScore = matchResult?.bestMatch?.score || 0;
            console.log(`Row ${rowIndex + 2}: ✗ No match for "${nombre}" (best score: ${(bestScore * 100).toFixed(0)}% < ${MIN_MATCH_SCORE * 100}% required)`);
          }
        }

        if (!preAlertAccepted && !slCode) {
          // No learned slCode match and no fuzzy match — fall back to route-only cache
          const learnedRuta = lookupLearnedRoute(nombre);
          if (learnedRuta) {
            ruta = learnedRuta;
            console.log(`Row ${rowIndex + 2}: 📍 Learned route applied: "${nombre}" → ${learnedRuta}`);
          }
        }


        // ── Pricing — canonical calculatePrice from @/lib/utils/pricing ──────────
        // Single source of truth: tiered USA air pricing + permit surcharge.
        // Never use pricingService here — Firebase pricing collection can override
        // it with a per_kg mode that produces wrong results.
        const { country, shippingType, requiresPermit } = manifestConfig;

        // Rounding columns — always computed, independent of permit flag
        const pesoRedondeo       = Math.ceil(peso);
        const diferenciaRedondeo = Math.max(0, Math.round((pesoRedondeo - peso) * 1000) / 1000);
        const pesoConsolidacion  = consolidacion ? pesoRedondeo : 0;

        // precio final (respects requiresPermit flag of this manifest)
        const priceResult    = calculatePrice(peso, country, shippingType, 'regular', requiresPermit);
        const precio         = priceResult.quoteRequired ? 0 : Math.round(priceResult.price * 100) / 100;
        totalPrice += precio;

        // precio SIN permiso — plain tiered price, no $3 surcharge
        const priceResultSin   = calculatePrice(peso, country, shippingType, 'regular', false);
        const precioSinPermiso = priceResultSin.quoteRequired ? 0 : Math.round(priceResultSin.price * 100) / 100;

        // precio CON permiso — always includes $3 permit fee for reference
        const priceResultCon   = calculatePrice(peso, country, shippingType, 'regular', true);
        const precioConPermiso = priceResultCon.quoteRequired ? 0 : Math.round(priceResultCon.price * 100) / 100;

        const originalData: Record<string, unknown> = {};
        row.forEach((cell, idx) => {
          originalData[headers[idx] || `col_${idx}`] = cell;
        });

        // Get description from file and remove "PERMISO" word
        let descripcion = descripcionCol !== undefined ? String(row[descripcionCol] || '').toUpperCase() : '';
        descripcion = descripcion.replace(/\s*PERMISO\s*/gi, ' ').trim();

        const processedRow: ManifestRow = {
          tracking,
          nombre,
          guia,
          manifiesto: manifestNumber,
          peso,
          precio,
          slCode,
          nombreCliente,
          ruta,
          consolidacion,
          descripcion,
          permisos: manifestConfig.requiresPermit,
          pesoRedondeo,
          diferenciaRedondeo,
          pesoConsolidacion,
          precioSinPermiso,
          precioConPermiso,
          matchScore,
          matchSource: matchSource || undefined,
          hasPreAlert: preAlertAccepted,
          preAlertSlCode: preAlertAccepted ? slCode : undefined,
          preAlertCreatedAt: preAlertOverride?.preAlertCreatedAt,
          preAlertKey: preAlertOverride?.preAlertKey,
          preAlertId: preAlertOverride?.preAlertId,
          originalData,
        };

        rows.push(processedRow);
        processedCount++;
      } catch (error) {
        console.error(`Error processing row ${rowIndex}:`, error);
        errorCount++;
      }
    });
    
    updateStep('9', 'completed', `${processedCount} filas | $${totalPrice.toFixed(2)} total`);
    
    // Determine if user choice is required (< 5 rows can be asked, >= 5 should export file)
    const requiresUserChoice = multiMatchRows.length > 0 && multiMatchRows.length < 5;
    
    // Collect unmatched names for AI suggestions
    const unmatchedNames: string[] = [];
    for (const row of rows) {
      if (!row.slCode || row.slCode === 'N/A') {
        unmatchedNames.push(row.nombre);
      }
    }
    
    // Generate AI suggestions based on unmatched names (if any)
    let aiSuggestions: ProcessingResult['aiSuggestions'];
    if (unmatchedNames.length > 0) {
      const patterns: string[] = [];
      const suggestions: string[] = [];
      
      // Analyze patterns in unmatched names
      const uniqueUnmatched = [...new Set(unmatchedNames)].slice(0, 20);
      
      // Check for common patterns
      const hasInitials = uniqueUnmatched.some(n => /^[A-Z]\s+/.test(n));
      const hasReversedOrder = uniqueUnmatched.some(n => n.split(' ').length >= 2);
      const hasSpecialChars = uniqueUnmatched.some(n => /[^A-Z\s]/.test(n));
      
      if (hasInitials) {
        patterns.push('Nombres con iniciales detectados (ej: "J PEREZ")');
        suggestions.push('Expandir iniciales: agregar mapeo de iniciales comunes');
      }
      if (hasReversedOrder) {
        patterns.push('Posibles nombres en orden invertido');
        suggestions.push('Verificar orden apellido-nombre vs nombre-apellido');
      }
      if (hasSpecialChars) {
        patterns.push('Caracteres especiales en nombres');
        suggestions.push('Normalizar caracteres especiales antes de comparar');
      }
      if (uniqueUnmatched.length > 5) {
        suggestions.push(`${uniqueUnmatched.length} nombres sin match - considerar agregar nuevos clientes`);
      }
      
      aiSuggestions = {
        unmatchedNames: uniqueUnmatched,
        patterns,
        suggestions,
      };
    }
    
    // Resolve recent exchange rate from Firestore
    let resolvedExchangeRate: number | undefined = undefined;
    try {
      const manifests = await getRecentManifests(10);
      const withTc = manifests.filter((m) => (m.exchangeRate ?? 0) > 0);
      if (withTc.length > 0) {
        resolvedExchangeRate = withTc[0].exchangeRate;
      }
    } catch (err) {
      console.warn('[ManifestProcessor] failed to fetch recent exchange rate:', err);
    }

    return {
      rows,
      summary: {
        totalRows: data.length,
        processedRows: processedCount,
        errors: errorCount,
        totalPrice,
        customersMatched,
        namesCorrections,
        weightCorrections,
      },
      manifestNumber,
      manifestType,
      corrections,
      validation,
      multiMatchRows,
      requiresUserChoice,
      aiSuggestions,
      ...(resolvedExchangeRate ? { exchangeRate: resolvedExchangeRate } : {}),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    throw new Error(`Error procesando archivo: ${errorMessage}`);
  }
}

