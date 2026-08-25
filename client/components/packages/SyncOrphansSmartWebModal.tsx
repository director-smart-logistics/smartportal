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
  Ghost
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  syncOrphanPackagesToSmartWeb,
  type SP1PackageForSync,
  type SyncSmartWebResult,
} from "@/lib/services/sync-smartweb-service";

type SyncStep = "preview" | "confirm" | "verify" | "processing" | "results";

interface SyncOrphansSmartWebModalProps {
  open: boolean;
  packages: SP1PackageForSync[];
  onClose: () => void;
}

export function SyncOrphansSmartWebModal({
  open,
  packages,
  onClose,
}: SyncOrphansSmartWebModalProps) {
  const [step, setStep] = useState<SyncStep>("preview");
  const [verifyInput, setVerifyInput] = useState("");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    tracking: "",
  });
  const [result, setResult] = useState<SyncSmartWebResult | null>(null);

  const verifyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("preview");
      setVerifyInput("");
      setProgress({ current: 0, total: 0, tracking: "" });
      setResult(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (step === "verify") {
      setTimeout(() => verifyRef.current?.focus(), 100);
    }
  }, [step]);

  const handleStartSync = async () => {
    setStep("processing");
    setProgress({ current: 0, total: packages.length, tracking: "" });

    try {
      const res = await syncOrphanPackagesToSmartWeb(packages, {
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

  const renderPreview = () => {
    const eligible = packages.length;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          <StatCard
            icon={<Ghost className="h-4 w-4 text-purple-600" />}
            label="Paquetes Huérfanos a Sincronizar"
            count={eligible}
            color="purple"
          />
        </div>

        <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5 text-xs text-orange-800 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              Creación Forzada en SmartWeb (SP2)
            </p>
            <p className="mt-0.5">
              Se enviarán estos paquetes con el SL Code <strong>PENDIENTE</strong> y cliente <strong>Cliente Desconocido</strong> (si no tienen) para que aparezcan en SP2 y servicio al cliente pueda rastrearlos.
            </p>
          </div>
        </div>

        {eligible === 0 ? (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-3 text-sm text-red-700 text-center font-medium">
            No hay paquetes seleccionados.
          </div>
        ) : (
          <p className="text-sm text-gray-600 text-center">
            Se forzará la creación de{" "}
            <span className="font-semibold text-gray-900">{eligible}</span>{" "}
            paquete{eligible !== 1 ? "s" : ""} en el servidor de SmartWeb.
          </p>
        )}
      </div>
    );
  };

  const renderConfirm = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800 space-y-2">
        <p className="font-semibold text-purple-900 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Sincronización Aislada
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>
            Los paquetes aparecerán en SmartWeb bajo "PENDIENTE" si no tienen código asignado.
          </li>
          <li>
            Esta acción permite la trazabilidad desde SP2, aunque no exista factura.
          </li>
          <li>
            Se <strong>sobreescribirá</strong> el estado en SP2 si el paquete ya existe.
          </li>
        </ul>
      </div>
      <p className="text-center text-sm text-gray-600 font-medium">
        ¿Confirmas que deseas sincronizar{" "}
        <span className="font-bold text-gray-900">{packages.length}</span>{" "}
        paquete{packages.length !== 1 ? "s" : ""} huérfano(s) con SmartWeb?
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
          para confirmar la sincronización forzada de <strong>{packages.length}</strong>{" "}
          paquetes.
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
        <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
        <p className="text-sm font-medium text-gray-800">
          Enviando paquetes huérfanos a SmartWeb…
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

  const stepConfig: Record<
    SyncStep,
    {
      title: string;
      description: string;
      footer: React.ReactNode;
    }
  > = {
    preview: {
      title: "Sincronizar Huérfanos",
      description: `${packages.length} paquete${packages.length !== 1 ? "s" : ""} seleccionado${packages.length !== 1 ? "s" : ""}`,
      footer: (
        <div className="flex gap-2 w-full justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => setStep("confirm")}
            disabled={packages.length === 0}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    confirm: {
      title: "Confirmar Sincronización Aislada",
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
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
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
      title: "Sincronizando Huérfanos…",
      description: "Por favor espera, no cierres esta ventana.",
      footer: <></>,
    },
    results: {
      title: "Resultado",
      description: "SmartWeb ha procesado los paquetes huérfanos.",
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
            <Ghost className="h-5 w-5 text-purple-500" />
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

        {step !== "processing" && (
          <div className="flex justify-center gap-1.5 pb-2 shrink-0">
            {(["preview", "confirm", "verify", "results"] as const).map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  s === step ? "w-4 bg-purple-500" : "w-1.5 bg-gray-300",
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

function StatCard({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: "green" | "blue" | "amber" | "red" | "purple";
}) {
  const bg: Record<string, string> = {
    green: "bg-green-50 border-green-200",
    blue: "bg-blue-50 border-blue-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
    purple: "bg-purple-50 border-purple-200",
  };
  const text: Record<string, string> = {
    green: "text-green-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
    purple: "text-purple-700",
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
