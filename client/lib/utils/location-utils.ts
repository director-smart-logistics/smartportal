/**
 * location-utils.ts
 * Utility to extract and format Costa Rica districts and locations from raw customer addresses
 * and geocoded Google Maps text strings.
 */

// Provinces list (used to give higher priority to specific districts/cantons over broad provinces)
export const CR_PROVINCES = new Set([
  'san jose', 'alajuela', 'cartago', 'heredia', 'guanacaste', 'puntarenas', 'limon'
]);

// Comprehensive dictionary of Costa Rica cantons and districts
export const CR_DISTRICTS_AND_CANTONS = [
  // San José
  'San José', 'Carmen', 'Merced', 'Hospital', 'Catedral', 'Zapote', 'San Francisco de Dos Ríos',
  'Uruca', 'Mata Redonda', 'Pavas', 'Hatillo', 'San Sebastián', 'Escazú', 'San Antonio',
  'San Rafael', 'Desamparados', 'San Miguel', 'San Juan de Dios', 'San Rafael Arriba',
  'San Rafael Abajo', 'Los Guido', 'Patarrá', 'Puriscal', 'Santiago', 'Tarbaca', 'Aserrí',
  'Mora', 'Ciudad Colón', 'Guayabo', 'Goicoechea', 'Guadalupe', 'Calle Blancos',
  'Mata de Plátano', 'Ipís', 'Rancho Redondo', 'Purral', 'Santa Ana', 'Salitral', 'Pozos',
  'Piedades', 'Brasil', 'Alajuelita', 'San Josecito', 'Concepción', 'San Felipe', 'Coronado',
  'San Isidro', 'Dulce Nombre', 'Patalillo', 'Cascajal', 'Acosta', 'San Ignacio', 'Tibás',
  'San Juan', 'Cinco Esquinas', 'Anselmo Llorente', 'León XIII', 'Colima', 'Moravia',
  'San Vicente', 'San Jerónimo', 'La Trinidad', 'Montes de Oca', 'San Pedro', 'Sabanilla',
  'Mercedes', 'Turrubares', 'San Pablo', 'Dota', 'Santa María', 'Curridabat', 'Granadilla',
  'Sánchez', 'Tirrases', 'Pérez Zeledón', 'San Isidro de El General', 'Daniel Flores', 'Rivas',
  'Platanares', 'Pejibaye', 'Cajón', 'Barú', 'Río Nuevo', 'Páramo', 'La Amistad', 'León Cortés',

  // Alajuela
  'Alajuela', 'Carrizal', 'Guácima', 'Río Segundo', 'Turrúcares', 'Tambor', 'Garita',
  'Sarapiquí', 'San Ramón', 'Piedades Norte', 'Piedades Sur', 'Ángeles', 'Alfaro', 'Volio',
  'Zapotal', 'Peñas Blancas', 'San Lorenzo', 'Grecia', 'San Roque', 'Tacares', 'Puente de Piedra',
  'Bolívar', 'San Mateo', 'Atenas', 'Jesús', 'Santa Eulalia', 'Naranjo', 'Cirrí Sur', 'El Rosario',
  'Palmares', 'Zaragoza', 'Buenos Aires', 'Candelaria', 'Poás', 'Carrillos', 'Sabana Redonda',
  'Orotina', 'El Mastate', 'Hacienda Vieja', 'Coyolar', 'La Ceiba', 'San Carlos', 'Quesada',
  'Florencia', 'Buenavista', 'Aguas Zarcas', 'Venecia', 'Pital', 'La Fortuna', 'La Tigra',
  'La Palmera', 'Venado', 'Cutris', 'Monterrey', 'Poco Sol', 'Zarcero', 'Laguna', 'Tapesco',
  'Palmira', 'Brisas', 'Valverde Vega', 'Sarchí Norte', 'Sarchí Sur', 'Sarchí', 'Toro Amarillo',
  'Rodríguez', 'Upala', 'Los Chiles', 'Guatuso', 'Río Celeste', 'Río Cuarto',

  // Cartago
  'Cartago', 'Oriental', 'Occidental', 'San Nicolás', 'Taras', 'Francisco Peralta', 'Arenilla',
  'Guadalupe (Arenilla)', 'Corralillo', 'Tierra Blanca', 'Llano Grande', 'Quebradilla',
  'Paraíso', 'Orosi', 'Cachí', 'Llanos de Santa Lucía', 'Birrisito', 'La Unión', 'Tres Ríos',
  'San Diego', 'San Ramón', 'Río Azul', 'Jiménez', 'Juan Viñas', 'Tucurrique', 'Victoria',
  'Turrialba', 'La Suiza', 'Peralta', 'Santa Cruz', 'Santa Teresita', 'Pavones', 'Tuis',
  'Tayutic', 'Santa Rosa', 'Tres Equis', 'La Isabel', 'Chirripó', 'Alvarado', 'Pacayas',
  'Cervantes', 'Capellades', 'Oreamuno', 'Cot', 'Potrero Cerrado', 'Cipreses', 'El Guarco',
  'El Tejar', 'Tobosi', 'Patio de Agua',

  // Heredia
  'Heredia', 'Ulloa', 'Varablanca', 'Barva', 'Santa Lucía', 'San José de la Montaña',
  'Santo Domingo', 'Paracito', 'Santo Tomás', 'Tures', 'Pará', 'Santa Bárbara', 'Puraba',
  'Belén', 'La Asunción', 'La Ribera', 'Flores', 'San Joaquín', 'Barrantes', 'Llorente',
  'Puerto Viejo', 'La Virgen', 'Horquetas', 'Llanuras del Gaspar', 'Cureña',

  // Guanacaste
  'Liberia', 'Cañas Dulces', 'Mayorga', 'Nacascolo', 'Curubandé', 'Nicoya', 'Mansión',
  'Quebrada Honda', 'Sámara', 'Nosara', 'Belén de Nosarita', 'Santa Cruz', 'Bolsón',
  'Veintisiete de Abril', 'Tempate', 'Cartagena', 'Cuajiniquil', 'Diriá', 'Cabo Velas',
  'Tamarindo', 'Bagaces', 'Mogote', 'Río Naranjo', 'Carrillo', 'Filadelfia', 'Sardinal',
  'Cañas', 'Bebedero', 'Porozal', 'Abangares', 'Las Juntas', 'Sierra', 'Colorado', 'Tilarán',
  'Quebrada Grande', 'Tronadora', 'Líbano', 'Tierras Morenas', 'Arenal', 'Cabeceras',
  'Nandayure', 'Carmelita', 'Santa Rita', 'Porvenir', 'Bejuco', 'La Cruz', 'Santa Cecilia',
  'Santa Elena', 'Hojancha', 'Monte Romo', 'Puerto Carrillo', 'Huacas', 'Matambú',

  // Puntarenas
  'Puntarenas', 'Pitahaya', 'Chomes', 'Lepanto', 'Paquera', 'Manzanillo', 'Guacimal',
  'Barranca', 'Monte Verde', 'Monteverde', 'Isla del Coco', 'Cóbano', 'Chacarita', 'Chira',
  'Acapulco', 'El Roble', 'Arancibia', 'Esparza', 'Espíritu Santo', 'San Juan Grande',
  'Macacona', 'Caldera', 'Volcán', 'Potrero Grande', 'Boruca', 'Pilas', 'Colinas',
  'Chánguena', 'Biolley', 'Brunka', 'Montes de Oro', 'Miramar', 'Osa', 'Puerto Cortés',
  'Palmar', 'Sierpe', 'Bahía Ballena', 'Piedras Blancas', 'Bahía Drake', 'Quepos', 'Savegre',
  'Naranjito', 'Golfito', 'Puerto Jiménez', 'Guaycará', 'Pavón', 'Coto Brus', 'San Vito',
  'Sabalito', 'Aguabuena', 'Limoncito', 'Pittier', 'Gutiérrez Braun', 'Parrita', 'Corredores',
  'Corredor', 'La Cuesta', 'Canoas', 'Laurel', 'Garabito', 'Jacó', 'Tárcoles',

  // Limón
  'Limón', 'Valle La Estrella', 'Río Blanco', 'Matama', 'Pococí', 'Guápiles', 'Rita',
  'Roxana', 'Cariari', 'La Colonia', 'Siquirres', 'Pacuarito', 'Florida', 'Germania',
  'El Cairo', 'Alegría', 'Reventazón', 'Talamanca', 'Bratsi', 'Sixaola', 'Cahuita',
  'Telire', 'Matina', 'Batán', 'Carrandi', 'Guácimo', 'Pocora', 'Río Jiménez', 'Duacarí'
];

