/**
 * One "Eliminar cuenta" for SP1 and SP2 (2026-09-29).
 *
 * Rule (decided by the owner):
 *   - An account WITHOUT history (no package, invoice, shipment or pre-alert in either system) is removed from
 *     BOTH systems: SP1 ficha, SP2 profile, addresses, payment methods, identity indexes and the login.
 *   - An account WITH history is never deleted: the call is refused and says why (counts per system). The admin
 *     may instead disable the login (SP2), and the account stays identical in SP1 and SP2.
 *   - Nothing is left "soft-deleted": either the account exists in both systems or in none.
 * Every run writes account_deletions_log/<id> in SP1 AND in SP2 with who, why, when, the full backup of every
 * document removed (for debugging, evidence and recovery — scripts/audit/account-cleanup-restore.cjs format)
 * and the outcome. Refusals are logged too.
 *
 * Order: backup + log → SP1 ficha (so SP2's delete trigger finds nothing to re-create: guardNewSp1Customer skips
 * deleted accounts) → SP2 documents → the caller removes the login (SP2 owns Auth).
 *
 * Entry points:
 *   - slDeleteCustomerAccount (SP1 callable, admins): SP1 "Eliminar cliente"; asks SP2 to remove the login.
 *   - slDeleteAccountFromSp2 (HTTP, x-sync-secret): used by SP2's "Eliminar" (slAdminSoftDeleteUser).
 */
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";
import { sp2ProjectId } from "../config/sp2-target";

const SP2_PROJECT_ID = sp2ProjectId();
const SL = /^SL\d+$/;

function sp2Firestore(): FirebaseFirestore.Firestore {
  const name = "smart-portal-2";
  const app = getApps().find((a) => a.name === name) ?? initializeApp({ projectId: SP2_PROJECT_ID }, name);
  // (the QA emulator points SP2_PROJECT_ID at the demo project; production is smart-portal-2)
  return getFirestore(app);
}
const sp1Firestore = () => getFirestore(getApp(), "portal");

type Db = FirebaseFirestore.Firestore;
export interface DeleteInput { slCode: string; reason: string; by: string; source: "sp1" | "sp2"; uid?: string }
export interface DeleteResult {
  status: "deleted" | "blocked" | "not-found";
  slCode: string;
  uid: string | null;
  email: string | null;
  logId: string;
  history?: Record<string, number>;
  message: string;
}

const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null, (_k, x) => (x && typeof x.toDate === "function") ? { __ts: x.toDate().toISOString() } : x));

/** Counts every trace of history the account has in both systems (codes compared as written and upper-case). */
export async function accountHistory(db1: Db, db2: Db, slCode: string, uid: string | null): Promise<Record<string, number>> {
  // each document counted once per kind (a shipment found by slCode AND by userId is one shipment)
  const ids: Record<string, Set<string>> = {};
  const add = async (kind: string, db: Db, col: string, field: string, value: string) => {
    for (const d of (await db.collection(col).where(field, "==", value).limit(50).get()).docs) (ids[kind] ||= new Set()).add(d.id);
  };
  for (const f of ["slCode", "clientSlCode", "customerId"]) {
    await add("paquetes SP1", db1, "packages", f, slCode);
    await add("facturas SP1", db1, "invoices", f, slCode);
  }
  await add("envíos SP2", db2, "shipments", "slCode", slCode);
  await add("pre-alertas SP2", db2, "pre_alerts", "slCode", slCode);
  if (uid) {
    await add("envíos SP2", db2, "shipments", "userId", uid);
    await add("pre-alertas SP2", db2, "pre_alerts", "userId", uid);
  }
  return Object.fromEntries(Object.entries(ids).filter(([, v]) => v.size).map(([k, v]) => [k, v.size]));
}

