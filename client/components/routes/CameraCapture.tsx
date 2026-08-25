import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, RefreshCw, Upload, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CameraCaptureProps {
  onCapture: (base64: string) => void;
  onClear?: () => void;
  capturedImage?: string | null;
  label?: string;
  disabled?: boolean;
}

export function CameraCapture({
  onCapture,
  onClear,
  capturedImage,
  label = "Foto del tablero",
  disabled = false,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<"idle" | "camera" | "preview">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(true);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setHasCamera(false);
    }
  }, []);

  useEffect(() => {
    if (capturedImage) setMode("preview");
  }, [capturedImage]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode("camera");
    } catch (err: any) {
      setCameraError(
        "No se pudo acceder a la cámara. Usa el botón de subir archivo.",
      );
      setHasCamera(false);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.9);
    stopStream();
    onCapture(base64);
    setMode("preview");
  }, [onCapture, stopStream]);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) {
          onCapture(base64);
          setMode("preview");
        }
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onCapture],
  );

  const handleClear = useCallback(() => {
    stopStream();
    setMode("idle");
    onClear?.();
  }, [onClear, stopStream]);

  if (mode === "preview" && capturedImage) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="relative rounded-lg overflow-hidden border border-border">
          <img
            src={capturedImage}
            alt="Dashboard"
            className="w-full h-48 object-cover"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <span className="bg-green-600/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Foto capturada
            </span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
              aria-label="Quitar foto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === "camera") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="relative rounded-lg overflow-hidden border border-border bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-48 object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-0 inset-x-0 flex justify-center gap-3 p-3 bg-black/40">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-white/90 hover:bg-white text-black border-0 gap-1"
              onClick={() => {
                stopStream();
                setMode("idle");
              }}
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-white text-black hover:bg-white/90 gap-1"
              onClick={capturePhoto}
            >
              <Camera className="h-4 w-4" /> Capturar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {cameraError && <p className="text-xs text-destructive">{cameraError}</p>}
      <div
        className={cn(
          "border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-3",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        <Camera className="h-8 w-8 text-muted-foreground" />
        <p className="text-xs text-muted-foreground text-center">
          Toma una foto del tablero/odómetro del vehículo
        </p>
        <div className="flex gap-2 flex-wrap justify-center">
          {hasCamera && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={startCamera}
              disabled={disabled}
            >
              <Camera className="h-3.5 w-3.5" /> Abrir cámara
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Upload className="h-3.5 w-3.5" /> Subir foto
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileInput}
          disabled={disabled}
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
