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

import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Set global options for all functions
 * Consistent with smart-portal-2 configuration
 */
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  memory: "256MiB",
  timeoutSeconds: 30,
});

// Initialize Firebase Admin SDK
import "./config/firebase";

// ============ AUTH FUNCTIONS ============
export * from "./auth";

// ============ USER FUNCTIONS ============
export * from "./users";

// ============ CUSTOMER FUNCTIONS ============
export * from "./customers";

// ============ PRE-ALERTS SYNC ============
export * from "./prealerts";

// ============ PACKAGE FUNCTIONS ============
export * from "./packages";

// ============ INVOICE FUNCTIONS ============
export * from "./invoices";

// ============ ENCOMIENDA FUNCTIONS ============
export * from "./encomiendas";

// ============ ANALYTICS FUNCTIONS ============
export * from "./analytics";

// ============ SETTINGS FUNCTIONS ============
export * from "./settings";

// ============ EMAIL FUNCTIONS ============
export * from "./email";

// ============ MANIFEST FUNCTIONS ============
export * from "./manifests";

// ============ MLOCKER PROXY ============
export * from "./mlocker";

// ============ COLOMBIA TRACKING ============
export * from "./colombia";

// ============ ROUTES & DISPATCH ============
export * from "./routes";

// ============ RESEND WEBHOOKS ============
export { resendWebhook, checkEmailStatus, syncEmailStatuses, slRefreshEmailStatus } from "./resend-webhook";

// ============ AUDIT FUNCTIONS ============
export { slGetAuditLogs, slGetAuditMetrics, slGetAuditSummary } from "./audit";

// ============ TEMPORARY: SUPER ADMIN SETUP ============
export { slCreateSuperAdmin } from "./admin/setup-super-admin";

// Shipping Labels
export {
  slCreateShippingLabel,
  slListShippingLabels,
  slUpdateLabelStatus,
  slCancelShippingLabel,
} from "./shipping-labels";
