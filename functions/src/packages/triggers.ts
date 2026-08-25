/**
 * Package Firestore triggers — package <-> invoice link invariant enforcement.
 *
 * Companion to `invoices/triggers.ts`. Where that trigger fires on invoice
 * mutations and walks the trackings, this one fires on PACKAGE mutations
 * (creation, tracking change, customer reassign, manifest move, deletion)
 * and recomputes the single source-of-truth link:
 *
 *   package.invoiceId / invoiceNumber / invoiceStatus
 *     ← the most recent ACTIVE invoice (NOT in
 *       annulled / cancelled / void / draft) that lists the package's
 *       tracking under the package's customer. If none, all three are null.
 *
 * Why this side too:
 *   - When admin reassigns a package to a different customer, the old
 *     invoice doesn't change, so `onInvoiceWritten` doesn't fire and the
 *     package would keep pointing to the previous customer's invoice
 *     (cross-client leak).
 *   - When a package's tracking is corrected, only the package doc changes;
 *     without this trigger the link would survive the rename.
 *
 * Idempotent. Anti-loop guarded by skipping writes whose only change is
 * the metadata fields we write back here.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";

const PKG_STATUS_RANK: Record<string, number> = {
  'pre-alerted': 0, 'pre_alerted': 0,
  'received': 1,
  'transit': 2, 'in_transit': 2,
  'customs': 3, 'retained': 3, 'held': 3,
  'consolidated': 4,
  'processed': 5,
  'route': 6, 'on_route': 6, 'pickup': 6,
  'delivered': 7, 'returned': 7,
};

function getStatusRank(status: string): number {
  return PKG_STATUS_RANK[String(status || '').toLowerCase()] ?? -1;
}

const LIVE_STATUS_LABELS: Record<string, string> = {
  customs: "En Aduanas",
  transit: "En Tránsito",
  received: "Recibido",
  route: "En Ruta",
  on_route: "En Ruta",
  in_route: "En Ruta",
  delivered: "Entregado",
  processed: "Facturado",
  held: "Retenido",
  returned: "Devuelto",
  consolidated: "Consolidado",
  "pre-alerted": "Pre-Alertado",
  pickup: "Retira en Oficina",
};

const INACTIVE = new Set(["annulled", "cancelled", "void", "deleted"]);

function isTransitoria(pkg: any): boolean {
  if (!pkg) return false;
  const mId = String(pkg.manifestId || "").toLowerCase();
  const mNum = String(pkg.manifestNumber || "").toLowerCase();
  const uMf = String(pkg.updatedManifest || "").toLowerCase();
  return (
    mId === "consolidacion_transitoria" ||
    mNum === "consolidacion_transitoria" ||
    uMf === "consolidacion_transitoria"
  );
}

// Fields we manage. If a write only touches these, we skip to break the
// re-entrancy loop produced by our own update().
const SELF_MANAGED_FIELDS = new Set([
  "invoiceId",
  "invoiceNumber",
  "invoiceStatus",
  "invoiceLinkUpdatedAt",
  "invoiceLinkSource",
]);

function onlyManagedDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): boolean {
  if (!before) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (SELF_MANAGED_FIELDS.has(k)) continue;
    const a = (before as Record<string, unknown>)[k];
    const b = (after  as Record<string, unknown>)[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) return false;
  }
  return true;
}

function getStatusPriority(status: string): number {
  const STATUS_PRIORITIES: Record<string, number> = {
    paid: 3,
    sent: 2,
    overdue: 2,
    pending: 2,
    pending_payment: 2,
    draft: 1,
    annulled: 0,
    cancelled: 0,
    void: 0,
  };
  return STATUS_PRIORITIES[String(status).toLowerCase()] ?? 0;
}

async function computeDesiredLink(
  tracking: string,
  clientSlCode: string,
): Promise<{ id: string | null; number: string | null; status: string | null }> {
  if (!tracking || !clientSlCode) return { id: null, number: null, status: null };
  const upper = tracking.toUpperCase();

  const snaps = await Promise.all([
    db.collection("invoices").where("trackingNumbers", "array-contains", tracking).get(),
    upper !== tracking
      ? db.collection("invoices").where("trackingNumbers", "array-contains", upper).get()
      : Promise.resolve(null as unknown as FirebaseFirestore.QuerySnapshot),
  ]);

  type Cand = { id: string; number: string | null; status: string; ms: number };
  const cands: Cand[] = [];
  const seen = new Set<string>();
  for (const snap of snaps) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data();
      const status = String(data.status || "draft").toLowerCase();
      const sl = String(data.clientSlCode || data.slCode || "").trim();
      if (sl && sl !== clientSlCode) continue;
      const ca = data.createdAt;
      const ms = ca?.toMillis?.()
        ?? (typeof ca === "string" ? Date.parse(ca) : 0)
        ?? 0;
      cands.push({
        id:     d.id,
        number: data.invoiceNumber || null,
        status,
        ms,
      });
    }
  }
  cands.sort((a, b) => {
    const priorityA = getStatusPriority(a.status);
    const priorityB = getStatusPriority(b.status);
    if (priorityB !== priorityA) {
      return priorityB - priorityA;
    }
    return b.ms - a.ms;
  });
  // Only resolve to active invoices. If none, return nulls so the package stays unlinked.
  const active = cands.filter(c => !INACTIVE.has(c.status));
  const w = active[0] || null;
  return w ? { id: w.id, number: w.number, status: w.status } : { id: null, number: null, status: null };
}

export const onPackageWritten = onDocumentWritten(
  {
    document: "packages/{pkgId}",
    database: "portal",
    region:   "us-central1",
  },
  async (event) => {
    const pkgId  = event.params.pkgId;
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    // Sync to manifest_encomiendas
    const trackingUpper = pkgId.toUpperCase();
    
    if (!after) {
      // Deletion: remove from manifest_encomiendas
      try {
        await db.collection("manifest_encomiendas").doc(trackingUpper).delete();
        logger.info("[package-trigger] deleted from manifest_encomiendas on package deletion", { pkgId: trackingUpper });
      } catch (err) {
        logger.warn("[package-trigger] failed to delete from manifest_encomiendas on package deletion", {
          pkgId: trackingUpper,
          error: (err as Error).message,
        });
      }
      return;
    }

    const beforeRuta = before ? String(before.ruta || "").trim().toLowerCase() : "";
    const afterRuta = String(after.ruta || "").trim().toLowerCase();
    const wasEncomienda = beforeRuta === "encomiendas";
    const isEncomienda = afterRuta === "encomiendas";

    if (isEncomienda) {
      // Check if any relevant field has changed to avoid redundant writes
      const fieldsToCompare = [
        "manifestNumber", "manifestId", "slCode", "userId", 
        "customerName", "nombre", "weight", "peso", "price", "cost", "precio",
        "description", "descripcion", "permisos", "requiresPermit",
        "consolidacion", "isConsolidated", "status", "statusLabel",
        "invoiceNumber", "invoiceUpdated"
      ];
      
      let hasChanged = !before || beforeRuta !== afterRuta;
      if (before && !hasChanged) {
        for (const field of fieldsToCompare) {
          if (before[field] !== after[field]) {
            hasChanged = true;
            break;
          }
        }
      }

      if (hasChanged) {
        const encomiendaPayload = {
          tracking: trackingUpper,
          manifestNumber: after.manifestNumber || after.manifestId || "",
          slCode: after.slCode || after.userId || "",
          customerName: after.customerName || after.nombre || "",
          ruta: "Encomiendas",
          weight: Number(after.weight ?? after.peso ?? 0),
          price: Number(after.price ?? after.cost ?? after.precio ?? 0),
          description: after.description || after.descripcion || "",
          permisos: after.permisos ?? after.requiresPermit ?? false,
          consolidacion: after.consolidacion ?? after.isConsolidated ?? false,
          status: after.status ?? "",
          statusLabel: after.statusLabel ?? "",
          invoiceNumber: after.invoiceNumber ?? "",
          invoiceUpdated: after.invoiceUpdated ?? false,
          updatedAt: new Date().toISOString(),
        };
        try {
          await db.collection("manifest_encomiendas").doc(trackingUpper).set(encomiendaPayload, { merge: true });
          logger.info("[package-trigger] manifest_encomiendas synced", { pkgId: trackingUpper, status: after.status });
        } catch (err) {
          logger.warn("[package-trigger] manifest_encomiendas sync failed", {
            pkgId: trackingUpper,
            error: (err as Error).message,
          });
        }
      }
    } else if (wasEncomienda && !isEncomienda) {
      // Route changed away from Encomiendas, remove from manifest_encomiendas
      try {
        await db.collection("manifest_encomiendas").doc(trackingUpper).delete();
        logger.info("[package-trigger] deleted from manifest_encomiendas on route change", { pkgId: trackingUpper });
      } catch (err) {
        logger.warn("[package-trigger] manifest_encomiendas delete on route change failed", {
          pkgId: trackingUpper,
          error: (err as Error).message,
        });
      }
    }

    // Anti-loop: if the diff is only the fields we manage, skip.
    if (before && onlyManagedDiff(before, after)) return;

    const tracking = String(after.trackingNumber || after.tracking || "").trim();
    const sl       = String(after.clientSlCode  || after.slCode    || "").trim();
    if (!tracking || !sl) return;

    // Si el paquete ya existía, y su tracking, cliente o estado de consolidación transitoria
    // no han cambiado, el enlace de factura deseado tampoco ha podido cambiar.
    const trackingChanged = !before || String(before.trackingNumber || before.tracking || "").trim() !== tracking;
    const slCodeChanged = !before || String(before.clientSlCode || before.slCode || "").trim() !== sl;
    const transitoriaChanged = !before || isTransitoria(before) !== isTransitoria(after);

    let desired;
    if (!trackingChanged && !slCodeChanged && !transitoriaChanged && before) {
      desired = {
        id:     before.invoiceId     || null,
        number: before.invoiceNumber || null,
        status: before.invoiceStatus || null,
      };
    } else {
      desired = isTransitoria(after)
        ? { id: null, number: null, status: null }
        : await computeDesiredLink(tracking, sl);
    }
    const current = {
      id:     after.invoiceId     || null,
      number: after.invoiceNumber || null,
      status: after.invoiceStatus || null,
    };

    const currentPkgStatus = after.status || '';
    const currentPkgRank = getStatusRank(currentPkgStatus);

    let desiredPkgStatus = currentPkgStatus;
    let desiredPkgLabel = after.statusLabel || '';

    if (desired.status === 'paid') {
      const targetRank = getStatusRank('on_route');
      if (currentPkgRank < targetRank) {
        desiredPkgStatus = 'on_route';
        desiredPkgLabel = LIVE_STATUS_LABELS['on_route'];
      }
    } else if (desired.status === 'sent' || desired.status === 'pending' || desired.status === 'overdue') {
      const targetRank = getStatusRank('processed');
      if (currentPkgRank < targetRank) {
        desiredPkgStatus = 'processed';
        desiredPkgLabel = LIVE_STATUS_LABELS['processed'];
      }
    }

    const linkUnchanged = current.id === desired.id && current.number === desired.number && current.status === desired.status;
    const statusUnchanged = currentPkgStatus === desiredPkgStatus;

    if (linkUnchanged && statusUnchanged) return;

    try {
      const updateData: Record<string, any> = {
        invoiceId:     desired.id,
        invoiceNumber: desired.number,
        invoiceStatus: desired.status,
        invoiceLinkUpdatedAt: new Date().toISOString(),
        invoiceLinkSource:    "package-trigger",
      };

      if (!statusUnchanged) {
        updateData.status = desiredPkgStatus;
        updateData.statusLabel = desiredPkgLabel;
        updateData.statusHistory = FieldValue.arrayUnion({
          status: desiredPkgStatus,
          changedAt: new Date().toISOString(),
          changedBy: "system",
          note: `Estado del paquete actualizado a ${desiredPkgStatus} para coincidir con la factura ${desired.number || desired.id} (estado: ${desired.status}).`,
          timestamp: new Date().toISOString(),
          updatedBy: "system",
          notes: `Estado del paquete actualizado a ${desiredPkgStatus} para coincidir con la factura ${desired.number || desired.id} (estado: ${desired.status}).`,
          location: desiredPkgStatus === 'processed' ? 'Costa Rica' : (desiredPkgStatus === 'on_route' ? 'En Ruta' : 'Costa Rica'),
        });
      }

      await event.data!.after!.ref.update(updateData);
      logger.info("[package-trigger] link and status enforced", {
        pkgId, tracking, sl,
        fromLink: current.id, toLink: desired.id,
        fromStatus: currentPkgStatus, toStatus: desiredPkgStatus,
      });
    } catch (err) {
      logger.warn("[package-trigger] link/status update failed", {
        pkgId, tracking, error: (err as Error).message,
      });
    }
  },
);
