import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, runTransaction, orderBy, limit, writeBatch } from "firebase/firestore";
import type { EncomiendaManifestRow } from "./manifest-processor";

function newestInvoiceDoc(docs: any[]) {
  return docs.slice().sort((a, b) => {
    let aTime = 0, bTime = 0;
    const aData = a.data(), bData = b.data();
    if (aData.createdAt?.seconds) aTime = aData.createdAt.seconds * 1000;
    else if (typeof aData.createdAt === 'string') aTime = new Date(aData.createdAt).getTime();
    if (bData.createdAt?.seconds) bTime = bData.createdAt.seconds * 1000;
    else if (typeof bData.createdAt === 'string') bTime = new Date(bData.createdAt).getTime();
    return bTime - aTime;
  })[0];
}

export async function findInvoiceForPackage(tracking: string, customerId?: string) {
  const t = tracking.trim().toUpperCase();
  const q1 = query(collection(db, "invoices"), where("trackingNumbers", "array-contains", t));
  const snap1 = await getDocs(q1);
  const valid1 = snap1.docs.filter(d => d.data().status !== 'deleted');
  if (valid1.length > 0) return newestInvoiceDoc(valid1);
  
  const q2 = query(collection(db, "invoices"), where("trackingNumber", "==", t));
  const snap2 = await getDocs(q2);
  const valid2 = snap2.docs.filter(d => d.data().status !== 'deleted');
  if (valid2.length > 0) return newestInvoiceDoc(valid2);
  
  if (customerId && !customerId.startsWith('__')) {
    const q3 = query(collection(db, "invoices"), where("customerId", "==", customerId));
    const snap3 = await getDocs(q3);
    const valid3 = snap3.docs.filter(d => d.data().status !== 'deleted');
    if (valid3.length > 0) {
      // Look for an invoice that actually contains this tracking in its items
      const docs = valid3;
      const matchedDocs = docs.filter(doc => {
        const data = doc.data();
        const items = data.invoiceItems || data.items || [];
        return items.some((i: any) => 
          (i.trackingNumber || '').toUpperCase() === t || 
          (i.tracking || '').toUpperCase() === t ||
          (i.trackingRef || '').toUpperCase() === t
        );
      });
      if (matchedDocs.length > 0) return newestInvoiceDoc(matchedDocs);
      
      // If we couldn't find one explicitly containing it, look for a draft invoice
      const draftDocs = docs.filter(doc => doc.data().status === 'draft');
      if (draftDocs.length > 0) return newestInvoiceDoc(draftDocs);
      
      // Do not fallback to closed invoices
      return undefined;
    }
  }
  return undefined;
}

