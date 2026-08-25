/**
 * Matching Engine — Type Definitions
 *
 * Central source of truth for all interfaces used by the customer matching
 * pipeline. Every module in `matching/` imports from here — never from
 * the old monolithic `customer-matcher.ts`.
 *
 * @module matching/types
 */

// ─── Core Data ──────────────────────────────────────────────────────────────────

/**
 * Represents a customer record loaded from the SP1 `customers` collection
 * or from `temp_customers`. This is the in-memory shape used for matching —
 * NOT the Firestore document shape.
 */
export interface CustomerData {
  id: string;
  name: string;
  fullName: string;
  /** Accent-stripped, uppercase, for matching */
  normalizedName: string;
  firstName: string;
  lastName: string;
  slCode: string;
  ruta?: string;
  consolidationEnabled: boolean;
  email?: string;
  phone?: string;
  dni?: string;
  /** True when the record originates from temp_customers (no SP1 account yet) */
  isTemp?: boolean;
}

// ─── Match Results ──────────────────────────────────────────────────────────────

/**
 * A single scored candidate returned by `matchName()`.
 * Contains the matched customer, the final blended score, and a breakdown
 * of which algorithms contributed.
 */
export interface MatchResult {
  customer: CustomerData;
  score: number;
  matchType: 'exact' | 'normalized' | 'fuzzy' | 'partial';
  matchedField: 'fullName' | 'firstName+lastName' | 'name' | 'firstName' | 'lastName';
  algorithms: {
    exact: boolean;
    normalized: boolean;
    levenshtein: number;
    jaroWinkler: number;
    tokenBased: number;
    firstNameMatch: number;
    lastNameMatch: number;
    doubleMetaphone: number;
  };
}

/**
 * Response returned by all public matching functions (`findCustomerMatch`,
 * `batchFindCustomerMatches`, `batchFindCustomerMatchesWithAI`).
 */
export interface CustomerMatchResponse {
  exactMatch: boolean;
  bestMatch?: MatchResult;
  candidates: MatchResult[];
  slCode?: string;
  ruta?: string;
  consolidationEnabled?: boolean;
  searchedName: string;
  totalCustomers: number;
  multipleMatches: boolean;
  requiresUserChoice: boolean;
}

// ─── Internal Indexes ───────────────────────────────────────────────────────────

/**
 * Pre-computed in-memory indexes for O(1) customer lookups.
 * Built once per cache load in `customer-loader.ts`.
 */
export interface CustomerIndexes {
  bySlCode: Map<string, CustomerData>;
  byName: Map<string, CustomerData>;
  byNameReversed: Map<string, CustomerData>;
  byFirstToken: Map<string, CustomerData[]>;
  byLastToken: Map<string, CustomerData[]>;
  tokenData: TokenizedCustomer[];
}

/**
 * Pre-tokenized customer record stored inside `CustomerIndexes.tokenData`.
 * Avoids re-splitting + re-normalizing every customer on each match call.
 */
export interface TokenizedCustomer {
  customer: CustomerData;
  parts: string[];
  reversedParts: string[];
  meaningfulParts: string[];
  firstTokenKey: string;
  lastTokenKey: string;
}
