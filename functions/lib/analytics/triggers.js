"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDashboardInvoiceWritten = exports.onDashboardCustomerWritten = exports.onDashboardPackageWritten = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const firebase_1 = require("../config/firebase");
const firestore_2 = require("firebase-admin/firestore");
const COUNTER_DOC_PATH = "metadata/dashboard_counters";
// Trigger for Packages
exports.onDashboardPackageWritten = (0, firestore_1.onDocumentWritten)({
    document: "packages/{pkgId}",
    database: "portal",
    region: "us-central1",
}, async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const updatePayload = {};
    if (!before && after) {
        // Create
        updatePayload.totalPackages = firestore_2.FieldValue.increment(1);
        const status = after.status || "pending";
        updatePayload[`statusBreakdown.${status}`] = firestore_2.FieldValue.increment(1);
        if (status === "delivered") {
            updatePayload.deliveredPackages = firestore_2.FieldValue.increment(1);
        }
        else if (status === "pending") {
            updatePayload.pendingPackages = firestore_2.FieldValue.increment(1);
        }
    }
    else if (before && !after) {
        // Delete
        updatePayload.totalPackages = firestore_2.FieldValue.increment(-1);
        const status = before.status || "pending";
        updatePayload[`statusBreakdown.${status}`] = firestore_2.FieldValue.increment(-1);
        if (status === "delivered") {
            updatePayload.deliveredPackages = firestore_2.FieldValue.increment(-1);
        }
        else if (status === "pending") {
            updatePayload.pendingPackages = firestore_2.FieldValue.increment(-1);
        }
    }
    else if (before && after) {
        // Update
        const beforeStatus = before.status || "pending";
        const afterStatus = after.status || "pending";
        if (beforeStatus !== afterStatus) {
            updatePayload[`statusBreakdown.${beforeStatus}`] = firestore_2.FieldValue.increment(-1);
            updatePayload[`statusBreakdown.${afterStatus}`] = firestore_2.FieldValue.increment(1);
            if (beforeStatus === "delivered") {
                updatePayload.deliveredPackages = firestore_2.FieldValue.increment(-1);
            }
            else if (beforeStatus === "pending") {
                updatePayload.pendingPackages = firestore_2.FieldValue.increment(-1);
            }
            if (afterStatus === "delivered") {
                updatePayload.deliveredPackages = firestore_2.FieldValue.increment(1);
            }
            else if (afterStatus === "pending") {
                updatePayload.pendingPackages = firestore_2.FieldValue.increment(1);
            }
        }
    }
    if (Object.keys(updatePayload).length > 0) {
        try {
            await firebase_1.db.doc(COUNTER_DOC_PATH).update(updatePayload);
        }
        catch (err) {
            v2_1.logger.warn("[onDashboardPackageWritten] Failed to update counters, attempting set merge", err);
            try {
                await firebase_1.db.doc(COUNTER_DOC_PATH).set(updatePayload, { merge: true });
            }
            catch (setErr) {
                v2_1.logger.error("[onDashboardPackageWritten] Critical failure updating dashboard counters", setErr);
            }
        }
    }
});
// Trigger for Customers
exports.onDashboardCustomerWritten = (0, firestore_1.onDocumentWritten)({
    document: "customers/{customerId}",
    database: "portal",
    region: "us-central1",
}, async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const updatePayload = {};
    if (!before && after) {
        updatePayload.totalCustomers = firestore_2.FieldValue.increment(1);
    }
    else if (before && !after) {
        updatePayload.totalCustomers = firestore_2.FieldValue.increment(-1);
    }
    if (Object.keys(updatePayload).length > 0) {
        try {
            await firebase_1.db.doc(COUNTER_DOC_PATH).update(updatePayload);
        }
        catch (err) {
            try {
                await firebase_1.db.doc(COUNTER_DOC_PATH).set(updatePayload, { merge: true });
            }
            catch (setErr) {
                v2_1.logger.error("[onDashboardCustomerWritten] Critical failure updating dashboard counters", setErr);
            }
        }
    }
});
// Trigger for Invoices
exports.onDashboardInvoiceWritten = (0, firestore_1.onDocumentWritten)({
    document: "invoices/{invoiceId}",
    database: "portal",
    region: "us-central1",
}, async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const updatePayload = {};
    if (!before && after) {
        updatePayload.totalInvoices = firestore_2.FieldValue.increment(1);
    }
    else if (before && !after) {
        updatePayload.totalInvoices = firestore_2.FieldValue.increment(-1);
    }
    if (Object.keys(updatePayload).length > 0) {
        try {
            await firebase_1.db.doc(COUNTER_DOC_PATH).update(updatePayload);
        }
        catch (err) {
            try {
                await firebase_1.db.doc(COUNTER_DOC_PATH).set(updatePayload, { merge: true });
            }
            catch (setErr) {
                v2_1.logger.error("[onDashboardInvoiceWritten] Critical failure updating dashboard counters", setErr);
            }
        }
    }
});
//# sourceMappingURL=triggers.js.map