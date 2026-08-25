/**
 * InvoiceAuditDialog
 *
 * Diagnostic + remediation modal for uninvoiced packages within consolidation.
 *
 * ── Purpose ─────────────────────────────────────────────────────────────────────
 *   Surfaces data integrity issues and allows the admin to reconcile them:
 *
 *   1. ORPHAN_NO_INVOICE     – No invoice references this tracking → genuinely uninvoiced
 *   2. UNLINKED_INVOICE      – Invoice exists with this tracking but package.invoiceId is null
 *                               → REMEDIATION: link the package to the found invoice
 *   3. ANNULLED_INVOICE_LINK – Package references an annulled invoice
 *                               → REMEDIATION: clear the bad ref and/or link to replacement
 *   4. MISMATCHED_CUSTOMER   – Invoice for this tracking belongs to another customer
 *
 * ── Remediation Flow ────────────────────────────────────────────────────────────
 *   For UNLINKED_INVOICE findings: a "Vincular" button updates the package's
 *   invoiceId field to the found invoice's ID, with user confirmation.
 *
 *   For ANNULLED_INVOICE_LINK: a "Limpiar" button clears the stale invoiceId,
 *   and if a replacement invoice is found, offers to link it.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileSearch,
  Package,
  Link2Off,
  Link2,
  FileX2,
  Users,
  ExternalLink,
  X,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  CheckCircle2,
  Wrench,
  Truck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { firebaseApi } from '@/lib/firebase/callable';
import type { ConsolidationPackage, ConsolidationInvoice } from './types';

// ── Audit types ──────────────────────────────────────────────────────────────

export type DiagnosisType =
  | 'ORPHAN_NO_INVOICE'
  | 'UNLINKED_INVOICE'
  | 'ANNULLED_INVOICE_LINK'
  | 'MISMATCHED_CUSTOMER'
  | 'PAID_UNDELIVERED_PKG';

export interface AuditFinding {
  packageId: string;
  trackingNumber: string;
  slCode: string;
  customerName?: string;
  manifestNumber?: string;
  diagnosis: DiagnosisType;
  /** Human-readable explanation */
  detail: string;
  /** Related invoice (if found) */
  relatedInvoiceNumber?: string;
  relatedInvoiceId?: string;
  relatedInvoiceStatus?: string;
  relatedInvoiceSlCode?: string;
  /** Whether this finding can be auto-remediated */
  canRemediate: boolean;
  /** Label for the remediation action */
  remediateLabel?: string;
}

