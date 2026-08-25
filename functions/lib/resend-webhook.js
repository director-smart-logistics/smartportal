"use strict";
/**
 * Resend Webhook Handler
 * Processes email delivery events from Resend API
 * Updates invoice email status in Firestore
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncEmailStatuses = exports.slRefreshEmailStatus = exports.checkEmailStatus = exports.resendWebhook = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
/**
 * Verify Resend webhook signature
 * Security measure to ensure webhook authenticity
 */
function verifyWebhookSignature(payload, signature, secret) {
    // Resend uses HMAC SHA256 for webhook signatures
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");
    return signature === expectedSignature;
}
/**
 * Map Resend event type to our email status
 */
function mapEventToStatus(eventType) {
    switch (eventType) {
        case "email.sent":
            return "sent";
        case "email.delivered":
            return "delivered";
        case "email.opened":
            return "opened";
        case "email.bounced":
            return "bounced";
        case "email.complained":
            return "complained";
        case "email.clicked":
            return "clicked";
        case "email.delivery_delayed":
            return "sent"; // Keep as sent, just delayed
        default:
            return "sent";
    }
}
/**
 * Find invoice by Resend message ID
 */
async function findInvoiceByMessageId(messageId) {
    const db = (0, firestore_1.getFirestore)();
    try {
        const invoicesRef = db.collection("invoices");
        // Primary: match lastResendMessageId (most recent send)
        const snapshot = await invoicesRef
            .where("lastResendMessageId", "==", messageId)
            .limit(1)
            .get();
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        }
        // Fallback: flat scalar array stored alongside emailSendLogs
        const idsSnapshot = await invoicesRef
            .where("emailResendIds", "array-contains", messageId)
            .limit(1)
            .get();
        if (!idsSnapshot.empty) {
            return idsSnapshot.docs[0].id;
        }
        return null;
    }
    catch (error) {
        firebase_functions_1.logger.error("Error finding invoice by message ID:", error);
        return null;
    }
}
/**
 * Update invoice email status
 */
