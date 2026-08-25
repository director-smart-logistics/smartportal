// ─── Types ────────────────────────────────────────────────────────────────────
export interface ScanResult {
  id?: string;
  tracking: string;
  ruta: string;
  routeAbbr: string;
  routeGradient: string;
  customerName: string;
  slCode: string;
  status: string;
  requiresPermit: boolean;
  consolidationEnabled: boolean;
  pendingUserAssignment: boolean;
  weight?: number;
  manifestNumber?: string;
  // Master package custom fields
  isMasterPackage?: boolean;
  groupedTrackings?: string[];
  packageCount?: number;
  totalAmount?: number;
  encomiendaServiceName?: string;
}

export interface HistoryEntry extends ScanResult {
  scannedAt: number;
}

export type ScanState = 'idle' | 'scanning' | 'found' | 'not-found' | 'error';

// ─── Route gradient map ───────────────────────────────────────────────────────
export const ROUTE_GRADIENT: Record<string, string> = {
  'San Jose Centro':   'from-purple-600 to-purple-800',
  'San Jose Escazu':   'from-fuchsia-400 to-fuchsia-600',
  'Escazu':            'from-fuchsia-400 to-fuchsia-600',
  'San Jose Coronado': 'from-pink-400 to-pink-600',
  'Cartago 1':         'from-cyan-400 to-cyan-600',
  'Cartago 2':         'from-blue-500 to-blue-700',
  'Encomiendas':       'from-emerald-500 to-emerald-700',
  'Occidente':         'from-orange-500 to-orange-700',
  'Alajuela':          'from-red-500 to-red-700',
  'Heredia':           'from-yellow-400 to-yellow-600',
  'Retira':            'from-stone-500 to-stone-700',
  'RETIRA':            'from-stone-500 to-stone-700',
  'Pickup':            'from-stone-500 to-stone-700',
  'Desconocida':       'from-zinc-500 to-zinc-700',
};

// ─── Route abbreviations ──────────────────────────────────────────────────────
const ROUTE_ABBR: Record<string, string> = {
  'Heredia': 'H', 'Alajuela': 'A', 'Cartago 1': 'C1', 'Cartago 2': 'C2',
  'San Jose Centro': 'SJ', 'San Jose Escazu': 'SJ-E', 'San Jose Coronado': 'SJ-C',
  'Occidente': 'OCC', 'Encomiendas': 'ENC',
  'Retira': 'RET', 'RETIRA': 'RET', 'Pickup': 'RET', 'Escazu': 'ESC', 'Desconocida': 'DES',
};

// ─── Status labels ────────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<string, string> = {
  received:      'En Bodega',
  customs:       'En Aduana',
  route:         'En Ruta',
  delivered:     'Entregado',
  held:          'Retenido',
  returned:      'Devuelto',
  pending:       'Pendiente',
  consolidated:  'Consolidado',
  transit:       'En Tránsito',
  'pre-alerted': 'Pre-Alertado',
  processed:     'Facturado',
  pickup:        'Retira',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getGradient(ruta?: string): string {
  if (!ruta) return 'from-slate-700 to-slate-900';
  if (ROUTE_GRADIENT[ruta]) return ROUTE_GRADIENT[ruta];
  const lower = ruta.toLowerCase();
  if (lower.includes('occidente')) return ROUTE_GRADIENT['Occidente'] ?? 'from-orange-500 to-orange-700';
  if (lower.includes('san jose') || lower.includes('sj')) {
    if (lower.includes('escazu'))   return ROUTE_GRADIENT['San Jose Escazu'] ?? 'from-fuchsia-400 to-fuchsia-600';
    if (lower.includes('centro'))   return ROUTE_GRADIENT['San Jose Centro'] ?? 'from-purple-600 to-purple-800';
    if (lower.includes('coronado')) return ROUTE_GRADIENT['San Jose Coronado'] ?? 'from-pink-400 to-pink-600';
    return ROUTE_GRADIENT['San Jose Centro'] ?? 'from-purple-600 to-purple-800';
  }
  if (lower.includes('cartago')) {
    return ruta.includes('2') 
      ? (ROUTE_GRADIENT['Cartago 2'] ?? 'from-blue-500 to-blue-700') 
      : (ROUTE_GRADIENT['Cartago 1'] ?? 'from-cyan-400 to-cyan-600');
  }
  if (lower.includes('heredia'))   return ROUTE_GRADIENT['Heredia'] ?? 'from-yellow-400 to-yellow-600';
  if (lower.includes('alajuela'))  return ROUTE_GRADIENT['Alajuela'] ?? 'from-red-500 to-red-700';
  return 'from-slate-600 to-slate-800';
}

