"use strict";
/**
 * Tracking Variants Generator (server-side)
 * ─────────────────────────────────────────
 * Mirror of `client/lib/utils/tracking-variants.ts` for use in Cloud Functions
 * (manifest ingestion, scanner lookup, backfill). Keep in sync with the client
 * version — both must produce identical output for a given input so a package
 * created from either side is searchable by the same set of variants.
 *
 * Capped at 30 entries to fit Firestore's `array-contains-any` / `in` limit.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTrackingVariants = buildTrackingVariants;
function buildTrackingVariants(raw) {
    if (!raw || typeof raw !== "string")
        return [];
    let cleaned = raw.replace(/[^\x20-\x7E]/g, "").trim();
    if (cleaned.startsWith("]") && cleaned.length > 3) {
        cleaned = cleaned.substring(3);
    }
    cleaned = cleaned.replace(/[\s\-_]+/g, "");
    if (cleaned.length < 6)
        return [];
    const upper = cleaned.toUpperCase();
    const set = new Set();
    set.add(upper);
    set.add(cleaned);
    set.add(cleaned.toLowerCase());
    const digitsOnly = upper.replace(/[^0-9]/g, "");
    if (digitsOnly && digitsOnly !== upper)
        set.add(digitsOnly);
    const upsMatch = upper.match(/1Z[A-Z0-9]{16}/);
    if (upsMatch)
        set.add(upsMatch[0]);
    if (digitsOnly.startsWith("96") && digitsOnly.length >= 22) {
        set.add(digitsOnly.slice(-12));
        set.add(digitsOnly.slice(-15));
        set.add(digitsOnly.slice(-20));
        set.add(digitsOnly.slice(-22));
    }
    if (digitsOnly.startsWith("00") && digitsOnly.length >= 20) {
        set.add(digitsOnly.slice(-15));
        set.add(digitsOnly.slice(-12));
    }
    const uspsMatch = digitsOnly.match(/9[0-9]{19,21}/);
    if (uspsMatch)
        set.add(uspsMatch[0]);
    const uspsExpressMatch = upper.match(/[A-Z]{2}[0-9]{9}US/);
    if (uspsExpressMatch)
        set.add(uspsExpressMatch[0]);
    if (digitsOnly.startsWith("420")) {
        for (const offset of [8, 12]) {
            if (digitsOnly.length > offset + 12) {
                const stripped = digitsOnly.substring(offset);
                set.add(stripped);
                if (stripped.length >= 20)
                    set.add(stripped.slice(-20));
                if (stripped.length >= 22)
                    set.add(stripped.slice(-22));
                const innerMatch = stripped.match(/9[0-9]{19,21}/);
                if (innerMatch)
                    set.add(innerMatch[0]);
            }
        }
    }
    const gs1Numeric = upper.match(/[0-9]{12,22}/g);
    if (gs1Numeric) {
        for (const seg of gs1Numeric.slice(0, 5))
            set.add(seg);
    }
    for (const len of [22, 20, 18, 15, 12]) {
        if (digitsOnly.length > len)
            set.add(digitsOnly.slice(-len));
        if (upper.length > len)
            set.add(upper.slice(-len));
    }
    return Array.from(set)
        .filter((v) => v.length >= 6 && !v.includes("/"))
        .slice(0, 30);
}
//# sourceMappingURL=tracking-variants.js.map