/** Diagnosis metadata for display */
const DIAGNOSIS_META: Record<DiagnosisType, {
  label: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = {
  ORPHAN_NO_INVOICE: {
    label: 'Sin factura',
    color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    Icon: Package,
    description: 'No existe ninguna factura que contenga este tracking. El paquete nunca fue facturado.',
  },
  UNLINKED_INVOICE: {
    label: 'Factura desvinculada',
    color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
    Icon: Link2Off,
    description: 'Existe una factura con este tracking, pero el paquete no tiene el invoiceId asignado. Se puede vincular automáticamente.',
  },
  ANNULLED_INVOICE_LINK: {
    label: 'Factura anulada',
    color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    Icon: FileX2,
    description: 'El paquete referencia una factura anulada. Se puede limpiar la referencia y/o vincular a la factura de reemplazo.',
  },
  MISMATCHED_CUSTOMER: {
    label: 'Cliente diferente',
    color: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
    Icon: Users,
    description: 'Una factura contiene este tracking, pero pertenece a un cliente diferente (slCode distinto).',
  },
  PAID_UNDELIVERED_PKG: {
    label: 'Pagado sin entregar',
    color: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
    Icon: Truck,
    description: 'La factura está pagada hace más de 5 días pero el paquete no está en estado "entregado". Se sugiere actualizar el estado.',
  },
};

/** Terminal statuses — packages already "done" */
const TERMINAL_STATUSES = new Set(['delivered', 'processed', 'returned', 'pickup']);
const PAID_STALE_DAYS = 5;

// ── Audit engine ─────────────────────────────────────────────────────────────

function runAudit(
  packages: ConsolidationPackage[],
  invoices: ConsolidationInvoice[]
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Build tracking → invoice(s) index (one tracking can appear in multiple invoices)
  const trackingToInvoices = new Map<string, ConsolidationInvoice[]>();
  for (const inv of invoices) {
    for (const item of inv.invoiceItems || []) {
      if (item.trackingNumber) {
        const key = item.trackingNumber.toUpperCase().trim();
        const arr = trackingToInvoices.get(key) || [];
        arr.push(inv);
        trackingToInvoices.set(key, arr);
      }
    }
  }

  // Build invoiceId → invoice lookup
  const invoiceById = new Map<string, ConsolidationInvoice>();
  for (const inv of invoices) {
    invoiceById.set(inv.id, inv);
  }

  for (const pkg of packages) {
    const trackKey = pkg.trackingNumber.toUpperCase().trim();
    const matchingInvoices = trackingToInvoices.get(trackKey) || [];
    const pkgStatus = (pkg.status || '').toLowerCase();

    // Case 1: Package has an invoiceId pointing to an annulled invoice
    if (pkg.invoiceId) {
      const linkedInv = invoiceById.get(pkg.invoiceId);
      if (linkedInv && linkedInv.status === 'annulled') {
        // Check if there's a replacement non-annulled invoice
        const replacement = matchingInvoices.find(
          i => i.id !== linkedInv.id && i.status !== 'annulled'
        );
        findings.push({
          packageId: pkg.id,
          trackingNumber: pkg.trackingNumber,
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          manifestNumber: pkg.manifestNumber,
          diagnosis: 'ANNULLED_INVOICE_LINK',
          detail: replacement
            ? `Referencia la factura anulada ${linkedInv.invoiceNumber}. Factura de reemplazo disponible: ${replacement.invoiceNumber}.`
            : `Referencia la factura anulada ${linkedInv.invoiceNumber}. No se encontró factura de reemplazo.`,
          relatedInvoiceNumber: replacement?.invoiceNumber || linkedInv.invoiceNumber,
          relatedInvoiceId: replacement?.id || linkedInv.id,
          relatedInvoiceStatus: replacement?.status || linkedInv.status,
          relatedInvoiceSlCode: replacement?.slCode || linkedInv.slCode,
          canRemediate: !!replacement,
          remediateLabel: replacement ? `Vincular → ${replacement.invoiceNumber}` : undefined,
        });
        continue;
      }

      // Case 1b: Invoice is PAID but package is NOT delivered → stale delivery
      if (linkedInv && linkedInv.status === 'paid' && !TERMINAL_STATUSES.has(pkgStatus)) {
        const invDate = linkedInv.updatedAt || linkedInv.createdAt || '';
        const ageMs = invDate ? Date.now() - new Date(invDate).getTime() : 0;
        const ageDays = Math.floor(ageMs / 86_400_000);
        if (ageDays >= PAID_STALE_DAYS) {
          findings.push({
            packageId: pkg.id,
            trackingNumber: pkg.trackingNumber,
            slCode: pkg.slCode,
            customerName: pkg.customerName,
            manifestNumber: pkg.manifestNumber,
            diagnosis: 'PAID_UNDELIVERED_PKG',
            detail: `Factura ${linkedInv.invoiceNumber} pagada hace ${ageDays} días. Estado actual del paquete: "${pkg.status}". Se recomienda marcar como entregado.`,
            relatedInvoiceNumber: linkedInv.invoiceNumber,
            relatedInvoiceId: linkedInv.id,
            relatedInvoiceStatus: linkedInv.status,
            relatedInvoiceSlCode: linkedInv.slCode,
            canRemediate: true,
            remediateLabel: 'Marcar entregado',
          });
          continue;
        }
      }

      // Package has a valid invoiceId — no issue
      if (linkedInv) continue;
    }

    // Package has no invoiceId — investigate why
    if (!pkg.invoiceId) {
      if (matchingInvoices.length === 0) {
        // Case 2: No invoice contains this tracking at all
        findings.push({
          packageId: pkg.id,
          trackingNumber: pkg.trackingNumber,
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          manifestNumber: pkg.manifestNumber,
          diagnosis: 'ORPHAN_NO_INVOICE',
          detail: 'Ninguna factura de consolidación contiene este tracking. Puede que no se haya facturado aún.',
          canRemediate: false,
        });
      } else {
        // There are invoices with this tracking — check them
        const activeInvoices = matchingInvoices.filter(i => i.status !== 'annulled');

        if (activeInvoices.length === 0) {
          const inv = matchingInvoices[0];
          findings.push({
            packageId: pkg.id,
            trackingNumber: pkg.trackingNumber,
            slCode: pkg.slCode,
            customerName: pkg.customerName,
            manifestNumber: pkg.manifestNumber,
            diagnosis: 'UNLINKED_INVOICE',
            detail: `La factura ${inv.invoiceNumber} contenía este tracking pero fue anulada. El paquete quedó sin invoiceId vinculado.`,
            relatedInvoiceNumber: inv.invoiceNumber,
            relatedInvoiceId: inv.id,
            relatedInvoiceStatus: inv.status,
            relatedInvoiceSlCode: inv.slCode,
            canRemediate: false, // can't link to annulled invoice
          });
        } else {
          const inv = activeInvoices[0];

          if (inv.slCode && pkg.slCode && inv.slCode !== pkg.slCode) {
            findings.push({
              packageId: pkg.id,
              trackingNumber: pkg.trackingNumber,
              slCode: pkg.slCode,
              customerName: pkg.customerName,
              manifestNumber: pkg.manifestNumber,
              diagnosis: 'MISMATCHED_CUSTOMER',
              detail: `La factura ${inv.invoiceNumber} (${inv.slCode}) contiene este tracking, pero el paquete pertenece a ${pkg.slCode}.`,
              relatedInvoiceNumber: inv.invoiceNumber,
              relatedInvoiceId: inv.id,
              relatedInvoiceStatus: inv.status,
              relatedInvoiceSlCode: inv.slCode,
              canRemediate: false, // needs manual review
            });
          } else {
            findings.push({
              packageId: pkg.id,
              trackingNumber: pkg.trackingNumber,
              slCode: pkg.slCode,
              customerName: pkg.customerName,
              manifestNumber: pkg.manifestNumber,
              diagnosis: 'UNLINKED_INVOICE',
              detail: `La factura ${inv.invoiceNumber} contiene este tracking como item. Se puede vincular automáticamente.`,
              relatedInvoiceNumber: inv.invoiceNumber,
              relatedInvoiceId: inv.id,
              relatedInvoiceStatus: inv.status,
              relatedInvoiceSlCode: inv.slCode,
              canRemediate: true,
              remediateLabel: `Vincular → ${inv.invoiceNumber}`,
            });
          }
        }
      }
    }
  }

  return findings;
}

// ── Component ────────────────────────────────────────────────────────────────

interface InvoiceAuditDialogProps {
  open: boolean;
  onClose: () => void;
  packages: ConsolidationPackage[];
  invoices: ConsolidationInvoice[];
}

export function InvoiceAuditDialog({
  open,
  onClose,
  packages,
  invoices,
}: InvoiceAuditDialogProps) {
  const { toast } = useToast();
  const [expandedTypes, setExpandedTypes] = useState<Set<DiagnosisType>>(
    new Set(['PAID_UNDELIVERED_PKG', 'UNLINKED_INVOICE', 'ANNULLED_INVOICE_LINK', 'MISMATCHED_CUSTOMER'])
  );
  /** Track which findings are being remediated (packageId → loading) */
  const [remediating, setRemediating] = useState<Set<string>>(new Set());
  /** Track which findings have been successfully remediated */
  const [remediated, setRemediated] = useState<Set<string>>(new Set());

  const findings = useMemo(() => runAudit(packages, invoices), [packages, invoices]);

  /** Count remediable findings (excluding already remediated) */
  const remediableCount = useMemo(
    () => findings.filter(f => f.canRemediate && !remediated.has(f.packageId)).length,
    [findings, remediated]
  );

  // Group findings by diagnosis type
  const groupedFindings = useMemo(() => {
    const groups = new Map<DiagnosisType, AuditFinding[]>();
    for (const f of findings) {
      const arr = groups.get(f.diagnosis) || [];
      arr.push(f);
      groups.set(f.diagnosis, arr);
    }
    return groups;
  }, [findings]);

  const toggleType = (type: DiagnosisType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  /** Remediate a single finding */
  const handleRemediate = async (finding: AuditFinding) => {
    if (remediating.has(finding.packageId)) return;

    setRemediating(prev => new Set(prev).add(finding.packageId));

    try {
      if (finding.diagnosis === 'PAID_UNDELIVERED_PKG') {
        // Mark package as delivered — triggers SP2 sync via Cloud Function
        await firebaseApi.packages.updateStatus(finding.packageId, 'delivered', undefined, 'Marcado como entregado por auditoría: factura pagada >5 días');
      } else {
        // Default: link package to invoice
        if (!finding.relatedInvoiceId) return;
        await firebaseApi.packages.update(finding.packageId, {
          invoiceId: finding.relatedInvoiceId,
        });
      }

      setRemediated(prev => new Set(prev).add(finding.packageId));
      toast({
        title: finding.diagnosis === 'PAID_UNDELIVERED_PKG' ? 'Entregado' : 'Vinculado',
        description: finding.diagnosis === 'PAID_UNDELIVERED_PKG'
          ? `${finding.trackingNumber} → delivered (sync SP2)`
          : `${finding.trackingNumber} → ${finding.relatedInvoiceNumber}`,
      });
    } catch (err) {
      toast({
        title: 'Error al remediar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setRemediating(prev => {
        const next = new Set(prev);
        next.delete(finding.packageId);
        return next;
      });
    }
  };

  /** Bulk remediate all remediable findings */
  const [bulkLoading, setBulkLoading] = useState(false);
  const handleBulkRemediate = async () => {
    const toFix = findings.filter(
      f => f.canRemediate && !remediated.has(f.packageId)
    );
    if (toFix.length === 0) return;

    setBulkLoading(true);
    let fixed = 0;
    let failed = 0;

    // Separate by type for proper handling
    const deliveryFixes = toFix.filter(f => f.diagnosis === 'PAID_UNDELIVERED_PKG');
    const linkFixes = toFix.filter(f => f.diagnosis !== 'PAID_UNDELIVERED_PKG' && f.relatedInvoiceId);

    // Bulk delivery updates via bulkUpdateStatus
    if (deliveryFixes.length > 0) {
      try {
        const ids = deliveryFixes.map(f => f.packageId);
        await firebaseApi.packages.bulkUpdateStatus(ids, 'delivered', {
          notes: 'Marcado como entregado por auditoría: factura pagada >5 días',
        });
        for (const f of deliveryFixes) {
          fixed++;
          setRemediated(prev => new Set(prev).add(f.packageId));
        }
      } catch {
        failed += deliveryFixes.length;
      }
    }

    // Link fixes in batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < linkFixes.length; i += BATCH_SIZE) {
      const batch = linkFixes.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(f =>
          firebaseApi.packages.update(f.packageId, { invoiceId: f.relatedInvoiceId })
        )
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled') {
          fixed++;
          setRemediated(prev => new Set(prev).add(batch[j].packageId));
        } else {
          failed++;
        }
      }
    }

    setBulkLoading(false);
    toast({
      title: 'Reconciliación completada',
      description: `${fixed} corregido${fixed !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} fallido${failed !== 1 ? 's' : ''}` : ''}`,
    });
  };

  const diagnosisOrder: DiagnosisType[] = [
    'PAID_UNDELIVERED_PKG',
    'UNLINKED_INVOICE',
    'ANNULLED_INVOICE_LINK',
    'MISMATCHED_CUSTOMER',
    'ORPHAN_NO_INVOICE',
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-w-5xl w-[95vw] max-h-[90vh] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" aria-hidden />
            Auditoría de Facturas
          </DialogTitle>
          <DialogDescription className="text-xs">
            Diagnóstico de paquetes sin factura vinculada. Identifica corrupción de datos,
            facturas anuladas sin relinkeo, y desvinculaciones por falta de invoiceId.
          </DialogDescription>
        </DialogHeader>

        {/* Summary stats + bulk action */}
        <div className="flex items-center gap-2 flex-wrap py-2 border-b">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Package className="h-3 w-3" aria-hidden />
            {packages.length} paquetes analizados
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <FileSearch className="h-3 w-3" aria-hidden />
            {findings.length} hallazgo{findings.length !== 1 ? 's' : ''}
          </Badge>
          {findings.length === 0 && (
            <Badge className="text-[10px] gap-1 bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
              Sin problemas detectados
            </Badge>
          )}
          {remediated.size > 0 && (
            <Badge className="text-[10px] gap-1 bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {remediated.size} corregido{remediated.size !== 1 ? 's' : ''}
            </Badge>
          )}

          {/* Bulk remediation button */}
          {remediableCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkRemediate}
              disabled={bulkLoading}
              className="ml-auto h-7 text-[10px] gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950"
            >
              {bulkLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wrench className="h-3 w-3" />
              )}
              Reconciliar {remediableCount} desvinculado{remediableCount !== 1 ? 's' : ''}
            </Button>
          )}
        </div>

        {/* Findings — min-h-0 is required so flex-1 actually clamps height
            instead of letting content overflow the dialog. */}
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-3 py-3">
            {findings.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-30" aria-hidden />
                <p className="text-sm font-medium">Todos los paquetes tienen factura vinculada correctamente</p>
                <p className="text-xs mt-1">No se detectaron problemas de integridad en los datos.</p>
              </div>
            )}

            {diagnosisOrder.map(diagType => {
              const items = groupedFindings.get(diagType);
              if (!items || items.length === 0) return null;
              const meta = DIAGNOSIS_META[diagType];
              const isExpanded = expandedTypes.has(diagType);
              const typeRemediableCount = items.filter(f => f.canRemediate && !remediated.has(f.packageId)).length;

              return (
                <div key={diagType} className="border rounded-lg overflow-hidden">
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleType(diagType)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors',
                      'hover:bg-muted/30'
                    )}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <meta.Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold">{meta.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{meta.description}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Pending = still need a click. Resolved = remediated or
                          intrinsically not actionable. Total = items.length. */}
                      {typeRemediableCount > 0 ? (
                        <Badge variant="outline" className="text-[10px] h-5 px-2 gap-1 border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-300">
                          <Wrench className="h-2.5 w-2.5" aria-hidden />
                          {typeRemediableCount} pendiente{typeRemediableCount !== 1 ? 's' : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5 px-2 gap-1 border-green-300 text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300">
                          <CheckCircle2 className="h-2.5 w-2.5" aria-hidden />
                          Todo OK
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn('text-[10px] h-5 px-2 shrink-0 gap-1', meta.color)}>
                        {items.length} total
                      </Badge>
                    </div>
                  </button>

                  {/* Group items */}
                  {isExpanded && (
                    <div className="border-t divide-y">
                      {items.map(f => {
                        const isFixed = remediated.has(f.packageId);
                        const isFixing = remediating.has(f.packageId);

                        return (
                          <div
                            key={f.packageId}
                            className={cn(
                              'px-3 py-2 text-xs space-y-1 transition-colors',
                              isFixed && 'bg-green-50/50 dark:bg-green-950/20'
                            )}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-foreground">{f.trackingNumber}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{f.slCode}</span>
                              {f.customerName && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-muted-foreground truncate max-w-[200px]">{f.customerName}</span>
                                </>
                              )}
                              {f.manifestNumber && (
                                <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono">
                                  {f.manifestNumber}
                                </Badge>
                              )}

                              {/* Remediation button — rightmost */}
                              {f.canRemediate && !isFixed && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRemediate(f)}
                                  disabled={isFixing}
                                  className="ml-auto h-5 text-[9px] gap-1 px-2 border-orange-300 text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950"
                                >
                                  {isFixing ? (
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  ) : (
                                    <Link2 className="h-2.5 w-2.5" />
                                  )}
                                  {f.remediateLabel || 'Vincular'}
                                </Button>
                              )}
                              {isFixed && (
                                <Badge className="ml-auto text-[8px] h-5 gap-1 bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Vinculado
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">{f.detail}</p>
                            {f.relatedInvoiceNumber && (
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className="text-muted-foreground">Factura:</span>
                                <span className="font-mono font-medium">{f.relatedInvoiceNumber}</span>
                                {f.relatedInvoiceStatus && (
                                  <Badge variant="outline" className={cn(
                                    'text-[8px] h-3.5 px-1',
                                    f.relatedInvoiceStatus === 'annulled' && 'border-red-300 text-red-600',
                                    f.relatedInvoiceStatus === 'draft' && 'border-gray-300 text-gray-600',
                                    f.relatedInvoiceStatus === 'sent' && 'border-blue-300 text-blue-600',
                                    f.relatedInvoiceStatus === 'paid' && 'border-green-300 text-green-600',
                                  )}>
                                    {f.relatedInvoiceStatus}
                                  </Badge>
                                )}
                                {f.relatedInvoiceSlCode && f.relatedInvoiceSlCode !== f.slCode && (
                                  <span className="text-red-500 font-medium">(cliente: {f.relatedInvoiceSlCode})</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Sticky progress footer — always visible so the admin can act and
            track completion without having to scroll back to the header. */}
        {findings.length > 0 && (
          <div className="border-t pt-3 -mx-6 px-6 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{remediated.size}</span>
                <span> de </span>
                <span className="font-semibold text-foreground">{findings.length}</span>
                <span> corregidos</span>
                {remediableCount > 0 && (
                  <>
                    <span> · </span>
                    <span className="font-semibold text-orange-700 dark:text-orange-400">{remediableCount} pendientes</span>
                  </>
                )}
              </div>
              {remediableCount > 0 ? (
                <Button
                  size="sm"
                  onClick={handleBulkRemediate}
                  disabled={bulkLoading}
                  className="h-8 gap-1.5"
                >
                  {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                  Reconciliar {remediableCount} ahora
                </Button>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1 border-green-300 text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  Sin acciones pendientes
                </Badge>
              )}
            </div>
            {/* Progress bar */}
            <Progress
              value={Math.round((remediated.size / Math.max(findings.length, 1)) * 100)}
              className="h-1.5"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
