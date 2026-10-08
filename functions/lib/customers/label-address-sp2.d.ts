/**
 * F11.2 (docs/F11_LABEL_ADDRESS_AUDIT.md) — the address an admin corrects on the Nova shipping label,
 * saved as the customer's principal address in SP2 (option "Actualizar también en SmartWeb").
 *
 * The label textarea is built from the principal address (NovaShippingLabelModal):
 *     line 1               streetAddress
 *     middle lines         details
 *     "Instrucciones: …"   deliveryInstructions (the modal omits it when it repeats the details)
 * Province / canton / district are never changed here; the "Distrito, Cantón, Provincia" line the labels
 * print since 2026-09-27 is recognised and ignored (it is not street or details).
 *
 * The stored block is the F12 standard block (users/{uid}.defaultAddress, addressModel 'single-v1').
 * CANONICAL_KEYS / fieldOf / canonicalAddress / principalOf are the same rule as
 * scripts/audit/address-principal.cjs and SP2 src/domain/address/principal-address.ts
 * (test/label-address-sp2.spec.ts checks they stay equal). Pure; no Firestore here.
 */
type AnyAddress = Record<string, any>;
export declare const SINGLE_ADDRESS_MODEL = "single-v1";
/** Fields a shipping label / encomienda manifest prints. */
export declare const LABEL_FIELDS: string[];
export declare const CANONICAL_KEYS: string[];
export declare function fieldOf(a: AnyAddress | null | undefined, k: string): any;
export declare const hasAddress: (a: AnyAddress | null | undefined) => boolean;
export declare const sameAddress: (a: AnyAddress | null | undefined, b: AnyAddress | null | undefined) => boolean;
/** The clean block: same values, fixed keys, principal flags set. */
export declare function canonicalAddress(src: AnyAddress, userId: string): AnyAddress;
/** Same rule as the F12 audit/migration (principalOf) — which SP2 address is the principal one. */
export declare function principalOf(collectionAddrs: AnyAddress[], embeddedAddrs: AnyAddress[], sp1Default: AnyAddress | null): {
    principal: AnyAddress | null;
    ambiguous: boolean;
};
/** The customer's current principal address in SP2 (users doc for single-v1, else the F12 rule). */
export declare function currentSp2Principal(user: AnyAddress, collectionAddrs: AnyAddress[], sp1Default: AnyAddress | null): {
    principal: AnyAddress | null;
    ambiguous: boolean;
};
export interface ParsedLabelAddress {
    streetAddress: string;
    details: string;
    /** undefined = the text has no "Instrucciones:" line → keep the customer's instructions. */
    deliveryInstructions?: string;
}
/**
 * True for the "Distrito, Cantón, Provincia" line the labels print since 2026-09-27: every comma part is
 * one of the address's own district / canton / province. That line is not part of the street or details.
 */
export declare function isLocationLine(line: string, a: AnyAddress | null | undefined): boolean;
/** The label textarea → address fields (inverse of how the modal builds it). Empty = "not given".
 *  With `current`, the location line (district/canton/province) is dropped: it is never street/details. */
export declare function parseLabelAddressText(text: string, current?: AnyAddress | null): ParsedLabelAddress;
/**
 * The new principal block: the current one with the label's street / details / instructions.
 * Everything else (province, canton, district, recipient, encomienda…) is kept as it is, and no field
 * is ever emptied: missing / empty lines keep the customer's value (decision 2026-09-26).
 * Returns null when a label would print the same address (nothing to write).
 */
export declare function principalFromLabelText(current: AnyAddress, text: string, meta: {
    userId: string;
    updatedAt: string;
    updatedBy: string;
}): AnyAddress | null;
export declare const canEditCustomerAddress: (role: unknown) => boolean;
export {};
//# sourceMappingURL=label-address-sp2.d.ts.map