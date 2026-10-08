/** The package has been in an invoice (now or before). */
export declare function hasInvoiceSignal(p: any): boolean;
export declare const onPackageFirstInvoice: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    pkgId: string;
}>>;
//# sourceMappingURL=first-invoice.d.ts.map