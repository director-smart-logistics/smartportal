// TypeScript declarations for experimental BarcodeDetector API
// See: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector

interface BarcodeDetectorOptions {
  formats?: string[];
}

interface Point2D {
  x: number;
  y: number;
}

interface BarcodeDetectorResult {
  boundingBox: DOMRectReadOnly;
  cornerPoints: Point2D[];
  format: string;
  rawValue: string;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(image: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
  static getSupportedFormats(): Promise<string[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
