/**
 * Customer Firestore triggers — SP1 → SP2 customer routing sync.
 *
 * This trigger ensures that whenever a customer's route is updated in SP1
 * (either through the EditCustomerModal, NovaTableModal, or any other UI path),
 * the change is immediately propagated to the customer's profile in SP2.
 *
 * It also automatically resolves and links the SP1 `preferredRoute` and
 * `preferredRouteId` based on the route name to keep the data canonical.
 */
/**
 * Firestore trigger on SP1 customer write.
 */
export declare const onCustomerWritten: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    customerId: string;
}>>;
//# sourceMappingURL=triggers.d.ts.map