export async function deleteAccountCore(db1: Db, db2: Db, input: DeleteInput, now = new Date().toISOString()): Promise<DeleteResult> {
  const slCode = String(input.slCode || "").trim().toUpperCase();
  const reason = String(input.reason || "").trim();
  if (!SL.test(slCode)) throw new HttpsError("invalid-argument", "Código SL inválido.");
  if (reason.length < 5) throw new HttpsError("invalid-argument", "Indica el motivo (mínimo 5 caracteres).");
  const logId = `${now.replace(/[:.]/g, "-")}_${slCode}`;

  const ficha = await db1.collection("customers").doc(slCode).get();
  const users = (await db2.collection("users").where("slCode", "==", slCode).get()).docs;
  const user = input.uid ? users.find((u) => u.id === input.uid) ?? (await db2.collection("users").doc(input.uid).get()) : users[0];
  const uid = user && user.exists ? user.id : (ficha.get("firebaseUid") || null);
  const email = (user && user.exists ? user.get("email") : null) || ficha.get("email") || null;
  const log = { slCode, uid, email, reason, by: input.by, source: input.source, at: now };
  const writeLog = (data: Record<string, unknown>) => Promise.all([
    db1.collection("account_deletions_log").doc(logId).set(data, { merge: true }),
    db2.collection("account_deletions_log").doc(logId).set(data, { merge: true }),
  ]);

  if (!ficha.exists && !(user && user.exists)) {
    await writeLog({ ...log, status: "not-found" });
    return { status: "not-found", slCode, uid, email, logId, message: `No existe ninguna cuenta ${slCode}.` };
  }
  if (users.length > 1) throw new HttpsError("failed-precondition", `Hay ${users.length} cuentas SP2 con ${slCode}: revisar antes de eliminar.`);

  const history = await accountHistory(db1, db2, slCode, uid);
  if (Object.keys(history).length) {
    const detail = Object.entries(history).map(([k, n]) => `${n} ${k}`).join(", ");
    await writeLog({ ...log, status: "blocked", history });
    logger.info("[deleteAccount] refused: account has history", { slCode, uid, history, by: input.by, source: input.source });
    return { status: "blocked", slCode, uid, email, logId, history, message: `La cuenta ${slCode} tiene historial (${detail}) y no se elimina. Si hay que impedir el acceso, deshabilita el login: la cuenta queda igual en SP1 y SP2.` };
  }

  // Full backup (same shape as scripts/audit/account-cleanup-apply.cjs → restorable with account-cleanup-restore.cjs)
  const backup: { sp1: Record<string, unknown>; sp2: Record<string, unknown> } = { sp1: {}, sp2: {} };
  const sp2Refs: FirebaseFirestore.DocumentReference[] = [];
  if (ficha.exists) backup.sp1[`customers/${slCode}`] = plain(ficha.data());
  if (user && user.exists && uid) {
    backup.sp2[`users/${uid}`] = plain(user.data());
    for (const [col, field] of [["addresses", "userId"], ["payment_methods", "userId"], ["email_index", "uid"], ["dni_index", "uid"], ["slcode_index", "uid"]] as const) {
      for (const d of (await db2.collection(col).where(field, "==", uid).get()).docs) { backup.sp2[`${col}/${d.id}`] = plain(d.data()); sp2Refs.push(d.ref); }
    }
    for (const sub of await db2.collection("users").doc(uid).listCollections()) {
      for (const d of (await sub.get()).docs) { backup.sp2[`users/${uid}/${sub.id}/${d.id}`] = plain(d.data()); sp2Refs.push(d.ref); }
    }
  }
  const idx = await db2.collection("slcode_index").doc(slCode).get();
  if (idx.exists && (!idx.get("uid") || idx.get("uid") === uid) && !sp2Refs.some((r) => r.path === idx.ref.path)) { backup.sp2[`slcode_index/${slCode}`] = plain(idx.data()); sp2Refs.push(idx.ref); }
  await writeLog({ ...log, status: "pending", backup: JSON.stringify({ group: "delete", code: slCode, uid, ...backup, login: null }) });

  const steps: string[] = [];
  if (ficha.exists) {
    await db1.collection("customers_merged").doc(`${slCode}_deleted_${logId}`).set({ ...ficha.data(), _deleted: { at: now, by: input.by, reason, logId } });
    await ficha.ref.delete(); steps.push(`SP1 customers/${slCode}`);
  }
  for (const r of sp2Refs) { await r.delete(); steps.push(`SP2 ${r.path}`); }
  if (user && user.exists) { await user.ref.delete(); steps.push(`SP2 users/${uid}`); }
  await writeLog({ status: "deleted", steps, doneAt: new Date().toISOString() });
  logger.info("[deleteAccount] deleted in SP1 and SP2", { slCode, uid, by: input.by, source: input.source, steps: steps.length });
  return { status: "deleted", slCode, uid, email, logId, message: `La cuenta ${slCode} se eliminó de SP1 y SP2 (respaldo en el registro ${logId}).` };
}

/** SP1 "Eliminar cliente" (admins). SP2 removes the login through its own endpoint. */
export const slDeleteCustomerAccount = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debe iniciar sesión");
  const role = String(request.auth.token.role || "").toUpperCase();
  if (!["ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(role)) throw new HttpsError("permission-denied", "Solo administradores pueden eliminar clientes.");
  const by = String(request.auth.token.email || request.auth.uid);
  const data = (request.data || {}) as { slCode?: string; reason?: string };
  const result = await deleteAccountCore(sp1Firestore(), sp2Firestore(), { slCode: String(data.slCode || ""), reason: String(data.reason || ""), by, source: "sp1" });
  if (result.status === "deleted" && result.uid) {
    const url = process.env.SP2_DELETE_LOGIN_URL || "https://us-central1-smart-portal-2.cloudfunctions.net/slDeleteLoginFromSp1";
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-sync-secret": process.env.SP2_SYNC_SECRET || "" }, body: JSON.stringify({ uid: result.uid, slCode: result.slCode, logId: result.logId, by }) });
      const ok = r.ok;
      await sp1Firestore().collection("account_deletions_log").doc(result.logId).set({ login: ok ? "deleted" : `error ${r.status}` }, { merge: true });
      if (!ok) logger.error("[slDeleteCustomerAccount] SP2 login removal failed", { status: r.status, uid: result.uid });
    } catch (err: any) {
      logger.error("[slDeleteCustomerAccount] SP2 login removal error", { uid: result.uid, error: err?.message });
      await sp1Firestore().collection("account_deletions_log").doc(result.logId).set({ login: `error ${err?.message}` }, { merge: true });
    }
  }
  return result;
});

/** Used by SP2's "Eliminar" after it verified the SP2 admin. SP2 then removes the login itself. */
export const slDeleteAccountFromSp2 = onRequest({ cors: false, invoker: "public", memory: "256MiB", timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const secret = process.env.SP2_SYNC_SECRET;
  if (!secret || req.headers["x-sync-secret"] !== secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const b = req.body || {};
    const result = await deleteAccountCore(sp1Firestore(), sp2Firestore(), { slCode: String(b.slCode || ""), uid: b.uid ? String(b.uid) : undefined, reason: String(b.reason || ""), by: String(b.by || "sp2-admin"), source: "sp2" });
    res.status(200).json(result);
  } catch (err: any) {
    const code = err instanceof HttpsError ? 400 : 500;
    res.status(code).json({ error: err?.message || "Error" });
  }
});
