import { type ConsolidationOp } from "../consolidation/consolidation-start";
export interface ConsolidationPushResult {
    ok: boolean;
    status: number;
    error?: string;
    results?: Array<{
        key: string;
        outcome: string;
        reason?: string;
    }>;
}
/** POST the operations to SP2 (shared with the backfill script's logic). One retry on network / 5xx. */
export declare function pushConsolidationToSp2(items: Array<ConsolidationOp & {
    by?: string;
}>): Promise<ConsolidationPushResult>;
export declare const onPackageConsolidationToSp2: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    pkgId: string;
}>>;
//# sourceMappingURL=consolidation-to-sp2.d.ts.map