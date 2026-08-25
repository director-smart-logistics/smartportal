/**
 * NovaIntegrityModal — operator-facing surface for the integrity audit.
 *
 * ─── REDESIGN GOALS (BUG-INTEGRITY-MODAL-COGNITIVE-LOAD 2026-04-29) ──────
 *
 * The operator opens this modal not to read forensics — they want to
 * answer ONE question: "what should I do, and what's the smallest set
 * of clicks to fix this?". The previous design front-loaded the data
 * (3-column evidence cards repeated for every row, dense severity
 * pills) and buried the call-to-action ("Aplicar 0 correcciones").
 *
 * The new layout is action-first:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Auditoría de integridad — MEGA-MAN-…                  [×]  │
 *   │                                                                 │
 *   │ ┌─ HERO (recommendation card, primary CTA) ───────────────────┐ │
 *   │ │ Recomendado                                                 │ │
 *   │ │  Aplica 44 correcciones automáticas de alta confianza        │ │
 *   │ │  (≥80%). Modifica manifests + packages — las facturas        │ │
 *   │ │  no se tocan. Las correcciones manuales quedan sin           │ │
 *   │ │  cambios.                                                    │ │
 *   │ │                              [Aplicar 44 ahora →]            │ │
 *   │ └──────────────────────────────────────────────────────────────┘ │
 *   │                                                                 │
 *   │ Filtros [169 hallazgos] [60 críticas] [97 importantes]          │
 *   │         [12 menores]   [60 facturas afectadas]                  │
 *   │                                            [Quitar] [Re-auditar]│
 *   │                                                                 │
 *   │ ─── Detalle por fila (190) ───                                  │
 *   │ ☐ #4  TBA…6677  ▸ slCode incorrecto                             │
 *   │      Manifest: San Jose Escazu  →  Sugerencia: SL3521 (95%)     │
 *   │      [Ver evidencia ▾]                                          │
 *   │                                                                 │
 *   │ ☐ #14 TBA…1331  ▸ slCode incorrecto · precio distinto           │
 *   │      Manifest: SL26098  →  Sugerencia: SL3333 (95%)             │
 *   │ ...                                                             │
 *   │                                                                 │
 *   │ [Cerrar]    [Aplicar 12 seleccionadas]                          │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Key UX moves:
 *   • Hero card surfaces the bulk action AT THE TOP, with plain-language
 *     copy explaining what it does + what it doesn't touch.
 *   • Per-row cards collapse by default → only show "diff + suggestion".
 *     The 3-column evidence view is preserved but moved behind a
 *     "Ver evidencia ▾" toggle for the few cases the operator wants
 *     to dig in.
 *   • Severity copy is humanised (críticas / importantes / menores
 *     instead of alta / media / baja).
 *   • The footer "Aplicar N correcciones" is gated on ≥1 selection so
 *     the "Aplicar 0" anti-pattern can't happen.
 *
 * ─── Filter chips + per-group apply (BUG-INTEGRITY-FILTERS 2026-04-29) ──
 *
 *   The summary chips ("60 críticas", "97 importantes", "12 menores",
 *   "60 facturas afectadas") used to be **read-only counters**.  When a
 *   manifest had 169 hallazgos, the operator had to scroll past every
 *   single one — including the dozens of low-severity warnings — to
 *   find and tick the few critical issues they wanted to fix.  They
 *   could not say "fíjate solo en las críticas y aplícalas".
 *
 *   The redesign promotes the chips to **togglable filter buttons** with
 *   multi-select semantics:
 *     - Click a severity → list narrows to rows containing ≥1 issue of
 *       that severity.  Click again → toggle off.
 *     - The "facturas afectadas" chip is orthogonal: it filters to
 *       rows whose evidence touches an active invoice.  Combines with
 *       severity (AND).
 *     - The "169 hallazgos" chip and the "Quitar filtros" link both
 *       reset every filter at once.
 *
 *   The hero CTA + "Marcarlas y revisar" buttons rescope to the FILTERED
 *   set whenever any filter is active — that's the per-group apply path.
 *   So clicking "60 críticas" → "Aplicar 50 ahora (filtradas)" applies
 *   only the 50 critical rows that have a high-confidence fix, leaving
 *   the rest of the manifest untouched.  The hero copy spells out which
 *   filter is active so the operator never wonders what "ahora" means.
 *
 *   Reactivity is already wired by the parent — `onApply` runs the
 *   repairs and triggers `runAudit()` on completion — so the report
 *   prop refreshes and the filter scope auto-recomputes.  Filters
 *   persist across audits so an operator working through "críticas"
 *   keeps that lens after each apply.
 *
 * ─── Kind filter, search, visible counter (BUG-INTEGRITY-FINDABILITY 2026-05-02) ──
 *
 *   Severity alone isn't always the lens an operator wants. A manifest
 *   with 149 hallazgos may legitimately mix slCode mismatches (mass-
 *   repairable) with duplicate_invoice rows (each needs human review).
 *   To unblock that workflow we layer two more filters on top of the
 *   severity / invoice toggles:
 *
 *     1. **Kind chips** (slCode, Nombre, Ruta, Factura cliente, …).
 *        Multi-select, AND-combined with severity.  Sourced from
 *        `report.summary.byKind` so we only show kinds that actually
 *        appear in the report — no dead chips.
 *
 *     2. **Tracking / cliente search box**.  Case-insensitive substring
 *        match against `manifestRow.tracking` and
 *        `manifestRow.customerName`.  Trims whitespace; empty string
 *        disables the search dimension.
 *
 *   Both compose multiplicatively with the existing filters.  When ANY
 *   filter is active the visible counter ("Mostrando 12 de 149 filas")
 *   makes the narrowing explicit so the operator never wonders whether
 *   the click "did anything" — that ambiguity was the original
 *   complaint when chips first became filters.  The counter sits
 *   ABOVE the scrollable list (outside `overflow-y-auto`) so it stays
 *   visible while the operator scrolls.
 *
 *   `aria-live="polite"` on the counter announces the new count to
 *   screen readers without interrupting flow — important because every
 *   filter interaction changes the number, and we don't want assistive
 *   tech to fire on every keystroke (the announcement is debounced
 *   naturally by the trim()/.length comparison).
 *
 * ─── Regression contract (DO NOT BREAK) ──────────────────────────────────
 *
 * The accumulated filter dimensions interact in non-obvious ways. Each
 * invariant below is locked down by a `REGRESSION:`-prefixed test in
 * `NovaIntegrityModal.spec.tsx`. If you change filter logic, run that
 * spec file and confirm every regression test still passes — they are
 * the safety net for shipping this modal at scale.
 *
 *   1. AND composition. `filteredGrouped` must apply EVERY active
 *      dimension (severity, kind, invoice, search) to a row before
 *      letting it through. Never collapse this into an OR chain.
 *      → guarded by `REGRESSION: severity ∩ kind ∩ invoice ∩ search`.
 *
 *   2. CTA scoping. `repairableInScope` (NOT `repairableRows`) feeds:
 *        - the hero "Aplicar N" button's count + onClick payload,
 *        - the "Marcarlas y revisar" bulk-select,
 *        - the empty-state message.
 *      Search alone (no chips) must rescope these too.
 *      → guarded by `REGRESSION: hero CTA / "Marcarlas y revisar" /
 *        rescopes to search-filtered subset`.
 *
 *   3. Selection survives filter reset. `clearAllFilters` resets every
 *      filter dimension AND `searchTerm`, but leaves `selectedRows`
 *      intact. Operators expect their manual ticks to persist when
 *      they pivot the lens.
 *      → guarded by `REGRESSION: "Quitar filtros" does NOT clear …
 *        manual selection`.
 *
 *   4. Filters survive re-audit. The selection/expansion `useEffect`
 *      keys on `report?.scannedAt`. Filter setters (`activeSeverities`,
 *      `activeKinds`, `filterInvoicesAffected`, `searchTerm`) MUST NOT
 *      be reset there.
 *      → guarded by `REGRESSION: kind filter / search query survives
 *        re-audit`.
 *
 *   5. Pluralization. The counter renders "fila" (singular) when
 *      `totalGrouped === 1`, "filas" otherwise.
 *      → guarded by `REGRESSION: counter renders "fila" (singular) …`.
 *
 *   6. Search uses literal-substring matching via `String.includes()`.
 *      Regex-special characters in the query (`. * + ? [ ] ( ) \ |`)
 *      must NOT be interpreted — they are user input, not a pattern.
 *      → guarded by `REGRESSION: search with regex-special chars`.
 *
 *   7. Apply-in-flight lockdown. The `applying` boolean disables every
 *      filter chip + search input so no stale filter writes interleave
 *      with the parent's `runAudit()` callback.
 *      → guarded by `REGRESSION: filter chips and search input are
 *        disabled while a repair apply is in flight`.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { replaceInvoiceNumberPrefix } from "@/lib/utils/invoice-reassign";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  IntegrityIssue,
  IntegrityIssueKind,
  IntegrityIssueSeverity,
  IntegrityRepair,
  IntegrityReport,
} from "@/lib/nova/integrity";

/** Case-insensitive equality that treats whitespace-trimmed strings equal. */
const eqCase = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean => (a ?? "").trim().toUpperCase() === (b ?? "").trim().toUpperCase();