/** Normalize string by removing accents and lowercasing for fuzzy comparison */
export function normalizeLocation(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Map of normalized name to canonical display name
const NORMALIZED_LOOKUP = new Map<string, string>();
CR_DISTRICTS_AND_CANTONS.forEach(name => {
  const norm = normalizeLocation(name);
  if (!NORMALIZED_LOOKUP.has(norm)) {
    NORMALIZED_LOOKUP.set(norm, name);
  }
});

// Non-district filler words to ignore when scanning tokens
const IGNORE_PATTERNS = [
  /^costa rica$/i,
  /^cr$/i,
  /^provincia de /i,
  /^provincia /i,
  /^prov\./i,
  /^canton de /i,
  /^distrito de /i,
  /^[A-Z0-9]{2,8}\+[A-Z0-9]{2,4}/i, // Plus codes e.g. W293+G4R
  /^\d{4,5}$/, // Zip codes
];

/**
 * Extracts the most accurate district or location name from a raw address or geocoded string.
 * Example inputs:
 * - "W293+G4R, Provincia de Cartago, Concepción, Costa Rica" -> "Concepción"
 * - "Cartago, Guadalupe (Arenilla), Central" -> "Guadalupe (Arenilla)"
 * - "150m este de la iglesia, San Rafael, La Unión" -> "San Rafael"
 * - "De la iglesia de caballo blanco 25m este... San Rafael" -> "San Rafael"
 */
export function extractDistrictFromAddress(address?: string | null): string | null {
  if (!address || typeof address !== 'string') return null;
  const raw = address.trim();
  if (!raw) return null;

  // 1. Check if the address is comma-separated (typical of Google Geocoded addresses or structured addresses)
  const segments = raw.split(',').map(s => s.trim()).filter(Boolean);

  let fallbackProvinceMatch: string | null = null;

  // Priority pass: Find specific non-province district matches
  for (const seg of segments) {
    if (IGNORE_PATTERNS.some(pat => pat.test(seg))) continue;

    const normSeg = normalizeLocation(seg);
    const cleanParen = normalizeLocation(seg.replace(/\([^)]*\)/g, '').trim());

    // Check if segment is a broad province name
    if (CR_PROVINCES.has(normSeg)) {
      if (!fallbackProvinceMatch) fallbackProvinceMatch = NORMALIZED_LOOKUP.get(normSeg) || seg;
      continue;
    }

    // Check exact parentheses match e.g. "Guadalupe (Arenilla)"
    if (seg.includes('(') && seg.includes(')') && cleanParen && NORMALIZED_LOOKUP.has(cleanParen)) {
      return seg; // preserve exact segment "Guadalupe (Arenilla)"
    }

    // Check direct normalized match
    if (NORMALIZED_LOOKUP.has(normSeg)) {
      return NORMALIZED_LOOKUP.get(normSeg)!;
    }
  }

  // 2. If no direct segment matched, check if any known district appears in the full address text as a distinct word/phrase
  const normFull = ` ${normalizeLocation(raw)} `;
  // Sort districts by length descending to match multi-word districts first
  const sortedDistricts = Array.from(NORMALIZED_LOOKUP.entries())
    .filter(([norm]) => !CR_PROVINCES.has(norm)) // prioritize non-provinces
    .sort((a, b) => b[0].length - a[0].length);

  for (const [normDist, canonicalName] of sortedDistricts) {
    if (normDist.length < 4) continue;
    
    // Check if whole word/phrase exists in normalized address
    const wordBoundaryRegex = new RegExp(`(?:^|[\\s,.;:/-])${normDist}(?:$|[\\s,.;:/-])`, 'i');
    if (wordBoundaryRegex.test(normFull)) {
      return canonicalName;
    }
  }

  // 3. Fallback to candidate segment from Google Geocoding (non-plus code, non-country, non-province)
  if (segments.length >= 3) {
    const candidate = segments.find(seg => 
      !IGNORE_PATTERNS.some(pat => pat.test(seg)) &&
      !CR_PROVINCES.has(normalizeLocation(seg)) &&
      !/^(costa rica|cr|central)$/i.test(normalizeLocation(seg))
    );
    if (candidate && candidate.length > 2 && candidate.length < 35) {
      return candidate;
    }
  }

  // 4. Return province fallback only if nothing more specific was found
  if (fallbackProvinceMatch) return fallbackProvinceMatch;

  return null;
}
