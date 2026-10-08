/**
 * F11.2 — slUpdateSp2AddressFromLabel: the Nova shipping label's option "Actualizar también la
 * dirección principal del cliente en SmartWeb (SP2)".
 *
 * The write itself (one batch, nothing erased, before/after log, SP2 pushes back to SP1 at once) is
 * ./label-address-sp2-writer.ts — shared with scripts/audit/cleanup-admin-overrides.cjs.
 * Safety here: staff only (SP1 isAgent() roles); the writer requires exactly one SP2 account for the SL,
 * an existing, non-ambiguous principal address (province/canton/district come from it).
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { sp2ProjectId } from "../config/sp2-target";
import { canEditCustomerAddress } from "./label-address-sp2";
import { updateSp2PrincipalFromLabel, LabelWriteError } from "./label-address-sp2-writer";

interface Request { slCode?: string; deliveryAddress?: string }

function sp2Db(): FirebaseFirestore.Firestore {
  const name = "smart-portal-2";
  const app = getApps().find((a) => a.name === name) || initializeApp({ projectId: sp2ProjectId() }, name);
  return getFirestore(app);
}

const HTTPS_CODE = { "empty": "invalid-argument", "not-found": "failed-precondition", "multiple": "failed-precondition", "no-address": "failed-precondition", "ambiguous": "failed-precondition" } as const;

export const slUpdateSp2AddressFromLabel = onCall({ cors: true, invoker: "public" }, async (request: CallableRequest<Request>) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debe iniciar sesión");
  if (!canEditCustomerAddress(request.auth.token.role)) throw new HttpsError("permission-denied", "Solo personal autorizado puede cambiar la dirección del cliente");

  const slCode = String(request.data?.slCode || "").trim().toUpperCase();
  const text = String(request.data?.deliveryAddress || "");
  if (!slCode) throw new HttpsError("invalid-argument", "Falta el código SL");
  if (text.length > 2000) throw new HttpsError("invalid-argument", "La dirección es demasiado larga");

  const by = String(request.auth.token.email || request.auth.uid);
  try {
    const r = await updateSp2PrincipalFromLabel(getFirestore(getApp(), "portal"), sp2Db(), { slCode, text, by, byUid: request.auth.uid, source: "nova-shipping-label" });
    if (r.changed) console.log(`[slUpdateSp2AddressFromLabel] ${slCode} (${r.uid}) principal address updated by ${by}`);
    return { success: true, changed: r.changed, address: r.after };
  } catch (e) {
    if (e instanceof LabelWriteError) throw new HttpsError(HTTPS_CODE[e.code], e.message);
    throw e;
  }
});