export async function applyManualServiceToInvoice(invoiceId: string, item: { description: string, amount: number, descKey: string, trackingRef: string }) {
  const invRef = doc(db, "invoices", invoiceId);
  return await runTransaction(db, async (t) => {
    const snap = await t.get(invRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    const existing: any[] = data.invoiceItems ?? data.items ?? [];
    const isEditing = !!item.trackingRef;
    let oldAmount = 0;
    const filtered = existing.filter((i: any) => {
      const match = i.isManual === true && (!isEditing ? !i.trackingRef && i.descKey === item.descKey : i.trackingRef === item.trackingRef && i.descKey === item.descKey);
      if (match) oldAmount += Number(i.totalPrice ?? i.unitPrice ?? 0);
      return !match;
    });
    const newItem = {
      description: item.description,
      trackingNumber: "",
      trackingRef: item.trackingRef || "",
      descKey: item.descKey,
      quantity: 1,
      unitPrice: item.amount,
      totalPrice: item.amount,
      weight: 0,
      isManual: true,
    };
    const updated = [...filtered, newItem];
    const diff = item.amount - oldAmount;
    const newTotal = Math.round((Number(data.totalAmount ?? data.amount ?? 0) + diff) * 100) / 100;
    const newSubtotal = Math.round((Number(data.subtotalAmount ?? data.subtotal ?? 0) + diff) * 100) / 100;
    t.update(invRef, {
      invoiceItems: updated,
      items: updated,
      totalAmount: newTotal,
      subtotalAmount: newSubtotal,
      amount: newTotal,
      subtotal: newSubtotal,
      updatedAt: new Date().toISOString()
    });
    return true;
  });
}

export async function removeManualServiceFromInvoice(invoiceId: string, itemKey: string, trackingRef: string) {
  const invRef = doc(db, "invoices", invoiceId);
  return await runTransaction(db, async (t) => {
    const snap = await t.get(invRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    const existing: any[] = data.invoiceItems ?? data.items ?? [];
    const isGlobal = !trackingRef;
    let oldAmount = 0;
    const filtered = existing.filter((i: any) => {
      const match = i.isManual === true && (isGlobal ? !i.trackingRef && i.descKey === itemKey : i.trackingRef === trackingRef && i.descKey === itemKey);
      if (match) oldAmount += Number(i.totalPrice ?? i.unitPrice ?? 0);
      return !match;
    });
    if (oldAmount === 0) return true;
    const newTotal = Math.round((Number(data.totalAmount ?? data.amount ?? 0) - oldAmount) * 100) / 100;
    const newSubtotal = Math.round((Number(data.subtotalAmount ?? data.subtotal ?? 0) - oldAmount) * 100) / 100;
    t.update(invRef, {
      invoiceItems: filtered,
      items: filtered,
      totalAmount: newTotal,
      subtotalAmount: newSubtotal,
      amount: newTotal,
      subtotal: newSubtotal,
      updatedAt: new Date().toISOString()
    });
    return true;
  });
}

export async function syncManifestEncomiendaFromPackages(manifestNumber: string) {
  const snap = await getDocs(query(collection(db, "packages"), where("encomiendaManifestNumber", "==", manifestNumber)));
  const batch = writeBatch(db);
  let count = 0;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const mapped = {
      tracking: data.trackingNumber || docSnap.id,
      slCode: data.slCode || "",
      description: data.description || "",
      weight: data.peso ?? data.weight ?? 0,
      price: data.montoTotal ?? 0,
      route: data.ruta ?? "",
      encomiendaServiceName: data.courierService || "",
      customerName: data.clientName || "",
      updatedAt: new Date().toISOString(),
    };
    batch.set(doc(db, "manifest_encomiendas", mapped.tracking), mapped, { merge: true });
    count++;
  });
  if (count > 0) await batch.commit();
  return count;
}

export async function syncAllEncomiendaPackages() {
  const snap = await getDocs(query(collection(db, "packages"), where("ruta", "==", "Encomiendas")));
  const batch = writeBatch(db);
  let count = 0;
  const manifestSet = new Set<string>();
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (!data.encomiendaManifestNumber) return;
    manifestSet.add(data.encomiendaManifestNumber);
    const mapped = {
      tracking: data.trackingNumber || docSnap.id,
      slCode: data.slCode || "",
      description: data.description || "",
      weight: data.peso ?? data.weight ?? 0,
      price: data.montoTotal ?? 0,
      route: data.ruta ?? "",
      encomiendaServiceName: data.courierService || "",
      customerName: data.clientName || "",
      updatedAt: new Date().toISOString(),
    };
    batch.set(doc(db, "manifest_encomiendas", mapped.tracking), mapped, { merge: true });
    count++;
  });
  if (count > 0) await batch.commit();
  return { synced: count, manifests: manifestSet.size };
}

