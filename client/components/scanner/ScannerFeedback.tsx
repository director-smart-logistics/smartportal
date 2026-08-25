import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScannerState =
  | "idle"
  | "scanning"
  | "processing"
  | "success"
  | "error";

interface ScannerFeedbackProps {
  state: ScannerState;
  detectedBarcodes: number;
  focusQuality: number;
  distance: number;
  zone: string;
}

export function ScannerFeedback({
  state,
  detectedBarcodes,
  focusQuality,
  distance,
  zone,
}: ScannerFeedbackProps) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Scanning Frame */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Animated corner brackets */}
        {renderCornerBrackets(focusQuality, state)}
      </svg>

      {/* Status Bar */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
        {/* Barcode Count */}
        <AnimatePresence>
          {detectedBarcodes > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center gap-2 bg-green-500/20 border border-green-500 rounded-full px-3 py-1.5 backdrop-blur-sm"
            >
              <span className="flex items-center justify-center w-6 h-6 bg-green-500 text-black rounded-full text-xs font-bold">
                {detectedBarcodes}
              </span>
              <span className="text-xs text-green-100 font-medium">
                {detectedBarcodes === 1 ? "code" : "codes"} detected
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Distance & Zone Info */}
        <div className="flex flex-col items-end gap-2">
          <div className="bg-black/60 border border-white/20 rounded-lg px-3 py-1.5 backdrop-blur-sm">
            <div className="text-xs text-white/80">Distance:</div>
            <div className="text-sm font-bold text-white">{distance}cm</div>
          </div>

          <div
            className={cn(
              "px-2 py-1 rounded text-xs font-medium backdrop-blur-sm",
              getZoneStyle(zone),
            )}
          >
            {zone}
          </div>
        </div>
      </div>

      {/* Focus Quality Indicator - Top */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-48">
        {focusQuality < 0.5 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-xs text-white font-normal"
          >
            Move device slowly back for better focus
          </motion.div>
        )}
      </div>

      {/* Processing Animation */}
      <AnimatePresence>
        {state === "processing" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-4">
              {/* Pulse Rings */}
              <div className="relative w-24 h-24">
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 border-2 border-primary rounded-full"
                    animate={{
                      scale: [1, 2, 3],
                      opacity: [0.6, 0.3, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      delay: i * 0.2,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                ))}
                <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-primary animate-spin" />
              </div>

              <div className="text-white text-lg font-medium">
                Analyzing label...
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Feedback - Removed, using green corner brackets instead */}

      {/* Error Feedback */}
      <AnimatePresence>
        {state === "error" && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            className="absolute inset-0 bg-red-500/20 flex items-center justify-center backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3">
              <AlertTriangle
                className="w-16 h-16 text-red-500"
                strokeWidth={2.5}
              />
              <div className="text-white text-xl font-bold">Scan Failed</div>
              <div className="text-white/80 text-sm">Please try again</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Render animated corner brackets
 */
function renderCornerBrackets(focusQuality: number, state: ScannerState) {
  // Green when success, orange otherwise
  const color = state === "success" ? "#22c55e" : "#f59e0b";
  const cornerSize = 8;
  const strokeWidth = 0.5;

  const corners = [
    { x: 20, y: 30, rotate: 0 }, // Top-left
    { x: 80, y: 30, rotate: 90 }, // Top-right
    { x: 80, y: 70, rotate: 180 }, // Bottom-right
    { x: 20, y: 70, rotate: 270 }, // Bottom-left
  ];

  return corners.map((corner, i) => (
    <motion.g
      key={i}
      transform={`translate(${corner.x}, ${corner.y}) rotate(${corner.rotate})`}
      initial={{ opacity: 0.5 }}
      animate={{
        opacity: state === "scanning" ? 1 : 0.5,
      }}
    >
      <path
        d={`M-${cornerSize},0 L0,0 L0,-${cornerSize}`}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
    </motion.g>
  ));
}

/**
 * Get focus bar color
 */
function getFocusColor(quality: number): string {
  if (quality > 0.7) return "#22c55e";
  if (quality > 0.4) return "#f59e0b";
  return "#ef4444";
}

/**
 * Get zone badge styling
 */
function getZoneStyle(zone: string): string {
  const styles: Record<string, string> = {
    MACRO: "bg-orange-500/20 border border-orange-500 text-orange-100",
    CLOSE: "bg-yellow-500/20 border border-yellow-500 text-yellow-100",
    OPTIMAL: "bg-green-500/20 border border-green-500 text-green-100",
    FAR: "bg-blue-500/20 border border-blue-500 text-blue-100",
    EXTREME: "bg-purple-500/20 border border-purple-500 text-purple-100",
  };

  return styles[zone] || "bg-gray-500/20 border border-gray-500 text-gray-100";
}
