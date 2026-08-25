/**
 * Gender and Distinct Given Name Guard
 *
 * Prevents distinct Spanish given names that differ by only 1-2 suffix/vowel characters
 * (e.g., DANIEL vs DANIELA, VICTOR vs VICTORIA, MARIO vs MARIA) from being treated as
 * typographical errors or fuzzy-matching each other.
 *
 * Real typos (e.g., DANIEL vs DANEL, RODRIGUEZ vs RODRIGEZ, GONZALEZ vs GONZALES)
 * are NOT in this map and will continue to fuzzy-match normally.
 *
 * @module matching/gender-name-guard
 */

// Normalized distinct given name pairs (bidirectional)
const DISTINCT_GIVEN_NAME_PAIRS: ReadonlyArray<[string, string]> = [
  // A / O / IA / IEL endings
  ['DANIEL', 'DANIELA'],
  ['VICTOR', 'VICTORIA'],
  ['GABRIEL', 'GABRIELA'],
  ['MARIO', 'MARIA'],
  ['ADRIAN', 'ADRIANA'],
  ['JULIAN', 'JULIANA'],
  ['CARLOS', 'CARLA'],
  ['CARLOS', 'CAROLINA'],
  ['LUIS', 'LUISA'],
  ['MANUEL', 'MANUELA'],
  ['PAULO', 'PAULA'],
  ['PABLO', 'PAOLA'],
  ['PABLO', 'PAULA'],
  ['CRISTIAN', 'CRISTINA'],
  ['FERNANDO', 'FERNANDA'],
  ['ALEJANDRO', 'ALEJANDRA'],
  ['MARCELO', 'MARCELA'],
  ['ROBERTO', 'ROBERTA'],
  ['CLAUDIO', 'CLAUDIA'],
  ['FRANCISCO', 'FRANCISCA'],
  ['ANDRES', 'ANDREA'],
  ['RAFAEL', 'RAFAELA'],
  ['SAMUEL', 'SAMUELA'],
  ['MARTIN', 'MARTINA'],
  ['EMILIO', 'EMILIA'],
  ['ESTEBAN', 'ESTEFANIA'],
  ['JULIO', 'JULIA'],
  ['JULIO', 'JULIANA'],
  ['PATRICIO', 'PATRICIA'],
  ['SERGIO', 'SERGIA'],
  ['VALENTIN', 'VALENTINA'],
  ['CAMILO', 'CAMILA'],
  ['IVAN', 'IVANA'],
  ['LUCAS', 'LUCIA'],
  ['MAURICIO', 'MAURICIA'],
  ['RODRIGO', 'RODRIGA'],
  ['RAMON', 'RAMONA'],
  ['SEBASTIAN', 'SEBASTIANA'],
  ['TOMAS', 'TOMASA'],
  ['VICENTE', 'VICENTA'],
  ['ALBERTO', 'ALBERTA'],
  ['EDUARDO', 'EDUARDA'],
  ['ANTONIO', 'ANTONIA'],
  ['HECTOR', 'HECTORA'],
  ['ARIEL', 'ARIELA'],
  ['JORGE', 'GEORGINA'],
  ['ENRIQUE', 'ENRIQUETA'],
  ['PEDRO', 'PETRA'],
  ['JOSE', 'JOSEFINA'],
  ['GUILLERMO', 'GUILLERMINA'],
  ['GONZALO', 'GONZALA'],
  ['FABIAN', 'FABIANA'],
  ['DAMIAN', 'DAMIANA'],
  ['LEONARDO', 'LEONARDA'],
  ['BERNARDO', 'BERNARDA'],
  ['CESAR', 'CESARIA'],
  ['ALEX', 'ALEXA'],
  ['ALEX', 'ALEXANDRA'],
  ['AXEL', 'ALEXA'],
  ['MAX', 'MAXIMA'],
  ['OSCAR', 'OSCARINA'],
];

// O(1) Fast Lookup Map: "NAME_A" -> Set of distinct names it cannot match
const distinctNamesMap = new Map<string, Set<string>>();

DISTINCT_GIVEN_NAME_PAIRS.forEach(([nameA, nameB]) => {
  const normA = nameA.toUpperCase().trim();
  const normB = nameB.toUpperCase().trim();

  if (!distinctNamesMap.has(normA)) distinctNamesMap.set(normA, new Set());
  if (!distinctNamesMap.has(normB)) distinctNamesMap.set(normB, new Set());

  distinctNamesMap.get(normA)!.add(normB);
  distinctNamesMap.get(normB)!.add(normA);
});

/**
 * Returns true if tokenA and tokenB are distinct given names (e.g., male vs female variants)
 * that should NEVER be considered equal or fuzzy-equivalent.
 *
 * @param tokenA - First name token (already normalized/uppercased or raw)
 * @param tokenB - Second name token (already normalized/uppercased or raw)
 */
export function areDistinctGivenNames(tokenA: string, tokenB: string): boolean {
  if (!tokenA || !tokenB) return false;
  const a = tokenA.toUpperCase().trim();
  const b = tokenB.toUpperCase().trim();
  if (a === b) return false;

  const forbiddenSet = distinctNamesMap.get(a);
  return forbiddenSet ? forbiddenSet.has(b) : false;
}