export async function syncCostsToInvoices(rows: EncomiendaManifestRow[]) {
  let applied = 0;
  let errors = 0;
  const invMap = new Map<string, { doc: any, items: any[] }>();
  for (const row of rows) {
    try {
      const inv = await findInvoiceForPackage(row.tracking, row.slCode);
      if (!inv) continue;
      let grouped = invMap.get(inv.id);
      if (!grouped) {
        grouped = { doc: inv, items: inv.data().invoiceItems ?? inv.data().items ?? [] };
        invMap.set(inv.id, grouped);
      }
      let found = false;
      grouped.items = grouped.items.map((i: any) => {
        if ((i.trackingNumber || i.tracking || "").toUpperCase() === row.tracking.toUpperCase()) {
          found = true;
          return { ...i, unitPrice: row.price, totalPrice: row.price, weight: row.weight, description: row.description || i.description };
        }
        return i;
      });
      
      if (!found) {
        grouped.items.push({
          description: row.description || `Envío ${row.tracking}`,
          trackingNumber: row.tracking,
          tracking: row.tracking,
          quantity: 1,
          unitPrice: row.price ?? 0,
          totalPrice: row.price ?? 0,
          weight: row.weight ?? 0,
          isManual: false,
        });
      }

      if (row.thirdPartyCost != null && row.thirdPartyCost > 0) {
        const desc = row.thirdPartyCostDescription || "SERVICIO DE TERCERO";
        const manualMatch = grouped.items.find((i: any) => i.isManual && (i.trackingRef === row.tracking || !i.trackingRef) && i.descKey === desc);
        if (manualMatch) {
          manualMatch.unitPrice = row.thirdPartyCost;
          manualMatch.totalPrice = row.thirdPartyCost;
          if (!manualMatch.trackingRef) {
            manualMatch.trackingRef = row.tracking;
          }
        } else {
          grouped.items.push({
            description: desc,
            trackingNumber: "",
            trackingRef: row.tracking,
            descKey: desc,
            quantity: 1,
            unitPrice: row.thirdPartyCost,
            totalPrice: row.thirdPartyCost,
            weight: 0,
            isManual: true,
          });
        }
      }
    } catch { errors++; }
  }
  const batch = writeBatch(db);
  for (const [id, { doc: inv, items }] of Array.from(invMap.entries())) {
    const data = inv.data();
    const newTotal = items.reduce((s: number, i: any) => s + Number(i.totalPrice ?? i.unitPrice ?? i.amount ?? 0), 0);
    const newWeight = items.filter((i: any) => !i.isManual).reduce((s: number, i: any) => s + Number(i.weight ?? 0), 0);
    
    // Promote draft invoice to sent if the manifest indicates dispatched state
    let targetStatus = data.status;
    if (!targetStatus || targetStatus === 'draft') {
      const isDispatched = rows.some(r => 
        (r.status || '').toLowerCase() === 'sent' || 
        ['transit', 'route', 'delivered', 'processed'].includes((r.status || '').toLowerCase())
      );
      if (isDispatched) {
        targetStatus = 'sent';
      }
    }

    // Ensure the top-level trackingNumbers array is populated and accurate
    const trackingNumbers = Array.from(new Set(
      items
        .map((i: any) => (i.trackingNumber || i.tracking || '').toUpperCase())
        .filter((t: string) => t.length > 0)
    ));

    const ivaEnabled = !!data.ivaEnabled;
    const finalTotal = Math.round(newTotal * 100) / 100;
    const finalSubtotal = ivaEnabled ? Math.round(finalTotal / 1.13 * 100) / 100 : finalTotal;
    const finalTax = ivaEnabled ? Math.round((finalTotal - finalSubtotal) * 100) / 100 : 0;

    const rate = Number(data.exchangeRate ?? 0);
    const totalCRC = rate > 0 ? Math.round(finalTotal * rate) : 0;
    const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
    const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

    batch.update(doc(db, "invoices", id), {
      invoiceItems: items,
      items: items,
      trackingNumbers: trackingNumbers,
      status: targetStatus,
      totalAmount: finalTotal,
      subtotalAmount: finalSubtotal,
      amount: finalTotal,
      subtotal: finalSubtotal,
      iva: finalTax,
      taxAmount: finalTax,
      totalCRC: totalCRC,
      amountCRC: totalCRC,
      subtotalCRC: subtotalCRC,
      ivaCRC: ivaCRC,
      totalWeight: Math.round(newWeight * 100) / 100,
      updatedAt: new Date().toISOString()
    });
    applied++;
  }
  if (applied > 0) await batch.commit();
  return { applied, errors };
}

