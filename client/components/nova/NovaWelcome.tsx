import { memo, useState, useEffect } from "react";
import { Sparkles, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { NovaDropzone } from "./NovaDropzone";

export interface Feature {
  key: string;
  label: string;
}

export interface NovaWelcomeProps {
  title: string;
  message: string;
  features: Feature[];
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

const ROTATING_TEXTS = [
  "Procesa novas con IA",
  "Verifica nombres automáticamente",
  "Calcula precios al instante",
  "Exporta a CSV en segundos",
];

export const NovaWelcome = memo(function NovaWelcome({
  onFilesSelected,
  isProcessing,
}: NovaWelcomeProps) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prev) => (prev + 1) % ROTATING_TEXTS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <motion.div
        className="flex flex-col items-center justify-center space-y-12 w-full max-w-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        {/* Minimal AI Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">
            Potenciado por IA
          </span>
        </motion.div>

        {/* Animated Text Slider */}
        <div className="text-center space-y-4">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-5xl font-bold text-foreground tracking-tight"
          >
            Novas
          </motion.h1>

          <div className="h-8 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={currentTextIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="text-lg text-muted-foreground"
              >
                {ROTATING_TEXTS[currentTextIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress Dots */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {ROTATING_TEXTS.map((_, idx) => (
              <motion.div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentTextIndex
                    ? "w-6 bg-primary"
                    : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Minimal Dropzone */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <NovaDropzone
            onFilesSelected={onFilesSelected}
            disabled={isProcessing}
          />
        </motion.div>

        {/* Subtle Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-xs text-muted-foreground/60 flex items-center gap-2"
        >
          <Upload className="h-3 w-3" />
          Arrastra archivos Excel o CSV
        </motion.p>
      </motion.div>
    </div>
  );
});
