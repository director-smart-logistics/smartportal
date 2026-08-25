import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  RotateCcw,
  X,
  Package,
  MapPin,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignatureGeoData {
  address: string;
  lat: number;
  lng: number;
}

interface SignatureCaptureProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (signatureDataUrl: string, geoData?: SignatureGeoData) => void;
  isLoading?: boolean;
  packageInfo: {
    trackingNumber: string;
    customerName: string;
    slCode?: string;
    destination?: string;
    packageCount?: number;
  };
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

function getPoint(
  e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): Point {
  const rect = canvas.getBoundingClientRect();
  if ("touches" in e) {
    const t = e.touches[0];
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  return {
    x: (e as React.MouseEvent).clientX - rect.left,
    y: (e as React.MouseEvent).clientY - rect.top,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

type GeoStatus =
  | "idle"
  | "requesting"
  | "resolving"
  | "done"
  | "denied"
  | "error";

export function SignatureCapture({
  open,
  onClose,
  onConfirm,
  isLoading = false,
  packageInfo,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  // ── Geolocation + reverse geocoding ─────────────────────────────────────
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoData, setGeoData] = useState<SignatureGeoData | null>(null);

  useEffect(() => {
    if (!open) {
      setGeoStatus("idle");
      setGeoData(null);
      return;
    }
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setGeoStatus("resolving");
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { "Accept-Language": "es" } },
          );
          const json = await res.json();
          const address =
            json.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setGeoData({ address, lat, lng });
          setGeoStatus("done");
        } catch {
          setGeoData({
            address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            lat,
            lng,
          });
          setGeoStatus("done");
        }
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [open]);

  // ── Init canvas on open ─────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasSignature(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Wait for the DOM element to be sized
    const raf = requestAnimationFrame(initCanvas);
    return () => cancelAnimationFrame(raf);
  }, [open, initCanvas]);

  // ── Drawing ─────────────────────────────────────────────────────────────
  const startDrawing = useCallback(
    (
      e:
        | React.TouchEvent<HTMLCanvasElement>
        | React.MouseEvent<HTMLCanvasElement>,
    ) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      isDrawingRef.current = true;
      lastPointRef.current = getPoint(e, canvas);
      setHasSignature(true);
    },
    [],
  );

  const draw = useCallback(
    (
      e:
        | React.TouchEvent<HTMLCanvasElement>
        | React.MouseEvent<HTMLCanvasElement>,
    ) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas || !lastPointRef.current) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const current = getPoint(e, canvas);
      const last = lastPointRef.current;

      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();

      lastPointRef.current = current;
    },
    [],
  );

  const stopDrawing = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    initCanvas();
  }, [initCanvas]);

  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (isLoading) return;
    const dataUrl = canvas && hasSignature ? canvas.toDataURL("image/jpeg", 0.6) : "";
    onConfirm(dataUrl, geoData ?? undefined);
  }, [hasSignature, isLoading, onConfirm, geoData]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="signature-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] flex flex-col bg-white"
        role="dialog"
        aria-modal="true"
        aria-label="Captura de firma digital"
      >
        {/* ── Header ── */}
        <div className="border-b border-gray-200 px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {(packageInfo.packageCount ?? 0) > 0 && (
                <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-lg bg-gray-900 text-white text-sm font-black flex-shrink-0 mt-0.5">
                  {packageInfo.packageCount}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900 leading-snug">
                  Firme aquí para confirmar que recibió su paquete
                </p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {packageInfo.customerName || "Cliente"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-50"
              aria-label="Cancelar firma"
            >
              <X className="h-4 w-4 text-gray-700" />
            </button>
          </div>

          {/* GPS address strip */}
          <div className="mt-2 flex items-start gap-1.5 min-h-[1.25rem]">
            {geoStatus === "requesting" || geoStatus === "resolving" ? (
              <>
                <Loader2 className="h-3 w-3 text-gray-400 animate-spin flex-shrink-0 mt-0.5" />
                <span className="text-xs text-gray-400">
                  {geoStatus === "requesting"
                    ? "Solicitando ubicación GPS…"
                    : "Obteniendo dirección…"}
                </span>
              </>
            ) : geoStatus === "done" && geoData ? (
              <>
                <MapPin className="h-3 w-3 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-gray-500 leading-snug line-clamp-2">
                  {geoData.address}
                </span>
              </>
            ) : geoStatus === "denied" ? (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-amber-600">
                  Permiso de ubicación denegado
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Signature canvas ── */}
        <div className="flex-1 relative m-4 mb-0 min-h-0">
          <div
            className={cn(
              "relative w-full h-full rounded-2xl overflow-hidden border-4 transition-colors",
              hasSignature
                ? "border-gray-300 bg-white"
                : "border-dashed border-gray-300 bg-gray-50",
            )}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              aria-label="Área de firma"
              role="img"
            />

            {/* Placeholder text when empty */}
            <AnimatePresence>
              {!hasSignature && (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
                  aria-hidden="true"
                >
                  <Package className="h-16 w-16 text-gray-200 mb-3" />
                  <p className="text-3xl font-light text-gray-200">
                    Firme aquí
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="p-4 flex gap-3 flex-shrink-0">
          {/* Clear button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleClear}
            disabled={isLoading || !hasSignature}
            className={cn(
              "flex items-center justify-center gap-2 h-16 px-5 rounded-2xl border-2 font-bold text-base transition-colors",
              hasSignature
                ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                : "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed",
            )}
            aria-label="Borrar firma"
          >
            <RotateCcw className="h-5 w-5 flex-shrink-0" />
            <span>Borrar</span>
          </motion.button>

          {/* Confirm button */}
          <motion.button
            whileTap={{ scale: isLoading ? 1 : 0.97 }}
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              "flex-1 flex items-center justify-center gap-3 h-16 rounded-2xl font-bold text-lg transition-all text-white shadow-lg",
              !isLoading
                ? "bg-gray-900 active:bg-gray-800"
                : "bg-gray-400 cursor-not-allowed",
            )}
            aria-label="Confirmar entrega"
          >
            {isLoading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full"
                  style={{ borderWidth: 3 }}
                />
                <span>Guardando…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
                <span>{hasSignature ? "Confirmar Entrega" : "Confirmar Sin Firma"}</span>
              </>
            )}
          </motion.button>
        </div>

        {/* ── Legal note ── */}
        <p className="text-center text-xs text-gray-400 pb-4 px-5 flex-shrink-0">
          La firma digital confirma la recepción del paquete y queda registrada
          en el sistema.
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
