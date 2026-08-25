import { CalculatedColAirManifestRow } from '@/components/ui/col-air-spreadsheet/useColAirCalculations';
import { ManifestRow, ProcessingResult, ManifestType, saveManifestRecord } from '../manifest-processor';
import { getCustomersBySlCodes, CustomerContactInfo, createInvoicesFromRows } from '../invoice-service';
import { db } from '@/lib/firebase/config';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Transforms manual spreadsheet data into the format expected by NovaTableModal (ResultSummary).
 */
export async function processManualColAirManifest(
  rows: CalculatedColAirManifestRow[],
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
      console.error('[ColAirManifestProcessor] Failed to fetch customers by SL Code', err);
    }
  }

  // 4. Map rows to ManifestRow format
  const processedRows: ManifestRow[] = validRows.map((row, idx) => {
    const slCodeNorm = row.slCode.toUpperCase().trim();
    const customer = customerMap.get(slCodeNorm);
    
    // Use the values already calculated accurately in the frontend
    const price = row.price || 0;
    const pesoNum = parseFloat(row.peso as string) || 0;

    return {
      tracking: row.warehouseId.toUpperCase().trim(),
      nombre: customer?.fullName || row.customerName || '', // Resolved from SL Code, fallback to row
      guia: '',
      manifiesto: manifestNumber,
      peso: pesoNum,
      precio: price,
      slCode: slCodeNorm,
      nombreCliente: customer?.fullName || row.customerName || '',
      ruta: row.ruta || customer?.ruta || '',
      consolidacion: customer?.consolidationEnabled || false,
      descripcion: `PESO: ${pesoNum} KG (Permisos: ${row.permisos ? 'Sí' : 'No'})`,
      permisos: row.permisos,
      pesoRedondeo: pesoNum, 
      diferenciaRedondeo: 0,
      pesoConsolidacion: pesoNum,
      precioSinPermiso: price, // For now, mapping same
      precioConPermiso: price,
      matchScore: customer ? 1 : 0, // Perfect score if customer found, 0 if not
      matchSource: 'name',
      originalData: {
        warehouseId: row.warehouseId,
        peso: row.peso,
        permisos: row.permisos
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
    manifestType: 'colombia_air',
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

export async function saveColAirManifestData(
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
  // 1. Save Packages
  const packagesCollection = collection(db, 'packages');
  const batchSavePromises = processedData.rows.map(async (row) => {
    // Generate a package document ID based on tracking
    const docRef = doc(packagesCollection, row.tracking);
    
    return setDoc(docRef, {
      trackingNumber: row.tracking,
      slCode: row.slCode,
      weight: row.peso,
      manifest: processedData.manifestNumber,
      status: 'Bogota - Procesado', // Triggers SP2 sync via existing functions
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isSeaFreight: false, // It's air freight
      price: row.precio,
      permisos: row.permisos || false
    }, { merge: true }); // Merge true to avoid overwriting all existing package fields if they pre-exist
  });

  await Promise.all(batchSavePromises);

  // Call saveManifestRecord to register the manifest metadata in manifests collection
  await saveManifestRecord(processedData.rows, processedData.manifestNumber, {
    manifestType: 'colombia_air',
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
      source: 'manual', // since 'col_air' is not in the InvoiceRecord type
      ivaEnabled,
      terceroItems,
      mergedSlCodes: options?.mergeInvoices
        ? new Set(processedData.rows.map(r => r.slCode.toUpperCase().trim()).filter(Boolean))
        : undefined
    });
  }

  return null;
}
