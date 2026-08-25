"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.slCancelShippingLabel = exports.slUpdateLabelStatus = exports.slListShippingLabels = exports.slCreateShippingLabel = exports.slCreateSuperAdmin = exports.slGetAuditSummary = exports.slGetAuditMetrics = exports.slGetAuditLogs = exports.slRefreshEmailStatus = exports.syncEmailStatuses = exports.checkEmailStatus = exports.resendWebhook = void 0;
const v2_1 = require("firebase-functions/v2");
/**
 * Set global options for all functions
 * Consistent with smart-portal-2 configuration
 */
(0, v2_1.setGlobalOptions)({
    region: "us-central1",
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
});
// Initialize Firebase Admin SDK
require("./config/firebase");
// ============ AUTH FUNCTIONS ============
__exportStar(require("./auth"), exports);
// ============ USER FUNCTIONS ============
__exportStar(require("./users"), exports);
// ============ CUSTOMER FUNCTIONS ============
__exportStar(require("./customers"), exports);
// ============ PRE-ALERTS SYNC ============
__exportStar(require("./prealerts"), exports);
// ============ PACKAGE FUNCTIONS ============
__exportStar(require("./packages"), exports);
// ============ INVOICE FUNCTIONS ============
__exportStar(require("./invoices"), exports);
// ============ ENCOMIENDA FUNCTIONS ============
__exportStar(require("./encomiendas"), exports);
// ============ ANALYTICS FUNCTIONS ============
__exportStar(require("./analytics"), exports);
// ============ SETTINGS FUNCTIONS ============
__exportStar(require("./settings"), exports);
// ============ EMAIL FUNCTIONS ============
__exportStar(require("./email"), exports);
// ============ MANIFEST FUNCTIONS ============
__exportStar(require("./manifests"), exports);
// ============ MLOCKER PROXY ============
__exportStar(require("./mlocker"), exports);
// ============ COLOMBIA TRACKING ============
__exportStar(require("./colombia"), exports);
// ============ ROUTES & DISPATCH ============
__exportStar(require("./routes"), exports);
// ============ RESEND WEBHOOKS ============
var resend_webhook_1 = require("./resend-webhook");
Object.defineProperty(exports, "resendWebhook", { enumerable: true, get: function () { return resend_webhook_1.resendWebhook; } });
Object.defineProperty(exports, "checkEmailStatus", { enumerable: true, get: function () { return resend_webhook_1.checkEmailStatus; } });
Object.defineProperty(exports, "syncEmailStatuses", { enumerable: true, get: function () { return resend_webhook_1.syncEmailStatuses; } });
Object.defineProperty(exports, "slRefreshEmailStatus", { enumerable: true, get: function () { return resend_webhook_1.slRefreshEmailStatus; } });
// ============ AUDIT FUNCTIONS ============
var audit_1 = require("./audit");
Object.defineProperty(exports, "slGetAuditLogs", { enumerable: true, get: function () { return audit_1.slGetAuditLogs; } });
Object.defineProperty(exports, "slGetAuditMetrics", { enumerable: true, get: function () { return audit_1.slGetAuditMetrics; } });
Object.defineProperty(exports, "slGetAuditSummary", { enumerable: true, get: function () { return audit_1.slGetAuditSummary; } });
// ============ TEMPORARY: SUPER ADMIN SETUP ============
var setup_super_admin_1 = require("./admin/setup-super-admin");
Object.defineProperty(exports, "slCreateSuperAdmin", { enumerable: true, get: function () { return setup_super_admin_1.slCreateSuperAdmin; } });
// Shipping Labels
var shipping_labels_1 = require("./shipping-labels");
Object.defineProperty(exports, "slCreateShippingLabel", { enumerable: true, get: function () { return shipping_labels_1.slCreateShippingLabel; } });
Object.defineProperty(exports, "slListShippingLabels", { enumerable: true, get: function () { return shipping_labels_1.slListShippingLabels; } });
Object.defineProperty(exports, "slUpdateLabelStatus", { enumerable: true, get: function () { return shipping_labels_1.slUpdateLabelStatus; } });
Object.defineProperty(exports, "slCancelShippingLabel", { enumerable: true, get: function () { return shipping_labels_1.slCancelShippingLabel; } });
//# sourceMappingURL=index.js.map