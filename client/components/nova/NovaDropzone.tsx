import { useCallback, useState, useRef, useEffect } from "react";
import {
  Paperclip,
  FileSpreadsheet,
  X,
  ArrowUp,
  Sparkles,
  Send,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type InputMode = "dropzone" | "text";

export interface AIQuestion {
  id: string;
  question: string;
  placeholder?: string;
  context?: string;
}

export interface NovaDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  onTextSubmit?: (text: string, questionId?: string) => void;
  mode?: InputMode;
  aiQuestion?: AIQuestion | null;
  disabled?: boolean;
  acceptedTypes?: string[];
  maxFiles?: number;
  className?: string;
  minimal?: boolean;
}

const DEFAULT_ACCEPTED_TYPES = [
  ".xlsx",
  ".xls",
  ".csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

export function NovaDropzone({
  onFilesSelected,
  onTextSubmit,
  mode = "dropzone",
  aiQuestion = null,
  disabled = false,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxFiles = 5,
  className,
  minimal = false,
}: NovaDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Focus text input when switching to text mode
  useEffect(() => {
    if (mode === "text" && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [mode, aiQuestion]);

  const isValidFile = useCallback(
    (file: File) => {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
      return acceptedTypes.some(
        (type) => type === extension || type === file.type,
      );
    },
    [acceptedTypes],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files).filter(isValidFile);
      if (droppedFiles.length > 0) {
        const filesToAdd = droppedFiles.slice(
          0,
          maxFiles - selectedFiles.length,
        );
        const newFiles = [...selectedFiles, ...filesToAdd].slice(0, maxFiles);
        setSelectedFiles(newFiles);
      }
    },
    [disabled, isValidFile, maxFiles, selectedFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled || !e.target.files) return;

      const inputFiles = Array.from(e.target.files).filter(isValidFile);
      if (inputFiles.length > 0) {
        const filesToAdd = inputFiles.slice(0, maxFiles - selectedFiles.length);
        const newFiles = [...selectedFiles, ...filesToAdd].slice(0, maxFiles);
        setSelectedFiles(newFiles);
      }

      e.target.value = "";
    },
    [disabled, isValidFile, maxFiles, selectedFiles],
  );

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleProcessFiles = useCallback(() => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
      setSelectedFiles([]);
    }
  }, [selectedFiles, onFilesSelected]);

  const handleAttachClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleTextSubmit = useCallback(() => {
    if (textInput.trim() && onTextSubmit) {
      onTextSubmit(textInput.trim(), aiQuestion?.id);
      setTextInput("");
    }
  }, [textInput, onTextSubmit, aiQuestion]);

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleTextSubmit();
      }
    },
    [handleTextSubmit],
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn("w-full", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes.join(",")}
        multiple
        onChange={handleFileInput}
        disabled={disabled}
        className="hidden"
        aria-label="Seleccionar archivos"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl transition-all duration-300",
          "bg-muted/50 border border-border/50",
          "shadow-sm",
          isDragOver &&
            "border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.01]",
          !isDragOver && "hover:border-border hover:bg-muted/80",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <AnimatePresence>
          {selectedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 border-b border-border/50"
            >
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((file, index) => (
                  <motion.div
                    key={`${file.name}-${index}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border text-sm"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                    <span className="text-foreground">{file.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-0.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {mode === "text" ? (
            <motion.div
              key="text-mode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-2"
            >
              {/* AI Question Context */}
              {aiQuestion && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-2 px-2"
                >
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <MessageSquare className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {aiQuestion.question}
                      </p>
                      {aiQuestion.context && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {aiQuestion.context}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="flex items-center gap-2">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="p-2.5 rounded-xl text-primary"
                >
                  <MessageSquare className="h-5 w-5" />
                </motion.div>

                <input
                  ref={textInputRef}
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleTextKeyDown}
                  placeholder={
                    aiQuestion?.placeholder || "Escribe tu respuesta..."
                  }
                  disabled={disabled}
                  className={cn(
                    "flex-1 py-2.5 px-3 bg-transparent text-sm text-foreground",
                    "placeholder:text-muted-foreground",
                    "focus:outline-none",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                />

                <motion.button
                  type="button"
                  onClick={handleTextSubmit}
                  disabled={disabled || !textInput.trim()}
                  whileHover={{ scale: textInput.trim() ? 1.05 : 1 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "p-2.5 rounded-xl transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    textInput.trim()
                      ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                  aria-label="Enviar respuesta"
                >
                  <Send className="h-5 w-5" />
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dropzone-mode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 p-2"
            >
              <motion.button
                type="button"
                onClick={handleAttachClick}
                disabled={disabled}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "p-2.5 rounded-xl transition-colors",
                  "text-muted-foreground hover:text-foreground hover:bg-background",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  disabled && "pointer-events-none",
                )}
                aria-label="Adjuntar archivos"
              >
                <Paperclip className="h-5 w-5" />
              </motion.button>

              <div
                onClick={handleAttachClick}
                className="flex-1 py-2.5 px-1 cursor-pointer"
              >
                <AnimatePresence mode="wait">
                  {selectedFiles.length === 0 ? (
                    <motion.p
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-muted-foreground"
                    >
                      Arrastra archivos o haz clic para adjuntar...
                    </motion.p>
                  ) : (
                    <motion.p
                      key="selected"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-foreground"
                    >
                      {selectedFiles.length} archivo
                      {selectedFiles.length > 1 ? "s" : ""} listo
                      {selectedFiles.length > 1 ? "s" : ""}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                type="button"
                onClick={handleProcessFiles}
                disabled={disabled || selectedFiles.length === 0}
                whileHover={{ scale: selectedFiles.length > 0 ? 1.05 : 1 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "p-2.5 rounded-xl transition-all duration-200",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  selectedFiles.length > 0
                    ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
                aria-label="Procesar archivos"
              >
                {selectedFiles.length > 0 ? (
                  <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: [0, -10, 10, 0] }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      repeatDelay: 2,
                    }}
                  >
                    <Sparkles className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <ArrowUp className="h-5 w-5" />
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
