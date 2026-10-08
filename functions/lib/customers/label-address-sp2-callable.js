"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slUpdateSp2AddressFromLabel = void 0;
/**
 * F11.2 — slUpdateSp2AddressFromLabel: the Nova shipping label's option "Actualizar también la
 * dirección principal del cliente en SmartWeb (SP2)".
 *
 * The write itself (one batch, nothing erased, before/after log, SP2 pushes back to SP1 at once) is
 * ./label-address-sp2-writer.ts — shared with scripts/audit/cleanup-admin-overrides.cjs.
 * Safety here: staff only (SP1 isAgent() roles); the writer requires exactly one SP2 account for the SL,
 * an existing, non-ambiguous principal address (province/canton/district come from it).
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const sp2_target_1 = require("../config/sp2-target");
const label_address_sp2_1 = require("./label-address-sp2");
const label_address_sp2_writer_1 = require("./label-address-sp2-writer");
function sp2Db() {
    const name = "smart-portal-2";
    const app = (0, app_1.getApps)().find((a) => a.name === name) || (0, app_1.initializeApp)({ projectId: (0, sp2_target_1.sp2ProjectId)() }, name);
    return (0, firestore_1.getFirestore)(app);
}
const HTTPS_CODE = { "empty": "invalid-argument", "not-found": "failed-precondition", "multiple": "failed-precondition", "no-address": "failed-precondition", "ambiguous": "failed-precondition" };
exports.slUpdateSp2AddressFromLabel = (0, https_1.onCall)({ cors: true, invoker: "public" }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Debe iniciar sesión");
    if (!(0, label_address_sp2_1.canEditCustomerAddress)(request.auth.token.role))
        throw new https_1.HttpsError("permission-denied", "Solo personal autorizado puede cambiar la dirección del cliente");
    const slCode = String(request.data?.slCode || "").trim().toUpperCase();
    const text = String(request.data?.deliveryAddress || "");
    if (!slCode)
        throw new https_1.HttpsError("invalid-argument", "Falta el código SL");
    if (text.length > 2000)
        throw new https_1.HttpsError("invalid-argument", "La dirección es demasiado larga");
    const by = String(request.auth.token.email || request.auth.uid);
    try {
        const r = await (0, label_address_sp2_writer_1.updateSp2PrincipalFromLabel)((0, firestore_1.getFirestore)((0, app_1.getApp)(), "portal"), sp2Db(), { slCode, text, by, byUid: request.auth.uid, source: "nova-shipping-label" });
        if (r.changed)
            console.log(`[slUpdateSp2AddressFromLabel] ${slCode} (${r.uid}) principal address updated by ${by}`);
        return { success: true, changed: r.changed, address: r.after };
    }
    catch (e) {
        if (e instanceof label_address_sp2_writer_1.LabelWriteError)
            throw new https_1.HttpsError(HTTPS_CODE[e.code], e.message);
        throw e;
    }
});
//# sourceMappingURL=label-address-sp2-callable.js.map