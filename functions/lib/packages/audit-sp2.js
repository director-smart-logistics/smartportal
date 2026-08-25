"use strict";
/**
 * slAuditSp2Package
 *
 * Perform a server-side audit of a package and its associated invoices
 * in the secondary Firebase database (smart-portal-2 / SP2).
 *
 * Querying server-side using the Firebase Admin SDK avoids client-side CORS issues,
 * permissions limitations, and resource-exhausted errors due to excessive queued queries.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.slDeleteSp2Shipment = exports.slAuditSp2Package = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const SP2_PROJECT_ID = "smart-portal-2";
let sp2Db = null;
function getSp2Firestore() {
    if (sp2Db)
        return sp2Db;
    const appName = "smart-portal-2-audit";
    const existing = (0, app_1.getApps)().find(a => a.name === appName);
    if (existing) {
        sp2Db = (0, firestore_1.getFirestore)(existing);
    }
    else {
        const app = (0, app_1.initializeApp)({ projectId: SP2_PROJECT_ID }, appName);
        sp2Db = (0, firestore_1.getFirestore)(app);
    }
    return sp2Db;
}
exports.slAuditSp2Package = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { trackingNumber, invoicesList = [], packagesList = [] } = request.data || {};
    if (!trackingNumber) {
        throw new https_1.HttpsError("invalid-argument", "trackingNumber is required");
    }
    const tracking = trackingNumber.toUpperCase().trim();
    const dbSP2 = getSp2Firestore();
    const auditRes = {
        package: {
            exists: false,
            statusSp1: "",
            statusSp2: "",
            isDuplicate: false,
            sp2DocsCount: 0,
            mismatch: false,
        },
        packages: [],
        invoices: [],
        hasIssues: false,
    };
    try {
        // 1. Resolve packages list (if empty, populate with the main package)
        const localPackages = [...packagesList];
        if (localPackages.length === 0 && tracking) {
            localPackages.push({
                id: "main",
                trackingNumber: tracking,
                status: "",
            });
        }
        // 2. Audit Packages in SP2
        for (const pkgItem of localPackages) {
            const pkgTracking = (pkgItem.trackingNumber || "").toUpperCase().trim();
            if (!pkgTracking)
                continue;
            const shipmentsQuery = await dbSP2.collection("shipments")
                .where("tracking", "==", pkgTracking)
                .get();
            const seenShipmentIds = new Set();
            const shipmentDocs = [];
            for (const doc of shipmentsQuery.docs) {
                if (!seenShipmentIds.has(doc.id)) {
                    seenShipmentIds.add(doc.id);
                    shipmentDocs.push({
                        id: doc.id,
                        ...doc.data(),
                    });
                }
            }
            // Also try direct document fetch by tracking ID, in case doc ID is used as key
            try {
                const shipmentDoc = await dbSP2.collection("shipments").doc(pkgTracking).get();
                if (shipmentDoc.exists && !seenShipmentIds.has(shipmentDoc.id)) {
                    seenShipmentIds.add(shipmentDoc.id);
                    shipmentDocs.push({
                        id: shipmentDoc.id,
                        ...shipmentDoc.data(),
                    });
                }
            }
            catch (docErr) {
                v2_1.logger.warn(`[slAuditSp2Package] Optional direct document fetch failed for tracking ${pkgTracking}:`, { error: docErr.message });
            }
            const existsSp2 = shipmentDocs.length > 0;
            const isDuplicate = shipmentDocs.length > 1;
            const statusSp1 = pkgItem.status || "N/A";
            const statusSp2 = existsSp2 ? (shipmentDocs[0].status || "N/A") : "N/A";
            const mismatch = !existsSp2 || (statusSp1 !== "N/A" && statusSp1 !== statusSp2);
            auditRes.packages.push({
                id: pkgItem.id,
                trackingNumber: pkgTracking,
                existsSp2,
                isDuplicate,
                statusSp1,
                statusSp2,
                mismatch,
                sp2Docs: shipmentDocs.map((doc) => ({
                    id: doc.id,
                    tracking: doc.tracking || pkgTracking,
                    status: doc.status || "N/A",
                    slCode: doc.slCode || "N/A",
                    createdAt: doc.createdAt || null,
                })),
            });
        }
        // Populate legacy 'package' object from the main tracking number audit
        const mainAudited = auditRes.packages.find(p => p.trackingNumber === tracking) || auditRes.packages[0];
        if (mainAudited) {
            auditRes.package = {
                exists: mainAudited.existsSp2,
                statusSp1: mainAudited.statusSp1,
                statusSp2: mainAudited.statusSp2,
                isDuplicate: mainAudited.isDuplicate,
                sp2DocsCount: mainAudited.sp2Docs.length,
                mismatch: mainAudited.mismatch,
            };
        }
        // 3. Audit Invoices in SP2
        for (const localInv of invoicesList) {
            const invId = localInv.id;
            const invNum = localInv.invoiceNumber || invId;
            let existsInSp2 = false;
            let statusInSp2 = "N/A";
            let amountInSp2 = 0;
            try {
                // Try direct document fetch by ID first
                const sp2InvDoc = await dbSP2.collection("invoices").doc(invId).get();
                if (sp2InvDoc.exists) {
                    existsInSp2 = true;
                    const data = sp2InvDoc.data() || {};
                    statusInSp2 = data.status || "N/A";
                    amountInSp2 = data.amount || 0;
                }
                else {
                    // Query by invoiceNumber
                    const invNumQuery = await dbSP2.collection("invoices")
                        .where("invoiceNumber", "==", invNum)
                        .limit(1)
                        .get();
                    if (!invNumQuery.empty) {
                        existsInSp2 = true;
                        const data = invNumQuery.docs[0].data();
                        statusInSp2 = data.status || "N/A";
                        amountInSp2 = data.amount || 0;
                    }
                }
            }
            catch (err) {
                v2_1.logger.warn(`[slAuditSp2Package] Failed checking SP2 invoice ${invId}:`, { error: err.message });
            }
            // Comparison of totals uses Math.abs(diff) > 0.01 to prevent false-positives
            const mismatch = !existsInSp2 || localInv.status !== statusInSp2 || Math.abs(localInv.totalAmount - amountInSp2) > 0.01;
            auditRes.invoices.push({
                id: invId,
                invoiceNumber: invNum,
                existsSp1: true,
                existsSp2: existsInSp2,
                statusSp1: localInv.status || "N/A",
                statusSp2: statusInSp2,
                amountSp1: localInv.totalAmount,
                amountSp2: amountInSp2,
                mismatch,
            });
        }
        // Check if there are any issues across packages or invoices
        auditRes.hasIssues = auditRes.packages.some(p => !p.existsSp2 || p.isDuplicate || p.mismatch) ||
            auditRes.invoices.some(i => i.mismatch);
        return {
            success: true,
            data: auditRes,
        };
    }
    catch (error) {
        v2_1.logger.error(`[slAuditSp2Package] General audit execution failed for tracking ${tracking}:`, error);
        return {
            success: false,
            error: error.message || "Error interno durante la auditoría de SP2",
        };
    }
});
exports.slDeleteSp2Shipment = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { shipmentId } = request.data || {};
    if (!shipmentId) {
        throw new https_1.HttpsError("invalid-argument", "shipmentId is required");
    }
    try {
        const dbSP2 = getSp2Firestore();
        await dbSP2.collection("shipments").doc(shipmentId).delete();
        return {
            success: true,
        };
    }
    catch (error) {
        v2_1.logger.error(`[slDeleteSp2Shipment] Failed to delete shipment ${shipmentId}:`, error);
        return {
            success: false,
            error: error.message || "Error al eliminar shipment de SP2",
        };
    }
});
//# sourceMappingURL=audit-sp2.js.map