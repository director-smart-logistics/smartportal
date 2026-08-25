"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const SP1_PROJECT_ID = "smart-portal-admin";
const SP2_PROJECT_ID = "smart-portal-2";
// Initialize SP1 (Admin) Firestore
let sp1Db;
try {
    const existingApp = (0, app_1.getApps)().find(a => a.name === "[DEFAULT]");
    const app = existingApp ?? (0, app_1.initializeApp)({ projectId: SP1_PROJECT_ID });
    sp1Db = (0, firestore_1.getFirestore)(app, "portal");
    console.log("✅ SP1 (Admin) Firestore database initialized.");
}
catch (err) {
    console.error("❌ Failed to initialize SP1 Firestore:", err);
    process.exit(1);
}
// Initialize SP2 (Customer) Firestore
let sp2Db;
try {
    const appName = "smart-portal-2-healing";
    const existingApp = (0, app_1.getApps)().find(a => a.name === appName);
    const app = existingApp ?? (0, app_1.initializeApp)({ projectId: SP2_PROJECT_ID }, appName);
    sp2Db = (0, firestore_1.getFirestore)(app);
    console.log("✅ SP2 (Customer) Firestore database initialized.");
}
catch (err) {
    console.error("❌ Failed to initialize SP2 Firestore:", err);
    process.exit(1);
}
async function main() {
    const tracking = "TBA333107684096";
    const sp2ShipmentId = "TBA333107684096_1505";
    const sp1PreAlertId = "TBA333107684096_1505";
    console.log("\n=======================================================");
    console.log(`  HEALING DATA FOR TRACKING: ${tracking}`);
    console.log("=======================================================\n");
    // 1. Restore SP2 shipment: shipments/TBA333107684096_1505
    console.log(`1. Restoring SP2 shipment: shipments/${sp2ShipmentId}...`);
    const sp2ShipmentRef = sp2Db.collection("shipments").doc(sp2ShipmentId);
    const sp2ShipmentSnap = await sp2ShipmentRef.get();
    if (sp2ShipmentSnap.exists) {
        const currentData = sp2ShipmentSnap.data() || {};
        console.log("Current SP2 Shipment data:", {
            userId: currentData.userId,
            slCode: currentData.slCode,
            customerName: currentData.customerName,
        });
        await sp2ShipmentRef.update({
            userId: "1505",
            slCode: "SL1431",
            customerName: "JESSICA DEL SOCORRO HERNANDEZ AROSTEGUI",
            manuallyUpdated: false, // restore standard status propagation
        });
        console.log("   -> Restored SP2 shipment to SL1431 / userId 1505.");
    }
    else {
        console.log(`   -> ⚠️ SP2 shipment shipments/${sp2ShipmentId} not found.`);
    }
    // 2. Restore SP1 package: packages/TBA333107684096
    console.log(`2. Restoring SP1 package: packages/${tracking}...`);
    const sp1PackageRef = sp1Db.collection("packages").doc(tracking);
    const sp1PackageSnap = await sp1PackageRef.get();
    if (sp1PackageSnap.exists) {
        const currentData = sp1PackageSnap.data() || {};
        console.log("Current SP1 Package data:", {
            slCode: currentData.slCode,
            userId: currentData.userId,
            customerName: currentData.customerName,
            ruta: currentData.ruta,
        });
        await sp1PackageRef.update({
            slCode: "SL1431",
            userId: "SL1431",
            customerName: "Jessica del Socorro Hernández Arostegui",
            ruta: "San Jose Centro",
        });
        console.log("   -> Restored SP1 package to SL1431 / San Jose Centro.");
    }
    else {
        console.log(`   -> ⚠️ SP1 package packages/${tracking} not found.`);
    }
    // 3. Restore SP1 pre_alert: pre_alerts/TBA333107684096_1505
    console.log(`3. Restoring SP1 pre_alert: pre_alerts/${sp1PreAlertId}...`);
    const sp1PreAlertRef = sp1Db.collection("pre_alerts").doc(sp1PreAlertId);
    const sp1PreAlertSnap = await sp1PreAlertRef.get();
    if (sp1PreAlertSnap.exists) {
        const currentData = sp1PreAlertSnap.data() || {};
        console.log("Current SP1 Pre-Alert data:", {
            slCode: currentData.slCode,
            userId: currentData.userId,
            displayName: currentData.displayName,
            email: currentData.email,
        });
        await sp1PreAlertRef.update({
            slCode: "SL1431",
            userId: "1505",
            firstName: "Jessica del Socorro",
            lastName: "Hernández Arostegui",
            displayName: "Jessica del Socorro Hernández Arostegui",
            email: "jessicahdez.06@gmail.com",
            phone: "61937989",
            dni: "115050856",
        });
        console.log("   -> Restored SP1 pre_alert to SL1431 / userId 1505.");
    }
    else {
        console.log(`   -> ⚠️ SP1 pre_alert pre_alerts/${sp1PreAlertId} not found.`);
    }
    console.log("\n=======================================================");
    console.log("  DATA HEALING COMPLETED SUCCESSFULLY");
    console.log("=======================================================\n");
}
main().catch(err => {
    console.error("❌ Execution failed:", err);
    process.exit(1);
});
//# sourceMappingURL=heal_prealert_tba333.js.map