const KIND_COPY: Record<IntegrityIssueKind, string> = {
  slcode_mismatch: "slCode incorrecto",
  name_mismatch: "Nombre del cliente difiere",
  route_mismatch: "Ruta inconsistente",
  invoice_customer_drift: "Factura con cliente equivocado",
  invoice_weight_drift: "Factura con peso distinto",
  invoice_price_drift: "Factura con precio distinto",
  orphan_tracking: "Sin factura activa",
  duplicate_invoice: "Aparece en múltiples facturas",
};

/**
 * Short label rendered inside kind-filter chips. We can't reuse `KIND_COPY`
 * verbatim — those strings are full sentences ("Factura con cliente
 * equivocado") and would wreck the chip row layout. The chip variant is
 * the operator's verbal shortcut for the same concept.
 */
const KIND_CHIP_LABEL: Record<IntegrityIssueKind, string> = {
  slcode_mismatch: "slCode",
  name_mismatch: "Nombre",
  route_mismatch: "Ruta",
  invoice_customer_drift: "Cliente facturado",
  invoice_weight_drift: "Peso facturado",
  invoice_price_drift: "Precio facturado",
  orphan_tracking: "Sin factura",
  duplicate_invoice: "Factura duplicada",
};

const SEVERITY_COLOR: Record<IntegrityIssueSeverity, string> = {
  high: "bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-400",
  medium:
    "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400",
  low: "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-400",
};

const SEVERITY_LABEL: Record<IntegrityIssueSeverity, string> = {
  high: "crítica",
  medium: "importante",
  low: "menor",
};

const FIX_SOURCE_COPY: Record<
  NonNullable<IntegrityIssue["suggestedFix"]>["source"],
  string
> = {
  invoice_protected: "factura activa",
  consensus: "consenso entre fuentes",
  packages: "colección packages",
  encomiendas: "manifest_encomiendas",
  invoice_draft: "factura en borrador",
};

/** Minimum confidence threshold for "Aplicar todas las correcciones confiables". */
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

export interface NovaIntegrityModalProps {
  open: boolean;
  /**
   * The audit report. May be null while the audit is in flight (the modal
   * shows a loading state in that case). Re-running the audit is the
   * caller's responsibility (e.g. via `onRefresh`).
   */
  report: IntegrityReport | null;
  /** Indicates the audit is currently running — drives the loading skeleton. */
  loading?: boolean;
  onClose: () => void;
  /**
   * Triggered when the operator confirms a set of repairs. The caller is
   * responsible for actually invoking `applyIntegrityRepairs` and
   * re-fetching the report afterwards.
   */
  onApply: (repairs: IntegrityRepair[]) => void | Promise<void>;
  /** Re-run the audit without dismissing the modal. */
  onRefresh?: () => void;
}

