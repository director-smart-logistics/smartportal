/**
 * F11.2 / F11.3 — the ONE writer of "the address an admin corrected on a label → the customer's principal
 * address in SP2". Used by the Nova label (slUpdateSp2AddressFromLabel) and by
 * scripts/audit/cleanup-admin-overrides.cjs (--sync-sp2), so both write exactly the same way.
 *
 * Same write as the SP2 store (src/infrastructure/firebase/principal-address-store.ts), in ONE batch:
 *   users/{uid}      defaultAddress = block, addresses = [block], addressModel 'single-v1'
 *   addresses/{id}   the same block (transition copy); other docs of the user lose the principal mark
 *                    (their data is untouched)
 * sp1LastPushAt is NOT set, so SP2 pushes the customer back to SP1 at once. Nothing is ever erased
 * (principalFromLabelText). Before/after → SP1 sp2_address_admin_edits.
 * Rules: ./label-address-sp2.ts.
 */
import { FieldValue } from "firebase-admin/firestore";
import { currentSp2Principal, principalFromLabelText, parseLabelAddressText, SINGLE_ADDRESS_MODEL } from "./label-address-sp2";

type Db = FirebaseFirestore.Firestore;
type AnyAddress = Record<string, any>;

export type LabelWriteErrorCode = "empty" | "not-found" | "multiple" | "no-address" | "ambiguous";
export class LabelWriteError extends Error {
  constructor(public code: LabelWriteErrorCode, message: string) { super(message); this.name = "LabelWriteError"; }
}

export interface LabelWriteInput { slCode: string; text: string; by: string; byUid?: string; source: string; runId?: string }
export interface LabelWriteResult { changed: boolean; uid: string; before: AnyAddress; after?: AnyAddress }

async function sp2UserBySl(sp2: Db, slCode: string) {
  const users = await sp2.collection("users").where("slCode", "==", slCode).limit(2).get();
  if (users.empty) throw new LabelWriteError("not-found", `No hay cliente ${slCode} en SmartWeb`);
  if (users.size > 1) throw new LabelWriteError("multiple", `Hay más de una cuenta con ${slCode} en SmartWeb; revisar antes de cambiar la dirección`);
  return users.docs[0];
}

/** Writes `block` as the only principal address of `uid` (users doc + transition copy). */
async function writePrincipal(sp2: Db, userRef: FirebaseFirestore.DocumentReference, uid: string, block: AnyAddress, by: string, now: string) {
  const collection = await sp2.collection("addresses").where("userId", "==", uid).get();
  const batch = sp2.batch();
  batch.update(userRef, {
    defaultAddress: block, addresses: [block], addressModel: SINGLE_ADDRESS_MODEL,
    addressUpdatedAt: now, profileLastUpdatedBy: by, updatedAt: now,
  });
  const copyRef = sp2.collection("addresses").doc(block.id);
  if (collection.docs.some((d) => d.id === block.id)) batch.update(copyRef, block);
  else batch.create(copyRef, block);
  for (const o of collection.docs) {
    const x = o.data();
    if (o.id !== block.id && (x.isPrimary || x.isDefault)) batch.update(o.ref, { isPrimary: false, isDefault: false, updatedAt: now, updatedBy: by });
  }
  await batch.commit();
}

export async function updateSp2PrincipalFromLabel(sp1: Db, sp2: Db, input: LabelWriteInput): Promise<LabelWriteResult> {
  const slCode = input.slCode.trim().toUpperCase();
  if (!parseLabelAddressText(input.text).streetAddress) throw new LabelWriteError("empty", "La dirección está vacía");
  const userDoc = await sp2UserBySl(sp2, slCode);
  const uid = userDoc.id;
  const collection = await sp2.collection("addresses").where("userId", "==", uid).get();
  const sp1Customer = (await sp1.collection("customers").doc(slCode).get()).data() || null;
  const { principal, ambiguous } = currentSp2Principal(userDoc.data(), collection.docs.map((d) => ({ id: d.id, ...d.data() })), sp1Customer?.defaultAddress || null);
  if (!principal) throw new LabelWriteError("no-address", "El cliente no tiene dirección principal en SmartWeb. Debe registrarla él (o desde el panel de SmartWeb) con provincia, cantón y distrito.");
  if (ambiguous) throw new LabelWriteError("ambiguous", "El cliente tiene más de una dirección marcada como principal en SmartWeb; revisar antes de cambiarla");

  const now = new Date().toISOString();
  const block = principalFromLabelText(principal, input.text, { userId: uid, updatedAt: now, updatedBy: input.by });
  if (!block) return { changed: false, uid, before: principal };
  block.id = String(principal.id || sp2.collection("addresses").doc().id);

  await writePrincipal(sp2, userDoc.ref, uid, block, input.by, now);
  await sp1.collection("sp2_address_admin_edits").add({
    slCode, uid, source: input.source, runId: input.runId || null, by: input.by, byUid: input.byUid || null,
    before: principal, after: block, labelText: input.text, result: "applied", at: FieldValue.serverTimestamp(),
  }).catch((e) => console.error(`[label-address-sp2] log failed for ${slCode}:`, e));
  return { changed: true, uid, before: principal, after: block };
}

/** Rollback: puts `before` back as the principal address (only if `after` is still the current one). */
export async function restoreSp2Principal(sp2: Db, slCode: string, before: AnyAddress, after: AnyAddress, by: string): Promise<"restored" | "changed-since"> {
  const userDoc = await sp2UserBySl(sp2, slCode);
  const cur = userDoc.data().defaultAddress;
  if (!cur || cur.updatedAt !== after.updatedAt) return "changed-since";   // the customer edited after: keep theirs
  await writePrincipal(sp2, userDoc.ref, userDoc.id, before, by, new Date().toISOString());
  return "restored";
}
