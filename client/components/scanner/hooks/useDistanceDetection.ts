import { useState, useEffect, useCallback, useRef } from "react";

export interface DistanceResult {
  distance: number; // in cm
  confidence: number; // 0-1
  method: string;
  zone: "MACRO" | "CLOSE" | "OPTIMAL" | "FAR" | "EXTREME";
}

export interface DistanceZone {
  range: [number, number];
  strategy: string;
  focusMode: string;
  captureMode: string;
}

export const DISTANCE_ZONES: Record<string, DistanceZone> = {
  MACRO: {
    range: [5, 15],
    strategy: "high_res_capture_with_digital_zoom_out",
    focusMode: "macro",
    captureMode: "burst_photo",
  },
  CLOSE: {
    range: [15, 20],
    strategy: "standard_capture_with_autofocus",
    focusMode: "continuous",
    captureMode: "single_photo",
  },
  OPTIMAL: {
    range: [20, 40],
    strategy: "direct_stream_processing",
    focusMode: "continuous",
    captureMode: "video_stream",
  },
  FAR: {
    range: [40, 70],
    strategy: "digital_zoom_with_super_resolution",
    focusMode: "infinity",
    captureMode: "multi_frame_super_resolution",
  },
  EXTREME: {
    range: [70, 200],
    strategy: "ai_enhanced_reconstruction",
    focusMode: "infinity",
    captureMode: "video_accumulation",
  },
};

/**
 * Distance detection system using multiple methods
 */