export function NovaIntegrityModal({
  open,
  report,
  loading = false,
  onClose,
  onApply,
  onRefresh,
}: NovaIntegrityModalProps) {
  // Set of rowIndex values the operator has selected for repair. We key
  // by rowIndex (NOT by issue index) because the same row may surface
  // multiple issues — they all collapse into one repair operation.
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  // Per-row "evidence revealed" toggle — keeps the list scannable by
  // default, lets the operator drill down into the 3-column comparison
  // when they need to verify a single suggestion.
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  // ── Filter state ────────────────────────────────────────────────────────
  // Filters narrow the visible issue list AND scope the hero/marcar CTAs
  // to the visible-and-repairable subset. They persist across re-audits
  // (`scannedAt` change) on purpose: an operator working through critical
  // issues keeps that lens after each apply, otherwise every refresh
  // would dump them back into the full manifest noise.
  //
  // Four orthogonal dimensions, AND-combined:
  //   • `activeSeverities`         — multi-select severity tier
  //   • `activeKinds`              — multi-select issue kind (slCode, ruta…)
  //   • `filterInvoicesAffected`   — boolean: rows whose evidence touches
  //                                  an active invoice
  //   • `searchTerm`               — case-insensitive substring match against
  //                                  manifestRow.tracking | customerName.
  //                                  Trimmed; empty string is "no filter".
  const [activeSeverities, setActiveSeverities] = useState<
    Set<IntegrityIssueSeverity>
  >(new Set());
  const [activeKinds, setActiveKinds] = useState<Set<IntegrityIssueKind>>(
    new Set(),
  );
  const [filterInvoicesAffected, setFilterInvoicesAffected] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const trimmedSearch = searchTerm.trim().toLowerCase();
  const isFiltered =
    activeSeverities.size > 0 ||
    activeKinds.size > 0 ||
    filterInvoicesAffected ||
    trimmedSearch.length > 0;

  // Reset selection + expansion whenever a fresh report arrives — a new
  // audit run should not leak stale ticks across. We DO NOT reset filter
  // state here (operator-chosen lens survives re-audit by design).
  useEffect(() => {
    if (!report) return;
    setSelectedRows(new Set());
    setExpandedRows(new Set());
  }, [report?.scannedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group issues by rowIndex so the UI shows ONE card per affected row.
  // Inside a card we list every issue as a small chip.
  const grouped = useMemo(() => {
    if (!report) return [];
    const map = new Map<number, IntegrityIssue[]>();
    for (const issue of report.issues) {
      const k = issue.manifestRow.rowIndex;
      const list = map.get(k) ?? [];
      list.push(issue);
      map.set(k, list);
    }
    // Preserve `report.issues` order (already severity-sorted) for the
    // first issue per row.
    const ordered: Array<{ rowIndex: number; issues: IntegrityIssue[] }> = [];
    const seen = new Set<number>();
    for (const issue of report.issues) {
      const k = issue.manifestRow.rowIndex;
      if (seen.has(k)) continue;
      seen.add(k);
      ordered.push({ rowIndex: k, issues: map.get(k)! });
    }
    return ordered;
  }, [report]);

  const repairableRows = useMemo(() => {
    if (!report) return new Set<number>();
    const rows = new Set<number>();
    for (const issue of report.issues) {
      if (
        issue.suggestedFix &&
        issue.suggestedFix.confidence >= HIGH_CONFIDENCE_THRESHOLD
      ) {
        rows.add(issue.manifestRow.rowIndex);
      }
    }
    return rows;
  }, [report]);

  // ── Filtered view: which rows + repairables match the active filter ─────
  // A row passes when EVERY active filter dimension is satisfied by at
  // least one of the row's issues:
  //   - severity filter (multi-select): row has ≥1 issue whose severity
  //     is in `activeSeverities`. When the set is empty, the dimension
  //     is inactive (matches everything).
  //   - kind filter (multi-select): row has ≥1 issue whose kind is in
  //     `activeKinds`. Empty set → dimension inactive.
  //   - invoice filter: row has ≥1 issue with `evidence.invoice` set
  //     (drift impacting an active invoice).
  //   - search filter: tracking OR customerName contains the trimmed
  //     lower-case query as a substring.
  //
  // The row keeps ALL its issue chips even when only one matched — the
  // operator wants context, not surgical chip removal.
  const filteredGrouped = useMemo(() => {
    if (!isFiltered) return grouped;
    return grouped.filter(({ issues }) => {
      if (
        activeSeverities.size > 0 &&
        !issues.some((i) => activeSeverities.has(i.severity))
      )
        return false;
      if (activeKinds.size > 0 && !issues.some((i) => activeKinds.has(i.kind)))
        return false;
      if (filterInvoicesAffected && !issues.some((i) => !!i.evidence.invoice))
        return false;
      if (trimmedSearch.length > 0) {
        const matches = issues.some((i) => {
          const tr = (i.manifestRow.tracking || "").toLowerCase();
          const cn = (i.manifestRow.customerName || "").toLowerCase();
          return tr.includes(trimmedSearch) || cn.includes(trimmedSearch);
        });
        if (!matches) return false;
      }
      return true;
    });
  }, [
    grouped,
    isFiltered,
    activeSeverities,
    activeKinds,
    filterInvoicesAffected,
    trimmedSearch,
  ]);

  // Intersection of `repairableRows` with the rows visible under the
  // current filter — drives the hero CTA + "Marcarlas y revisar" so
  // those buttons reliably operate on the visible (per-group) subset.
  const repairableInScope = useMemo(() => {
    if (!isFiltered) return repairableRows;
    const visibleRowIdxs = new Set(filteredGrouped.map((g) => g.rowIndex));
    const out = new Set<number>();
    repairableRows.forEach((idx) => {
      if (visibleRowIdxs.has(idx)) out.add(idx);
    });
    return out;
  }, [repairableRows, filteredGrouped, isFiltered]);

  const toggleSeverity = (sev: IntegrityIssueSeverity) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  const toggleKind = (kind: IntegrityIssueKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const clearAllFilters = () => {
    setActiveSeverities(new Set());
    setActiveKinds(new Set());
    setFilterInvoicesAffected(false);
    setSearchTerm("");
  };

  const toggleRow = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const toggleExpanded = (rowIndex: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const selectAllRepairable = () => {
    // Scope selection to the active filter so "Marcarlas y revisar" is
    // an honest per-group action when filters are on.
    setSelectedRows(new Set(repairableInScope));
  };

  // Build repairs from a given rowIndex set — shared by the hero-CTA
  // bulk path and the manual-selection footer path.
  const buildRepairsFor = (rowSet: Set<number>): IntegrityRepair[] => {
    const repairs: IntegrityRepair[] = [];
    for (const { rowIndex, issues } of grouped) {
      if (!rowSet.has(rowIndex)) continue;
      const fix = issues.find((i) => i.suggestedFix)?.suggestedFix;
      if (!fix) continue;
      const tracking = issues[0].manifestRow.tracking;
      // Find the active invoice evidence (if any) across every issue on
      // this row — the audit surfaces it on the slcode_mismatch entry but
      // other issue kinds may carry the same evidence. We only care about
      // one invoice per row; picking the first non-empty is sufficient.
      const invoiceEvidence = issues
        .map((i) => i.evidence?.invoice)
        .find((inv) => !!inv?.invoiceId);
      repairs.push({
        rowIndex,
        tracking,
        slCode: fix.slCode,
        customerName: fix.customerName,
        ruta: fix.ruta,
        ...(invoiceEvidence
          ? {
              invoice: {
                invoiceId: invoiceEvidence.invoiceId,
                invoiceNumber: invoiceEvidence.invoiceNumber,
                isProtected: invoiceEvidence.isProtected,
                // Captures the slCode BEFORE the repair so the repair service can
                // delete an orphaned temp_customers record if the previous owner
                // was a temp (`SL-NAN-*`). Mirrors the Facturas "Reasignar" flow.
                previousSlCode: invoiceEvidence.clientSlCode,
              },
            }
          : {}),
      });
    }
    return repairs;
  };

  const handleApply = async () => {
    if (!report || selectedRows.size === 0) return;
    const repairs = buildRepairsFor(selectedRows);
    if (repairs.length === 0) return;
    setApplying(true);
    try {
      await onApply(repairs);
      setSelectedRows(new Set());
    } finally {
      setApplying(false);
    }
  };

  // Per-row apply — operators can fix one card at a time when they don't
  // want the bulk "aplicar todas" CTA. Tracks the currently-applying row
  // so only that card's button shows a spinner and stays disabled; every
  // other card remains interactive.
  const [applyingRow, setApplyingRow] = useState<number | null>(null);
  const handleApplyOne = async (rowIndex: number) => {
    if (!report || applying || applyingRow !== null) return;
    const repairs = buildRepairsFor(new Set([rowIndex]));
    if (repairs.length === 0) return;
    setApplyingRow(rowIndex);
    try {
      await onApply(repairs);
      setSelectedRows((prev) => {
        if (!prev.has(rowIndex)) return prev;
        const next = new Set(prev);
        next.delete(rowIndex);
        return next;
      });
    } finally {
      setApplyingRow(null);
    }
  };

  // Hero-CTA path: ignores the operator's manual selection and applies
  // every high-confidence fix WITHIN THE ACTIVE FILTER — so clicking
  // "Aplicar 50 ahora" while the "críticas" chip is on touches only the
  // 50 critical rows that have a confident suggestion. With no filter
  // active this collapses to the legacy "apply everything" behaviour.
  const handleApplyAllRepairable = async () => {
    if (!report || repairableInScope.size === 0) return;
    const repairs = buildRepairsFor(repairableInScope);
    if (repairs.length === 0) return;
    setApplying(true);
    try {
      await onApply(repairs);
      setSelectedRows(new Set());
    } finally {
      setApplying(false);
    }
  };

  // Human label for the active filter — shown inline in the hero copy
  // and inside chip aria-labels so screen readers announce the scope.
  const activeFilterLabel = (() => {
    if (!isFiltered) return "";
    const parts: string[] = [];
    if (activeSeverities.has("high")) parts.push("críticas");
    if (activeSeverities.has("medium")) parts.push("importantes");
    if (activeSeverities.has("low")) parts.push("menores");
    activeKinds.forEach((k) => parts.push(KIND_CHIP_LABEL[k].toLowerCase()));
    if (filterInvoicesAffected) parts.push("con facturas afectadas");
    if (trimmedSearch.length > 0) parts.push(`«${searchTerm.trim()}»`);
    return parts.join(" + ");
  })();

  // Kinds present in the report drive which kind chips render.  We
  // derive from `summary.byKind` so empty buckets don't pollute the row
  // (a manifest with only slcode_mismatch shouldn't show 7 dead chips).
  // Order matches the canonical IntegrityIssueKind union for stable UI.
  const KIND_ORDER: IntegrityIssueKind[] = [
    "slcode_mismatch",
    "name_mismatch",
    "route_mismatch",
    "invoice_customer_drift",
    "invoice_weight_drift",
    "invoice_price_drift",
    "orphan_tracking",
    "duplicate_invoice",
  ];
  const kindChips: Array<{ kind: IntegrityIssueKind; count: number }> = [];
  if (report) {
    for (const k of KIND_ORDER) {
      const count = report.summary.byKind[k] ?? 0;
      if (count > 0) kindChips.push({ kind: k, count });
    }
  }

  const totalGrouped = grouped.length;
  const visibleGrouped = filteredGrouped.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !applying) onClose();
      }}
    >
      <DialogContent
        className="max-w-3xl max-h-[85vh] flex flex-col"
        data-testid="nova-integrity-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Auditoría de integridad — {report?.manifestId ?? "cargando…"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            Comparamos cada fila contra <code>packages</code>,{" "}
            <code>manifest_encomiendas</code> y <code>invoices</code>. Cuando 2
            o más fuentes coinciden, aplicamos la corrección a{" "}
            <strong>
              manifests + packages + encomiendas + la factura vinculada
            </strong>{" "}
            (incluyendo el prefijo del número) en un solo batch atómico.
          </DialogDescription>
        </DialogHeader>

        {loading || !report ? (
          <div
            className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground"
            data-testid="nova-integrity-loading"
          >
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="text-xs">Auditando manifiesto…</span>
          </div>
        ) : report.issues.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 gap-2 text-emerald-600 dark:text-emerald-400"
            data-testid="nova-integrity-clean"
          >
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            <span className="text-sm font-medium">
              Sin inconsistencias detectadas
            </span>
            <span className="text-xs text-muted-foreground">
              {report.totalRows} filas analizadas
            </span>
          </div>
        ) : (
          <>
            {/* ── HERO recommendation ─────────────────────────────────────
                Surfaces the smallest-friction action: apply every high-
                confidence fix in one click. When no high-confidence fixes
                exist (e.g. all issues need manual review) we degrade to a
                neutral explainer card so the operator still understands
                the next step. ── */}
            {repairableInScope.size > 0 ? (
              <div
                data-testid="nova-integrity-hero"
                className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50 to-emerald-100/40 dark:from-emerald-950/30 dark:to-emerald-900/20 p-4 flex items-start gap-3"
              >
                <div className="shrink-0 rounded-full bg-emerald-500/15 p-2">
                  <Sparkles
                    className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    Recomendado: aplicar {repairableInScope.size} corrección
                    {repairableInScope.size !== 1 ? "es" : ""} automática
                    {repairableInScope.size !== 1 ? "s" : ""}
                    {isFiltered && (
                      <span className="font-normal opacity-80">
                        {" "}
                        · solo {activeFilterLabel}
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/80 leading-relaxed mt-0.5">
                    Cada sugerencia tiene <strong>≥80% de confianza</strong>,
                    basada en el consenso entre packages, encomiendas y facturas
                    activas. Cuando 2 o más fuentes coinciden, la tercera se
                    corrige automáticamente —{" "}
                    <strong>incluyendo la factura y su prefijo</strong> (
                    <code>SL-NAN-…</code>, nombre de ruta, etc.) vía
                    re-asignación de cliente.
                    {isFiltered &&
                      repairableInScope.size < repairableRows.size && (
                        <>
                          {" "}
                          El filtro actual deja fuera{" "}
                          {repairableRows.size - repairableInScope.size}{" "}
                          corrección
                          {repairableRows.size - repairableInScope.size !== 1
                            ? "es"
                            : ""}{" "}
                          confiable
                          {repairableRows.size - repairableInScope.size !== 1
                            ? "s"
                            : ""}{" "}
                          — quita el filtro para verlas.
                        </>
                      )}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      type="button"
                      onClick={handleApplyAllRepairable}
                      disabled={applying}
                      data-testid="nova-integrity-apply-all-repairable"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 gap-1.5"
                    >
                      {applying ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Aplicar {repairableInScope.size}{" "}
                      {isFiltered
                        ? `${activeSeverities.size === 1 && !filterInvoicesAffected ? activeFilterLabel : "filtradas"}`
                        : "ahora"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={selectAllRepairable}
                      disabled={applying}
                      data-testid="nova-integrity-select-all-repairable"
                      className="text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200/60 dark:hover:bg-emerald-900/40"
                    >
                      Marcarlas y revisar
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                <AlertTriangle
                  className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  {isFiltered ? (
                    <>
                      Ninguna corrección automática confiable cae bajo el filtro{" "}
                      <strong>{activeFilterLabel}</strong>. Revisa los hallazgos
                      visibles y corrígelos manualmente, o quita el filtro para
                      ver el resto del manifiesto.
                    </>
                  ) : (
                    <>
                      No detectamos correcciones con confianza ≥ 80%. Revisa
                      cada hallazgo manualmente y aplica la sugerencia
                      correspondiente o corrige la fila en la tabla principal.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* ── Filter chips (severity + invoice-affected) ────────────
                Multi-select toggle group. Each click narrows the visible
                rows AND scopes the hero/marcar CTAs. Inactive chips show
                a pale fill; active chips get a ring and bolder colour so
                a quick glance reveals the current lens. ── */}
            <div
              data-testid="nova-integrity-summary"
              className="flex items-center flex-wrap gap-2 px-1 py-2 border-b border-border text-[11px]"
              role="group"
              aria-label="Filtrar hallazgos"
            >
              {/* "Todos" — clears every filter; acts as the master indicator */}
              <button
                type="button"
                onClick={clearAllFilters}
                disabled={applying}
                aria-pressed={!isFiltered}
                data-testid="nova-integrity-filter-all"
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium transition-colors",
                  !isFiltered
                    ? "bg-foreground text-background border-foreground"
                    : "bg-muted border-border hover:bg-muted/70",
                )}
              >
                {report.issues.length} hallazgos
              </button>

              {report.summary.bySeverity.high > 0 && (
                <button
                  type="button"
                  onClick={() => toggleSeverity("high")}
                  disabled={applying}
                  aria-pressed={activeSeverities.has("high")}
                  aria-label={`Filtrar ${report.summary.bySeverity.high} críticas`}
                  data-testid="nova-integrity-filter-high"
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium transition-colors",
                    SEVERITY_COLOR.high,
                    activeSeverities.has("high")
                      ? "ring-2 ring-red-500/60 ring-offset-1 ring-offset-background font-bold shadow-sm"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  {report.summary.bySeverity.high} crítica
                  {report.summary.bySeverity.high !== 1 ? "s" : ""}
                </button>
              )}

              {report.summary.bySeverity.medium > 0 && (
                <button
                  type="button"
                  onClick={() => toggleSeverity("medium")}
                  disabled={applying}
                  aria-pressed={activeSeverities.has("medium")}
                  aria-label={`Filtrar ${report.summary.bySeverity.medium} importantes`}
                  data-testid="nova-integrity-filter-medium"
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium transition-colors",
                    SEVERITY_COLOR.medium,
                    activeSeverities.has("medium")
                      ? "ring-2 ring-amber-500/60 ring-offset-1 ring-offset-background font-bold shadow-sm"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  {report.summary.bySeverity.medium} importante
                  {report.summary.bySeverity.medium !== 1 ? "s" : ""}
                </button>
              )}

              {report.summary.bySeverity.low > 0 && (
                <button
                  type="button"
                  onClick={() => toggleSeverity("low")}
                  disabled={applying}
                  aria-pressed={activeSeverities.has("low")}
                  aria-label={`Filtrar ${report.summary.bySeverity.low} menores`}
                  data-testid="nova-integrity-filter-low"
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium transition-colors",
                    SEVERITY_COLOR.low,
                    activeSeverities.has("low")
                      ? "ring-2 ring-blue-500/60 ring-offset-1 ring-offset-background font-bold shadow-sm"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  {report.summary.bySeverity.low} menor
                  {report.summary.bySeverity.low !== 1 ? "es" : ""}
                </button>
              )}

              {report.summary.invoicesNeedingReview > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterInvoicesAffected((v) => !v)}
                  disabled={applying}
                  aria-pressed={filterInvoicesAffected}
                  aria-label={`Filtrar filas que afectan ${report.summary.invoicesNeedingReview} facturas`}
                  data-testid="nova-integrity-filter-invoices"
                  title="Facturas tocadas por al menos una fila con drift. El filtro muestra solo esas filas; las facturas se regeneran desde el menú Acciones de cada grupo."
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium transition-colors",
                    "border-purple-300 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300",
                    filterInvoicesAffected
                      ? "ring-2 ring-purple-500/60 ring-offset-1 ring-offset-background font-bold shadow-sm"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  {report.summary.invoicesNeedingReview} factura
                  {report.summary.invoicesNeedingReview !== 1 ? "s" : ""}{" "}
                  afectada
                  {report.summary.invoicesNeedingReview !== 1 ? "s" : ""}
                </button>
              )}

              {/* Right-aligned controls: clear filter + re-audit */}
              <div className="ml-auto flex items-center gap-1">
                {isFiltered && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={clearAllFilters}
                    disabled={applying}
                    data-testid="nova-integrity-filter-clear"
                    className="text-[11px] h-7 px-2 gap-1"
                  >
                    <X className="h-3 w-3" aria-hidden="true" /> Quitar filtros
                  </Button>
                )}
                {onRefresh && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={onRefresh}
                    disabled={applying}
                    className="text-[11px] h-7 px-2"
                  >
                    Re-auditar
                  </Button>
                )}
              </div>
            </div>

            {/* ── Kind chips ─────────────────────────────────────────────
                Filter by issue type (slCode, Nombre, Ruta, drifts, …).
                Multi-select; AND-combined with severity. We skip the row
                entirely when there is only ONE kind in the report (a
                manifest of pure slCode mismatches gains nothing from a
                "filter by slCode" chip). ── */}
            {kindChips.length > 1 && (
              <div
                data-testid="nova-integrity-kind-filters"
                className="flex items-center flex-wrap gap-1.5 px-1 py-1.5 border-b border-border text-[10px]"
                role="group"
                aria-label="Filtrar por tipo de inconsistencia"
              >
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-1">
                  Tipo
                </span>
                {kindChips.map(({ kind, count }) => {
                  const active = activeKinds.has(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => toggleKind(kind)}
                      disabled={applying}
                      aria-pressed={active}
                      aria-label={`Filtrar ${count} ${KIND_CHIP_LABEL[kind]}`}
                      data-testid={`nova-integrity-filter-kind-${kind}`}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium transition-colors",
                        active
                          ? "bg-foreground text-background border-foreground ring-2 ring-foreground/30 ring-offset-1 ring-offset-background shadow-sm"
                          : "bg-muted border-border text-foreground/80 hover:bg-muted/70",
                      )}
                    >
                      {KIND_CHIP_LABEL[kind]}{" "}
                      <span className="tabular-nums opacity-70">·{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Search + visible counter ───────────────────────────────
                The counter ("Mostrando 12 de 149 filas") is the explicit
                proof that the filter dimensions are doing something —
                the original feedback (BUG-INTEGRITY-FINDABILITY) was
                that operators couldn't tell whether a chip click had
                taken effect.  Sits ABOVE the scroll container so it
                doesn't scroll out of view. ── */}
            <div
              data-testid="nova-integrity-search-row"
              className="flex items-center gap-2 px-1 py-1.5 border-b border-border"
            >
              <label htmlFor="nova-integrity-search" className="sr-only">
                Buscar tracking o cliente
              </label>
              <div className="relative flex-1 max-w-xs">
                <Search
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  id="nova-integrity-search"
                  type="search"
                  placeholder="Buscar tracking o cliente…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={applying}
                  data-testid="nova-integrity-search"
                  className="h-7 pl-7 pr-2 text-[11px]"
                />
              </div>
              <span
                data-testid="nova-integrity-visible-count"
                aria-live="polite"
                className="ml-auto text-[11px] tabular-nums text-muted-foreground"
              >
                Mostrando{" "}
                <strong className="text-foreground">{visibleGrouped}</strong> de{" "}
                <strong className="text-foreground">{totalGrouped}</strong> fila
                {totalGrouped !== 1 ? "s" : ""}
              </span>
            </div>

            {/* ── Issue list ──────────────────────────────────────────── */}
            <div
              className="flex-1 overflow-y-auto pt-2 space-y-2 -mx-1 px-1"
              data-testid="nova-integrity-list"
            >
              {/* Filter-only empty state: there ARE issues in the manifest
                  but none match the active filter. Surfaces a one-click
                  "Quitar filtros" so the operator can recover without
                  hunting for the chip again. ── */}
              {isFiltered && filteredGrouped.length === 0 && (
                <div
                  data-testid="nova-integrity-filter-empty"
                  className="rounded border border-dashed border-border bg-muted/30 px-3 py-6 text-center space-y-2"
                >
                  <p className="text-xs text-muted-foreground">
                    Ninguna fila coincide con el filtro{" "}
                    <strong>{activeFilterLabel}</strong>.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={clearAllFilters}
                    className="text-[11px] h-7 px-2 gap-1"
                  >
                    <X className="h-3 w-3" aria-hidden="true" /> Quitar filtros
                  </Button>
                </div>
              )}
              {filteredGrouped.map(({ rowIndex, issues }) => {
                const primary = issues[0];
                const fix = issues.find((i) => i.suggestedFix)?.suggestedFix;
                const isSelected = selectedRows.has(rowIndex);
                const repairable = !!fix;
                const highConfidence =
                  !!fix && fix.confidence >= HIGH_CONFIDENCE_THRESHOLD;
                return (
                  <article
                    key={rowIndex}
                    data-testid={`nova-integrity-row-${rowIndex}`}
                    className={cn(
                      "rounded-md border bg-card px-3 py-2 space-y-2",
                      isSelected
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-border",
                    )}
                  >
                    <header className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(rowIndex)}
                        disabled={!repairable || applying}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        aria-label={`Seleccionar fila #${rowIndex + 1}`}
                        data-testid={`nova-integrity-checkbox-${rowIndex}`}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                        #{rowIndex + 1}
                      </span>
                      <span
                        className="text-[10px] font-mono text-muted-foreground truncate flex-1"
                        title={primary.manifestRow.tracking}
                      >
                        {primary.manifestRow.tracking}
                      </span>
                      {issues.map((iss, i) => (
                        <span
                          key={i}
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border",
                            SEVERITY_COLOR[iss.severity],
                          )}
                          title={iss.message}
                        >
                          {KIND_COPY[iss.kind]} · {SEVERITY_LABEL[iss.severity]}
                        </span>
                      ))}
                    </header>

                    {/* ── Evidence side-by-side ───────────────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
                      <section
                        data-testid={`nova-integrity-evidence-manifest-${rowIndex}`}
                        className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 px-2 py-1.5 space-y-0.5"
                      >
                        <header className="text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          Manifest (actual)
                        </header>
                        <p>
                          <strong>slCode:</strong>{" "}
                          {primary.manifestRow.slCode || "—"}
                        </p>
                        <p>
                          <strong>Cliente:</strong>{" "}
                          {primary.manifestRow.customerName || "—"}
                        </p>
                        <p>
                          <strong>Ruta:</strong>{" "}
                          {primary.manifestRow.ruta || "—"}
                        </p>
                      </section>

                      {primary.evidence.packagesCollection ? (
                        <section
                          data-testid={`nova-integrity-evidence-packages-${rowIndex}`}
                          className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 px-2 py-1.5 space-y-0.5"
                        >
                          <header className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                            packages
                          </header>
                          <p>
                            <strong>slCode:</strong>{" "}
                            {primary.evidence.packagesCollection.slCode || "—"}
                          </p>
                          <p>
                            <strong>Cliente:</strong>{" "}
                            {primary.evidence.packagesCollection.customerName ||
                              "—"}
                          </p>
                          <p>
                            <strong>Ruta:</strong>{" "}
                            {primary.evidence.packagesCollection.ruta || "—"}
                          </p>
                        </section>
                      ) : (
                        <section className="rounded border border-dashed border-muted-foreground/30 px-2 py-1.5 text-muted-foreground italic flex items-center justify-center">
                          packages — no encontrado
                        </section>
                      )}

                      {primary.evidence.invoice ? (
                        <section
                          data-testid={`nova-integrity-evidence-invoice-${rowIndex}`}
                          className="rounded border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 px-2 py-1.5 space-y-0.5"
                        >
                          <header className="text-[9px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400 flex items-center gap-1 flex-wrap">
                            <span>invoice</span>
                            {primary.evidence.invoice.isProtected && (
                              <span className="opacity-70">(protegida)</span>
                            )}
                            {primary.evidence.invoice.isConsolidation && (
                              <span
                                title="Factura consolidada — la auditoría salta las comprobaciones de peso/precio por-tracking"
                                className="inline-flex items-center px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 text-[8px] font-bold normal-case tracking-normal"
                              >
                                consolidada
                              </span>
                            )}
                          </header>
                          <p
                            className="font-mono text-[9px] truncate"
                            title={primary.evidence.invoice.invoiceNumber}
                          >
                            {primary.evidence.invoice.invoiceNumber}
                          </p>
                          <p>
                            <strong>slCode:</strong>{" "}
                            {primary.evidence.invoice.clientSlCode || "—"}
                          </p>
                          <p>
                            <strong>Cliente:</strong>{" "}
                            {primary.evidence.invoice.clientName || "—"}
                          </p>
                          {primary.evidence.conflictingInvoices &&
                            primary.evidence.conflictingInvoices.length > 0 && (
                              <div
                                data-testid={`nova-integrity-conflicts-${rowIndex}`}
                                className="mt-1 pt-1 border-t border-purple-300/60 dark:border-purple-800/60 space-y-0.5"
                              >
                                <p className="font-semibold text-destructive">
                                  Duplicada en{" "}
                                  {primary.evidence.conflictingInvoices.length}{" "}
                                  otra
                                  {primary.evidence.conflictingInvoices
                                    .length === 1
                                    ? ""
                                    : "s"}
                                  :
                                </p>
                                <ul className="space-y-0.5">
                                  {primary.evidence.conflictingInvoices.map(
                                    (c) => (
                                      <li
                                        key={c.invoiceId}
                                        className="font-mono text-[9px] truncate"
                                        title={c.invoiceNumber}
                                      >
                                        • {c.invoiceNumber || c.invoiceId}
                                        <span className="opacity-70">
                                          {" "}
                                          · {c.status}
                                        </span>
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </div>
                            )}
                        </section>
                      ) : primary.evidence.encomiendas ? (
                        <section
                          data-testid={`nova-integrity-evidence-encomiendas-${rowIndex}`}
                          className="rounded border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 px-2 py-1.5 space-y-0.5"
                        >
                          <header className="text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                            encomiendas
                          </header>
                          <p>
                            <strong>slCode:</strong>{" "}
                            {primary.evidence.encomiendas.slCode || "—"}
                          </p>
                          <p>
                            <strong>Cliente:</strong>{" "}
                            {primary.evidence.encomiendas.customerName || "—"}
                          </p>
                          <p>
                            <strong>Ruta:</strong>{" "}
                            {primary.evidence.encomiendas.ruta || "—"}
                          </p>
                        </section>
                      ) : (
                        <section className="rounded border border-dashed border-muted-foreground/30 px-2 py-1.5 text-muted-foreground italic flex items-center justify-center">
                          factura / encomienda — no encontrada
                        </section>
                      )}
                    </div>

                    {/* ── Detalle por incidencia ─────────────────────────
                        For drift issues (`invoice_weight_drift`,
                        `invoice_price_drift`, etc.) the headline badge
                        only carries the message in a tooltip. Inline the
                        full message so the operator sees the manifest /
                        invoice numeric gap without hovering — same UX
                        we offer for slCode mismatches. */}
                    {(() => {
                      const driftIssues = issues.filter(
                        (i) =>
                          i.kind === "invoice_weight_drift" ||
                          i.kind === "invoice_price_drift" ||
                          i.kind === "invoice_customer_drift" ||
                          i.kind === "duplicate_invoice",
                      );
                      if (driftIssues.length === 0) return null;
                      return (
                        <ul
                          data-testid={`nova-integrity-issue-detail-${rowIndex}`}
                          className="space-y-0.5 text-[10px] text-foreground/80 px-2"
                        >
                          {driftIssues.map((iss, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span
                                className={cn(
                                  "inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0",
                                  iss.severity === "high"
                                    ? "bg-destructive"
                                    : iss.severity === "medium"
                                      ? "bg-amber-500"
                                      : "bg-sky-500",
                                )}
                                aria-hidden="true"
                              />
                              <span className="font-semibold shrink-0">
                                {KIND_COPY[iss.kind]}:
                              </span>
                              <span className="break-words">{iss.message}</span>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}

                    {/* ── Change summary + per-row apply ───────────────
                        Spells out every field that will flip in every
                        source (manifest / packages / encomiendas / invoice)
                        so the operator sees exactly what the batch write
                        will mutate before committing. Includes the invoice
                        number rewrite (new policy: always rewritten when
                        the prefix differs from the consensus slCode). */}
                    {fix
                      ? (() => {
                          const changes: Array<{
                            label: string;
                            before: string;
                            after: string;
                          }> = [];
                          // Manifest row
                          if (!eqCase(primary.manifestRow.slCode, fix.slCode)) {
                            changes.push({
                              label: "Manifest · slCode",
                              before: primary.manifestRow.slCode || "—",
                              after: fix.slCode,
                            });
                          }
                          if (
                            !eqCase(
                              primary.manifestRow.customerName,
                              fix.customerName,
                            )
                          ) {
                            changes.push({
                              label: "Manifest · Cliente",
                              before: primary.manifestRow.customerName || "—",
                              after: fix.customerName,
                            });
                          }
                          if (!eqCase(primary.manifestRow.ruta, fix.ruta)) {
                            changes.push({
                              label: "Manifest · Ruta",
                              before: primary.manifestRow.ruta || "—",
                              after: fix.ruta,
                            });
                          }
                          // packages collection
                          const pkg = primary.evidence.packagesCollection;
                          if (pkg && !eqCase(pkg.slCode, fix.slCode)) {
                            changes.push({
                              label: "packages · slCode",
                              before: pkg.slCode || "—",
                              after: fix.slCode,
                            });
                          }
                          // manifest_encomiendas mirror
                          const enc = primary.evidence.encomiendas;
                          if (enc && !eqCase(enc.slCode, fix.slCode)) {
                            changes.push({
                              label: "encomiendas · slCode",
                              before: enc.slCode || "—",
                              after: fix.slCode,
                            });
                          }
                          // Invoice — slCode + clientName + rewritten prefix
                          const inv = primary.evidence.invoice;
                          if (inv) {
                            if (!eqCase(inv.clientSlCode, fix.slCode)) {
                              changes.push({
                                label: "factura · slCode",
                                before: inv.clientSlCode || "—",
                                after: fix.slCode,
                              });
                            }
                            if (!eqCase(inv.clientName, fix.customerName)) {
                              changes.push({
                                label: "factura · Cliente",
                                before: inv.clientName || "—",
                                after: fix.customerName,
                              });
                            }
                            const newInvoiceNumber = replaceInvoiceNumberPrefix(
                              inv.invoiceNumber,
                              fix.slCode,
                            );
                            if (newInvoiceNumber !== inv.invoiceNumber) {
                              changes.push({
                                label: "factura · N°",
                                before: inv.invoiceNumber,
                                after: newInvoiceNumber,
                              });
                            }
                          }
                          const isApplyingThisRow = applyingRow === rowIndex;
                          const disabled = applying || applyingRow !== null;
                          return (
                            <div
                              data-testid={`nova-integrity-fix-${rowIndex}`}
                              className={cn(
                                "rounded-md border px-2.5 py-2 space-y-2",
                                highConfidence
                                  ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/30"
                                  : "border-blue-300 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/30",
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <Wrench
                                  className={cn(
                                    "h-3.5 w-3.5 shrink-0 mt-0.5",
                                    highConfidence
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-blue-600 dark:text-blue-400",
                                  )}
                                  aria-hidden="true"
                                />
                                <div className="flex-1 min-w-0 text-[11px]">
                                  <p
                                    className={cn(
                                      "font-semibold",
                                      highConfidence
                                        ? "text-emerald-800 dark:text-emerald-300"
                                        : "text-blue-800 dark:text-blue-300",
                                    )}
                                  >
                                    Re-asignar a {fix.slCode} ·{" "}
                                    {fix.customerName}
                                    <span className="font-normal opacity-70">
                                      {" "}
                                      · <em>{FIX_SOURCE_COPY[fix.source]}</em> ·
                                      confianza{" "}
                                      {Math.round(fix.confidence * 100)}%
                                    </span>
                                  </p>
                                  {changes.length > 0 ? (
                                    <ul
                                      data-testid={`nova-integrity-changes-${rowIndex}`}
                                      className="mt-1.5 space-y-0.5 text-[10px] text-foreground/80"
                                    >
                                      {changes.map((c, idx) => (
                                        <li
                                          key={idx}
                                          className="flex items-center gap-1.5 flex-wrap"
                                        >
                                          <span className="font-semibold shrink-0">
                                            {c.label}:
                                          </span>
                                          <code
                                            className="font-mono text-[10px] bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 px-1 rounded truncate max-w-[220px]"
                                            title={c.before}
                                          >
                                            {c.before}
                                          </code>
                                          <ArrowRight
                                            className="h-2.5 w-2.5 shrink-0 opacity-70"
                                            aria-hidden="true"
                                          />
                                          <code
                                            className="font-mono text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-1 rounded truncate max-w-[220px]"
                                            title={c.after}
                                          >
                                            {c.after}
                                          </code>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-1 text-[10px] text-muted-foreground italic">
                                      Sin cambios pendientes — todas las fuentes
                                      ya coinciden con la sugerencia.
                                    </p>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    highConfidence ? "default" : "outline"
                                  }
                                  onClick={() => handleApplyOne(rowIndex)}
                                  disabled={disabled || changes.length === 0}
                                  className="h-7 px-2.5 text-[11px] gap-1 shrink-0"
                                  aria-label={`Aplicar corrección a fila ${rowIndex + 1}`}
                                  data-testid={`nova-integrity-apply-row-${rowIndex}`}
                                >
                                  {isApplyingThisRow ? (
                                    <Loader2
                                      className="h-3 w-3 animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Wrench
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                  )}
                                  {isApplyingThisRow ? "Aplicando…" : "Aplicar"}
                                </Button>
                              </div>
                            </div>
                          );
                        })()
                      : (() => {
                          // Kind-aware fallback panel. `orphan_tracking` is a
                          // *data-consistent* row that simply lacks an active
                          // invoice — there's nothing to "repair" via the audit
                          // batch (manifest/packages already agree). The misleading
                          // "Sin sugerencia automática" warning was confusing the
                          // operator: this branch routes them to the correct flow
                          // (Facturas → Actualizar BD) instead.
                          const allOrphan = issues.every(
                            (i) => i.kind === "orphan_tracking",
                          );
                          if (allOrphan) {
                            return (
                              <p
                                data-testid={`nova-integrity-orphan-${rowIndex}`}
                                className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded border border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400"
                              >
                                <AlertTriangle
                                  className="h-3 w-3 shrink-0"
                                  aria-hidden="true"
                                />
                                Datos consistentes — falta generar la factura
                                desde Facturas → Actualizar BD.
                              </p>
                            );
                          }
                          // Duplicate invoice — operator must anular the
                          // redundant invoices in Facturas; we can't pick one
                          // automatically because we don't know which has the
                          // correct totals. Route the operator there with the
                          // exact list of conflicting numbers already shown
                          // in the invoice card above.
                          const allDuplicate = issues.every(
                            (i) => i.kind === "duplicate_invoice",
                          );
                          if (allDuplicate) {
                            const conflictCount =
                              primary.evidence.conflictingInvoices?.length ?? 0;
                            return (
                              <p
                                data-testid={`nova-integrity-duplicate-${rowIndex}`}
                                className="text-[11px] flex items-start gap-1.5 px-2 py-1 rounded border border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300"
                              >
                                <AlertTriangle
                                  className="h-3 w-3 mt-0.5 shrink-0"
                                  aria-hidden="true"
                                />
                                <span>
                                  El tracking aparece en {conflictCount + 1}{" "}
                                  facturas activas. Anula las{" "}
                                  {conflictCount === 1
                                    ? "duplicada"
                                    : `${conflictCount} duplicadas`}{" "}
                                  desde Facturas dejando sólo la correcta — la
                                  auditoría sólo detecta el conflicto, no puede
                                  elegir cuál conservar.
                                </span>
                              </p>
                            );
                          }
                          // Drift-only rows (weight / price) — the customer
                          // & route already match. The fix is NOT a
                          // reassignment but a *re-emit* of the invoice from
                          // the current manifest snapshot, which lives in
                          // Facturas → Regenerar. Surface that path explicitly.
                          const allDrift = issues.every(
                            (i) =>
                              i.kind === "invoice_weight_drift" ||
                              i.kind === "invoice_price_drift",
                          );
                          if (allDrift) {
                            return (
                              <p
                                data-testid={`nova-integrity-drift-${rowIndex}`}
                                className="text-[11px] flex items-start gap-1.5 px-2 py-1 rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                              >
                                <AlertTriangle
                                  className="h-3 w-3 mt-0.5 shrink-0"
                                  aria-hidden="true"
                                />
                                <span>
                                  {primary.evidence.invoice?.isConsolidation
                                    ? "Factura consolidada — la diferencia se debe al reparto entre trackings; regenera la factura desde Facturas si quieres alinearla con el manifiesto actual."
                                    : "Re-genera la factura desde Facturas para alinear los valores con el manifiesto."}
                                </span>
                              </p>
                            );
                          }
                          return (
                            <p
                              data-testid={`nova-integrity-no-fix-${rowIndex}`}
                              className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                            >
                              <AlertTriangle
                                className="h-3 w-3 shrink-0"
                                aria-hidden="true"
                              />
                              Sin sugerencia automática — corrige manualmente
                              desde la tabla.
                            </p>
                          );
                        })()}
                  </article>
                );
              })}
            </div>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={onClose}
                disabled={applying}
                data-testid="nova-integrity-cancel"
              >
                Cerrar
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={handleApply}
                disabled={selectedRows.size === 0 || applying}
                data-testid="nova-integrity-apply"
                className="gap-1.5"
              >
                {applying ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Aplicar {selectedRows.size} corrección
                {selectedRows.size !== 1 ? "es" : ""}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
