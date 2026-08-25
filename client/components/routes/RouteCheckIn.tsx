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
import {
  Loader2,
  Gauge,
  Car,
  Package,
  Weight,
  AlertTriangle,
  CheckCircle2,
  Fuel,
  SkipForward,
  Eye,
} from "lucide-react";
import { CameraCapture } from "./CameraCapture";
import {
  createRouteSession,
  uploadDashboardPhoto,
  type RouteSession,
  type RouteSessionPackage,
} from "@/lib/services/route-session-service";
import {
  analyzeDashboardImage,
  evaluateKmDiscrepancy,
} from "@/lib/services/route-ai-analyzer";
import { cn } from "@/lib/utils";

interface RouteCheckInProps {
  open: boolean;
  routeId: string;
  routeName: string;
  driverId: string;
  driverName: string;
  packages: RouteSessionPackage[];
  totalWeight: number;
  cashToCollect: number;
  isAdmin?: boolean;
  onCheckedIn: (sessionId: string) => void;
  onSkip?: () => void;
}

export function RouteCheckIn({
  open,
  routeId,
  routeName,
  driverId,
  driverName,
  packages,
  totalWeight,
  cashToCollect,
  isAdmin = false,
  onCheckedIn,
  onSkip,
}: RouteCheckInProps) {
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [startKm, setStartKm] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kmDiscrepancy = useMemo(() => {
    if (!aiResult || !startKm) return null;
    return evaluateKmDiscrepancy(Number(startKm), aiResult.kmReading);
  }, [aiResult, startKm]);

  const handlePhotoCapture = useCallback(
    async (base64: string) => {
      setPhoto(base64);
      setAiResult(null);
      setAnalyzingAI(true);
      setError(null);
      try {
        const result = await analyzeDashboardImage(base64);
        setAiResult(result);
        if (result.kmReading && !startKm) {
          setStartKm(String(result.kmReading));
        }
      } catch (err: any) {
        console.error("AI photo analysis error:", err);
        setError(err?.message ?? "No se pudo leer el tablero. Por favor, ingresa los datos manualmente.");
      } finally {
        setAnalyzingAI(false);
      }
    },
    [startKm],
  );

  const handlePhotoClear = useCallback(() => {
    setPhoto(null);
    setAiResult(null);
  }, []);

  const isFormValid =
    vehiclePlate.trim() && startKm && Number(startKm) > 0 && photo;

  const handleSubmit = useCallback(async () => {
    if (!isFormValid) return;
    setSaving(true);
    setError(null);
    try {
      const tempId = `tmp_${Date.now()}`;
      const sessionData: Omit<RouteSession, "id" | "createdAt" | "updatedAt"> =
        {
          routeId,
          routeName,
          driverId,
          driverName,
          vehiclePlate: vehiclePlate.trim().toUpperCase(),
          startKm: Number(startKm),
          startKmAI: aiResult?.kmReading,
          startFuelLevel: aiResult?.fuelLevel,
          startFuelLevelPercent: aiResult?.fuelLevelPercent,
          startAIResult: aiResult,
          startAt: new Date().toISOString(),
          packages,
          totalPackages: packages.length,
          totalWeight,
          cashToCollect,
          cashCurrency: "CRC",
          status: "open",
        };

      const sessionId = await createRouteSession(sessionData);

      if (photo) {
        const { url, path } = await uploadDashboardPhoto(
          sessionId,
          photo,
          "start",
        );
        const { updateRouteSession } = await import(
          "@/lib/services/route-session-service"
        );
        await updateRouteSession(sessionId, {
          startPhotoUrl: url,
          startPhotoStoragePath: path,
        });
      }

      onCheckedIn(sessionId);
    } catch (err: any) {
      setError(err?.message ?? "Error al guardar el check-in");
    } finally {
      setSaving(false);
    }
  }, [
    isFormValid,
    routeId,
    routeName,
    driverId,
    driverName,
    vehiclePlate,
    startKm,
    aiResult,
    photo,
    packages,
    totalWeight,
    cashToCollect,
    onCheckedIn,
  ]);

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {isAdmin && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400 text-xs">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span>
              Vista previa — estás viendo el flujo del chofer. Puedes saltar si
              lo deseas.
            </span>
          </div>
        )}

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            Inicio de Ruta
          </DialogTitle>
          <DialogDescription>
            Completa el check-in para comenzar la ruta{" "}
            <strong>{routeName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Route summary */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-lg">
          <div className="text-center">
            <Package className="h-4 w-4 mx-auto text-muted-foreground mb-0.5" />
            <p className="text-sm font-semibold">{packages.length}</p>
            <p className="text-xs text-muted-foreground">Paquetes</p>
          </div>
          <div className="text-center">
            <Weight className="h-4 w-4 mx-auto text-muted-foreground mb-0.5" />
            <p className="text-sm font-semibold">{totalWeight.toFixed(1)} kg</p>
            <p className="text-xs text-muted-foreground">Peso total</p>
          </div>
          <div className="text-center">
            <span className="block text-xs text-muted-foreground mb-0.5">
              Chofer
            </span>
            <p className="text-xs font-semibold truncate">{driverName}</p>
          </div>
        </div>

        <Separator />

        {/* Plate */}
        <div className="space-y-1.5">
          <Label htmlFor="plate" className="flex items-center gap-1.5">
            <Car className="h-3.5 w-3.5" /> Placa del vehículo *
          </Label>
          <Input
            id="plate"
            placeholder="ABC-123"
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
            className="uppercase font-mono"
            maxLength={10}
          />
        </div>

        {/* Odometer */}
        <div className="space-y-1.5">
          <Label htmlFor="startKm" className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> Kilometraje actual *
          </Label>
          <Input
            id="startKm"
            type="number"
            placeholder="Ej: 45000"
            value={startKm}
            onChange={(e) => setStartKm(e.target.value)}
            min={0}
          />
        </div>

        {/* Camera */}
        <CameraCapture
          label="Foto del tablero/odómetro *"
          capturedImage={photo}
          onCapture={handlePhotoCapture}
          onClear={handlePhotoClear}
          disabled={saving}
        />

        {/* AI Analysis result */}
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
                {aiResult.fuelLevelPercent != null &&
                  ` (≈${aiResult.fuelLevelPercent}%)`}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || saving}
            className="w-full gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Iniciar ruta
          </Button>

          {isAdmin && onSkip && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
              onClick={onSkip}
              disabled={saving}
            >
              <SkipForward className="h-3.5 w-3.5" />
              Saltar check-in (admin)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
