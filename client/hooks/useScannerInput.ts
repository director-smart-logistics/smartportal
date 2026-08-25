/**
 * Scanner Input Hook - NON-INTRUSIVE barcode scanner support
 *
 * DESIGN PRINCIPLE: Never interfere with normal keyboard usage.
 *
 * This hook ONLY intercepts scanner input when:
 * 1. The active element is NOT an input/textarea (scanner firing at body/div)
 * 2. Rapid sequential keystrokes are detected (< 30ms = definitely a scanner)
 *
 * Normal keyboard typing in ANY input field is NEVER blocked.
 *
 * USAGE:
 * ```tsx
 * // Just add data-scanner-input="true" to your input
 * <input data-scanner-input="true" ... />
 * ```
 *
 * Ported from smart-portal-2/hooks/useScannerInput.ts
 * Compatible with Inatek USB barcode scanners (HID keyboard-wedge mode)
 *
 * @module hooks/useScannerInput
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface ScannerInputOptions {
  /** Callback when a complete scan is detected */
  onScan: (value: string) => void;
  /** Minimum characters to trigger a scan (default: 6) */
  minLength?: number;
  /** Maximum time between keystrokes to detect scanner (default: 30ms - very fast, definitely scanner) */
  maxKeystrokeDelay?: number;
  /** Time to wait after last keystroke before processing (default: 150ms) */
  debounceMs?: number;
  /** Whether the scanner input is enabled (default: true) */
  enabled?: boolean;
  /** Auto-clear the input after scan (default: false) */
  autoClear?: boolean;
  /** Delay before auto-clear in ms (default: 3000) */
  autoClearDelay?: number;
}

export interface ScannerInputResult {
  /** Ref to attach to the scanner input element */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Current scan buffer (characters being accumulated) */
  scanBuffer: string;
  /** Whether a scan is currently in progress */
  isScanning: boolean;
  /** Manually clear the scan buffer */
  clearBuffer: () => void;
  /** Last completed scan value */
  lastScan: string | null;
}

// Global scanner state - only used when scanner fires at non-input elements
let globalScannerBuffer = '';
let globalLastKeystrokeTime = 0;
let globalScanTimeout: ReturnType<typeof setTimeout> | null = null;
let consecutiveFastKeystrokes = 0;

// Check if element is an input-like element
function isInputElement(el: Element | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    el.hasAttribute('contenteditable') ||
    el.closest('[contenteditable]') !== null
  );
}

export function useScannerInput(options: ScannerInputOptions): ScannerInputResult {
  const {
    onScan,
    minLength = 6,
    maxKeystrokeDelay = 30,
    debounceMs = 150,
    enabled = true,
    autoClear = false,
    autoClearDelay = 3000,
  } = options;

  const inputRef = useRef<HTMLInputElement>(null);
  const [scanBuffer, setScanBuffer] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const clearBuffer = useCallback(() => {
    setScanBuffer('');
    globalScannerBuffer = '';
    consecutiveFastKeystrokes = 0;
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  const processScan = useCallback(
    (value: string) => {
      if (value.length >= minLength) {
        setLastScan(value);
        setIsScanning(false);
        onScanRef.current(value);
        if (autoClear) {
          setTimeout(clearBuffer, autoClearDelay);
        }
      }
      consecutiveFastKeystrokes = 0;
    },
    [minLength, autoClear, autoClearDelay, clearBuffer]
  );

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process printable characters, ignore modifiers
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      const activeElement = document.activeElement;
      const isInInput = isInputElement(activeElement);

      // CRITICAL: If user is in ANY input field, DO NOT interfere
      if (isInInput) {
        if (performance.now() - globalLastKeystrokeTime > 100) {
          consecutiveFastKeystrokes = 0;
          globalScannerBuffer = '';
        }
        return;
      }

      // User is NOT in an input - this might be scanner firing at body/document
      const now = performance.now();
      const timeSinceLastKeystroke = now - globalLastKeystrokeTime;
      globalLastKeystrokeTime = now;

      if (timeSinceLastKeystroke < maxKeystrokeDelay) {
        consecutiveFastKeystrokes++;
      } else {
        consecutiveFastKeystrokes = 1;
        globalScannerBuffer = '';
      }

      // Need at least 3 consecutive fast keystrokes to confirm it's a scanner
      if (consecutiveFastKeystrokes >= 3) {
        e.preventDefault();
        e.stopPropagation();

        globalScannerBuffer += e.key;
        setScanBuffer(globalScannerBuffer);
        setIsScanning(true);

        // Find and focus the nearest scanner input (data-scanner-input="true")
        const scannerInput = document.querySelector(
          '[data-scanner-input="true"]'
        ) as HTMLInputElement | null;
        if (scannerInput && scannerInput !== document.activeElement) {
          scannerInput.focus();
          scannerInput.value = globalScannerBuffer;
          scannerInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (globalScanTimeout) clearTimeout(globalScanTimeout);
        globalScanTimeout = setTimeout(() => {
          const finalValue = globalScannerBuffer.trim().toUpperCase();
          if (finalValue.length >= minLength) {
            processScan(finalValue);
          }
          globalScannerBuffer = '';
          globalScanTimeout = null;
          setIsScanning(false);
        }, debounceMs);
      } else if (consecutiveFastKeystrokes >= 1) {
        globalScannerBuffer += e.key;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Enter key finalizes scan immediately
      if (e.key === 'Enter' && globalScannerBuffer.length >= minLength) {
        if (globalScanTimeout) {
          clearTimeout(globalScanTimeout);
          globalScanTimeout = null;
        }
        const finalValue = globalScannerBuffer.trim().toUpperCase();
        globalScannerBuffer = '';
        processScan(finalValue);
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
      if (globalScanTimeout) clearTimeout(globalScanTimeout);
    };
  }, [enabled, maxKeystrokeDelay, debounceMs, minLength, processScan]);

  return { inputRef, scanBuffer, isScanning, clearBuffer, lastScan };
}

/**
 * Simple utility to check if current input is from a barcode scanner
 * based on typing speed
 */
export function isScannerInput(keystrokeDelay: number): boolean {
  return keystrokeDelay < 50;
}

export default useScannerInput;
