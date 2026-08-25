/**
 * MLocker Service — Client-side wrapper for the slMLockerProxy Firebase Function
 *
 * Provides typed calls to:
 *  - trackPackage       → ML Cargo API tracking
 *  - listManifests      → MLocker portal manifest history
 *  - getManifestDetail  → MLocker portal manifest detail (parsed packages)
 *  - downloadManifestExcel → MLocker portal Excel export
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/lib/firebase/config";

// ── Response types ────────────────────────────────────────────────────────────

export interface MLCargoTrackingResult {
  found: boolean;
  trackingNumber: string;
  message?: string;
  packageInfo?: {
    trackingNumber: string;
    destino?: string;
    destinoCompleto?: string;
    shipper?: string;
    shipperDescripcion?: string;
    bultos?: number;
    peso?: number;
    notas?: string;
    codigoCliente?: string;
    nombreCliente?: string;
    idManifest?: string;
    descripcionArticulo?: string;
    factura?: string;
  } | null;
  events?: Array<{
    trackingNumber?: string;
    ciudad?: string;
    detalle?: string;
    fecha?: string;
  }>;
  eventCount?: number;
}

export interface MLockerManifest {
  id: string;
  description: string;
  receptionDate: string;
  status: string;
  manifestType?: string;
}

export interface MLockerManifestListResult {
  total: number;
  count: number;
  manifests: MLockerManifest[];
}

export interface MLockerManifestPackage {
  tracking: string;
  cliente: string;
  nombreCliente: string;
  tipo: string;
  nombreTipo: string;
  valor: string;
  guia: string;
  saco: string;
  peso: string;
}

export interface MLockerManifestDetailResult {
  manifestId: string;
  packageCount: number;
  totalWeight: number | null;
  totalPackages: number;
  packages: MLockerManifestPackage[];
}

export interface MLockerExcelResult {
  success: boolean;
  manifestId: string;
  type: string;
  url?: string;
  base64?: string;
  contentType?: string;
  filename?: string;
  storagePath?: string;
  downloadUrl?: string;
}

// ── Firebase Functions callable reference ────────────────────────────────────

function getMLockerProxy() {
  const functions = getFunctions(app, "us-central1");
  return httpsCallable<Record<string, unknown>, Record<string, unknown>>(
    functions,
    "slMLockerProxy"
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function trackPackage(trackingNumber: string): Promise<MLCargoTrackingResult> {
  const proxy = getMLockerProxy();
  const result = await proxy({ action: "track_package", trackingNumber });
  return result.data as unknown as MLCargoTrackingResult;
}

export async function listManifests(params: {
  start?: number;
  length?: number;
  manifestNumber?: string;
  description?: string;
  status?: number;
  startDate?: string;
  endDate?: string;
} = {}): Promise<MLockerManifestListResult> {
  const proxy = getMLockerProxy();
  // If searching by manifestNumber, trim it
  const cleanParams = { ...params };
  if (cleanParams.manifestNumber) {
    cleanParams.manifestNumber = cleanParams.manifestNumber.trim();
  }
  const result = await proxy({ action: "list_manifests", ...cleanParams });
  const data = result.data as unknown as MLockerManifestListResult;
  if (data && Array.isArray(data.manifests)) {
    data.manifests = data.manifests.map(m => ({
      ...m,
      id: (m.id || '').trim(),
    }));
  }
  return data;
}

export async function getManifestDetail(manifestId: string): Promise<MLockerManifestDetailResult> {
  const proxy = getMLockerProxy();
  const trimmedId = (manifestId || '').trim();
  const result = await proxy({ action: "get_manifest_detail", manifestId: trimmedId });
  const data = result.data as unknown as MLockerManifestDetailResult;
  if (data) {
    if (data.manifestId) {
      data.manifestId = data.manifestId.trim();
    }
  }
  return data;
}

export async function downloadManifestExcel(
  manifestId: string,
  excelType: "summary" | "detail" = "summary"
): Promise<MLockerExcelResult> {
  const proxy = getMLockerProxy();
  const trimmedId = (manifestId || '').trim();
  const result = await proxy({ action: "download_manifest_excel", manifestId: trimmedId, excelType });
  const data = result.data as unknown as MLockerExcelResult;
  if (data) {
    if (data.manifestId) {
      data.manifestId = data.manifestId.trim();
    }
  }
  return data;
}

/**
 * Trigger a browser download from an Excel result returned by downloadManifestExcel.
 * If the result has a URL, opens it in a new tab.
 * If it has base64, creates a Blob and triggers a download link.
 */
export function triggerExcelDownload(excelResult: MLockerExcelResult): void {
  // Prefer the signed Storage URL (direct download), fall back to legacy url
  const directUrl = excelResult.downloadUrl || excelResult.url;
  if (directUrl) {
    const anchor = document.createElement("a");
    anchor.href = directUrl;
    anchor.download = excelResult.filename || `manifiesto_${excelResult.manifestId}.xlsx`;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  }

  if (excelResult.base64) {
    const byteChars = atob(excelResult.base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
      type: excelResult.contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = excelResult.filename || `manifiesto_${excelResult.manifestId}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

/**
 * Convert MLocker manifest detail packages to the ProcessedRow format
 * used by Nova's manifest processor, so users can run match/pricing on them.
 */
export function convertMLockerDetailToRows(
  detail: MLockerManifestDetailResult
): Array<{
  tracking: string;
  nombre: string;
  peso: number;
  descripcion: string;
  manifiesto: string;
}> {
  return detail.packages.map((pkg) => ({
    tracking: pkg.tracking,
    nombre: pkg.nombreCliente || pkg.cliente,
    peso: parseFloat(pkg.peso) || 0,
    descripcion: pkg.nombreTipo || pkg.tipo || "",
    manifiesto: detail.manifestId,
  }));
}