export function getAbbr(ruta: string): string {
  if (ROUTE_ABBR[ruta]) return ROUTE_ABBR[ruta];
  const lower = ruta.toLowerCase();
  if (lower.includes('occidente')) return 'OCC';
  if (lower.includes('san jose') || lower.includes('sj')) {
    if (lower.includes('escazu'))   return 'SJ-E';
    if (lower.includes('centro'))   return 'SJ';
    if (lower.includes('coronado')) return 'SJ-C';
    return 'SJ';
  }
  if (lower.includes('cartago'))   return ruta.includes('2') ? 'C2' : 'C1';
  if (lower.includes('heredia'))   return 'H';
  if (lower.includes('alajuela'))  return 'A';
  return ruta.substring(0, 3).toUpperCase();
}

// ─── Web Audio beep (no external deps) ───────────────────────────────────────
export function playBeep(type: 'success' | 'error'): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx  = new AudioCtx();
    
    if (type === 'success') {
      // Modern success chime: Two quick high notes (A5 -> E6) with bell envelope
      const playNote = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      playNote(880, now, 0.4); // A5
      playNote(1318.51, now + 0.1, 0.6); // E6
      
    } else {
      // Modern error sound: A soft, low double-thud
      const playThud = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.8, startTime + duration);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playThud(250, now, 0.2);
      playThud(200, now + 0.15, 0.3);
    }
  } catch { /* blocked before first user gesture — safe to ignore */ }
}

// ─── Speech Synthesis (TTS) ───────────────────────────────────────────────────

export interface SpeechSettings {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  repeatRoute: boolean;
}

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  voiceName: '',
  rate: 1.25, // Updated default rate to 1.25
  pitch: 1.25, // Updated default pitch to 1.25
  volume: 1.0,
  repeatRoute: false,
};

export function getSpeechSettings(): SpeechSettings {
  if (typeof window === 'undefined') return DEFAULT_SPEECH_SETTINGS;
  try {
    const raw = localStorage.getItem('bodega-speech-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate legacy default values to the new 1.25 defaults
      if (parsed.rate === 1.1) parsed.rate = 1.25;
      if (parsed.pitch === 1.3) parsed.pitch = 1.25;
      return { ...DEFAULT_SPEECH_SETTINGS, ...parsed };
    }
  } catch {}
  return DEFAULT_SPEECH_SETTINGS;
}

export function saveSpeechSettings(settings: SpeechSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('bodega-speech-settings', JSON.stringify(settings));
  } catch {}
}

// Warm up the voices cache on load and ensure it is ready when called
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

/**
 * Returns the highest quality Spanish voice available on the host system.
 * Prioritizes natural/Siri/Google/Microsoft Sabina/Monica/Paulina voices.
 */
