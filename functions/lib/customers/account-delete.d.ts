type Db = FirebaseFirestore.Firestore;
export interface DeleteInput {
    slCode: string;
    reason: string;
    by: string;
    source: "sp1" | "sp2";
    uid?: string;
}
export interface DeleteResult {
    status: "deleted" | "blocked" | "not-found";
    slCode: string;
    uid: string | null;
    email: string | null;
    logId: string;
    history?: Record<string, number>;
    message: string;
}
/** Counts every trace of history the account has in both systems (codes compared as written and upper-case). */
export declare function accountHistory(db1: Db, db2: Db, slCode: string, uid: string | null): Promise<Record<string, number>>;
export declare function deleteAccountCore(db1: Db, db2: Db, input: DeleteInput, now?: string): Promise<DeleteResult>;
/** SP1 "Eliminar cliente" (admins). SP2 removes the login through its own endpoint. */
export declare const slDeleteCustomerAccount: import("firebase-functions/v2/https").CallableFunction<any, Promise<DeleteResult>, unknown>;
/** Used by SP2's "Eliminar" after it verified the SP2 admin. SP2 then removes the login itself. */
export declare const slDeleteAccountFromSp2: import("firebase-functions/v2/https").HttpsFunction;
export {};
//# sourceMappingURL=account-delete.d.ts.map