import { Button } from "@/components/ui/button";
import {
  Camera,
  FlashlightIcon,
  FlashlightOff,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

interface ScannerControlsProps {
  onCapture: () => void;
  onToggleTorch?: () => void;
  onReset?: () => void;
  isScanning: boolean;
  disabled?: boolean;
}

export function ScannerControls({
  onCapture,
  onToggleTorch,
  onReset,
  isScanning,
  disabled = false,
}: ScannerControlsProps) {
  const [torchEnabled, setTorchEnabled] = useState(false);

  const handleToggleTorch = () => {
    setTorchEnabled(!torchEnabled);
    onToggleTorch?.();
  };

  return (
    <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-6 px-4">
      {/* Torch Button */}
      {onToggleTorch && (
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleToggleTorch}
            disabled={disabled || !isScanning}
            className="w-14 h-14 rounded-full bg-black/60 border-white/20 hover:bg-black/80 backdrop-blur-sm"
          >
            {torchEnabled ? (
              <FlashlightIcon className="w-6 h-6 text-yellow-400" />
            ) : (
              <FlashlightOff className="w-6 h-6 text-white/80" />
            )}
          </Button>
        </motion.div>
      )}

      {/* Main Capture Button */}
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          type="button"
          size="icon"
          onClick={onCapture}
          disabled={disabled || !isScanning}
          className="w-20 h-20 rounded-full bg-primary hover:bg-primary/90 border-4 border-white/30 shadow-lg"
        >
          <Camera className="w-8 h-8" />
        </Button>
      </motion.div>

      {/* Reset Button */}
      {onReset && (
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onReset}
            disabled={disabled}
            className="w-14 h-14 rounded-full bg-black/60 border-white/20 hover:bg-black/80 backdrop-blur-sm"
          >
            <RotateCcw className="w-6 h-6 text-white/80" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
