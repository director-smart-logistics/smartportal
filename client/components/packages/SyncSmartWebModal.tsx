/**
 * SyncSmartWebModal
 *
 * Double-confirmation modal for syncing selected SP1 packages → SP2 (SmartWeb)
 * customer dashboards.
 *
 * Flow:
 *   Step 1 — Preview   : shows breakdown (create / update / skip / no-user)
 *   Step 2 — Confirm   : explicit first confirmation
 *   Step 3 — Verify    : typed "SYNC" keyword as second gate
 *   Step 4 — Processing: progress bar while writing to SP2
 *   Step 5 — Results   : final summary
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
  Lock,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  syncPackagesToSmartWeb,
  previewSyncPackages,
  type SP1PackageForSync,
  type SyncSmartWebResult,
} from "@/lib/services/sync-smartweb-service";

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncStep = "preview" | "confirm" | "verify" | "processing" | "results";

interface SyncSmartWebModalProps {
  open: boolean;
  packages: SP1PackageForSync[];
  onClose: () => void;
  /**
   * When true, the sync will:
   *  1. Bypass the SP2 regression guard — SP1 admin status always wins.
   *  2. Replace old sp1_sync history entries (ML/carrier events are preserved).
   * Defaults to true for admin-triggered syncs (SP1 is the source of truth).
   */
  forceSync?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SyncSmartWebModal({
  open,
  packages,
  onClose,
  forceSync = true,
}: SyncSmartWebModalProps) {
  const [step, setStep] = useState<SyncStep>("preview");
  const [verifyInput, setVerifyInput] = useState("");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    tracking: "",
  });
  const [result, setResult] = useState<SyncSmartWebResult | null>(null);
  const [previewData, setPreviewData] = useState<{
    withSlCode: SP1PackageForSync[];
    noSlCode: SP1PackageForSync[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const verifyRef = useRef<HTMLInputElement>(null);

  // Load preview when modal opens
  useEffect(() => {
    if (!open) {
      setStep("preview");
      setVerifyInput("");
      setProgress({ current: 0, total: 0, tracking: "" });
      setResult(null);
      setPreviewData(null);
      return;
    }
    if (packages.length === 0) return;

    setPreviewLoading(true);
    previewSyncPackages(packages)
      .then(setPreviewData)
      .finally(() => setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // packages ref stable within a single modal open

  // Focus verify input when reaching that step
  useEffect(() => {
    if (step === "verify") {
      setTimeout(() => verifyRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStartSync = async () => {
    setStep("processing");
    setProgress({ current: 0, total: packages.length, tracking: "" });

    try {
      const pkgsWithForce = packages.map((p) => ({ 
        ...p, 
        forceSync,
        allowCreate: true,
        slCode: p.slCode?.trim() && p.slCode !== "0" && p.slCode !== "N/A" && !p.slCode.startsWith("T") ? p.slCode : "PENDIENTE"
      }));
      
      const res = await syncPackagesToSmartWeb(pkgsWithForce, {
        onProgress: (current, total, tracking) =>
          setProgress({ current, total, tracking }),
      });
      setResult(res);
      setStep("results");
    } catch (err: any) {
      setResult({
        total: packages.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: packages.length,
        details: [
          { trackingNumber: "—", outcome: "error", reason: err?.message },
        ],
      });
      setStep("results");
    }
  };

  const progressPct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderPreview = () => {
    if (previewLoading || !previewData) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">Preparando resumen…</p>
        </div>
      );
    }

    const { withSlCode, noSlCode } = previewData;
    const eligible = withSlCode.length;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<RefreshCw className="h-4 w-4 text-blue-600" />}
            label="Con SL code (asignados)"
            count={eligible}
            color="blue"
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4 text-amber-500" />}
            label="Sin SL code (huérfanos)"
            count={noSlCode.length}
            color="amber"
          />
        </div>

        {forceSync && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5 text-xs text-orange-800 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                Forzar Sync — SP1 es fuente de verdad
              </p>
              <p className="mt-0.5">
                El estado actual de SP1 sobreescribirá el estado en SP2 sin
                importar cuál sea. Los eventos del rastreo (ML/carrier) se
                preservan; los eventos de sync anteriores de SP1 se reemplazan.
              </p>
            </div>
          </div>
        )}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-800">
          <p className="font-semibold mb-1">
            El servidor determinará para cada paquete:
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              Si ya existe en SmartWeb → actualiza el estado con el de SP1.
            </li>
            <li>
              Si no existe → el paquete será <b>creado</b> para que sea visible en admnistración.
            </li>
            {!forceSync && (
              <li>
                Si está bloqueado por admin en SP2 → lo omite sin modificar.
              </li>
            )}
          </ul>
        </div>

        {noSlCode.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <p className="font-semibold mb-1">
              Paquetes sin SL code ({noSlCode.length}) — se sincronizarán como huérfanos:
            </p>
            <ul className="space-y-0.5 max-h-20 overflow-y-auto">
              {noSlCode.slice(0, 6).map((p) => (
                <li key={p.id} className="font-mono">
                  {p.trackingNumber}
                </li>
              ))}
              {noSlCode.length > 6 && (
                <li className="italic">…y {noSlCode.length - 6} más</li>
              )}
            </ul>
          </div>
        )}

        {packages.length === 0 ? (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-3 text-sm text-red-700 text-center font-medium">
            No hay paquetes seleccionados.
          </div>
        ) : (
          <p className="text-sm text-gray-600 text-center">
            Se enviarán{" "}
            <span className="font-semibold text-gray-900">{packages.length}</span>{" "}
            paquete{packages.length !== 1 ? "s" : ""} al servidor de SmartWeb.
          </p>
        )}
      </div>
    );
  };

  const renderConfirm = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 space-y-2">
        <p className="font-semibold text-orange-900 flex items-center gap-2">
          {forceSync ? (
            <ShieldAlert className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {forceSync
            ? "Forzar Sync — acción irreversible"
            : "Esta acción es permanente"}
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>
            El estado actual de SP1 se enviará a SP2 para cada paquete
            seleccionado.
          </li>
          {forceSync ? (
            <li>
              Se <strong>sobreescribirá</strong> el estado en SP2 sin importar
              cuál sea (el regression guard será ignorado).
            </li>
          ) : (
            <li>
              Los paquetes bloqueados por admins en SmartWeb <strong>no</strong>{" "}
              serán modificados.
            </li>
          )}
          {forceSync && (
            <li>
              Los eventos de sync anteriores de SP1 se limpiarán; los del
              rastreo ML/carrier se preservan.
            </li>
          )}
          <li>Esta operación no se puede deshacer automáticamente.</li>
        </ul>
      </div>
      <p className="text-center text-sm text-gray-600 font-medium">
        ¿Confirmas que deseas sincronizar{" "}
        <span className="font-bold text-gray-900">{packages.length}</span>{" "}
        paquete{packages.length !== 1 ? "s" : ""} con SmartWeb?
      </p>
    </div>
  );

  const renderVerify = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold text-red-900 mb-1">
          Confirmación final requerida
        </p>
        <p className="text-xs">
          Escribe{" "}
          <span className="font-mono font-bold bg-red-100 px-1 py-0.5 rounded">
            SYNC
          </span>{" "}
          para confirmar la sincronización de <strong>{packages.length}</strong>{" "}
          paquetes con SmartWeb.
        </p>
      </div>
      <Input
        ref={verifyRef}
        value={verifyInput}
        onChange={(e) => setVerifyInput(e.target.value.toUpperCase())}
        placeholder="Escribe SYNC"
        className={cn(
          "text-center font-mono text-lg tracking-widest h-12 focus-visible:ring-1 focus-visible:ring-offset-0",
          verifyInput === "SYNC"
            ? "border-green-500 focus-visible:ring-green-500 focus-visible:border-green-500 bg-green-50"
            : "border-gray-300 focus-visible:ring-primary focus-visible:border-primary",
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter" && verifyInput === "SYNC") handleStartSync();
        }}
        aria-label="Confirmación de sincronización"
      />
    </div>
  );

  const renderProcessing = () => (
    <div className="space-y-5 py-4">
      <div className="flex flex-col items-center gap-2">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm font-medium text-gray-800">
          Sincronizando con SmartWeb…
        </p>
        {progress.tracking && (
          <p className="text-xs text-gray-500 font-mono truncate max-w-xs">
            {progress.tracking}
          </p>
        )}
      </div>
      <Progress value={progressPct} className="h-2.5" />
      <p className="text-center text-xs text-gray-500">
        {progress.current} / {progress.total} paquetes
      </p>
    </div>
  );

  const renderResults = () => {
    if (!result) return null;
    const success = result.errors === 0;
    return (
      <div className="space-y-4">
        <div className={cn("flex flex-col items-center gap-2 py-3")}>
          {success ? (
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          ) : (
            <AlertCircle className="h-10 w-10 text-amber-500" />
          )}
          <p className="font-semibold text-gray-900 text-center">
            {success ? "Sincronización completada" : "Completado con errores"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <StatCard
            icon={<Plus className="h-4 w-4 text-green-600" />}
            label="Creados"
            count={result.created}
            color="green"
          />
          <StatCard
            icon={<RefreshCw className="h-4 w-4 text-blue-600" />}
            label="Actualizados"
            count={result.updated}
            color="blue"
          />
          <StatCard
            icon={<Lock className="h-4 w-4 text-amber-600" />}
            label="Omitidos"
            count={result.skipped}
            color="amber"
          />
          <StatCard
            icon={<XCircle className="h-4 w-4 text-red-500" />}
            label="Errores"
            count={result.errors}
            color="red"
          />
        </div>

        {result.errors > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 max-h-28 overflow-y-auto space-y-1">
            {result.details
              .filter((d) => d.outcome === "error")
              .map((d) => (
                <p key={d.trackingNumber} className="font-mono">
                  {d.trackingNumber}: {d.reason}
                </p>
              ))}
          </div>
        )}
      </div>
    );
  };

  // ── Step config ──────────────────────────────────────────────────────────

  const stepConfig: Record<
    SyncStep,
    {
      title: string;
      description: string;
      footer: React.ReactNode;
    }
  > = {
    preview: {
      title: forceSync
        ? "Forzar Sync SP2 (Estado Actual)"
        : "Sincronizar con SmartWeb",
      description: `${packages.length} paquete${packages.length !== 1 ? "s" : ""} seleccionado${packages.length !== 1 ? "s" : ""}`,
      footer: (
        <div className="flex gap-2 w-full justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => setStep("confirm")}
            disabled={
              previewLoading ||
              !previewData ||
              previewData.withSlCode.length === 0
            }
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    confirm: {
      title: "Primera confirmación",
      description: "Revisa antes de proceder",
      footer: (
        <div className="flex gap-2 w-full justify-between">
          <Button variant="outline" onClick={() => setStep("preview")}>
            Atrás
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => setStep("verify")}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            >
              Confirmar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ),
    },
    verify: {
      title: "Segunda confirmación",
      description: "Escribe la palabra clave para proceder",
      footer: (
        <div className="flex gap-2 w-full justify-between">
          <Button variant="outline" onClick={() => setStep("confirm")}>
            Atrás
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleStartSync}
              disabled={verifyInput !== "SYNC"}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" /> Sincronizar ahora
            </Button>
          </div>
        </div>
      ),
    },
    processing: {
      title: "Sincronizando…",
      description: "Por favor espera, no cierres esta ventana.",
      footer: <></>,
    },
    results: {
      title: "Resultado del Sync",
      description: "SmartWeb ha sido actualizado.",
      footer: (
        <div className="flex justify-end w-full">
          <Button
            onClick={onClose}
            className="bg-gray-900 hover:bg-gray-800 text-white"
          >
            Cerrar
          </Button>
        </div>
      ),
    },
  };

  const cfg = stepConfig[step];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && step !== "processing") onClose();
      }}
    >
      <DialogContent
        className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-2xl w-[95vw] h-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col p-6 rounded-xl overflow-hidden bg-background border-border shadow-lg"
        onInteractOutside={(e) => {
          if (step === "processing") e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            {cfg.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">{cfg.description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 pr-2">
          {step === "preview" && renderPreview()}
          {step === "confirm" && renderConfirm()}
          {step === "verify" && renderVerify()}
          {step === "processing" && renderProcessing()}
          {step === "results" && renderResults()}
        </div>

        {/* Step indicator dots */}
        {step !== "processing" && (
          <div className="flex justify-center gap-1.5 pb-2 shrink-0">
            {(["preview", "confirm", "verify", "results"] as const).map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  s === step ? "w-4 bg-blue-500" : "w-1.5 bg-gray-300",
                )}
              />
            ))}
          </div>
        )}

        <DialogFooter className="mt-2 shrink-0 border-t pt-4">{cfg.footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small stat card ──────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: "green" | "blue" | "amber" | "red";
}) {
  const bg: Record<string, string> = {
    green: "bg-green-50 border-green-200",
    blue: "bg-blue-50 border-blue-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
  };
  const text: Record<string, string> = {
    green: "text-green-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 flex items-center gap-2.5",
        bg[color],
      )}
    >
      {icon}
      <div>
        <p className={cn("text-xl font-bold leading-none", text[color])}>
          {count}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
