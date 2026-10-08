/**
 * Invoice siblings (2026-09-28): in the customer's SP2 dashboard a "Facturados" card IS an invoice, and it only moves
 * to "Entregados" when EVERY package of that invoice is delivered. So when the admin changes the status of a package
 * in Paquetes, the other packages of the same invoice are offered for the same change — listed, checked by default,
 * the admin can untick any (partial delivery, a returned package). Nothing is changed without the admin confirming.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export interface InvoiceSibling {
  id: string;
  trackingNumber: string;
  status: string;
  invoiceNumber: string;
}

interface PkgRef {
  id: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  [k: string]: any;
}

const chunks = <T,>(a: T[], n = 10): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * Packages that share an invoice with `pkgs` and are not already in `targetStatus`.
 * Linked by invoiceId (kept by the SP1 package/invoice triggers) and, for older data, by invoiceNumber.
 */
export async function findInvoiceSiblings(pkgs: PkgRef[], targetStatus: string): Promise<InvoiceSibling[]> {
  const own = new Set(pkgs.map((p) => p.id));
  const ids = [...new Set(pkgs.map((p) => p.invoiceId).filter(Boolean) as string[])];
  const nums = [...new Set(pkgs.map((p) => p.invoiceNumber).filter(Boolean) as string[])];
  if (!ids.length && !nums.length) return [];
  const found = new Map<string, InvoiceSibling>();
  const add = (snap: Awaited<ReturnType<typeof getDocs>>) => {
    for (const d of snap.docs) {
      if (own.has(d.id) || found.has(d.id)) continue;
      const x = d.data() as any;
      if (String(x.status || "") === targetStatus) continue;
      found.set(d.id, { id: d.id, trackingNumber: x.trackingNumber || x.tracking || d.id, status: String(x.status || ""), invoiceNumber: x.invoiceNumber || "" });
    }
  };
  const col = collection(db, "packages");
  await Promise.all([
    ...chunks(ids).map(async (c) => add(await getDocs(query(col, where("invoiceId", "in", c))))),
    ...chunks(nums).map(async (c) => add(await getDocs(query(col, where("invoiceNumber", "in", c))))),
  ]);
  return [...found.values()].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber) || a.trackingNumber.localeCompare(b.trackingNumber));
}
