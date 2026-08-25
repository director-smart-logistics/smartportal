import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, DatabaseZap, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";

interface Props {
  isOpen: boolean;
  defaultName: string;
  onConfirm: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function NovaManifestNamePromptModal({
  isOpen,
  defaultName,
  onConfirm,
  onCancel,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset input field when defaultName changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setError(null);
      setIsValidating(false);
      // Auto-focus on input field
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim();
    if (!finalName) {
      setError("El nombre del manifiesto no puede estar vacío.");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Check if manifest already exists in Firestore (manifests/{id})
      const docRef = doc(db, "manifests", finalName);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setError(
          `El manifiesto "${finalName}" ya existe en la base de datos. Por favor elija un nombre diferente para evitar sobrescribir o fusionar los datos.`
        );
        setIsValidating(false);
      } else {
        // If it does not exist, trigger confirm callback
        await onConfirm(finalName);
      }
    } catch (err) {
      console.error("[NovaManifestNamePromptModal] validation error:", err);
      setError("Ocurrió un error al verificar la base de datos. Intente de nuevo.");
      setIsValidating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manifest-prompt-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <DatabaseZap className="h-4 w-4" />
              </div>
              <p
                id="manifest-prompt-title"
                className="text-sm font-semibold text-foreground font-sans"
              >
                Guardar manifiesto
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ingrese el nombre o identificador con el que desea guardar este manifiesto en la base de datos.
              </p>

              <div className="space-y-1.5">
                <label
                  htmlFor="manifest-name"
                  className="text-xs font-semibold text-foreground block"
                >
                  Nombre del manifiesto
                </label>
                <input
                  ref={inputRef}
                  id="manifest-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isValidating}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-60 transition-all font-mono"
                  placeholder="Ej: SL-2026-05-21"
                  required
                />
              </div>

              {/* Warnings & Errors */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-start gap-3 p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-semibold">Validación de manifiesto</p>
                      <p className="text-[11px] leading-relaxed text-red-700/95 dark:text-red-400/95">
                        {error}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border bg-card">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isValidating}
                className="text-xs font-medium"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isValidating || !name.trim()}
                className="text-xs font-medium gap-1.5"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <DatabaseZap className="h-3.5 w-3.5" />
                    Guardar y Continuar
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
