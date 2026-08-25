import { memo } from "react";
import { motion } from "framer-motion";

export interface NovaProcessingIndicatorProps {
  text: string;
}

export const NovaProcessingIndicator = memo(function NovaProcessingIndicator({
  text,
}: NovaProcessingIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border-t bg-border/40 p-4"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-3 py-4">
          <ProcessingDots />
          <span className="text-sm text-muted-foreground">{text}</span>
        </div>
      </div>
    </motion.div>
  );
});

const ProcessingDots = memo(function ProcessingDots() {
  return (
    <div className="flex space-x-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-primary rounded-full"
          animate={{ y: [0, -8, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
});