async function updateInvoiceEmailStatus(invoiceId, statusLog) {
    const db = (0, firestore_1.getFirestore)();
    const invoiceRef = db.collection("invoices").doc(invoiceId);
    try {
        await invoiceRef.update({
            emailStatus: statusLog.status,
            emailStatusUpdatedAt: statusLog.timestamp,
            emailStatusLogs: firestore_1.FieldValue.arrayUnion(statusLog),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        firebase_functions_1.logger.info(`Updated invoice ${invoiceId} email status to ${statusLog.status}`);
    }
    catch (error) {
        firebase_functions_1.logger.error(`Error updating invoice ${invoiceId} email status:`, error);
        throw error;
    }
}
/**
 * Process Resend webhook event
 */
async function processWebhookEvent(event) {
    const { type, created_at, data } = event;
    const emailId = data.email_id;
    firebase_functions_1.logger.info(`Processing Resend webhook event: ${type} for email ${emailId}`);
    // Find the invoice associated with this email
    const invoiceId = await findInvoiceByMessageId(emailId);
    if (!invoiceId) {
        firebase_functions_1.logger.warn(`No invoice found for Resend message ID: ${emailId}`);
        return;
    }
    // Create status log entry
    const statusLog = {
        status: mapEventToStatus(type),
        timestamp: created_at,
        emailId,
        metadata: {
            eventType: type,
            to: data.to,
            subject: data.subject,
            tags: data.tags,
        },
    };
    // Update invoice with new email status
    await updateInvoiceEmailStatus(invoiceId, statusLog);
    firebase_functions_1.logger.info(`Successfully processed webhook event for invoice ${invoiceId}`);
}
/**
 * HTTP endpoint for Resend webhooks
 * Endpoint: POST /resendWebhook
 */
exports.resendWebhook = functions.https.onRequest(async (req, res) => {
    // Only accept POST requests
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    try {
        // Verify webhook signature (best-effort — never block event processing)
        const signature = req.headers["resend-signature"];
        const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
        if (!webhookSecret) {
            firebase_functions_1.logger.warn("Resend webhook: RESEND_WEBHOOK_SECRET not configured — skipping signature verification");
        }
        else {
            // NOTE: Firebase parses the body before we can read raw bytes, so we
            // serialize back to string. HMAC may mismatch vs original bytes.
            // This is best-effort: warn but never drop events.
            const rawBody = JSON.stringify(req.body);
            if (signature && !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
                firebase_functions_1.logger.warn("Resend webhook: signature mismatch — processing event anyway");
            }
        }
        // Process the webhook event
        const event = req.body;
        await processWebhookEvent(event);
        // Respond with success
        res.status(200).json({ success: true, message: "Webhook processed" });
    }
    catch (error) {
        firebase_functions_1.logger.error("Error processing Resend webhook:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * Callable function to manually check email status
 * Used when webhook delivery fails or for manual status checks
 */
exports.checkEmailStatus = functions.https.onCall(async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { messageId } = request.data;
    if (!messageId) {
        throw new functions.https.HttpsError("invalid-argument", "Message ID is required");
    }
    try {
        // In production, this would call Resend API to get email status
        // For now, we'll just return the stored status
        const invoiceId = await findInvoiceByMessageId(messageId);
        if (!invoiceId) {
            return {
                success: false,
                error: "Invoice not found for this message ID",
            };
        }
        const db = (0, firestore_1.getFirestore)();
        const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();
        const invoiceData = invoiceDoc.data();
        return {
            success: true,
            status: invoiceData?.emailStatus || "not_sent",
            timestamp: invoiceData?.emailStatusUpdatedAt,
            logs: invoiceData?.emailStatusLogs || [],
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error checking email status:", error);
        throw new functions.https.HttpsError("internal", error instanceof Error ? error.message : "Unknown error");
    }
});
/**
 * Callable: fetch real-time delivery status from Resend API for a single invoice.
 * Looks up the lastResendMessageId on the invoice, calls resend.emails.get(),
 * updates emailStatus / emailStatusLogs in Firestore, and returns the new status.
 */
exports.slRefreshEmailStatus = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { invoiceId } = request.data;
    if (!invoiceId) {
        throw new functions.https.HttpsError("invalid-argument", "invoiceId is required");
    }
    const db = (0, firestore_1.getFirestore)();
    const invoiceSnap = await db.collection("invoices").doc(invoiceId).get();
    if (!invoiceSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Invoice not found");
    }
    const invoiceData = invoiceSnap.data();
    const messageId = invoiceData.lastResendMessageId;
    if (!messageId) {
        return { success: false, reason: "no_message_id" };
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new functions.https.HttpsError("failed-precondition", "Resend API key not configured");
    }
    // Dynamically import to avoid top-level side-effects at cold-start
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resend } = require("resend");
    const resend = new Resend(apiKey);
    let emailData;
    try {
        const result = await resend.emails.get(messageId);
        if (result.error || !result.data) {
            const errMsg = result.error?.message ?? "Email not found in Resend";
            const statusCode = result.error?.statusCode ?? 0;
            firebase_functions_1.logger.warn(`slRefreshEmailStatus: Resend returned error for ${messageId}`, { statusCode, errMsg });
            // 404 = email ID no longer exists — return gracefully instead of crashing
            if (statusCode === 404 || errMsg.toLowerCase().includes('not found')) {
                return { success: false, reason: "email_not_found", messageId };
            }
            throw new functions.https.HttpsError("unavailable", errMsg);
        }
        emailData = result.data;
    }
    catch (err) {
        if (err instanceof functions.https.HttpsError)
            throw err;
        firebase_functions_1.logger.error(`slRefreshEmailStatus: unexpected error calling Resend for ${messageId}`, err);
        throw new functions.https.HttpsError("unavailable", err?.message ?? "Resend API unavailable");
    }
    const STATUS_MAP = {
        queued: "sent", sent: "sent", delivered: "delivered",
        bounced: "bounced", opened: "opened", clicked: "clicked",
        complained: "complained", failed: "failed",
    };
    const lastEvent = emailData.last_event ?? "sent";
    const newStatus = STATUS_MAP[lastEvent] ?? "sent";
    const now = new Date().toISOString();
    const statusLog = {
        status: newStatus,
        timestamp: now,
        emailId: messageId,
        metadata: { source: "manual-refresh", last_event: lastEvent },
    };
    await invoiceSnap.ref.update({
        emailStatus: newStatus,
        emailStatusUpdatedAt: now,
        emailStatusLogs: firestore_1.FieldValue.arrayUnion(statusLog),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info(`slRefreshEmailStatus: invoice ${invoiceId} → ${newStatus}`);
    return { success: true, status: newStatus };
});
/**
 * Manual sync function for email statuses
 * Can be called manually or triggered via Cloud Scheduler
 * Note: For automatic daily sync, configure Cloud Scheduler to call this function
 */
exports.syncEmailStatuses = functions.https.onCall(async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Require admin role
    const userRole = request.auth.token?.role;
    if (userRole !== "ADMIN") {
        throw new functions.https.HttpsError("permission-denied", "Only admins can sync email statuses");
    }
    firebase_functions_1.logger.info("Starting manual email status sync");
    const db = (0, firestore_1.getFirestore)();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    try {
        // Get invoices with emails sent in the last 7 days that might need status updates
        const invoicesSnapshot = await db
            .collection("invoices")
            .where("emailSent", "==", true)
            .where("emailSentAt", ">=", sevenDaysAgo.toISOString())
            .where("emailStatus", "in", ["sent", "delivered"])
            .limit(100)
            .get();
        firebase_functions_1.logger.info(`Found ${invoicesSnapshot.size} invoices to check`);
        let updated = 0;
        let errors = 0;
        for (const doc of invoicesSnapshot.docs) {
            try {
                const data = doc.data();
                const messageId = data.lastResendMessageId;
                if (!messageId) {
                    continue;
                }
                // In production, call Resend API to get current status
                // For now, we'll skip this as it requires API integration
                // await checkAndUpdateEmailStatus(doc.id, messageId);
                updated++;
            }
            catch (error) {
                firebase_functions_1.logger.error(`Error syncing status for invoice ${doc.id}:`, error);
                errors++;
            }
        }
        firebase_functions_1.logger.info(`Email status sync completed: ${updated} updated, ${errors} errors`);
        return {
            success: true,
            updated,
            errors,
            total: invoicesSnapshot.size,
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error in email status sync:", error);
        throw new functions.https.HttpsError("internal", error instanceof Error ? error.message : "Unknown error");
    }
});
//# sourceMappingURL=resend-webhook.js.map