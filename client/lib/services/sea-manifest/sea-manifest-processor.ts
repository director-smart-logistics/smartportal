import { CalculatedSeaManifestRow } from '@/components/ui/usa-sea-spreadsheet/useSpreadsheetCalculations';
import { ManifestRow, ProcessingResult, ManifestType, saveManifestRecord } from '../manifest-processor';
import { getCustomersBySlCodes, CustomerContactInfo, createInvoicesFromRows } from '../invoice-service';
import { db } from '@/lib/firebase/config';
import { collection, doc, setDoc, serverTimestamp, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { deleteInvoiceFromSp2 } from '../sync-invoices-service';


/**
 * Transforms manual spreadsheet data into the format expected by NovaTableModal (ResultSummary).
 */
export async function processManualSeaManifest(
  rows: CalculatedSeaManifestRow[],
  manifestNumber: string
): Promise<ProcessingResult> {
  
  // 1. Filter out empty rows
  const validRows = rows.filter(r => 
    r.warehouseId.trim() !== '' || r.slCode.trim() !== ''
  );

  // 2. Extract unique SL Codes to fetch customer data in one batch
  const slCodes = [...new Set(validRows.map(r => r.slCode.toUpperCase().trim()).filter(Boolean))];
  
  // 3. Fetch customers from Firebase
  let customerMap = new Map<string, CustomerContactInfo>();
  if (slCodes.length > 0) {
    try {
      customerMap = await getCustomersBySlCodes(slCodes);
    } catch (err) {
      console.error('[SeaManifestProcessor] Failed to fetch customers by SL Code', err);
    }
  }

  // 4. Map rows to ManifestRow format
  const processedRows: ManifestRow[] = validRows.map((row, idx) => {
    const slCodeNorm = row.slCode.toUpperCase().trim();
    const customer = customerMap.get(slCodeNorm);
    
    // Use the values already calculated accurately in the frontend
    const roundedVolume = row.roundedVolume || 0;
    const price = row.price || 0;
    
    // We can still calculate the raw cubic feet for the description
    const lengthNum = parseFloat(row.length as string) || 0;
    const widthNum = parseFloat(row.width as string) || 0;
    const heightNum = parseFloat(row.height as string) || 0;
    const cubicFeet = (lengthNum * widthNum * heightNum) / 1728;
    
    const warehouseIdStr = row.warehouseId.toUpperCase().trim().replace(/\//g, '-');
    const multiplier = parseInt(row.multiplier as string) || 1;
    const descSuffix = multiplier > 1 ? ` X${multiplier}` : '';

    return {
      tracking: warehouseIdStr,
      nombre: customer?.fullName || row.customerName || '', // Resolved from SL Code, fallback to row
      guia: '',
      manifiesto: manifestNumber,
      peso: roundedVolume, // We store the rounded volume as the "peso" so existing Nova logic treats it natively
      precio: price,
      slCode: slCodeNorm,
      nombreCliente: customer?.fullName || row.customerName || '',
      ruta: row.ruta || customer?.ruta || '',
      consolidacion: customer?.consolidationEnabled || false,
      descripcion: `${warehouseIdStr}${descSuffix} | DIM: ${lengthNum}x${widthNum}x${heightNum} in (${cubicFeet.toFixed(2)} ft³)`,
      permisos: false,
      pesoRedondeo: roundedVolume, // Set the rounding difference to 0 since it's already rounded
      diferenciaRedondeo: 0,
      pesoConsolidacion: roundedVolume,
      precioSinPermiso: price,
      precioConPermiso: price, // Sea doesn't use permit fees by default, or it's built into the 30 USD
      matchScore: customer ? 1 : 0, // Perfect score if customer found, 0 if not
      matchSource: 'name',
      originalData: {
        warehouseId: row.warehouseId,
        length: row.length,
        width: row.width,
        height: row.height,
        cubicFeet,
        roundedVolume
      }
    };
  });

  const totalErrors = processedRows.filter(r => r.slCode === '' || r.matchScore === 0).length;

  // 5. Construct the final ProcessingResult
  return {
    rows: processedRows,
    summary: {
      totalRows: rows.length,
      processedRows: validRows.length,
      errors: totalErrors,
      totalPrice: processedRows.reduce((acc, r) => acc + r.precio, 0),
      customersMatched: processedRows.filter(r => r.matchScore === 1).length,
      namesCorrections: 0,
      weightCorrections: 0
    },
    manifestNumber,
    manifestType: 'usa_sea', // Forces sea logic
    corrections: [],
    validation: {
      isValid: totalErrors === 0,
      issues: [],
      suggestions: []
    },
    multiMatchRows: [],
    requiresUserChoice: false
  };
}

export async function saveSeaManifestData(
  processedData: ProcessingResult,
  createDraftInvoices: boolean,
  exchangeRate: number,
  options?: {
    ivaEnabled?: boolean;
    bodegajeCost?: number;
    permisoCost?: number;
    mergeInvoices?: boolean;
  }
) {
  // ── Cleanup Stale Packages and Draft Invoices ──────────────────────────────
  try {
    const manifestNumber = processedData.manifestNumber;
    const newTrackings = new Set(processedData.rows.map(r => r.tracking.toUpperCase().trim()));
    const newSlCodes = new Set(processedData.rows.map(r => r.slCode.toUpperCase().trim()));

    // 1. Clean up stale packages
    const pkgsQuery1 = query(collection(db, 'packages'), where('manifest', '==', manifestNumber));
    const pkgsQuery2 = query(collection(db, 'packages'), where('manifestNumber', '==', manifestNumber));
    
    const [snap1, snap2] = await Promise.all([
      getDocs(pkgsQuery1),
      getDocs(pkgsQuery2)
    ]);
    
    // De-duplicate documents
    const existingPkgDocs = new Map<string, any>();
    snap1.docs.forEach(d => existingPkgDocs.set(d.id, d));
    snap2.docs.forEach(d => existingPkgDocs.set(d.id, d));
    
    const pkgsToDelete: string[] = [];
    existingPkgDocs.forEach((docSnap, pkgId) => {
      const data = docSnap.data() || {};
      const trackingNum = (data.trackingNumber || data.tracking || pkgId) as string;
      const trackingUpper = trackingNum.toUpperCase().trim();
      if (!newTrackings.has(trackingUpper)) {
        // Only delete if it's NOT in a protected status!
        const status = (data.status as string | undefined) ?? '';
        const lowerStatus = status.toLowerCase();
        if (
          lowerStatus !== 'delivered' &&
          lowerStatus !== 'processed' &&
          lowerStatus !== 'returned' &&
          lowerStatus !== 'pickup'
        ) {
          pkgsToDelete.push(pkgId);
        }
      }
    });

    if (pkgsToDelete.length > 0) {
      await Promise.all(pkgsToDelete.map(pkgId => deleteDoc(doc(db, 'packages', pkgId))));
    }

    // 2. Clean up stale draft invoices
    const invQuery = query(collection(db, 'invoices'), where('manifestNumber', '==', manifestNumber));
    const invSnap = await getDocs(invQuery);
    
    const invoicesToDelete: { id: string; invoiceNumber: string }[] = [];
    invSnap.docs.forEach(d => {
      const data = d.data();
      const status = (data.status as string | undefined) ?? '';
      const clientSlCode = (data.clientSlCode as string | undefined) ?? '';
      
      // AI GUARD: Only delete DRAFT invoices (or invoices without status)
      if (!status || status.toLowerCase() === 'draft') {
        const clientSlCodeUpper = clientSlCode.toUpperCase().trim();
        if (!newSlCodes.has(clientSlCodeUpper)) {
          invoicesToDelete.push({
            id: d.id,
            invoiceNumber: data.invoiceNumber || d.id
          });
        }
      }
    });

    if (invoicesToDelete.length > 0) {
      await Promise.all(invoicesToDelete.map(async (inv) => {
        await deleteDoc(doc(db, 'invoices', inv.id));
        try {
          await deleteInvoiceFromSp2(inv.id, inv.invoiceNumber);
        } catch (syncErr) {
          console.warn(`[SeaManifestProcessor] Failed to delete invoice ${inv.id} from SP2:`, syncErr);
        }
      }));
    }
  } catch (err) {
    console.error('[SeaManifestProcessor] Failed to clean up stale packages/invoices:', err);
  }

  // 1. Save Packages
  const packagesCollection = collection(db, 'packages');
  const batchSavePromises = processedData.rows.map(async (row) => {
    // Generate a package document ID based on tracking
    const docRef = doc(packagesCollection, row.tracking);
    
    return setDoc(docRef, {
      trackingNumber: row.tracking,
      slCode: row.slCode,
      weight: row.peso,
      length: row.originalData?.length || 0,
      width: row.originalData?.width || 0,
      height: row.originalData?.height || 0,
      volume: row.originalData?.cubicFeet || 0,
      manifest: processedData.manifestNumber,
      status: 'Miami - Procesado', // Triggers SP2 sync via existing functions
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isSeaFreight: true,
      price: row.precio
    }, { merge: true }); // Merge true to avoid overwriting all existing package fields if they pre-exist
  });

  await Promise.all(batchSavePromises);

  // Call saveManifestRecord to register the manifest metadata in manifests collection
  await saveManifestRecord(processedData.rows, processedData.manifestNumber, {
    manifestType: 'usa_sea',
    exchangeRate,
    totalPrice: processedData.summary.totalPrice
  });

  // 2. Save Draft Invoices if requested
  if (createDraftInvoices) {
    const { ivaEnabled = false, bodegajeCost: globalBodegaje = 0, permisoCost: globalPermiso = 0 } = options || {};
    
    // Create terceroItems map to apply to ALL slCodes in this manifest
    const terceroItems = new Map<string, { amount: number; description: string }>();
    
    // Group rows by slCode to accumulate costs
    const slCodeGroups = processedData.rows.reduce((acc, row) => {
      const code = row.slCode.toUpperCase().trim();
      if (!code) return acc;
      if (!acc[code]) acc[code] = { bodegaje: 0, permiso: 0 };
      acc[code].bodegaje += globalBodegaje;
      acc[code].permiso += globalPermiso;
      return acc;
    }, {} as Record<string, { bodegaje: number; permiso: number }>);

    Object.entries(slCodeGroups).forEach(([code, costs]) => {
      if (costs.bodegaje > 0 || costs.permiso > 0) {
        const descParts = [];
        if (costs.bodegaje > 0) descParts.push(`Bodegaje: $${costs.bodegaje}`);
        if (costs.permiso > 0) descParts.push(`Permisos: $${costs.permiso}`);
        terceroItems.set(code, {
          amount: costs.bodegaje + costs.permiso,
          description: descParts.join(' | ')
        });
      }
    });

    return await createInvoicesFromRows(processedData.rows, {
      exchangeRate,
      manifestNumber: processedData.manifestNumber,
      source: 'maritime',
      ivaEnabled,
      terceroItems,
      mergedSlCodes: options?.mergeInvoices
        ? new Set(processedData.rows.map(r => r.slCode.toUpperCase().trim()).filter(Boolean))
        : undefined
    });
  }

  return null;
}
