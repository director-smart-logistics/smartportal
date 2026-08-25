/**
 * slManifestReport — Callable Cloud Function
 *
 * Receives a LearningRecord from the client after every processed manifest,
 * builds an HTML report email, and sends it to director@smartlogisticscr.com
 * via the existing Resend service.
 */
export declare const slManifestReport: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    messageId: string | undefined;
}>, unknown>;
//# sourceMappingURL=manifest-report.d.ts.map