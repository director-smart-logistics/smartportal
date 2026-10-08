/**
 * F8.2 — the encomienda service the customer PROPOSED in SP2 (not in the list yet: SP2 address
 * `encomiendaPendingReview` + `encomiendaSubmittedName`) reaches SP1 so the shipping label shows it.
 *
 * It travels as `encomiendaSuggestedName` and as a note at the start of `deliveryInstructions`
 * (the label already prints that field). The SP1 admin decides: once the address has an official
 * `encomienda` (chosen in SP2 or set by the admin in SP1), the suggestion and its note go away.
 * Pure; tested in test/encomienda-suggestion.spec.ts.
 */
export const SUGGESTION_NOTE_PREFIX = 'Encomienda sugerida por el cliente:';

interface AddressLike {
  encomienda?: { name?: string } | null;
  requiresEncomienda?: boolean;
  deliveryInstructions?: string | null;
  encomiendaSuggestedName?: string | null;
}

/** The name the customer proposed, when the address still has no official service. */
export function suggestedEncomiendaName(sp2Address: { encomiendaPendingReview?: unknown; encomiendaSubmittedName?: unknown; encomienda?: unknown }): string | null {
  if (sp2Address.encomienda) return null;
  const name = typeof sp2Address.encomiendaSubmittedName === 'string' ? sp2Address.encomiendaSubmittedName.trim() : '';
  return name ? name : null;
}

/** deliveryInstructions without a previous suggestion note (never duplicated). */
function withoutNote(instructions: string | null | undefined): string {
  return String(instructions ?? '')
    .split(' · ')
    .filter((part) => !part.trim().startsWith(SUGGESTION_NOTE_PREFIX))
    .join(' · ')
    .trim();
}

/** Applies the rule to an SP1 address after SP1-only fields were preserved. */
export function applyEncomiendaSuggestion<T extends AddressLike>(addr: T): T {
  const suggested = addr.encomienda?.name ? null : (addr.encomiendaSuggestedName || null);
  const rest = withoutNote(addr.deliveryInstructions);
  const note = suggested ? `${SUGGESTION_NOTE_PREFIX} ${suggested} (por confirmar)` : '';
  const instructions = [note, rest].filter(Boolean).join(' · ');
  return { ...addr, encomiendaSuggestedName: suggested, deliveryInstructions: instructions || null };
}