export function useDistanceDetection(videoElement: HTMLVideoElement | null) {
  const [distance, setDistance] = useState<DistanceResult>({
    distance: 30,
    confidence: 0.5,
    method: "default",
    zone: "OPTIMAL",
  });

  const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousDistanceRef = useRef<number>(30);

  /**
   * Detect distance using barcode size analysis
   */
  const detectFromBarcodeSize = useCallback((barcodeWidth: number): number => {
    // Assume standard Code 128 barcode is about 4cm wide
    // Using pinhole camera model: distance = (realWidth * focalLength) / pixelWidth
    const assumedBarcodeWidth = 4; // cm
    const focalLength = 1000; // arbitrary focal length constant (needs calibration)

    const estimatedDistance =
      (assumedBarcodeWidth * focalLength) / barcodeWidth;
    return Math.max(5, Math.min(200, estimatedDistance));
  }, []);

  /**
   * Detect distance from focus quality
   */
  const detectFromFocusQuality = useCallback(
    (videoEl: HTMLVideoElement): number => {
      // Check if video is ready
      if (
        !videoEl ||
        videoEl.videoWidth === 0 ||
        videoEl.videoHeight === 0 ||
        videoEl.readyState < 2
      ) {
        return 30; // Return default if video not ready
      }

      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");

      if (!ctx) return 30;

      try {
        ctx.drawImage(videoEl, 0, 0, 100, 100);
        const imageData = ctx.getImageData(0, 0, 100, 100);

        // Calculate sharpness (Laplacian variance)
        const sharpness = calculateSharpness(imageData);

        // Map sharpness to distance (inverse relationship)
        // High sharpness (>800) = optimal distance (20-40cm)
        // Low sharpness (<200) = too close or too far
        if (sharpness > 800) {
          return 30; // OPTIMAL center
        } else if (sharpness > 400) {
          return 25; // OPTIMAL lower
        } else {
          // Could be MACRO or FAR, default to CLOSE
          return 20;
        }
      } catch (error) {
        console.error("Focus quality detection error:", error);
        return 30;
      }
    },
    [],
  );

  /**
   * Detect distance from object size in frame
   */
  const detectFromFrameSize = useCallback(
    (videoEl: HTMLVideoElement): number => {
      // Check if video is ready
      if (
        !videoEl ||
        videoEl.videoWidth === 0 ||
        videoEl.videoHeight === 0 ||
        videoEl.readyState < 2
      ) {
        return 30; // Return default if video not ready
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) return 30;

      try {
        ctx.drawImage(videoEl, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Detect edges to find object boundaries
        const objectSize = detectObjectSize(imageData);

        // Larger object = closer distance
        // Smaller object = farther distance
        const frameFillPercentage = objectSize / (canvas.width * canvas.height);

        if (frameFillPercentage > 0.6) {
          return 15; // MACRO
        } else if (frameFillPercentage > 0.3) {
          return 30; // OPTIMAL
        } else if (frameFillPercentage > 0.1) {
          return 50; // FAR
        } else {
          return 80; // EXTREME
        }
      } catch (error) {
        console.error("Frame size detection error:", error);
        return 30;
      }
    },
    [],
  );

  /**
   * Combine multiple detection methods
   */
  const detectDistance = useCallback((): DistanceResult => {
    if (!videoElement) {
      return {
        distance: 30,
        confidence: 0.3,
        method: "default",
        zone: "OPTIMAL",
      };
    }

    // Method 1: Focus quality
    const focusDistance = detectFromFocusQuality(videoElement);

    // Method 2: Frame size
    const frameDistance = detectFromFrameSize(videoElement);

    // Weighted average (focus quality is more reliable)
    const combinedDistance = focusDistance * 0.6 + frameDistance * 0.4;

    // Smooth transition with previous measurement
    const smoothedDistance =
      previousDistanceRef.current * 0.7 + combinedDistance * 0.3;

    previousDistanceRef.current = smoothedDistance;

    // Determine zone
    const zone = getDistanceZone(smoothedDistance);

    return {
      distance: Math.round(smoothedDistance),
      confidence: 0.7,
      method: "focus_and_frame_analysis",
      zone,
    };
  }, [videoElement, detectFromFocusQuality, detectFromFrameSize]);

  /**
   * Get single distance measurement
   */
  const measureOnce = useCallback((): DistanceResult => {
    return detectDistance();
  }, [detectDistance]);

  // Auto-start monitoring when video element is available
  useEffect(() => {
    if (!videoElement) {
      console.log("[Distance] No video element");
      return;
    }

    console.log("[Distance] Starting distance monitoring");

    // Wait for video to be ready
    const checkInterval = setInterval(() => {
      if (videoElement.videoWidth > 0 && videoElement.readyState >= 2) {
        clearInterval(checkInterval);
        console.log("[Distance] ✓ Video ready for distance measurement");
      }
    }, 100);

    // Start measuring distance
    const measureInterval = setInterval(() => {
      if (videoElement.videoWidth > 0 && videoElement.readyState >= 2) {
        const result = detectDistance();
        setDistance(result);

        // Log occasionally to avoid spam
        if (Math.random() < 0.1) {
          console.log("[Distance]", result.distance, "cm, zone:", result.zone);
        }
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
      clearInterval(measureInterval);
      console.log("[Distance] Stopped monitoring");
    };
  }, [videoElement, detectDistance]);

  return {
    distance,
    measureOnce,
  };
}

/**
 * Determine distance zone from distance value
 */
function getDistanceZone(distance: number): DistanceResult["zone"] {
  if (distance < 15) return "MACRO";
  if (distance < 20) return "CLOSE";
  if (distance < 40) return "OPTIMAL";
  if (distance < 70) return "FAR";
  return "EXTREME";
}

/**
 * Calculate image sharpness using Laplacian variance
 */
function calculateSharpness(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  let sum = 0;
  let count = 0;

  // Apply Laplacian kernel
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      // Get grayscale values
      const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const top =
        (data[idx - width * 4] +
          data[idx - width * 4 + 1] +
          data[idx - width * 4 + 2]) /
        3;
      const bottom =
        (data[idx + width * 4] +
          data[idx + width * 4 + 1] +
          data[idx + width * 4 + 2]) /
        3;
      const left = (data[idx - 4] + data[idx - 3] + data[idx - 2]) / 3;
      const right = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;

      // Laplacian = 4*center - (top + bottom + left + right)
      const laplacian = Math.abs(4 * center - (top + bottom + left + right));

      sum += laplacian * laplacian;
      count++;
    }
  }

  return sum / count;
}

/**
 * Detect object size using edge detection
 */
function detectObjectSize(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  let edgePixels = 0;
  const threshold = 50;

  // Simple edge detection (Sobel-like)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const right = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;
      const bottom =
        (data[idx + width * 4] +
          data[idx + width * 4 + 1] +
          data[idx + width * 4 + 2]) /
        3;

      const gx = Math.abs(right - center);
      const gy = Math.abs(bottom - center);
      const gradient = Math.sqrt(gx * gx + gy * gy);

      if (gradient > threshold) {
        edgePixels++;
      }
    }
  }

  return edgePixels;
}