export function getPremiumSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const esVoices = voices.filter(
    v => v.lang.startsWith('es-') || v.lang.startsWith('es_') || v.lang.toLowerCase().includes('spanish')
  );
  
  if (esVoices.length === 0) return null;

  // Premium voice keywords ordered from highest quality/most natural to standard
  const premiumKeywords = [
    'siri',        // iOS/macOS Siri voices (extraordinary natural quality)
    'monica',      // macOS Monica premium
    'paulina',     // macOS Paulina premium
    'google',      // Google TTS Spanish premium
    'sabina',      // Windows 10/11 Microsoft Sabina
    'helena',      // Windows Microsoft Helena
    'diego',       // macOS Diego
    'jorge',       // macOS Jorge
    'raul',        // Windows Microsoft Raul
    'natural',     // Chrome Premium Natural
    'neural',      // Neural engine voices
  ];

  const scored = esVoices.map(voice => {
    const nameLower = voice.name.toLowerCase();
    let score = 0;
    
    // Score based on premium keywords
    for (let i = 0; i < premiumKeywords.length; i++) {
      if (nameLower.includes(premiumKeywords[i])) {
        score += (premiumKeywords.length - i) * 10;
        break;
      }
    }
    
    // Latin American regional priority for local accents
    const langLower = voice.lang.toLowerCase();
    if (langLower.includes('cr') || langLower.includes('mx') || langLower.includes('us') || langLower.includes('la')) {
      score += 5;
    }
    if (voice.localService) {
      score += 2; // Prefer local system engine to avoid server-dependent delay
    }
    
    return { voice, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.voice || null;
}

let speechTimeoutId: any = null;

export function speakAnnouncement(text: string, customSettings?: SpeechSettings, delayMs: number = 2000): void {
  try {
    if (!window.speechSynthesis) return;

    // 1. Cancel any active speech to avoid overlaps during quick scanning
    window.speechSynthesis.cancel();

    // 2. Clear any pending speech timeout
    if (speechTimeoutId) {
      clearTimeout(speechTimeoutId);
    }

    // 3. Wrap speech synthesis in a delay
    speechTimeoutId = setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      const settings = customSettings || getSpeechSettings();
      const voices = window.speechSynthesis.getVoices();

      let chosenVoice: SpeechSynthesisVoice | null = null;
      if (settings.voiceName) {
        chosenVoice = voices.find(v => v.name === settings.voiceName) || null;
      }
      if (!chosenVoice) {
        chosenVoice = getPremiumSpanishVoice();
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;
      } else {
        utterance.lang = 'es-ES'; // Default fallback
      }

      // Calibrate parameters from the settings
      utterance.volume = settings.volume;
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;

      window.speechSynthesis.speak(utterance);
    }, delayMs);
  } catch (e) {
    console.error('[TTS] Speech synthesis error:', e);
  }
}

export function getScanResultPhrase(result: ScanResult): string {
  if (result.isMasterPackage) {
    const name = result.customerName || '';
    const service = result.encomiendaServiceName || 'Sin servicio';
    const count = result.packageCount || 0;
    const isHeld = result.status === 'held' || result.status === 'returned';
    const authStatus = isHeld ? 'Retenida. No autorizada.' : 'Autorizada.';
    return `${name}. Vía ${service}. ${count} paquetes. ${authStatus}`;
  }
  const abbr = (result.routeAbbr || '').toUpperCase().trim();
  let routePhrase = '';

  // Phonetic translations for exact route initials and direct names
  if (abbr === 'A') {
    routePhrase = 'Alajuela.';
  } else if (abbr === 'C1' || abbr === 'C-1') {
    routePhrase = 'Cartago uno.';
  } else if (abbr === 'C2' || abbr === 'C-2') {
    routePhrase = 'Cartago dos.';
  } else if (abbr === 'SJ' || abbr === 'SJOC') {
    routePhrase = 'Centro.';
  } else if (abbr === 'SJ-E' || abbr === 'SJE' || abbr === 'SJOE') {
    routePhrase = 'Escazú.';
  } else if (abbr === 'SJ-C' || abbr === 'SJC' || abbr === 'SJOCO') {
    routePhrase = 'Coronado.';
  } else if (abbr === 'OCC') {
    routePhrase = 'Occidente.';
  } else if (abbr === 'H') {
    routePhrase = 'Heredia.';
  } else if (abbr === 'ENC') {
    routePhrase = 'Encomiendas.';
  } else if (abbr === 'RET') {
    routePhrase = 'Retira.';
  } else if (abbr === 'DES') {
    routePhrase = 'Desconocida.';
  } else {
    // If it's a completely custom route name, spell it out space-separated
    routePhrase = abbr.split('').join(', ') + '.';
  }

  let fullPhrase = routePhrase;

  if (result.requiresPermit) {
    fullPhrase += ' Permiso.';
  }
  if (result.pendingUserAssignment) {
    fullPhrase += ' Sin cliente.';
  }
  if (result.consolidationEnabled) {
    fullPhrase += ' Consolidado.';
  }

  return fullPhrase;
}

