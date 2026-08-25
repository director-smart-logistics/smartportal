import {
  useCallback,
  useRef,
  useState,
  useEffect,
  KeyboardEvent,
  memo,
} from "react";
import {
  Paperclip,
  ArrowUp,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const ACCEPTED_TYPES = [
  ".xlsx",
  ".xls",
  ".csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NovaComposerProps {
  /** Called when user attaches Excel/CSV files */
  onFilesSelected: (files: File[]) => void;
  /** Called when user submits a text message */
  onTextSubmit: (text: string) => void;
  /** Whether a manifest is currently being processed */
  isProcessing: boolean;
  /** Whether Nova agent is thinking */
  isThinking: boolean;
  /** Whether any conversation exists */
  hasConversation: boolean;
}

// ── Attached file pill ─────────────────────────────────────────────────────────

interface FilePillProps {
  file: File;
  onRemove: () => void;
}

function FilePill({ file, onRemove }: FilePillProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-lg px-2 py-0.5 text-xs text-primary max-w-[180px]"
    >
      <FileSpreadsheet className="h-3 w-3 shrink-0" />
      <span className="truncate font-medium text-[11px]">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 hover:text-destructive transition-colors ml-0.5"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ── Compact, Streamlined Nova Composer ─────────────────────────────────────────

export const NovaComposer = memo(function NovaComposer({
  onFilesSelected,
  onTextSubmit,
  isProcessing,
  isThinking,
  hasConversation,
}: NovaComposerProps) {
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const isDisabled = isProcessing || isThinking;
  const canSend =
    (text.trim().length > 0 || pendingFiles.length > 0) && !isDisabled;
  const prevThinkingRef = useRef(isThinking);

  // Auto-focus textarea when Nova finishes responding
  useEffect(() => {
    const wasThinking = prevThinkingRef.current;
    prevThinkingRef.current = isThinking;
    if (wasThinking && !isThinking) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isThinking]);

  useEffect(() => {
    if (!isProcessing && !isThinking) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isProcessing, isThinking]);

  // Auto-resize textarea with a compact min-height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 96)}px`;
  }, [text]);

  // ── File handling ────────────────────────────────────────────────────────────

  const isValidFile = useCallback((file: File) => {
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    return ACCEPTED_TYPES.some((t) => t === ext || t === file.type);
  }, []);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const valid = Array.from(incoming).filter(isValidFile);
      if (valid.length === 0) return;
      setPendingFiles((prev) => {
        const merged = [...prev, ...valid].slice(0, 5);
        return merged;
      });
    },
    [isValidFile],
  );

  const removeFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles],
  );

  const handleSend = useCallback(() => {
    if (!canSend) return;

    if (pendingFiles.length > 0) {
      onFilesSelected(pendingFiles);
      setPendingFiles([]);
    }

    if (text.trim().length > 0) {
      onTextSubmit(text.trim());
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "24px";
      }
    }
  }, [canSend, pendingFiles, text, onFilesSelected, onTextSubmit]);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Drag and drop ────────────────────────────────────────────────────────────

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDisabled) setIsDragOver(true);
    },
    [isDisabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!composerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isDisabled) return;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles, isDisabled],
  );

  return (
    <div className="w-full">
      {/* Composer box — Compact, single streamlined row */}
      <div
        ref={composerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col rounded-2xl bg-[#f0f4f9] dark:bg-zinc-800/90 border border-transparent shadow-xs transition-all duration-200",
          "focus-within:border-black/15 dark:focus-within:border-white/15 focus-within:shadow-md focus-within:bg-white dark:focus-within:bg-zinc-800",
          isDragOver && "border-primary/50 bg-primary/5 ring-2 ring-primary/20",
          isDisabled && "opacity-60 cursor-not-allowed",
        )}
      >
        {/* Drag overlay */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div
              key="drag-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5 pointer-events-none"
            >
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" />
                Suelta para adjuntar
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pending file pills */}
        <AnimatePresence>
          {pendingFiles.length > 0 && (
            <motion.div
              key="pills"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-1.5 px-3 pt-2 pb-0"
            >
              {pendingFiles.map((f, i) => (
                <FilePill
                  key={`${f.name}-${i}`}
                  file={f}
                  onRemove={() => removeFile(i)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Streamlined Compact Input Row */}
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          {/* Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
            aria-label="Adjuntar archivo Excel o CSV"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer",
              "hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              pendingFiles.length > 0 ? "text-primary" : "text-[#444746] dark:text-zinc-300",
            )}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {/* Textarea */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              disabled={isDisabled}
              placeholder={
                isProcessing
                  ? "Nova está procesando..."
                  : "Escribe o arrastra un manifiesto aquí..."
              }
              rows={1}
              aria-label="Mensaje para Nova"
              className={cn(
                "block w-full resize-none bg-transparent text-sm leading-snug py-1",
                "text-[#1f1f1f] dark:text-zinc-100 placeholder:text-[#70757a] dark:placeholder:text-zinc-400",
                "focus:outline-none min-h-[22px] max-h-[96px] overflow-y-auto",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
          </div>

          {/* Send / Status Button */}
          <div className="relative h-8 w-8 shrink-0">
            <motion.button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Enviar mensaje"
              animate={
                canSend ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }
              }
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                "nova-send-btn absolute inset-0 flex items-center justify-center rounded-full cursor-pointer",
                "focus-visible:outline-none",
                "disabled:cursor-not-allowed",
              )}
            >
              {isThinking ? (
                <motion.div
                  className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 0.75,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              ) : (
                <ArrowUp className="h-3.5 w-3.5" />
              )}
            </motion.button>

            {/* Inactive state icon */}
            <motion.div
              aria-hidden="true"
              animate={
                !canSend && !isDisabled
                  ? { scale: 1, opacity: 1 }
                  : { scale: 0, opacity: 0 }
              }
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center rounded-full text-[#444746]/40 dark:text-zinc-500 cursor-default"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.filter((t) => t.startsWith(".")).join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileInputChange}
        aria-hidden="true"
      />
    </div>
  );
});
