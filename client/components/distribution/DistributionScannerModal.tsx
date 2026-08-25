import { useRef, useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useHtml5QrcodeScanner } from "@/components/scanner/hooks/useHtml5QrcodeScanner";
import { useNativeBarcodeDetector } from "@/components/scanner/hooks/useNativeBarcodeDetector";
import { ScanLine, X, CheckCircle2, CameraOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DistributionScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (trackingNumber: string) => void;
}

// ── Inner scanner (mounted only while the dialog is open) ────────────────────
function ScannerInner({
  onScan,
  onClose,
}: {
  onScan: (v: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const confirmedRef = useRef(false);

  const scanner = useHtml5QrcodeScanner();
  const nativeDetector = useNativeBarcodeDetector(videoRef.current);

  const detectedCodes = nativeDetector.isSupported
    ? nativeDetector.detectedBarcodes.map((b) => b.rawValue)
    : scanner.detectedCodes.map((c) => c.text);

  // Start camera 400ms after mount (lets Dialog animate in first)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!videoRef.current) return;
      try {
        await scanner.startScanning(videoRef.current);
        if (nativeDetector.isSupported) nativeDetector.startDetection();
        setStarted(true);
      } catch {
        // camera error handled by scanner hook
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanner.isScanning) scanner.stopScanning();
      if (nativeDetector.isDetecting) nativeDetector.stopDetection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-accept first detected code
  useEffect(() => {
    if (confirmedRef.current || detectedCodes.length === 0) return;
    const code = detectedCodes[0].trim();
    if (!code || code.length < 4) return;
    confirmedRef.current = true;
    setDetected(code);
    setTimeout(() => {
      onScan(code);
      onClose();
    }, 600);
  }, [detectedCodes, onScan, onClose]);

  const handleManualClose = useCallback(() => {
    if (scanner.isScanning) scanner.stopScanning();
    if (nativeDetector.isDetecting) nativeDetector.stopDetection();
    onClose();
  }, [scanner, nativeDetector, onClose]);

  const cameraError = scanner.error;

  if (cameraError) {
    const isNotFound =
      cameraError.toLowerCase().includes("notfound") ||
      cameraError.toLowerCase().includes("not found");
    return (
      <div
        className="relative bg-gray-950 flex flex-col items-center justify-center gap-4 p-8"
        style={{ height: "70svh" }}
      >
        <CameraOff className="h-12 w-12 text-gray-500" aria-hidden="true" />
        <div className="text-center">
          <p className="text-white font-semibold text-base">
            {isNotFound ? "Cámara no encontrada" : "Error de cámara"}
          </p>
          <p className="text-gray-400 text-sm mt-1 max-w-xs">
            {isNotFound
              ? "Este dispositivo no tiene cámara disponible o el acceso fue denegado."
              : cameraError}
          </p>
        </div>
        <Button
          variant="outline"
          className="border-gray-600 text-white hover:bg-gray-800"
          onClick={handleManualClose}
        >
          Cerrar
        </Button>
        <button
          onClick={handleManualClose}
          className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          aria-label="Cerrar escáner"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-black" style={{ height: "70svh" }}>
      {/* Camera feed */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        autoPlay
        muted
        aria-label="Cámara para escanear"
      />

      {/* Scanning overlay */}
      {!detected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-4">
          {/* Animated scan frame */}
          <div className="relative w-3/4 h-32 border-2 border-white/60 rounded-xl overflow-hidden">
            <motion.div
              className="absolute inset-x-0 h-0.5 bg-blue-400/80"
              animate={{ top: ["10%", "90%", "10%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <p className="text-white text-sm font-medium bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">
            {started ? "Apunta la cámara al código" : "Iniciando cámara..."}
          </p>
        </div>
      )}

      {/* Success overlay */}
      <AnimatePresence>
        {detected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-green-500/30 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-5 text-center shadow-2xl mx-6"
            >
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500 mb-1">Código detectado</p>
              <p className="font-mono font-bold text-sm text-gray-900 break-all">
                {detected}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close button */}
      <button
        onClick={handleManualClose}
        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        aria-label="Cerrar escáner"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Status badge */}
      {started && !detected && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
          <motion.div
            className="w-2 h-2 rounded-full bg-green-400"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-xs text-white font-medium">Escaneando</span>
        </div>
      )}

      {/* Header label */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-center gap-2 text-white">
          <ScanLine className="h-4 w-4" />
          <span className="text-sm font-semibold">Escáner de Paquetes</span>
        </div>
      </div>
    </div>
  );
}

// ── Public modal component ────────────────────────────────────────────────────
export function DistributionScannerModal({
  open,
  onClose,
  onScan,
}: DistributionScannerModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 overflow-hidden max-w-sm border-0 bg-black">
        <DialogTitle className="sr-only">Escáner de paquetes</DialogTitle>
        <DialogDescription className="sr-only">
          Escáner de cámara para leer códigos de barras de paquetes
        </DialogDescription>
        {/* Mount ScannerInner only while open to ensure clean camera lifecycle */}
        {open && <ScannerInner onScan={onScan} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
