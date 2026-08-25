import { useState, useEffect, useCallback, useRef } from "react";

export interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Use native BarcodeDetector API for fast, reliable barcode detection
 * Fallback to html5-qrcode if not supported
 */
export function useNativeBarcodeDetector(
  videoElement: HTMLVideoElement | null,
) {
  const [isSupported, setIsSupported] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedBarcodes, setDetectedBarcodes] = useState<DetectedBarcode[]>(
    [],
  );
  const detectorRef = useRef<any>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if BarcodeDetector is supported
  useEffect(() => {
    const checkSupport = async () => {
      if ("BarcodeDetector" in window) {
        try {
          // @ts-ignore - BarcodeDetector is experimental
          const formats = await window.BarcodeDetector.getSupportedFormats();
          console.log(
            "[Native Detector] ✓ BarcodeDetector supported with formats:",
            formats,
          );
          setIsSupported(true);

          // Create detector instance
          // @ts-ignore
          detectorRef.current = new window.BarcodeDetector({
            formats: [
              "code_128",
              "code_39",
              "code_93",
              "codabar",
              "ean_13",
              "ean_8",
              "itf",
              "qr_code",
              "pdf417",
              "data_matrix",
              "aztec",
              "upc_a",
              "upc_e",
            ],
          });
        } catch (error) {
          console.warn(
            "[Native Detector] BarcodeDetector available but initialization failed:",
            error,
          );
          setIsSupported(false);
        }
      } else {
        console.log(
          "[Native Detector] BarcodeDetector not supported in this browser",
        );
        setIsSupported(false);
      }
    };

    checkSupport();
  }, []);

  /**
   * Start continuous barcode detection
   */
  const startDetection = useCallback(() => {
    if (!isSupported || !detectorRef.current || !videoElement) {
      console.log("[Native Detector] Cannot start - not supported or no video");
      return;
    }

    if (isDetecting) {
      console.log("[Native Detector] Already detecting");
      return;
    }

    console.log("[Native Detector] Starting continuous detection...");
    setIsDetecting(true);

    // Detect barcodes every 200ms
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoElement || videoElement.readyState < 2) {
        return;
      }

      try {
        const barcodes = await detectorRef.current.detect(videoElement);

        if (barcodes.length > 0) {
          const formattedBarcodes = barcodes.map((barcode: any) => ({
            rawValue: barcode.rawValue,
            format: barcode.format,
            boundingBox: barcode.boundingBox
              ? {
                  x: barcode.boundingBox.x,
                  y: barcode.boundingBox.y,
                  width: barcode.boundingBox.width,
                  height: barcode.boundingBox.height,
                }
              : undefined,
          }));

          setDetectedBarcodes(formattedBarcodes);

          // Log only when barcodes change
          const currentCodes = formattedBarcodes
            .map((b: any) => b.rawValue)
            .join(",");
          console.log("[Native Detector] 🎯 Detected:", currentCodes);
        } else {
          // Clear if no barcodes
          setDetectedBarcodes([]);
        }
      } catch (error) {
        // Silently ignore detection errors - happens when video not ready
        if (Math.random() < 0.01) {
          // Log 1% of the time to avoid spam
          console.debug("[Native Detector] Detection error:", error);
        }
      }
    }, 200); // 5 FPS detection rate
  }, [isSupported, videoElement, isDetecting]);

  /**
   * Stop detection
   */
  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setIsDetecting(false);
    setDetectedBarcodes([]);
    console.log("[Native Detector] Stopped detection");
  }, []);

  /**
   * Clear detected barcodes
   */
  const clearBarcodes = useCallback(() => {
    setDetectedBarcodes([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  return {
    isSupported,
    isDetecting,
    detectedBarcodes,
    startDetection,
    stopDetection,
    clearBarcodes,
  };
}
