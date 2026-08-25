import { useCallback, useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeResult,
} from "html5-qrcode";

export interface DetectedCode {
  text: string;
  format: string;
  timestamp: number;
}

export interface ScannerState {
  isScanning: boolean;
  isReady: boolean;
  error: string | null;
  detectedCodes: DetectedCode[];
}

interface Html5QrcodeConfig {
  fps: number;
  qrbox?:
    | { width: number; height: number }
    | ((
        viewfinderWidth: number,
        viewfinderHeight: number,
      ) => { width: number; height: number });
  aspectRatio?: number;
  disableFlip?: boolean;
  formatsToSupport?: Html5QrcodeSupportedFormats[];
  experimentalFeatures?: {
    useBarCodeDetectorIfSupported?: boolean;
  };
}

/**
 * Enhanced barcode scanner using html5-qrcode library
 * This provides better detection than raw ZXing
 */
export function useHtml5QrcodeScanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanningRef = useRef(false);
  const containerIdRef = useRef<string>("html5qr-reader");

  const [state, setState] = useState<ScannerState>({
    isScanning: false,
    isReady: false,
    error: null,
    detectedCodes: [],
  });

  /**
   * Initialize scanner
   */
  const initializeScanner = useCallback(() => {
    console.log("[Html5QrScanner] Initializing...");

    try {
      // Create container element if it doesn't exist
      let container = document.getElementById(containerIdRef.current);
      if (!container) {
        container = document.createElement("div");
        container.id = containerIdRef.current;
        // Hide the container but keep it in the DOM for stream access
        container.style.position = "absolute";
        container.style.top = "-9999px";
        container.style.left = "-9999px";
        container.style.width = "1px";
        container.style.height = "1px";
        container.style.overflow = "hidden";
        document.body.appendChild(container);
      }

      // Create scanner instance
      scannerRef.current = new Html5Qrcode(containerIdRef.current);

      setState((prev) => ({ ...prev, isReady: true }));
      console.log("[Html5QrScanner] ✓ Ready");
    } catch (error) {
      console.error("[Html5QrScanner] Initialization failed:", error);
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize scanner",
      }));
    }
  }, []);

  /**
   * Start scanning with camera
   */
  const startScanning = useCallback(async (videoElement: HTMLVideoElement) => {
    if (!scannerRef.current) {
      console.error("[Html5QrScanner] Scanner not initialized");
      return;
    }

    if (scanningRef.current) {
      console.log("[Html5QrScanner] Already scanning");
      return;
    }

    console.log("[Html5QrScanner] Starting camera...");
    videoRef.current = videoElement;
    scanningRef.current = true;

    try {
      // Get available cameras
      const cameras = await Html5Qrcode.getCameras();
      console.log("[Html5QrScanner] Found cameras:", cameras.length);

      if (cameras.length === 0) {
        throw new Error("No cameras found on device");
      }

      // Prefer back camera on mobile, or highest quality camera
      const backCamera = cameras.find(
        (camera) =>
          camera.label.toLowerCase().includes("back") ||
          camera.label.toLowerCase().includes("rear") ||
          camera.label.toLowerCase().includes("environment"),
      );

      // Use facingMode constraint for better mobile support
      const cameraConstraint = backCamera
        ? backCamera.id
        : { facingMode: "environment" }; // Prefer back camera on mobile

      console.log(
        "[Html5QrScanner] Using camera:",
        backCamera?.label || "environment facing",
      );

      // Configure scanner for shipping labels - optimized for better detection
      const config: Html5QrcodeConfig = {
        fps: 20, // Increased from 10 to 20 fps for faster detection
        // Dynamic qrbox based on viewfinder size - best practice from documentation
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // For barcodes, use 80% width and 30% height for better horizontal barcode scanning
          const qrboxWidth = Math.floor(viewfinderWidth * 0.8);
          const qrboxHeight = Math.floor(viewfinderHeight * 0.3);
          return {
            width: Math.max(Math.min(qrboxWidth, 600), 50), // Min 50px (html5-qrcode requirement), max 600px
            height: Math.max(qrboxHeight, 50), // Min 50px (html5-qrcode requirement)
          };
        },
        aspectRatio: 1.777778, // 16:9
        disableFlip: false, // Allow scanning mirrored barcodes
        formatsToSupport: [
          // Prioritize most common shipping formats
          Html5QrcodeSupportedFormats.CODE_128, // Most common
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.PDF_417, // FedEx
          Html5QrcodeSupportedFormats.DATA_MATRIX, // DHL
          Html5QrcodeSupportedFormats.AZTEC, // FedEx
          Html5QrcodeSupportedFormats.MAXICODE, // UPS
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        // Advanced options for better detection
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true, // Use native detector if available
        },
      };

      // Success callback when barcode detected
      const onScanSuccess = (
        decodedText: string,
        decodedResult: Html5QrcodeResult,
      ) => {
        console.log(
          "[Html5QrScanner] ✓ Decoded:",
          decodedText,
          "Format:",
          decodedResult.result.format?.formatName || "unknown",
        );

        setState((prev) => {
          // Avoid duplicates within 2 seconds
          const exists = prev.detectedCodes.some(
            (code) =>
              code.text === decodedText && Date.now() - code.timestamp < 2000,
          );
          if (exists) return prev;

          return {
            ...prev,
            detectedCodes: [
              ...prev.detectedCodes,
              {
                text: decodedText,
                format: decodedResult.result.format?.formatName || "unknown",
                timestamp: Date.now(),
              },
            ],
          };
        });
      };

      // Error callback (mostly just noise)
      const onScanError = (errorMessage: string) => {
        // Silently ignore expected scanning errors - these happen on every frame without a barcode
        // Only log unexpected errors for debugging
        const expectedErrors = [
          "NotFoundException",
          "No MultiFormat Readers",
          "not found",
          "NotFoundError",
          "No code found",
          "No barcode or QR code detected",
          "QR code parse error",
        ];

        const isExpectedError = expectedErrors.some((err) =>
          errorMessage.toLowerCase().includes(err.toLowerCase()),
        );

        if (!isExpectedError) {
          console.warn("[Html5QrScanner] Unexpected error:", errorMessage);
        }
      };

      // Start scanning - proper API usage per documentation
      await scannerRef.current.start(
        cameraConstraint, // Can be cameraId string or MediaTrackConstraints
        config, // Html5QrcodeCameraScanConfig
        onScanSuccess, // QrcodeSuccessCallback
        onScanError, // QrcodeErrorCallback (optional)
      );

      setState((prev) => ({ ...prev, isScanning: true, error: null }));
      console.log("[Html5QrScanner] ✓ Camera started");

      // Get the video element created by html5-qrcode and copy its stream to our video element
      const copyStreamToVideo = (attempts = 0) => {
        const html5Video = document.querySelector(
          `#${containerIdRef.current} video`,
        ) as HTMLVideoElement;

        if (html5Video?.srcObject && videoElement) {
          console.log(
            "[Html5QrScanner] ✓ Copying video stream to display element",
          );
          videoElement.srcObject = html5Video.srcObject;
          videoElement.setAttribute("autoplay", "true");
          videoElement.setAttribute("playsinline", "true");
          videoElement.play().catch((err) => {
            console.warn("[Html5QrScanner] Video play error:", err);
            // Try again on user interaction
            videoElement.addEventListener("click", () => videoElement.play(), {
              once: true,
            });
          });
        } else if (attempts < 10) {
          // Retry up to 10 times (5 seconds total)
          setTimeout(() => copyStreamToVideo(attempts + 1), 500);
        } else {
          console.error(
            "[Html5QrScanner] Failed to find video stream after 10 attempts",
          );
        }
      };

      copyStreamToVideo();
    } catch (error) {
      console.error("[Html5QrScanner] Failed to start:", error);
      scanningRef.current = false;
      setState((prev) => ({
        ...prev,
        isScanning: false,
        error:
          error instanceof Error ? error.message : "Failed to start camera",
      }));
    }
  }, []);

  /**
   * Stop scanning - properly tear down camera and video per documentation
   */
  const stopScanning = useCallback(async () => {
    if (!scannerRef.current || !scanningRef.current) {
      console.log("[Html5QrScanner] Not scanning");
      return;
    }

    console.log("[Html5QrScanner] Stopping...");
    scanningRef.current = false;

    try {
      // Per documentation: stop() will stop the video feed and camera properly
      await scannerRef.current.stop();
      console.log("[Html5QrScanner] ✓ Camera stopped");

      // Clear the video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch (error) {
      console.error("[Html5QrScanner] Stop error:", error);
    }

    setState((prev) => ({ ...prev, isScanning: false }));
  }, []);

  /**
   * Capture high-quality still image from video stream
   */
  const captureImage = useCallback(async (): Promise<Blob> => {
    // Try to get video from either our element or html5-qrcode's element
    let video = videoRef.current;

    if (!video || !video.srcObject) {
      // Fallback to html5-qrcode's video element
      video = document.querySelector(
        `#${containerIdRef.current} video`,
      ) as HTMLVideoElement;
    }

    if (!video || !video.srcObject) {
      throw new Error("Video stream not available");
    }

    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");

      // Use video dimensions
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Draw current video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log(
              "[Html5QrScanner] ✓ Image captured:",
              blob.size,
              "bytes",
            );
            resolve(blob);
          } else {
            reject(new Error("Failed to capture image"));
          }
        },
        "image/jpeg",
        0.95, // High quality
      );
    });
  }, []);

  /**
   * Clear detected codes
   */
  const clearDetectedCodes = useCallback(() => {
    setState((prev) => ({ ...prev, detectedCodes: [] }));
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    initializeScanner();

    return () => {
      if (scannerRef.current && scanningRef.current) {
        scannerRef.current.stop().catch((err) => {
          console.warn("[Html5QrScanner] Cleanup error:", err);
        });
      }
      scannerRef.current = null;

      // Remove container element
      const container = document.getElementById(containerIdRef.current);
      if (container) {
        container.remove();
      }
    };
  }, [initializeScanner]);

  return {
    isScanning: state.isScanning,
    isReady: state.isReady,
    error: state.error,
    detectedCodes: state.detectedCodes,
    focusQuality: 0, // Html5-qrcode doesn't provide focus quality
    startScanning,
    stopScanning,
    captureImage,
    clearDetectedCodes,
  };
}
