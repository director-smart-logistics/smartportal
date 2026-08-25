/**
 * customer-name.ts — authoritative customer full-name resolution
 *
 * BACKGROUND (BUG-NAME-FROM-DISPLAYNAME evolution):
 *
 * SP1 (this app) stores `firstName`, `lastName`, `fullName` on each customer
 * doc. SP2 (smart-portal-2) stores a free-form `displayName` plus structured
 * `firstName`/`lastName`. The customer-sync job pulls SP2 into SP1 every 6
 * hours. Historically three competing rules have lived here:
 *
 *   Rule A (legacy, pre-0.0.591):
 *     fullName = displayName || firstName+lastName
 *   Breaks when displayName is a handle/username like "Fran92MJ (Fran92MJ)"
 *   — that stale handle wins over the structured "Francisco Mejia" name.
 *
 *   Rule B (0.0.591 fix):
 *     fullName = firstName+lastName || displayName
 *   Fixes the handle case, but silently TRUNCATES multi-surname names for
 *   customers whose SP1 `lastName` is empty: "Jesus" + "" + "JESUS ARRIETA
 *   CLAVERIA" produces fullName="Jesus", destroying Nova's name-based
 *   matching for the whole customer base (regression reported 2026-04-28).
 *
 *   Rule C (this file, 0.0.597 fix):
 *     Prefer `displayName` ONLY when it (1) has strictly MORE name tokens
 *     than the structured form AND (2) does NOT look like a handle (no
 *     digits, no special chars, no repeated token). Otherwise fall back to
 *     firstName+lastName, then displayName, then 'Usuario' as a last resort.
 *
 * Rule C simultaneously handles:
 *   - "Francisco" + "Mejia" + "Fran92MJ (Fran92MJ)" → "Francisco Mejia"
 *     (structured wins; display flagged as handle via digits)
 *   - "Jesus" + "" + "JESUS ARRIETA CLAVERIA" → "JESUS ARRIETA CLAVERIA"
 *     (display has 3 tokens vs 1, no handle markers → display wins)
 *   - "Ana" + "Gonzalez" + "ANA GONZALEZ LOPEZ" → "ANA GONZALEZ LOPEZ"
 *     (display has 3 tokens vs 2 → preserves second apellido for matching)
 *
 * This helper is the single source of truth. Do NOT introduce parallel
 * `fullName = X || Y` fallbacks elsewhere — import and call this instead.
 *
 * Mirrored verbatim (inline, no cross-package import) in:
 *   - functions/src/customers/sync.ts (transformUserToCustomer)
 *   - functions/scripts/run-customer-sync.ts (name-resolution block)
 * Any change here MUST be mirrored there. Covered by unit tests in
 * customer-name.spec.ts.
 */

/**
 * Detect whether `name` looks like a machine handle/username rather than a
 * real person's name. Signals checked:
 *   - Contains digits (e.g. "fran92mj")
 *   - Contains handle-style punctuation: () {} [] <> @ # $
 *   - Repeated token pattern: "Foo (Foo)", "Foo Foo" — typical of SP2
 *     displayName synthesised from a single handle string.
 *
 * Pure: no side effects, safe to call on every sync iteration.
 */
export function looksLikeHandle(name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  if (/\d/.test(clean)) return true;
  if (/[(){}\[\]<>@#$]/.test(clean)) return true;
  const tokens = clean.split(/\s+/).map(t => t.replace(/[()[\]{}<>]/g, ''));
  if (
    tokens.length === 2 &&
    tokens[0].length > 0 &&
    tokens[0].toUpperCase() === tokens[1].toUpperCase()
  ) return true;
  return false;
}

/**
 * Resolve the authoritative customer full name from structured SP1 fields
 * and free-form SP2 displayName. See file-level doc for the complete rule
 * set and failure-mode analysis.
 *
 * @param firstName   - SP1 structured first name (may be empty)
 * @param lastName    - SP1 structured last name (may be empty)
 * @param displayName - SP2 free-form display name (may be empty, may be a
 *                      handle like "Fran92MJ (Fran92MJ)")
 * @returns Non-empty display-ready full name. Never returns an empty string:
 *          falls back to 'Usuario' for completely blank profiles.
 */
export function resolveCustomerFullName(
  firstName: string | undefined | null,
  lastName: string | undefined | null,
  displayName: string | undefined | null,
): string {
  const computed = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim();
  const display  = (displayName || '').trim();
  const computedTokens = computed ? computed.split(/\s+/).length : 0;
  const displayTokens  = display ? display.split(/\s+/).length : 0;
  if (display && !looksLikeHandle(display) && displayTokens > computedTokens) {
    return display;
  }
  return computed || display || 'Usuario';
}

/**
 * Checks if a string is a synthetic placeholder name like "Cliente Pre-alertado (SL123)",
 * "SL-NAN-123", "SIN-NOMBRE", etc.
 */
export function isSyntheticPlaceholderName(name: string | undefined | null): boolean {
  if (!name) return true;
  const lower = name.trim().toLowerCase();
  if (!lower) return true;
  if (lower.includes('pre-alerta') || lower.includes('prealerta')) return true;
  if (lower.startsWith('sl-') || lower.startsWith('sl_')) return true;
  if (lower === 'cliente' || lower === 'usuario' || lower === 'sin-codigo' || lower === 'sin codigo') return true;
  return false;
}

/**
 * Authoritative customer name resolution across all manifest, pre-alert, profile
 * and override layers. Strictly prevents "Cliente Pre-alertado..." and synthetic
 * placeholders from reaching invoices, receipts, manifests or tables.
 */
export function resolveEffectiveCustomerName(params: {
  overrideName?: string | null;
  contactName?: string | null;
  preAlertName?: string | null;
  manifestConsigneeName?: string | null;
  savedCustomerName?: string | null;
  slCode?: string | null;
}): string {
  // 1. Explicit user/operator override
  if (params.overrideName && !isSyntheticPlaceholderName(params.overrideName)) {
    return params.overrideName.trim();
  }
  // 2. Official registered customer profile (SP1/SP2 database)
  if (params.contactName && !isSyntheticPlaceholderName(params.contactName)) {
    return params.contactName.trim();
  }
  // 3. Pre-alert declared name (from customer self-declaration)
  if (params.preAlertName && !isSyntheticPlaceholderName(params.preAlertName)) {
    return params.preAlertName.trim();
  }
  // 4. Saved customer name on row/document (if not a synthetic placeholder)
  if (params.savedCustomerName && !isSyntheticPlaceholderName(params.savedCustomerName)) {
    return params.savedCustomerName.trim();
  }
  // 5. Courier manifest consignee name (from Excel/CSV)
  if (params.manifestConsigneeName && !isSyntheticPlaceholderName(params.manifestConsigneeName)) {
    return params.manifestConsigneeName.trim();
  }
  // 6. Last resort fallback
  return params.slCode ? String(params.slCode).trim() : 'Cliente';
}

