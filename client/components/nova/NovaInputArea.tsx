import { memo } from "react";
import { motion } from "framer-motion";
import { NovaDropzone } from "./NovaDropzone";

export interface NovaInputAreaProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

export const NovaInputArea = memo(function NovaInputArea({
  onFilesSelected,
  isProcessing,
}: NovaInputAreaProps) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="border-t bg-border/40 p-4"
    >
      <div className="max-w-4xl mx-auto">
        <NovaDropzone
          onFilesSelected={onFilesSelected}
          disabled={isProcessing}
          className="max-w-none"
        />
      </div>
    </motion.div>
  );
});
