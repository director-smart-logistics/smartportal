/**
 * F2.2b — the MANUAL invoice sync (Facturas → sincronizar con SP2, syncInvoicesToSp2) hands SP2
 * the CONFIRMED pre-alert of each tracking by id, exactly like the automatic trigger.
 *
 * Twin of functions/src/invoices/prealert-links.ts (client and functions do not share code) —
 * keep both identical; their tests cover the same cases.
 *
 * A link travels only when SP1's packages/{tracking} AND its pre-alert belong to the invoice
 * customer (stored by Nova on save, client/lib/nova/prealert-link.ts).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SL_RE = /^SL\d+$/;

function normalizeSl(value: unknown): string {
  const raw = String(value ?? '').toUpperCase().replace(/\s+/g, '');
  const sl = /^\d+$/.test(raw) ? `SL${raw}` : raw;
  return SL_RE.test(sl) ? sl : '';
}

export interface PreAlertLink {
  tracking: string;
  preAlertId: string;
}

/** Trackings of an invoice payload: trackingNumbers + trackingNumber + item trackings, upper case, unique. */
export function invoiceTrackings(invoice: Record<string, any>): string[] {
  const out = new Set<string>();
  const add = (t: unknown) => {
    const v = String(t ?? '').toUpperCase().trim();
    if (v) out.add(v);
  };
  (Array.isArray(invoice.trackingNumbers) ? invoice.trackingNumbers : []).forEach(add);
  add(invoice.trackingNumber);
  (Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : []).forEach((it: any) => add(it?.trackingNumber));
  return [...out];
}

/** Pure decision: which confirmed links may travel with this invoice. */
export function preAlertLinksFor(
  invoiceSlCode: unknown,
  packages: Map<string, Record<string, any> | undefined>,
): PreAlertLink[] {
  const sl = normalizeSl(invoiceSlCode);
  if (!sl) return [];
  const links: PreAlertLink[] = [];
  packages.forEach((pkg, tracking) => {
    if (!pkg) return;
    const id = String(pkg.preAlertId ?? '').trim();
    if (!id) return;
    if (normalizeSl(pkg.preAlertSlCode) !== sl) return;
    if (normalizeSl(pkg.slCode || pkg.clientSlCode) !== sl) return;
    links.push({ tracking, preAlertId: id });
  });
  return links;
}

/**
 * Adds `preAlertLinks` to each invoice payload of a chunk (reads each SP1 package once).
 * Never throws: on a read failure the payloads go as before (SP2 keeps its previous behavior).
 */
export async function attachPreAlertLinks(payloads: Array<Record<string, any>>): Promise<void> {
  try {
    const all = new Set<string>();
    payloads.forEach((p) => invoiceTrackings(p).forEach((t) => all.add(t)));
    const pkgs = new Map<string, Record<string, any> | undefined>();
    await Promise.all([...all].map(async (t) => {
      const snap = await getDoc(doc(db, 'packages', t));
      pkgs.set(t, snap.exists() ? (snap.data() as Record<string, any>) : undefined);
    }));
    for (const p of payloads) {
      const own = new Map(invoiceTrackings(p).map((t) => [t, pkgs.get(t)] as const));
      const links = preAlertLinksFor(p.slCode || p.clientSlCode || p.customerId, own);
      if (links.length) p.preAlertLinks = links;
    }
  } catch (err) {
    console.warn('[syncInvoicesToSp2] Could not read pre-alert links — synced without them', err);
  }
}
