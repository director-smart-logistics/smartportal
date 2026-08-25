/**
 * use-nova-downloads.ts
 *
 * Custom hook that encapsulates all file-download and local-backup logic
 * for the Nova results table.
 *
 * Exported handlers:
 *  - handleDownloadCSV        — Download full manifest as CSV (overrides applied)
 *  - handleDownloadXLSX       — Download full manifest as Excel (overrides applied)
 *  - saveLocalBackup          — Persist current CSV to localStorage (fire-and-forget)
 *  - handleDownloadBackupCSV  — Download the latest localStorage backup (fallback to CSV)
 *
 * NOTE: GTI manifest download was removed from NovaTable. The canonical GTI
 * download lives exclusively in RoutesManagement (Gestión de Rutas → GTI
 * Entregados) where invoices carry the definitive amountCRC amounts.
 *
 * BUG-D1/D2: The parent onDownload/onDownloadXLSX props use processedData.rows
 * from use-nova-chat, which are the original manifest rows with no overrides.
 * These handlers instead call buildResolvedRows to produce a ProcessingResult
 * whose rows match exactly what the operator sees in the table, then delegate
 * to the same generateCSV/generateXLSX pipeline used everywhere else.
 */

import { useCallback } from 'react';
import {
  downloadCSV as downloadCSVFile,
  downloadXLSX as downloadXLSXFile,
  generateCSV,
  type ManifestType,
  type ManifestRow,
  type ProcessingResult,
} from '@/lib/services/manifest-processor';
import type { CustomerContactInfo } from '@/lib/services/invoice-service';
import type { NovaMessage as NovaMessageType } from '@/hooks/use-nova-chat';
import { logAction } from '@/lib/services/audit-service';

// ── Parameter types ───────────────────────────────────────────────────────────

interface DownloadUserInfo {
  id?:       string;
  email?:    string;
  fullName?: string;
}

interface UseNovaDownloadsParams {
  resultData:         NonNullable<NovaMessageType['resultData']>;
  buildResolvedRows:  (rows: ManifestRow[]) => ManifestRow[];
  authUser?:          DownloadUserInfo | null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNovaDownloads({
  resultData,
  buildResolvedRows,
  authUser,
}: UseNovaDownloadsParams) {

  const handleDownloadCSV = useCallback(() => {
    const resolved   = buildResolvedRows(resultData.rows);
    const totalPrice = resolved.reduce((s, r) => s + r.precio, 0);
    const result: ProcessingResult = {
      rows:               resolved,
      summary:            { ...resultData.summary, totalPrice },
      manifestNumber:     resultData.manifestNumber,
      manifestType:       (resultData.manifestType || 'usa_air') as ManifestType,
      corrections:        resultData.corrections,
      validation:         resultData.validation || { isValid: true, issues: [], suggestions: [] },
      multiMatchRows:     resultData.multiMatchRows || [],
      requiresUserChoice: resultData.requiresUserChoice || false,
    };
    logAction({
      userId: authUser?.id || "unknown",
      userName: authUser?.fullName || authUser?.email || "Usuario Nova",
      userEmail: authUser?.email || undefined,
      action: "manifest_exported",
      category: "manifest",
      resource: "manifests",
      resourceId: resultData.manifestNumber,
      result: "success",
      metadata: { format: "csv", totalRows: resolved.length, totalPrice },
    });
    downloadCSVFile(result);
  }, [buildResolvedRows, resultData, authUser]);

  const handleDownloadXLSX = useCallback(() => {
    const resolved   = buildResolvedRows(resultData.rows);
    const totalPrice = resolved.reduce((s, r) => s + r.precio, 0);
    const result: ProcessingResult = {
      rows:               resolved,
      summary:            { ...resultData.summary, totalPrice },
      manifestNumber:     resultData.manifestNumber,
      manifestType:       (resultData.manifestType || 'usa_air') as ManifestType,
      corrections:        resultData.corrections,
      validation:         resultData.validation || { isValid: true, issues: [], suggestions: [] },
      multiMatchRows:     resultData.multiMatchRows || [],
      requiresUserChoice: resultData.requiresUserChoice || false,
    };
    logAction({
      userId: authUser?.id || "unknown",
      userName: authUser?.fullName || authUser?.email || "Usuario Nova",
      userEmail: authUser?.email || undefined,
      action: "manifest_exported",
      category: "manifest",
      resource: "manifests",
      resourceId: resultData.manifestNumber,
      result: "success",
      metadata: { format: "xlsx", totalRows: resolved.length, totalPrice },
    });
    downloadXLSXFile(result);
  }, [buildResolvedRows, resultData, authUser]);

  const saveLocalBackup = useCallback((resolvedRows: ManifestRow[]) => {
    try {
      const result: ProcessingResult = {
        rows:               resolvedRows,
        summary:            { ...resultData.summary, totalPrice: resolvedRows.reduce((s, r) => s + r.precio, 0) },
        manifestNumber:     resultData.manifestNumber,
        manifestType:       (resultData.manifestType || 'usa_air') as ManifestType,
        corrections:        resultData.corrections,
        validation:         resultData.validation || { isValid: true, issues: [], suggestions: [] },
        multiMatchRows:     resultData.multiMatchRows || [],
        requiresUserChoice: resultData.requiresUserChoice || false,
      };
      const csv = generateCSV(result);
      const key = `nova_backup_${resultData.manifestNumber || 'last'}`;
      localStorage.setItem(key, csv);
      localStorage.setItem(`${key}_ts`, new Date().toISOString());
    } catch { /* non-fatal */ }
  }, [resultData]);

  const handleDownloadBackupCSV = useCallback(() => {
    const key      = `nova_backup_${resultData.manifestNumber || 'last'}`;
    const backup   = localStorage.getItem(key);
    const filename = `${resultData.manifestNumber || 'manifiesto'}_backup.csv`;
    
    logAction({
      userId: authUser?.id || "unknown",
      userName: authUser?.fullName || authUser?.email || "Usuario Nova",
      userEmail: authUser?.email || undefined,
      action: "manifest_downloaded",
      category: "manifest",
      resource: "manifests",
      resourceId: resultData.manifestNumber,
      result: "success",
      metadata: { type: "local_backup", hasBackup: !!backup },
    });

    if (backup) {
      const blob = new Blob([backup], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } else {
      handleDownloadCSV();
    }
  }, [resultData.manifestNumber, handleDownloadCSV, authUser]);

  return {
    handleDownloadCSV,
    handleDownloadXLSX,
    saveLocalBackup,
    handleDownloadBackupCSV,
  };
}
