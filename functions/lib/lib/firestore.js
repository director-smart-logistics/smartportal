"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromTimestamp = exports.toTimestamp = exports.serverTimestamp = exports.routePackagesRef = exports.quoteItemsRef = exports.invoiceItemsRef = exports.trackingHistoryRef = exports.userProfileRef = exports.employeesRef = exports.departmentsRef = exports.manifestsRef = exports.quotesRef = exports.scannerHistoryRef = exports.auditRef = exports.auditLogsRef = exports.permissionsRef = exports.settingsRef = exports.invoicesRef = exports.routesRef = exports.deliveriesRef = exports.packagesRef = exports.customersRef = exports.usersRef = exports.db = void 0;
exports.getDocument = getDocument;
exports.listDocuments = listDocuments;
exports.createDocument = createDocument;
exports.updateDocument = updateDocument;
exports.deleteDocument = deleteDocument;
exports.createBatch = createBatch;
exports.runTransaction = runTransaction;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("../types/firestore");
// Use the named database "portal" as configured in firebase.json
exports.db = (0, firestore_1.getFirestore)("portal");
// Collection references
const usersRef = () => exports.db.collection(firestore_2.COLLECTIONS.USERS);
exports.usersRef = usersRef;
const customersRef = () => exports.db.collection(firestore_2.COLLECTIONS.CUSTOMERS);
exports.customersRef = customersRef;
const packagesRef = () => exports.db.collection(firestore_2.COLLECTIONS.PACKAGES);
exports.packagesRef = packagesRef;
const deliveriesRef = () => exports.db.collection(firestore_2.COLLECTIONS.DELIVERIES);
exports.deliveriesRef = deliveriesRef;
const routesRef = () => exports.db.collection(firestore_2.COLLECTIONS.ROUTES);
exports.routesRef = routesRef;
const invoicesRef = () => exports.db.collection(firestore_2.COLLECTIONS.INVOICES);
exports.invoicesRef = invoicesRef;
const settingsRef = () => exports.db.collection(firestore_2.COLLECTIONS.SETTINGS);
exports.settingsRef = settingsRef;
const permissionsRef = () => exports.db.collection(firestore_2.COLLECTIONS.PERMISSIONS);
exports.permissionsRef = permissionsRef;
const auditLogsRef = () => exports.db.collection(firestore_2.COLLECTIONS.AUDIT_LOGS);
exports.auditLogsRef = auditLogsRef;
const auditRef = () => exports.db.collection("audit_logs");
exports.auditRef = auditRef;
const scannerHistoryRef = () => exports.db.collection(firestore_2.COLLECTIONS.SCANNER_HISTORY);
exports.scannerHistoryRef = scannerHistoryRef;
const quotesRef = () => exports.db.collection(firestore_2.COLLECTIONS.QUOTES);
exports.quotesRef = quotesRef;
const manifestsRef = () => exports.db.collection(firestore_2.COLLECTIONS.MANIFESTS);
exports.manifestsRef = manifestsRef;
const departmentsRef = () => exports.db.collection(firestore_2.COLLECTIONS.DEPARTMENTS);
exports.departmentsRef = departmentsRef;
const employeesRef = () => exports.db.collection(firestore_2.COLLECTIONS.EMPLOYEES);
exports.employeesRef = employeesRef;
// Subcollection references
const userProfileRef = (userId) => (0, exports.usersRef)().doc(userId).collection(firestore_2.SUBCOLLECTIONS.PROFILE);
exports.userProfileRef = userProfileRef;
const trackingHistoryRef = (packageId) => (0, exports.packagesRef)().doc(packageId).collection(firestore_2.SUBCOLLECTIONS.TRACKING_HISTORY);
exports.trackingHistoryRef = trackingHistoryRef;
const invoiceItemsRef = (invoiceId) => (0, exports.invoicesRef)().doc(invoiceId).collection(firestore_2.SUBCOLLECTIONS.ITEMS);
exports.invoiceItemsRef = invoiceItemsRef;
const quoteItemsRef = (quoteId) => (0, exports.quotesRef)().doc(quoteId).collection(firestore_2.SUBCOLLECTIONS.ITEMS);
exports.quoteItemsRef = quoteItemsRef;
const routePackagesRef = (routeId) => (0, exports.routesRef)().doc(routeId).collection(firestore_2.SUBCOLLECTIONS.ROUTE_PACKAGES);
exports.routePackagesRef = routePackagesRef;
// Helper functions
const serverTimestamp = () => firestore_1.FieldValue.serverTimestamp();
exports.serverTimestamp = serverTimestamp;
const toTimestamp = (date) => firestore_1.Timestamp.fromDate(date);
exports.toTimestamp = toTimestamp;
const fromTimestamp = (timestamp) => timestamp.toDate();
exports.fromTimestamp = fromTimestamp;
// Generic CRUD helpers
async function getDocument(collection, id) {
    const doc = await collection.doc(id).get();
    if (!doc.exists)
        return null;
    return { id: doc.id, ...doc.data() };
}
async function listDocuments(collection, options) {
    let query = collection;
    if (options?.where) {
        for (const condition of options.where) {
            query = query.where(condition.field, condition.op, condition.value);
        }
    }
    if (options?.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection || "desc");
    }
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
async function createDocument(collection, data, id) {
    const docData = {
        ...data,
        createdAt: (0, exports.serverTimestamp)(),
        updatedAt: (0, exports.serverTimestamp)(),
    };
    let docRef;
    if (id) {
        docRef = collection.doc(id);
        await docRef.set(docData);
    }
    else {
        docRef = await collection.add(docData);
    }
    const now = new Date().toISOString();
    return { id: docRef.id, ...data, createdAt: now, updatedAt: now };
}
async function updateDocument(collection, id, data) {
    const docRef = collection.doc(id);
    await docRef.update({
        ...data,
        updatedAt: (0, exports.serverTimestamp)(),
    });
    const now = new Date().toISOString();
    return { id, ...data, updatedAt: now };
}
async function deleteDocument(collection, id) {
    const docRef = collection.doc(id);
    await docRef.delete();
    return true;
}
// Batch operations
function createBatch() {
    return exports.db.batch();
}
async function runTransaction(fn) {
    return exports.db.runTransaction(fn);
}
//# sourceMappingURL=firestore.js.map