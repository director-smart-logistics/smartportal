import { useState, useRef, useEffect, useCallback } from 'react';
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { useLocale } from "@/hooks/useLocale";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScanLine, Camera, RotateCcw, Pause, Play, Package2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from "@/hooks/use-toast";
import { useHtml5QrcodeScanner } from '@/components/scanner/hooks/useHtml5QrcodeScanner';
import { useNativeBarcodeDetector } from '@/components/scanner/hooks/useNativeBarcodeDetector';
import { useDistanceDetection } from '@/components/scanner/hooks/useDistanceDetection';
import { useScannerAudio } from '@/components/scanner/hooks/useScannerAudio';
import { ScannerFeedback, type ScannerState } from '@/components/scanner/ScannerFeedback';
import { scannerAPI, type ScanResult, type PackageMatch } from '@/lib/api/scanner';
import { cn } from '@/lib/utils';

export default function Scanner() {
  const { t } = useLocale(['scanner', 'common']);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [matchedPackage, setMatchedPackage] = useState<PackageMatch | null>(null);
  const [autoCaptureCountdown, setAutoCaptureCountdown] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmingIntake, setConfirmingIntake] = useState(false);
  const autoCaptureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Scanner is always visible - no welcome screen

  // Initialize scanner hooks
  const scanner = useHtml5QrcodeScanner();
  const nativeDetector = useNativeBarcodeDetector(videoRef.current);
  const distance = useDistanceDetection(videoRef.current);
  const audio = useScannerAudio();

  // Use native detector if supported, fallback to html5-qrcode
  const detectedCodes = nativeDetector.isSupported 
    ? nativeDetector.detectedBarcodes.map(b => ({ text: b.rawValue, format: b.format, timestamp: Date.now() }))
    : scanner.detectedCodes;

  /**
   * Start scanning session
   */
  const startScanningSession = useCallback(async () => {
    if (!videoRef.current) {
      console.error('[Scanner Page] Video element not ready');
      return;
    }

    console.log('[Scanner Page] Requesting camera access...');

    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(t("cameraApiNotSupported"));
      }

      // Check if we're on HTTPS or localhost
      const isSecureContext = window.isSecureContext;
      if (!isSecureContext) {
        console.warn('[Scanner Page] Not in secure context (HTTPS), camera may not work');
      }

      // Check current permission status if available
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log('[Scanner Page] Camera permission status:', permissionStatus.state);
          
          if (permissionStatus.state === 'denied') {
            throw new Error(t("cameraPermissionDeniedReset"));
          }
        } catch (permErr) {
          // Permission API might not support camera on some browsers, continue anyway
          console.log('[Scanner Page] Permission API not available or failed:', permErr);
        }
      }

      // Request camera permission and start scanning
      console.log('[Scanner Page] Calling scanner.startScanning...');
      await scanner.startScanning(videoRef.current);
      
      // Start native detector if supported
      if (nativeDetector.isSupported) {
        console.log('[Scanner Page] Starting native BarcodeDetector...');
        nativeDetector.startDetection();
      }
      
      setScannerState('scanning');
      console.log('[Scanner Page] Camera access granted, scanning started');
    } catch (error) {
      console.error('[Scanner Page] Camera access error:', error);
      
      // Provide specific error messages
      let errorMessage = t("failedToAccessCamera");
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = t("cameraPermissionDenied");
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage = t("noCameraFound");
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage = t("cameraInUse");
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: t("cameraError"),
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [scanner, toast]);

  // Auto-start scanner when component mounts and video element is ready
  useEffect(() => {
    if (videoRef.current && !scanner.isScanning) {
      console.log('[Scanner Page] Scanner opened, video element:', {
        element: !!videoRef.current,
        width: videoRef.current?.clientWidth,
        height: videoRef.current?.clientHeight
      });
      
      // Ensure video element is visible and has dimensions
      if (videoRef.current.clientWidth === 0 || videoRef.current.clientHeight === 0) {
        console.warn('[Scanner Page] Video element has no dimensions yet, waiting...');
      }
      
      // Wait for video element to be properly mounted and visible
      const timer = setTimeout(() => {
        console.log('[Scanner Page] Starting camera session...');
        startScanningSession();
      }, 300); // Allow time for layout to complete
      
      return () => {
        console.log('[Scanner Page] Cleaning up initialization timer');
        clearTimeout(timer);
      };
    }
  }, [startScanningSession, scanner.isScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[Scanner Page] Component unmounting, stopping scanner');
      if (scanner.isScanning) {
        scanner.stopScanning();
      }
      if (nativeDetector.isDetecting) {
        nativeDetector.stopDetection();
      }
    };
  }, [scanner.isScanning, nativeDetector.isDetecting]);

  /**
   * Capture and process label
   */
  const handleCapture = useCallback(async () => {
    console.log('[Scanner Page] ========== CAPTURE STARTED ==========');
    console.log('[Scanner Page] Scanner state:', {
      isScanning: scanner.isScanning,
      detectedCodes: detectedCodes.length,
      distance: distance.distance.distance,
      zone: distance.distance.zone
    });
    
    if (!scanner.isScanning) {
      console.error('[Scanner Page] Cannot capture - scanner not active');
      toast({
        title: t("scannerNotReady"),
        description: t("waitForCameraInit"),
        variant: 'destructive',
      });
      return;
    }

    setScannerState('processing');
    audio.playSound('focus');

    // Safety timeout - reset if stuck for more than 30 seconds
    const timeoutId = setTimeout(() => {
      console.error('[Scanner Page] ⚠️ Capture timeout - resetting scanner');
      setScannerState('scanning');
      toast({
        title: t("processingTimeout"),
        description: t("operationTimeout"),
        variant: 'destructive',
      });
    }, 30000);

    try {
      // Capture high-quality image
      console.log('[Scanner Page] [1/3] Capturing image from video stream...');
      const image = await scanner.captureImage();
      console.log('[Scanner Page] ✓ Image captured successfully:', {
        size: image.size,
        type: image.type
      });

      // Send to backend for AI enhancement
      console.log('[Scanner Page] [2/3] Sending to backend API...');
      
      // Extract just the text from detected codes
      const barcodes = detectedCodes.map(code => code.text);
      console.log('[Scanner Page] Barcodes to send:', barcodes);
      
      const result = await scannerAPI.parseLabel(
        barcodes,
        image,
        distance.distance.distance,
        distance.distance.zone
      );

      console.log('[Scanner Page] ✓ Backend response received:', result);
      setScanResult(result);

      // Check if we have valid tracking data
      const hasValidTracking = result.trackingNumber && 
        result.trackingNumber !== 'Unknown' && 
        result.trackingNumber !== 'Error' &&
        result.carrier !== 'Unknown' &&
        result.success !== false &&
        result.confidence > 0.3;

      console.log('[Scanner Page] [3/3] Processing result...');

      if (hasValidTracking) {
        console.log('[Scanner Page] ✓ Valid tracking data detected');
        // Try to match with existing package
        try {
          // Get user agent
          const userAgent = navigator.userAgent;
          
          // Prepare scan data payload
          const scanData = {
            carrier: result.carrier,
            confidence: result.confidence,
            extractionMethod: result.metadata?.extractionMethod,
            distance: distance.distance.distance,
            processingTime: result.metadata?.processingTime,
            userId: user?.id,
            userAgent: userAgent,
            metadata: {
              detectedBarcodes: detectedCodes.map(code => code.text),
              focusQuality: scanner.focusQuality,
              zone: distance.distance.zone,
            },
          };
          
          console.log('[Scanner Page] Sending match request with data:', {
            trackingNumber: result.trackingNumber,
            ...scanData
          });
          
          const match = await scannerAPI.matchPackage(
            result.trackingNumber,
            scanData
          );
          setMatchedPackage(match);
          console.log('[Scanner Page] Package match result:', match);
          
          // Show confirmation dialog if package needs intake confirmation
          if (match.found && match.needsConfirmation) {
            setShowConfirmDialog(true);
          }
        } catch (error) {
          console.warn('[Scanner Page] Package match failed:', error);
          // Don't fail the whole scan if package matching fails
        }

        clearTimeout(timeoutId);
        setScannerState('success');
        audio.playSound('success');

        console.log('[Scanner Page] ========== CAPTURE COMPLETE (SUCCESS) ==========');

        // Reset to scanning after brief success display
        setTimeout(() => {
          console.log('[Scanner Page] Resetting for next scan');
          setScannerState('scanning');
        }, 2000);
      } else {
        // Low confidence or no data extracted
        console.log('[Scanner Page] ⚠️ Low confidence or invalid tracking data');
        console.log('[Scanner Page] Result details:', {
          trackingNumber: result.trackingNumber,
          carrier: result.carrier,
          confidence: result.confidence,
          success: result.success
        });
        
        clearTimeout(timeoutId);
        setScannerState('error');
        audio.playSound('error');

        toast({
          title: t("lowConfidence"),
          description: t("lowConfidenceDescription"),
          variant: 'destructive',
        });

        console.log('[Scanner Page] ========== CAPTURE COMPLETE (LOW CONFIDENCE) ==========');

        // Reset to scanning after brief delay
        setTimeout(() => {
          setScannerState('scanning');
        }, 2000);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[Scanner Page] ========== CAPTURE FAILED ==========');
      console.error('[Scanner Page] Error details:', error);
      console.error('[Scanner Page] Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      setScannerState('error');
      audio.playSound('error');

      // Friendly error message - keep scanner open
      const errorMessage = error instanceof Error ? error.message : t("failedToProcessLabel");
      const isApiNotFound = errorMessage.includes('404') || errorMessage.includes('Not Found');

      toast({
        title: isApiNotFound ? t("apiNotAvailable") : t("processingFailed"),
        description: isApiNotFound 
          ? t("apiNotAvailableDescription")
          : t("tryAgainOrAdjust"),
        variant: 'destructive',
      });
      
      // Stay in scanning state - don't close scanner
      setTimeout(() => {
        setScannerState('scanning');
      }, 2000);
    }
  }, [scanner, detectedCodes, distance.distance.distance, distance.distance.zone, audio, toast, t, nativeDetector]);

  // Auto-capture after 0.1 seconds when barcodes detected
  useEffect(() => {
    // Clear any existing timers
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Only auto-capture if:
    // 1. Scanner is in scanning state (not processing/error/success)
    // 2. Barcodes are detected
    // 3. Scanner is actively running
    // 4. Camera is not paused
    if (scannerState === 'scanning' && detectedCodes.length > 0 && scanner.isScanning && !isPaused) {
      console.log('[Scanner Page] 🎯 Barcodes detected, auto-capture in 0.1 seconds...');
      
      // Start countdown from 0.1 seconds
      let remaining = 0.1;
      setAutoCaptureCountdown(remaining);
      
      // Capture after 0.1 seconds (100ms)
      autoCaptureTimerRef.current = setTimeout(() => {
        console.log('[Scanner Page] ⚡ Auto-capturing now!');
        setAutoCaptureCountdown(null);
        handleCapture();
      }, 100);
    } else {
      // Clear countdown when no barcodes
      setAutoCaptureCountdown(null);
    }

    // Cleanup timers on unmount or when dependencies change
    return () => {
      if (autoCaptureTimerRef.current) {
        clearTimeout(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setAutoCaptureCountdown(null);
    };
  }, [scannerState, detectedCodes.length, scanner.isScanning, isPaused, handleCapture]);

  // Note: Autofocus is disabled - camera uses manual focus mode
  // No dynamic focus updates needed

  /**
   * Reset scanner
   */
  const handleReset = useCallback(() => {
    console.log('[Scanner Page] Resetting scanner...');
    
    // Clear auto-capture timers
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoCaptureCountdown(null);
    
    // Clear detected codes and results
    if (nativeDetector.isSupported) {
      nativeDetector.clearBarcodes();
    } else {
      scanner.clearDetectedCodes();
    }
    setScanResult(null);
    setMatchedPackage(null);
    setScannerState('scanning');
    setIsPaused(false);
    
    console.log('[Scanner Page] Scanner reset');
  }, [nativeDetector, scanner]);

  /**
   * Pause/Resume camera
   */
  const handlePause = useCallback(() => {
    if (isPaused) {
      // Resume scanning
      console.log('[Scanner Page] Resuming camera...');
      if (nativeDetector.isSupported) {
        nativeDetector.startDetection();
      }
      setIsPaused(false);
    } else {
      // Pause scanning
      console.log('[Scanner Page] Pausing camera...');
      if (nativeDetector.isSupported) {
        nativeDetector.stopDetection();
      }
      // Clear auto-capture timers when pausing
      if (autoCaptureTimerRef.current) {
        clearTimeout(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setAutoCaptureCountdown(null);
      setIsPaused(true);
    }
  }, [isPaused, nativeDetector]);

  /**
   * Confirm package intake
   */
  const handleConfirmIntake = useCallback(async () => {
    if (!matchedPackage?.package?.id) {
      console.error('[Scanner Page] No package to confirm');
      return;
    }

    try {
      setConfirmingIntake(true);
      console.log('[Scanner Page] Confirming intake for package:', matchedPackage.package.id);

      const result = await scannerAPI.confirmIntake(matchedPackage.package.id);
      
      console.log('[Scanner Page] ✓ Package intake confirmed:', result);
      
      // Update matched package with new status
      setMatchedPackage({
        ...matchedPackage,
        package: {
          ...matchedPackage.package,
          status: 'intake',
        },
      });

      setShowConfirmDialog(false);
      
      toast({
        title: t("packageIntakeConfirmed"),
        description: `${matchedPackage.package.trackingNumber} ${t("packageIntakeConfirmedDescription")}`,
      });
    } catch (error) {
      console.error('[Scanner Page] Failed to confirm intake:', error);
      toast({
        title: t("errorTitle"),
        description: t("failedToConfirmIntake"),
        variant: "destructive",
      });
    } finally {
      setConfirmingIntake(false);
    }
  }, [matchedPackage, toast]);

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 p-4 md:p-6"
      >
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-2"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ScanLine className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {t("title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Scanner - Always Visible */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
              <Card className="p-4 md:p-6">
                {/* Full-Width Video Feed */}
                <div 
                  className="relative bg-black rounded-lg overflow-hidden w-full max-w-2xl mx-auto aspect-video"
                  data-testid="scanner-video-container"
                >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      className="w-full h-full object-cover"
                      aria-label="Camera feed for barcode scanning"
                      data-testid="scanner-video-feed"
                      onLoadedMetadata={() => console.log('[Video] Metadata loaded')}
                      onCanPlay={() => console.log('[Video] Can play')}
                      onError={(e) => console.error('[Video] Error:', e)}
                    />

                    {/* Scanner Feedback Overlay */}
                    <ScannerFeedback
                      state={scannerState}
                      detectedBarcodes={detectedCodes.length}
                      focusQuality={scanner.focusQuality}
                      distance={distance.distance.distance}
                      zone={distance.distance.zone}
                    />

                    {/* Camera Permission Overlay */}
                    {scannerState === 'idle' && !scanner.isScanning && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center"
                      >
                        <div className="text-center text-white max-w-sm px-6">
                          <div className="mb-4">
                            <ScanLine className="h-12 w-12 text-primary mx-auto" />
                          </div>
                          <h3 className="text-lg font-bold mb-2">{t("cameraAccessRequired")}</h3>
                          <p className="text-white/70 text-sm mb-4">
                            {t("allowCameraPermission")}
                          </p>
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex items-center justify-center gap-2 text-sm text-white/60">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              <span>{t("initializingCamera")}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                console.log('[Scanner Page] Manual retry triggered');
                                startScanningSession();
                              }}
                              className="mt-2 bg-white/10 hover:bg-white/20 text-white border-white/20"
                              aria-label="Retry camera access"
                              data-testid="scanner-retry-camera-button"
                            >
                              {t("retryCameraAccess")}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Simple Text Status */}
                    <AnimatePresence mode="wait">
                      {isPaused ? (
                        <motion.div
                          key="paused-status"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10"
                        >
                          <div className="text-center">
                            <div className="text-yellow-500 font-semibold text-base">
                              {t("cameraPaused")}
                            </div>
                          </div>
                        </motion.div>
                      ) : scannerState === 'scanning' && (
                        <motion.div
                          key="scanning-status"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10"
                        >
                          <div className="text-center">
                            {detectedCodes.length === 0 ? (
                              <div className="text-white font-normal text-sm">
                                {t("searchingForBarcodes")}
                              </div>
                            ) : autoCaptureCountdown !== null ? (
                              <div className="text-orange-500 font-bold text-lg">
                                {t("capturing")}
                              </div>
                            ) : (
                              <div className="text-white font-medium text-sm">
                                {detectedCodes.length} {detectedCodes.length > 1 ? t("barcodes") : t("barcode")} {t("detected")}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                      
                      {scannerState === 'success' && (
                        <motion.div
                          key="success-status"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10"
                        >
                          <div className="text-green-500 font-bold text-xl">
                            {t("scannedSuccessfully")}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                {/* Control Buttons Below Video */}
                <div className="mt-6">
                  <div className="max-w-2xl mx-auto">
                    {/* Tracking ID Input */}
                    <div className="mb-4">
                      <label 
                        htmlFor="tracking-id-input"
                        className="block text-sm font-medium mb-2"
                      >
                        {t("trackingId")}
                      </label>
                      <input
                        id="tracking-id-input"
                        type="text"
                        value={scanResult?.trackingNumber || ''}
                        readOnly
                        placeholder={t("waitingForScan")}
                        aria-label={t("trackingId")}
                        aria-readonly="true"
                        data-testid="scanner-tracking-input"
                        className="w-full px-4 py-4 bg-background border-2 border-input rounded-md text-2xl font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      {scanResult && scanResult.carrier !== 'Unknown' && (
                        <div 
                          className="mt-1.5 text-xs text-muted-foreground"
                          data-testid="scanner-carrier-info"
                          aria-live="polite"
                        >
                          {t("carrierLabel")}: <span className="font-medium">{scanResult.carrier}</span>
                          {scanResult.confidence && (
                            <span className="ml-2">• {t("confidenceLabel")}: {(scanResult.confidence * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Package Match Status */}
                    {matchedPackage && (
                      <div className="mb-4" data-testid="scanner-match-status">
                        {matchedPackage.found ? (
                          <div 
                            className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4"
                            role="status"
                            aria-live="polite"
                            data-testid="scanner-package-found"
                          >
                            <div className="flex items-start gap-3">
                              <Package2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
                                  {t("packageFound")}
                                </h3>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-green-700 dark:text-green-300">{t("customerLabel")}:</span>
                                    <span className="font-medium text-green-900 dark:text-green-100">
                                      {matchedPackage.package?.customerName}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-green-700 dark:text-green-300">{t("statusLabel")}:</span>
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-full text-xs font-medium",
                                      matchedPackage.package?.status === 'pending' 
                                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                    )}>
                                      {matchedPackage.package?.status}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-green-700 dark:text-green-300">{t("destinationLabel")}:</span>
                                    <span className="font-medium text-green-900 dark:text-green-100">
                                      {matchedPackage.package?.destination}
                                    </span>
                                  </div>
                                </div>
                                {matchedPackage.needsConfirmation && (
                                  <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                                    <p className="text-xs text-green-700 dark:text-green-300 italic">
                                      {t("confirmationRequired")}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4"
                            role="alert"
                            aria-live="assertive"
                            data-testid="scanner-package-not-found"
                          >
                            <div className="flex items-start gap-3">
                              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-1">
                                  {t("packageNotFound")}
                                </h3>
                                <p className="text-xs text-orange-700 dark:text-orange-300">
                                  {t("packageNotFoundDescription")}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-3">
                      {/* Capture Button - Full Width */}
                      <Button
                        onClick={handleCapture}
                        disabled={scannerState === 'processing' || !scanner.isScanning || autoCaptureCountdown !== null || isPaused}
                        variant="default"
                        className="w-full"
                        size="lg"
                        aria-label="Capture barcode image"
                        data-testid="scanner-capture-button"
                      >
                        <Camera className="mr-2 h-5 w-5" />
                        {autoCaptureCountdown !== null 
                          ? t("capturing")
                          : scannerState === 'processing' 
                          ? t("processing")
                          : t("capture")}
                      </Button>

                      {/* Secondary Buttons - 2 Column Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          onClick={handleReset}
                          disabled={scannerState === 'processing'}
                          className="w-full"
                          aria-label="Reset scanner"
                          data-testid="scanner-reset-button"
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {t("reset")}
                        </Button>

                        <Button
                          variant="outline"
                          onClick={handlePause}
                          disabled={scannerState === 'processing'}
                          className="w-full"
                          aria-label={isPaused ? t("resume") : t("pause")}
                          aria-pressed={isPaused}
                          data-testid="scanner-pause-button"
                        >
                          {isPaused ? (
                            <>
                              <Play className="mr-2 h-4 w-4" />
                              {t("resume")}
                            </>
                          ) : (
                            <>
                              <Pause className="mr-2 h-4 w-4" />
                              {t("pause")}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
        </motion.div>
      </motion.div>

      {/* Confirmation Dialog for Package Intake */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent data-testid="scanner-intake-confirmation-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              {t("confirmPackageIntake")}
            </DialogTitle>
            <DialogDescription>
              {t("packageFoundPendingDescription")}
            </DialogDescription>
          </DialogHeader>

          {matchedPackage?.package && (
            <div className="space-y-3 py-4">
              <div 
                className="bg-muted/50 p-4 rounded-lg space-y-2"
                data-testid="scanner-package-details"
              >
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("trackingNumberLabel")}:</span>
                  <span className="font-mono font-medium">{matchedPackage.package.trackingNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("customerLabel")}:</span>
                  <span className="font-medium">{matchedPackage.package.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("currentStatusLabel")}:</span>
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                    {matchedPackage.package.status}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("destinationLabel")}:</span>
                  <span className="font-medium">{matchedPackage.package.destination}</span>
                </div>
              </div>

              <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <strong>{t("actionLabel")}:</strong> {t("updateStatusToIntake")} <strong>"{t("intakeStatus")}"</strong> {t("createTrackingHistory")}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={confirmingIntake}
              aria-label="Cancel intake confirmation"
              data-testid="scanner-cancel-intake-button"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmIntake}
              disabled={confirmingIntake}
              className="bg-primary"
              aria-label={t("confirmIntake")}
              aria-busy={confirmingIntake}
              data-testid="scanner-confirm-intake-button"
            >
              {confirmingIntake ? t("confirming") : t("confirmIntake")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
