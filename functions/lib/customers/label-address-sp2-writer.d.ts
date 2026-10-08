type Db = FirebaseFirestore.Firestore;
type AnyAddress = Record<string, any>;
export type LabelWriteErrorCode = "empty" | "not-found" | "multiple" | "no-address" | "ambiguous";
export declare class LabelWriteError extends Error {
    code: LabelWriteErrorCode;
    constructor(code: LabelWriteErrorCode, message: string);
}
export interface LabelWriteInput {
    slCode: string;
    text: string;
    by: string;
    byUid?: string;
    source: string;
    runId?: string;
}
export interface LabelWriteResult {
    changed: boolean;
    uid: string;
    before: AnyAddress;
    after?: AnyAddress;
}
export declare function updateSp2PrincipalFromLabel(sp1: Db, sp2: Db, input: LabelWriteInput): Promise<LabelWriteResult>;
/** Rollback: puts `before` back as the principal address (only if `after` is still the current one). */
export declare function restoreSp2Principal(sp2: Db, slCode: string, before: AnyAddress, after: AnyAddress, by: string): Promise<"restored" | "changed-since">;
export {};
//# sourceMappingURL=label-address-sp2-writer.d.ts.map