export async function recoverAllLegacyThirdPartyCosts(): Promise<{ applied: number, errors: number, logs: string[] }> {
  const logs: string[] = [];
  try {
    const q = query(collection(db, "manifest_encomiendas"), where("thirdPartyCost", ">", 0));
    const snap = await getDocs(q);
    logs.push(`Found ${snap.size} rows with thirdPartyCost > 0`);
    if (snap.empty) return { applied: 0, errors: 0, logs };

    const rows = snap.docs.map(d => ({ tracking: d.id, ...d.data() } as any));
    for (const r of rows) logs.push(`Row: ${r.tracking} (cost: ${r.thirdPartyCost})`);
    
    const { applied, errors } = await syncCostsToInvoices(rows);
    logs.push(`syncCostsToInvoices finished. Applied: ${applied}, Errors: ${errors}`);
    return { applied, errors, logs };
  } catch (err: any) {
    logs.push(`FATAL ERROR: ${err.message}`);
    return { applied: 0, errors: 1, logs };
  }
}

export async function auditAndSyncInvoices(manifestNumber?: string): Promise<{ audited: number, fixed: number, logs: string[] }> {
  const logs: string[] = [];
  let audited = 0;
  let fixed = 0;

  try {
    // Escanear paquetes
    let q;
    if (manifestNumber) {
      q = query(collection(db, "packages"), where("encomiendaManifestNumber", "==", manifestNumber));
    } else {
      q = query(collection(db, "packages"), where("ruta", "==", "Encomiendas"));
    }
    const snap = await getDocs(q);
    logs.push(`Encontrados ${snap.size} paquetes para auditar.`);
    
    if (snap.empty) return { audited, fixed, logs };

    const rows = snap.docs.map(d => ({ tracking: d.id, ...(d.data() as any) } as any));
    
    const invMap = new Map<string, { doc: any, items: any[], relatedPackages: any[] }>();
    
    for (const row of rows) {
      try {
        const inv = await findInvoiceForPackage(row.tracking, row.slCode);
        if (!inv) continue;
        
        let grouped = invMap.get(inv.id);
        if (!grouped) {
          grouped = { doc: inv, items: inv.data().invoiceItems ?? inv.data().items ?? [], relatedPackages: [] };
          invMap.set(inv.id, grouped);
        }
        grouped.relatedPackages.push(row);
      } catch (err: any) {
        logs.push(`Error al buscar factura para ${row.tracking}: ${err.message}`);
      }
    }
    
    logs.push(`Encontradas ${invMap.size} facturas distintas para auditar.`);
    
    const batch = writeBatch(db);
    
    for (const [id, { doc: inv, items, relatedPackages }] of Array.from(invMap.entries())) {
      audited++;
      const data = inv.data();
      let needsUpdate = false;
      
      // 1. Revisar si la factura está en draft pero los paquetes ya fueron despachados
      let currentStatus = data.status || 'draft';
      if (currentStatus === 'draft') {
        const isDispatched = relatedPackages.some(r => 
          (r.status || '').toLowerCase() === 'sent' || 
          ['transit', 'route', 'delivered', 'processed'].includes((r.status || '').toLowerCase())
        );
        if (isDispatched) {
          currentStatus = 'sent';
          needsUpdate = true;
          logs.push(`Factura ${data.invoiceNumber || id}: Promovida de draft a sent.`);
        }
      }
      
      // 2. Revisar si los montos o pesos están sincronizados
      let itemsModified = false;
      const updatedItems = items.map((i: any) => {
        const pkg = relatedPackages.find(r => (i.trackingNumber || i.tracking || '').toUpperCase() === r.tracking.toUpperCase());
        if (pkg) {
          // Ignoramos ítems manuales y verificamos variaciones en peso y precio
          if (!i.isManual && (i.unitPrice !== pkg.price || i.weight !== pkg.weight || i.totalPrice !== pkg.price)) {
            itemsModified = true;
            return { ...i, unitPrice: pkg.price ?? 0, totalPrice: pkg.price ?? 0, weight: pkg.weight ?? 0 };
          }
        }
        return i;
      });

      // Añadir paquetes que falten en la factura
      for (const pkg of relatedPackages) {
        const exists = updatedItems.some((i: any) => (i.trackingNumber || i.tracking || '').toUpperCase() === pkg.tracking.toUpperCase());
        if (!exists) {
          updatedItems.push({
            description: pkg.description || `Envío ${pkg.tracking}`,
            trackingNumber: pkg.tracking,
            tracking: pkg.tracking,
            quantity: 1,
            unitPrice: pkg.price ?? 0,
            totalPrice: pkg.price ?? 0,
            weight: pkg.weight ?? 0,
            isManual: false,
          });
          itemsModified = true;
        }
      }
      
      if (itemsModified) {
        needsUpdate = true;
        logs.push(`Factura ${data.invoiceNumber || id}: Precios o pesos de ítems actualizados según paquetes.`);
      }
      
      const newTotal = updatedItems.reduce((s: number, i: any) => s + Number(i.totalPrice ?? i.unitPrice ?? i.amount ?? 0), 0);
      const newWeight = updatedItems.filter((i: any) => !i.isManual).reduce((s: number, i: any) => s + Number(i.weight ?? 0), 0);
      
      const currentTotal = Math.round(Number(data.totalAmount ?? data.amount ?? 0) * 100) / 100;
      const calculatedTotal = Math.round(newTotal * 100) / 100;
      
      if (currentTotal !== calculatedTotal) {
        needsUpdate = true;
        logs.push(`Factura ${data.invoiceNumber || id}: Total actualizado de ${currentTotal} a ${calculatedTotal}.`);
      }
      
      if (needsUpdate) {
        const trackingNumbers = Array.from(new Set(
          updatedItems
            .map((i: any) => (i.trackingNumber || i.tracking || '').toUpperCase())
            .filter((t: string) => t.length > 0)
        ));

        const ivaEnabled = !!data.ivaEnabled;
        const finalTotal = calculatedTotal;
        const finalSubtotal = ivaEnabled ? Math.round(finalTotal / 1.13 * 100) / 100 : finalTotal;
        const finalTax = ivaEnabled ? Math.round((finalTotal - finalSubtotal) * 100) / 100 : 0;

        const rate = Number(data.exchangeRate ?? 0);
        const totalCRC = rate > 0 ? Math.round(finalTotal * rate) : 0;
        const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
        const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;
        
        batch.update(doc(db, "invoices", id), {
          invoiceItems: updatedItems,
          items: updatedItems,
          trackingNumbers: trackingNumbers,
          status: currentStatus,
          totalAmount: finalTotal,
          subtotalAmount: finalSubtotal,
          amount: finalTotal,
          subtotal: finalSubtotal,
          iva: finalTax,
          taxAmount: finalTax,
          totalCRC: totalCRC,
          amountCRC: totalCRC,
          subtotalCRC: subtotalCRC,
          ivaCRC: ivaCRC,
          totalWeight: Math.round(newWeight * 100) / 100,
          updatedAt: new Date().toISOString()
        });
        fixed++;
      }
    }
    
    if (fixed > 0) {
      await batch.commit();
      logs.push(`Cambios confirmados (batch) para ${fixed} facturas.`);
    } else {
      logs.push(`No se requirieron correcciones.`);
    }

    return { audited, fixed, logs };
  } catch (err: any) {
    logs.push(`ERROR FATAL en auditAndSyncInvoices: ${err.message}`);
    return { audited, fixed, logs };
  }
}

