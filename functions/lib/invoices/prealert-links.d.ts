export interface PreAlertLink {
    tracking: string;
    preAlertId: string;
}
/** Trackings of an invoice: trackingNumbers + trackingNumber + its item trackings, upper case, unique. */
export declare function invoiceTrackings(invoice: Record<string, any>): string[];
/** Pure decision: which confirmed links may travel with this invoice. */
export declare function preAlertLinksFor(invoiceSlCode: unknown, packages: Map<string, Record<string, any> | undefined>): PreAlertLink[];
/** Reads packages/{tracking} of the invoice (one batched read) and returns the links that may travel. */
export declare function loadPreAlertLinks(db: FirebaseFirestore.Firestore, invoice: Record<string, any>): Promise<PreAlertLink[]>;
//# sourceMappingURL=prealert-links.d.ts.map