export function announceScanResult(result: ScanResult, customSettings?: SpeechSettings): void {
  const settings = customSettings || getSpeechSettings();
  if (result.isMasterPackage) {
    const name = result.customerName || '';
    const service = result.encomiendaServiceName || 'Sin servicio';
    const count = result.packageCount || 0;
    const isHeld = result.status === 'held' || result.status === 'returned';
    const authStatus = isHeld ? 'Retenida. No autorizada.' : 'Autorizada.';
    const spokenText = `${name}. Vía ${service}. ${count} paquetes. ${authStatus}`;
    speakAnnouncement(spokenText, settings);
    return;
  }
  const abbr = (result.routeAbbr || '').toUpperCase().trim();

  let routePhrase = '';

  if (abbr === 'A') {
    routePhrase = 'Alajuela.';
  } else if (abbr === 'C1' || abbr === 'C-1') {
    routePhrase = 'Cartago uno.';
  } else if (abbr === 'C2' || abbr === 'C-2') {
    routePhrase = 'Cartago dos.';
  } else if (abbr === 'SJ' || abbr === 'SJOC') {
    routePhrase = 'Centro.';
  } else if (abbr === 'SJ-E' || abbr === 'SJE' || abbr === 'SJOE') {
    routePhrase = 'Escazú.';
  } else if (abbr === 'SJ-C' || abbr === 'SJC' || abbr === 'SJOCO') {
    routePhrase = 'Coronado.';
  } else if (abbr === 'OCC') {
    routePhrase = 'Occidente.';
  } else if (abbr === 'H') {
    routePhrase = 'Heredia.';
  } else if (abbr === 'ENC') {
    routePhrase = 'Encomiendas.';
  } else if (abbr === 'RET') {
    routePhrase = 'Retira.';
  } else if (abbr === 'DES') {
    routePhrase = 'Desconocida.';
  } else {
    routePhrase = abbr.split('').join(', ') + '.';
  }

  let spokenText = routePhrase;
  if (settings.repeatRoute) {
    spokenText = `${routePhrase} ... ${routePhrase}`;
  }

  let fullPhrase = spokenText;

  if (result.requiresPermit) {
    fullPhrase += ' Permiso.';
  }
  if (result.pendingUserAssignment) {
    fullPhrase += ' Sin cliente.';
  }
  if (result.consolidationEnabled) {
    fullPhrase += ' Consolidado.';
  }

  speakAnnouncement(fullPhrase, settings);
}

export function isInternalTracking(barcode: string): boolean {
  if (!barcode) return false;
  const clean = barcode.replace(/[\s\-_]+/g, '').toUpperCase();
  return /^SL\d{15,}/.test(clean);
}

export function announceError(type: 'not-found' | 'error', customSettings?: SpeechSettings, barcode?: string): void {
  const settings = customSettings || getSpeechSettings();
  if (type === 'not-found') {
    if (barcode && isInternalTracking(barcode)) {
      speakAnnouncement('TRACKING INTERNO no autorizado para la salida.', settings);
    } else {
      speakAnnouncement('No encontrado.', settings);
    }
  } else {
    speakAnnouncement('Sin conexión.', settings);
  }
}

