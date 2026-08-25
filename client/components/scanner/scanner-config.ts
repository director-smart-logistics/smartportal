/**
 * Scanner Configuration
 * Switch between different barcode scanning implementations
 */

export type ScannerImplementation = "html5-qrcode";

export const SCANNER_CONFIG = {
  // Use html5-qrcode - reliable barcode scanner with better defaults
  implementation: "html5-qrcode" as ScannerImplementation,

  // ZXing-specific settings
  zxing: {
    scanInterval: 300, // ms between scan attempts
    tryHarder: true, // More thorough scanning (slower but more accurate)
    assumeGS1: false, // Don't assume GS1 format
    pureBarcode: false, // Allow barcodes with quiet zones
  },

  // Html5-qrcode specific settings (OPTIMIZED for better detection)
  html5qrcode: {
    fps: 20, // Frames per second - increased for faster detection
    qrbox: {
      // Scanning box dimensions - larger for easier alignment
      width: 400,
      height: 300,
    },
    useNativeBarcodeDetector: true, // Use browser's native detector if available
  },

  // Camera settings (common to both)
  camera: {
    preferredResolution: {
      width: 1920,
      height: 1080,
    },
    focusMode: "manual", // 'manual', 'continuous', or 'single-shot'
    torch: false, // Flash/torch off by default
  },

  // Detection thresholds
  detection: {
    minConfidence: 0.7, // Minimum confidence to accept a barcode
    deduplicationWindow: 2000, // ms - ignore duplicate barcodes within this window
  },

  // AI fallback settings
  ai: {
    enabled: true, // Enable AI processing when barcode detection fails
    strategy: "auto", // 'auto', 'zxing_only', 'ai_only'
    timeout: 10000, // ms - max time for AI processing
  },
} as const;

/**
 * Get scanner hook based on configuration
 */
export function getScannerHook() {
  if (SCANNER_CONFIG.implementation === "html5-qrcode") {
    return import("./hooks/useHtml5QrcodeScanner").then(
      (m) => m.useHtml5QrcodeScanner,
    );
  }
  return import("./hooks/useZXingScanner").then((m) => m.useZXingScanner);
}
