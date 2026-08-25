/**
 * SmartLogistics Admin Portal - Cloud Functions (Gen 2)
 *
 * ARCHITECTURE (similar to smart-portal-2):
 * - Callable functions → For frontend integration
 * - Firestore triggers → For data sync and automation
 * - HTTP functions → For external API access
 *
 * @module functions
 * @version 1.0.0
 */
import "./config/firebase";
export * from "./auth";
export * from "./users";
export * from "./customers";
export * from "./prealerts";
export * from "./packages";
export * from "./invoices";
export * from "./encomiendas";
export * from "./analytics";
export * from "./settings";
export * from "./email";
export * from "./manifests";
export * from "./mlocker";
export * from "./colombia";
export * from "./routes";
export { resendWebhook, checkEmailStatus, syncEmailStatuses, slRefreshEmailStatus } from "./resend-webhook";
export { slGetAuditLogs, slGetAuditMetrics, slGetAuditSummary } from "./audit";
export { slCreateSuperAdmin } from "./admin/setup-super-admin";
export { slCreateShippingLabel, slListShippingLabels, slUpdateLabelStatus, slCancelShippingLabel, } from "./shipping-labels";
//# sourceMappingURL=index.d.ts.map