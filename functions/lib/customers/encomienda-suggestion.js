"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUGGESTION_NOTE_PREFIX = void 0;
exports.suggestedEncomiendaName = suggestedEncomiendaName;
exports.applyEncomiendaSuggestion = applyEncomiendaSuggestion;
/**
 * F8.2 — the encomienda service the customer PROPOSED in SP2 (not in the list yet: SP2 address
 * `encomiendaPendingReview` + `encomiendaSubmittedName`) reaches SP1 so the shipping label shows it.
 *
 * It travels as `encomiendaSuggestedName` and as a note at the start of `deliveryInstructions`
 * (the label already prints that field). The SP1 admin decides: once the address has an official
 * `encomienda` (chosen in SP2 or set by the admin in SP1), the suggestion and its note go away.
 * Pure; tested in test/encomienda-suggestion.spec.ts.
 */
exports.SUGGESTION_NOTE_PREFIX = 'Encomienda sugerida por el cliente:';
/** The name the customer proposed, when the address still has no official service. */
function suggestedEncomiendaName(sp2Address) {
    if (sp2Address.encomienda)
        return null;
    const name = typeof sp2Address.encomiendaSubmittedName === 'string' ? sp2Address.encomiendaSubmittedName.trim() : '';
    return name ? name : null;
}
/** deliveryInstructions without a previous suggestion note (never duplicated). */
function withoutNote(instructions) {
    return String(instructions ?? '')
        .split(' · ')
        .filter((part) => !part.trim().startsWith(exports.SUGGESTION_NOTE_PREFIX))
        .join(' · ')
        .trim();
}
/** Applies the rule to an SP1 address after SP1-only fields were preserved. */
function applyEncomiendaSuggestion(addr) {
    const suggested = addr.encomienda?.name ? null : (addr.encomiendaSuggestedName || null);
    const rest = withoutNote(addr.deliveryInstructions);
    const note = suggested ? `${exports.SUGGESTION_NOTE_PREFIX} ${suggested} (por confirmar)` : '';
    const instructions = [note, rest].filter(Boolean).join(' · ');
    return { ...addr, encomiendaSuggestedName: suggested, deliveryInstructions: instructions || null };
}
//# sourceMappingURL=encomienda-suggestion.js.map