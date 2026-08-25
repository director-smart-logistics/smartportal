import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  Result,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";

export interface ScannerConfig {
  videoElement: HTMLVideoElement;
  onBarcodesDetected: (barcodes: string[]) => void;
  onError?: (error: Error) => void;
  distance?: number;
}

export interface ScannerState {
  isScanning: boolean;
  isReady: boolean;
  error: string | null;
  detectedCodes: string[];
  focusQuality: number;
}

/**
 * ZXing barcode scanner hook with distance-adaptive scanning
 */
export function useZXingScanner() {
  const [state, setState] = useState<ScannerState>({
    isScanning: false,
    isReady: false,
    error: null,
    detectedCodes: [],
    focusQuality: 1,
  });

  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef<boolean>(false);

  /**
   * Initialize ZXing reader with optimized settings
   */
  const initializeReader = useCallback(() => {
    const hints = new Map();

    // Enable all relevant barcode formats for shipping labels
    const formats = [
      BarcodeFormat.CODE_128, // Most common for tracking
      BarcodeFormat.CODE_39, // Older systems
      BarcodeFormat.PDF_417, // FedEx detailed info
      BarcodeFormat.DATA_MATRIX, // DHL, newer systems
      BarcodeFormat.AZTEC, // FedEx Ground
      BarcodeFormat.QR_CODE, // Modern labels
      BarcodeFormat.MAXICODE, // UPS routing
      BarcodeFormat.ITF, // Industrial 2 of 5
      BarcodeFormat.CODABAR, // Legacy systems
      BarcodeFormat.EAN_13, // International
      BarcodeFormat.UPC_A, // North America
    ];

    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.ASSUME_GS1, false);
    hints.set(DecodeHintType.PURE_BARCODE, false);

    const reader = new BrowserMultiFormatReader(hints);
    reader.timeBetweenDecodingAttempts = 300; // More reliable: 300ms between attempts

    readerRef.current = reader;

    setState((prev) => ({ ...prev, isReady: true, error: null }));
    console.log("[Scanner] Reader initialized with formats:", formats.length);
  }, []);

  /**
   * Get camera constraints based on distance and device
   */
  const getCameraConstraints = useCallback((distance: number = 35) => {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );

    // Base constraints that work on all devices
    const baseConstraints: MediaStreamConstraints = {
      video: {
        width: { min: 640, ideal: 1920, max: 3840 },
        height: { min: 480, ideal: 1080, max: 2160 },
        aspectRatio: { ideal: 16 / 9 },
      },
    };

    // Add facingMode only on mobile devices
    if (isMobile) {
      (baseConstraints.video as MediaTrackConstraints).facingMode =
        "environment";
    }

    // Note: Focus mode is configured AFTER stream is obtained via configureCameraFocus()
    // Only set basic video quality constraints here
    console.log(
      "[Scanner] Using basic constraints, focus will be configured after stream start",
    );

    return baseConstraints;
  }, []);

  /**
   * Configure camera focus - disable autofocus
   */
  const configureCameraFocus = useCallback(
    async (stream: MediaStream, distance: number) => {
      try {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          console.warn("[Scanner] No video track found");
          return;
        }

        const capabilities = videoTrack.getCapabilities() as any;
        const settings = videoTrack.getSettings() as any;

        console.log("[Scanner] Camera capabilities:", {
          focusMode: capabilities.focusMode,
          focusDistance: capabilities.focusDistance,
          zoom: capabilities.zoom,
        });

        // Disable autofocus - use manual focus mode
        const constraints: any = {};
        let focusModeApplied = false;

        if (capabilities.focusMode && Array.isArray(capabilities.focusMode)) {
          // Prefer manual focus to disable autofocus
          if (capabilities.focusMode.includes("manual")) {
            constraints.focusMode = "manual";
            focusModeApplied = true;
            console.log(
              "[Scanner] Setting focus mode: MANUAL (autofocus disabled)",
            );
          }
          // If manual not available but single-shot is, use that
          else if (capabilities.focusMode.includes("single-shot")) {
            constraints.focusMode = "single-shot";
            focusModeApplied = true;
            console.log(
              "[Scanner] Setting focus mode: SINGLE-SHOT (manual fallback)",
            );
          }
          // Last resort: continuous (but we tried to disable autofocus)
          else if (capabilities.focusMode.includes("continuous")) {
            constraints.focusMode = "continuous";
            focusModeApplied = true;
            console.log(
              "[Scanner] WARNING: Manual focus not available, using CONTINUOUS",
            );
          }
        }

        // Set focus distance if supported
        if (
          capabilities.focusDistance &&
          capabilities.focusDistance.min !== undefined
        ) {
          const { min, max } = capabilities.focusDistance;
          let normalizedDistance = distance / 100; // Convert cm to meters
          normalizedDistance = Math.max(min, Math.min(max, normalizedDistance));

          constraints.focusDistance = normalizedDistance;
          console.log("[Scanner] Setting focus distance:", normalizedDistance);
        }

        // Apply constraints if we have any
        if (Object.keys(constraints).length > 0) {
          try {
            await videoTrack.applyConstraints({ advanced: [constraints] });
            console.log("[Scanner] ✓ Focus configured successfully");
          } catch (err) {
            try {
              await videoTrack.applyConstraints(constraints);
              console.log("[Scanner] ✓ Focus configured (simplified)");
            } catch (fallbackError) {
              console.warn(
                "[Scanner] Focus configuration failed, using defaults",
              );
            }
          }
        }
      } catch (error) {
        console.error("[Scanner] Error configuring focus:", error);
      }
    },
    [],
  );

  /**
   * Continuous scanning loop
   */
  const continuousScan = useCallback(async (videoElement: HTMLVideoElement) => {
    if (!readerRef.current || !scanningRef.current) {
      console.log("[Scanner] Continuous scan stopped");
      return;
    }

    // Check if video is ready
    if (
      !videoElement ||
      videoElement.videoWidth === 0 ||
      videoElement.readyState < 2
    ) {
      console.warn("[Scanner] Video not ready for decoding, retrying...");
      if (scanningRef.current) {
        setTimeout(() => continuousScan(videoElement), 300);
      }
      return;
    }

    try {
      const result =
        await readerRef.current.decodeFromVideoElement(videoElement);

      if (result && result.getText()) {
        const code = result.getText();
        console.log("[Scanner] ✅ Barcode detected:", code);

        setState((prev) => {
          if (!prev.detectedCodes.includes(code)) {
            console.log("[Scanner] Adding new code:", code);
            return {
              ...prev,
              detectedCodes: [...prev.detectedCodes, code],
            };
          }
          return prev;
        });
      }
    } catch (error) {
      // No barcode detected - this is normal, don't log spam
    }

    // Continue scanning
    if (scanningRef.current) {
      requestAnimationFrame(() => {
        setTimeout(() => continuousScan(videoElement), 300); // 300ms interval - more reliable detection
      });
    }
  }, []);

  /**
   * Start continuous scanning from video stream
   */
  const startScanning = useCallback(
    async (videoElement: HTMLVideoElement, distance: number = 35) => {
      console.log("[Scanner] Starting scanning...");

      if (!readerRef.current) {
        console.log("[Scanner] Initializing reader...");
        initializeReader();
      }

      if (scanningRef.current) {
        console.log("[Scanner] Already scanning");
        return;
      }

      try {
        videoRef.current = videoElement;

        console.log("[Scanner] Requesting camera access...");
        const constraints = getCameraConstraints(distance);

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("[Scanner] ✓ Camera stream obtained");

        streamRef.current = stream;
        videoElement.srcObject = stream;

        console.log("[Scanner] Starting video playback...");
        await videoElement.play();
        console.log(
          "[Scanner] ✓ Video playing:",
          videoElement.videoWidth,
          "x",
          videoElement.videoHeight,
        );

        // Configure camera focus
        await configureCameraFocus(stream, distance);

        scanningRef.current = true;
        setState((prev) => ({ ...prev, isScanning: true, error: null }));

        // Start continuous decoding
        console.log("[Scanner] ✓ Starting continuous scan loop");
        requestAnimationFrame(() => continuousScan(videoElement));
      } catch (error) {
        console.error("[Scanner] ❌ Failed to start:", error);
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Camera access failed",
          isScanning: false,
        }));
        throw error;
      }
    },
    [
      getCameraConstraints,
      initializeReader,
      configureCameraFocus,
      continuousScan,
    ],
  );

  /**
   * Stop scanning and release resources
   */
  const stopScanning = useCallback(() => {
    console.log("[Scanner] Stopping scanning...");
    scanningRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        console.log("[Scanner] Stopping track:", track.kind);
        track.stop();
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }

    setState((prev) => ({
      ...prev,
      isScanning: false,
      detectedCodes: [],
    }));

    console.log("[Scanner] ✓ Scanner stopped");
  }, []);

  /**
   * Capture high-resolution image
   */
  const captureImage = useCallback(async (): Promise<Blob> => {
    if (!videoRef.current) {
      throw new Error("Video not initialized");
    }

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context not available");
    }

    ctx.drawImage(video, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create image blob"));
          }
        },
        "image/jpeg",
        0.95,
      );
    });
  }, []);

  /**
   * Capture burst of images
   */
  const captureBurst = useCallback(
    async (count: number = 3): Promise<Blob[]> => {
      const images: Blob[] = [];
      const wait = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      for (let i = 0; i < count; i++) {
        const image = await captureImage();
        images.push(image);
        await wait(100); // 100ms between captures
      }

      return images;
    },
    [captureImage],
  );

  /**
   * Toggle flashlight/torch
   */
  const toggleTorch = useCallback(async (enabled: boolean) => {
    if (!streamRef.current) return;

    const track = streamRef.current.getVideoTracks()[0];
    const capabilities = track.getCapabilities() as any;

    if (capabilities.torch) {
      await track.applyConstraints({
        advanced: [{ torch: enabled }] as any,
      });
    }
  }, []);

  /**
   * Assess focus quality
   */
  const assessFocusQuality = useCallback((): number => {
    if (!videoRef.current) return 0;

    const video = videoRef.current;

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      video.readyState < 2
    ) {
      return 0;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;

    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;

    try {
      ctx.drawImage(video, 0, 0, 100, 100);
      const imageData = ctx.getImageData(0, 0, 100, 100);

      const variance = calculateImageVariance(imageData);
      const quality = Math.min(variance / 1000, 1);

      setState((prev) => ({ ...prev, focusQuality: quality }));

      return quality;
    } catch (error) {
      return 0;
    }
  }, []);

  /**
   * Update focus based on new distance
   */
  const updateFocus = useCallback(
    async (newDistance: number) => {
      if (!streamRef.current) return;
      await configureCameraFocus(streamRef.current, newDistance);
    },
    [configureCameraFocus],
  );

  /**
   * Clear detected codes
   */
  const clearDetectedCodes = useCallback(() => {
    setState((prev) => ({ ...prev, detectedCodes: [] }));
  }, []);

  // Initialize reader on mount
  useEffect(() => {
    initializeReader();

    return () => {
      stopScanning();
    };
  }, [initializeReader, stopScanning]);

  return {
    ...state,
    startScanning,
    stopScanning,
    captureImage,
    captureBurst,
    toggleTorch,
    assessFocusQuality,
    updateFocus,
    clearDetectedCodes,
  };
}

/**
 * Detect iPhone 14 Pro by screen dimensions
 */
function detectIPhone14Pro(): boolean {
  return (
    window.screen.width === 393 &&
    window.screen.height === 852 &&
    window.devicePixelRatio === 3
  );
}

/**
 * Calculate image sharpness using variance
 */
function calculateImageVariance(imageData: ImageData): number {
  const data = imageData.data;
  let sum = 0;
  let sumSq = 0;
  const count = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sum += gray;
    sumSq += gray * gray;
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  return variance;
}
