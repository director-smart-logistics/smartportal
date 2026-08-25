import { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Fuel,
  PackageX,
  DollarSign,
  FlagOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CameraCapture } from "./CameraCapture";
import {
  closeRouteSession,
  uploadDashboardPhoto,
  type RouteSession,
  type UndeliveredJustification,
  type RouteSessionPackage,
} from "@/lib/services/route-session-service";
import {
  analyzeDashboardImage,
  evaluateKmDiscrepancy,
} from "@/lib/services/route-ai-analyzer";
import { cn } from "@/lib/utils";

interface RouteCheckOutProps {
  open: boolean;
  session: RouteSession;
  deliveredPackageIds: Set<string>;
  onClosed: () => void;
  onCancel?: () => void;
}

const UNDELIVERED_REASONS = [
  "Cliente no estaba en casa",
  "Dirección incorrecta",
  "Cliente rechazó el paquete",
  "No se pudo contactar al cliente",
  "Paquete dañado en tránsito",
  "Acceso restringido a la zona",
  "Otro",
];

export function RouteCheckOut({
  open,
  session,
  deliveredPackageIds,
  onClosed,
  onCancel,
}: RouteCheckOutProps) {
  const [endKm, setEndKm] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUndelivered, setShowUndelivered] = useState(true);

  const undeliveredPkgs = useMemo<RouteSessionPackage[]>(
    () => session.packages.filter((p) => !deliveredPackageIds.has(p.packageId)),
    [session.packages, deliveredPackageIds],
  );

  const [justifications, setJustifications] = useState<Record<string, string>>(
    () => Object.fromEntries(undeliveredPkgs.map((p) => [p.packageId, ""])),
  );

  const kmDiscrepancy = useMemo(() => {
    if (!aiResult || !endKm) return null;
    return evaluateKmDiscrepancy(Number(endKm), aiResult.kmReading);
  }, [aiResult, endKm]);

  const allJustified = undeliveredPkgs.every((p) =>
    justifications[p.packageId]?.trim(),
  );

  const handlePhotoCapture = useCallback(
    async (base64: string) => {
      setPhoto(base64);
      setAiResult(null);
      setAnalyzingAI(true);
      setError(null);
      try {
        const result = await analyzeDashboardImage(base64);
        setAiResult(result);
        if (result.kmReading && !endKm) {
          setEndKm(String(result.kmReading));
        }
      } catch (err: any) {
        console.error("AI photo analysis error:", err);
        setError(err?.message ?? "No se pudo leer el tablero. Por favor, ingresa los datos manualmente.");
      } finally {
        setAnalyzingAI(false);
      }
    },
    [endKm],
  );

  const isFormValid =
    endKm && Number(endKm) >= session.startKm && photo && allJustified;

  const handleSubmit = useCallback(async () => {
    if (!isFormValid || !session.id) return;
    setSaving(true);
    setError(null);
    try {
      let endPhotoUrl: string | undefined;
      let endPhotoStoragePath: string | undefined;

      if (photo) {
        const uploaded = await uploadDashboardPhoto(session.id, photo, "end");
        endPhotoUrl = uploaded.url;
        endPhotoStoragePath = uploaded.path;
      }

      const undelivered: UndeliveredJustification[] = undeliveredPkgs.map(
        (p) => ({
          packageId: p.packageId,
          tracking: p.tracking,
          customerName: p.customerName,
          reason: justifications[p.packageId] ?? "",
        }),
      );

      await closeRouteSession(session.id, {
        endKm: Number(endKm),
        endKmAI: aiResult?.kmReading,
        endFuelLevel: aiResult?.fuelLevel,
        endFuelLevelPercent: aiResult?.fuelLevelPercent,
        endPhotoUrl,
        endPhotoStoragePath,
        endAIResult: aiResult,
        undelivered,
        deliveredCount: deliveredPackageIds.size,
        undeliveredCount: undeliveredPkgs.length,
      });

      onClosed();
    } catch (err: any) {
      setError(err?.message ?? "Error al cerrar la ruta");
    } finally {
      setSaving(false);
    }
  }, [
    isFormValid,
    session,
    photo,
    endKm,
    aiResult,
    undeliveredPkgs,
    justifications,
    deliveredPackageIds,
    onClosed,
  ]);

  const kmDriven =
    endKm && Number(endKm) > session.startKm
      ? Number(endKm) - session.startKm
      : null;

  return (
    <Dialog open={open} onOpenChange={open ? undefined : onCancel}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlagOff className="h-5 w-5 text-primary" />
            Cierre de Ruta
          </DialogTitle>
          <DialogDescription>
            Registra el odómetro final y justifica los paquetes no entregados.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-lg text-center text-sm">
          <div>
            <p className="font-semibold text-green-600">
              {deliveredPackageIds.size}
            </p>
            <p className="text-xs text-muted-foreground">Entregados</p>
          </div>
          <div>
            <p className="font-semibold text-amber-600">
              {undeliveredPkgs.length}
            </p>
            <p className="text-xs text-muted-foreground">Sin entregar</p>
          </div>
          <div>
            <p className="font-semibold">
              {session.startKm.toLocaleString()} km
            </p>
            <p className="text-xs text-muted-foreground">Km inicio</p>
          </div>
        </div>

        <Separator />

        {/* End odometer */}
        <div className="space-y-1.5">
          <Label htmlFor="endKm" className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> Kilometraje final *
          </Label>
          <Input
            id="endKm"
            type="number"
            placeholder={`Mín: ${session.startKm}`}
            value={endKm}
            onChange={(e) => setEndKm(e.target.value)}
            min={session.startKm}
          />
          {kmDriven != null && (
            <p className="text-xs text-muted-foreground">
              Km recorridos: <strong>{kmDriven.toLocaleString()} km</strong>
            </p>
          )}
        </div>

        {/* Dashboard photo */}
        <CameraCapture
          label="Foto final del tablero/odómetro *"
          capturedImage={photo}
          onCapture={handlePhotoCapture}
          onClear={() => {
            setPhoto(null);
            setAiResult(null);
          }}
          disabled={saving}
        />

        {/* AI analysis */}
        {analyzingAI && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizando imagen con AI…
          </div>
        )}

        {aiResult && !analyzingAI && (
          <div
            className={cn(
              "p-3 rounded-lg border text-sm space-y-2",
              kmDiscrepancy?.isAcceptable !== false
                ? "border-green-200 bg-green-50 dark:bg-green-950/20"
                : "border-amber-200 bg-amber-50 dark:bg-amber-950/20",
            )}
          >
            <p className="font-medium flex items-center gap-1.5">
              {kmDiscrepancy?.isAcceptable !== false ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              Análisis AI (confianza:{" "}
              {Math.round((aiResult.confidence ?? 0) * 100)}%)
            </p>
            {kmDiscrepancy && (
              <p className="text-xs text-muted-foreground">
                {kmDiscrepancy.message}
              </p>
            )}
            {aiResult.fuelLevel && aiResult.fuelLevel !== "Unknown" && (
              <p className="text-xs flex items-center gap-1.5">
                <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
                Combustible:{" "}
                <Badge variant="outline" className="text-xs">
                  {aiResult.fuelLevel}
                </Badge>
              </p>
            )}
          </div>
        )}

        <Separator />

        {/* Undelivered justifications */}
        {undeliveredPkgs.length > 0 && (
          <div className="space-y-3">
            <button
              type="button"
              className="flex items-center justify-between w-full text-sm font-medium"
              onClick={() => setShowUndelivered((v) => !v)}
            >
              <span className="flex items-center gap-1.5">
                <PackageX className="h-4 w-4 text-amber-600" />
                Paquetes no entregados ({undeliveredPkgs.length})
              </span>
              {showUndelivered ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showUndelivered && (
              <div className="space-y-3">
                {undeliveredPkgs.map((pkg) => (
                  <div
                    key={pkg.packageId}
                    className="p-3 border border-border rounded-lg space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs">
                        <p className="font-medium font-mono">{pkg.tracking}</p>
                        {pkg.customerName && (
                          <p className="text-muted-foreground">
                            {pkg.customerName}
                          </p>
                        )}
                      </div>
                      {justifications[pkg.packageId] && (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Motivo *</Label>
                      <select
                        className="w-full text-xs border border-input rounded-md px-2 py-1.5 bg-background"
                        value={justifications[pkg.packageId] ?? ""}
                        onChange={(e) =>
                          setJustifications((prev) => ({
                            ...prev,
                            [pkg.packageId]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Seleccionar motivo…</option>
                        {UNDELIVERED_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {justifications[pkg.packageId] === "Otro" && (
                        <Textarea
                          placeholder="Describe el motivo…"
                          className="text-xs min-h-[60px]"
                          onChange={(e) =>
                            setJustifications((prev) => ({
                              ...prev,
                              [pkg.packageId]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {onCancel && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </Button>
          )}
          <Button
            className="flex-1 gap-2"
            onClick={handleSubmit}
            disabled={!isFormValid || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Cerrar ruta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
