import { memo, useState, useCallback, useRef } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  X,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ManifestType } from "@/lib/services/manifest-processor";
import type { ProcessingStep, ProcessedNovaData } from "@/hooks/use-nova-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SpreadsheetGrid } from "@/components/ui/usa-sea-spreadsheet/SpreadsheetGrid";
import {
  CalculatedSeaManifestRow,
  SeaManifestRowData,
} from "@/components/ui/usa-sea-spreadsheet/useSpreadsheetCalculations";
import {
  processManualSeaManifest,
  saveSeaManifestData,
} from "@/lib/services/sea-manifest/sea-manifest-processor";
import {
  sendInvoiceEmails,
  InvoiceRecord,
} from "@/lib/services/invoice-service";
import { ColAirSpreadsheetGrid } from "@/components/ui/col-air-spreadsheet/ColAirSpreadsheetGrid";
import {
  CalculatedColAirManifestRow,
  ColAirManifestRowData,
} from "@/components/ui/col-air-spreadsheet/useColAirCalculations";
import {
  processManualColAirManifest,
  saveColAirManifestData,
} from "@/lib/services/col-air-manifest/col-air-processor";
import { db } from "@/lib/firebase/config";
import {
  collection,
  query,
  where,
  documentId,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import { FEATURE_FLAGS } from "@/lib/utils/feature-flags";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { parseExcelToSpreadsheetRows } from "@/lib/services/sea-manifest/excel-parser";

interface StepUploadProps {
  manifestType: ManifestType;
  isProcessing: boolean;
  processingSteps?: ProcessingStep[];
  currentStep?: string;
  onFilesSelected: (files: File[]) => void;
  onManualSubmit?: (data: ProcessedNovaData) => void;
  onBack: () => void;
}

const MANIFEST_LABELS: Record<string, string> = {
  usa_air: "USA Aéreo",
  usa_sea: "USA Marítimo",
  colombia_air: "Colombia Aéreo",
};

export const StepUpload = memo(function StepUpload({
  manifestType,
  isProcessing,
  processingSteps,
  currentStep,
  onFilesSelected,
  onManualSubmit,
  onBack,
}: StepUploadProps) {
  const { t } = useTranslation("manifests");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("manual");
  const [importedRows, setImportedRows] = useState<SeaManifestRowData[]>([]);
  const [isManualProcessing, setIsManualProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = useCallback((file: File): string | null => {
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (
      !validTypes.includes(file.type) &&
      !["xlsx", "xls", "csv"].includes(ext || "")
    ) {
      return "Formato no soportado. Usa archivos .xlsx, .xls o .csv";
    }
    if (file.size > 10 * 1024 * 1024) {
      return "El archivo excede el límite de 10 MB";
    }
    return null;
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const file = fileArray[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setSelectedFile(file);

      if (manifestType === "usa_sea") {
        try {
          const parsedRows = await parseExcelToSpreadsheetRows(file);
          setImportedRows(parsedRows);
          setActiveTab("manual");
          setSelectedFile(null); // Clear it so they can upload another if needed
          return;
        } catch (err) {
          console.error("Error parsing excel:", err);
          setError("Error al leer el archivo Excel.");
          setSelectedFile(null);
          return;
        }
      }

      onFilesSelected([file]);
    },
    [validateFile, onFilesSelected, manifestType],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleFiles(e.target.files);
    },
    [handleFiles],
  );

  const handleColAirSpreadsheetSubmit = useCallback(
    async (
      rows: CalculatedColAirManifestRow[],
      customManifestName?: string,
      createDraftInvoices: boolean = true,
      options?: {
        ivaEnabled?: boolean;
        bodegajeCost?: number;
        permisoCost?: number;
        mergeInvoices?: boolean;
      },
    ) => {
      setIsManualProcessing(true);
      try {
        const manifestNumber =
          customManifestName && customManifestName.trim()
            ? customManifestName.trim()
            : `SM-${new Date().getTime().toString().slice(-6)}`;

        const processedData = await processManualColAirManifest(
          rows,
          manifestNumber,
        );

        const saveResult = await saveColAirManifestData(
          processedData,
          createDraftInvoices,
          500,
          options,
        );

        toast({
          title: "Procesamiento Exitoso",
          description: `Se procesaron ${processedData.summary.processedRows} paquetes aéreos en la base de datos.`,
        });

        return saveResult?.created || [];
      } catch (err) {
        console.error(err);
        setError(
          t("spreadsheet.processError", "Error al procesar los datos manuales"),
        );
        return [];
      } finally {
        setIsManualProcessing(false);
      }
    },
    [onBack, t, toast],
  );

  const handleSpreadsheetSubmit = useCallback(
    async (
      rows: CalculatedSeaManifestRow[],
      customManifestName?: string,
      createDraftInvoices: boolean = true,
      options?: {
        ivaEnabled?: boolean;
        bodegajeCost?: number;
        permisoCost?: number;
        exchangeRate?: number;
        mergeInvoices?: boolean;
      },
    ) => {
      setIsManualProcessing(true);
      try {
        const manifestNumber =
          customManifestName && customManifestName.trim()
            ? customManifestName.trim()
            : `SM_${format(new Date(), "ddMMyyyy")}_USA`;

        const processedData = await processManualSeaManifest(
          rows,
          manifestNumber,
          );

        // Save data immediately for Sea Manifest
        const saveResult = await saveSeaManifestData(
          processedData,
          createDraftInvoices,
          options?.exchangeRate ?? 500,
          options,
        );

        toast({
          title: "Procesamiento Exitoso",
          description: `Se procesaron ${processedData.summary.processedRows} paquetes marítimos en la base de datos.`,
        });

        return saveResult?.created || [];
      } catch (err) {
        console.error(err);
        setError(
          t("spreadsheet.processError", "Error al procesar los datos manuales"),
        );
        return [];
      } finally {
        setIsManualProcessing(false);
      }
    },
    [onBack, t, toast],
  );

  const handleBulkEmail = useCallback(
    async (selectedRows: CalculatedSeaManifestRow[]) => {
      const invoiceIds = Array.from(
        new Set(selectedRows.map((r) => r.invoiceId).filter(Boolean)),
      ) as string[];

      if (invoiceIds.length === 0) {
        toast({
          description: "No hay facturas válidas seleccionadas para enviar.",
          variant: "destructive",
        });
        return [];
      }

      setIsManualProcessing(true);
      try {
        const chunkSize = 30;
        const sentIds: string[] = [];

        for (let i = 0; i < invoiceIds.length; i += chunkSize) {
          const chunk = invoiceIds.slice(i, i + chunkSize);
          const q = query(
            collection(db, "invoices"),
            where(documentId(), "in", chunk),
          );
          const snap = await getDocs(q);
          const invoices = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as InvoiceRecord,
          );

          const result = await sendInvoiceEmails(invoices);

          // Update status for sent invoices (those without errors in the result)
          const successfulEmails = invoices.filter(
            (inv) => !result.errors.find((e) => e.email === inv.clientEmail),
          );
          for (const inv of successfulEmails) {
            await updateDoc(doc(db, "invoices", inv.id), { status: "sent" });
            sentIds.push(inv.id);
          }
        }

        toast({
          title: "Envío completado",
          description: `Se enviaron ${sentIds.length} facturas exitosamente.`,
        });
        return sentIds;
      } catch (err) {
        console.error("Error enviando facturas:", err);
        toast({
          description: "Ocurrió un error al enviar las facturas.",
          variant: "destructive",
        });
        return [];
      } finally {
        setIsManualProcessing(false);
      }
    },
    [toast],
  );

  const showTabs =
    (manifestType === "usa_sea" && FEATURE_FLAGS.ENABLE_USA_SEA_MODULE) ||
    manifestType === "colombia_air";

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const completedSteps =
    processingSteps?.filter((s) => s.status === "completed").length || 0;
  const totalSteps = processingSteps?.length || 0;
  const progressPct =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div
      className={cn(
        "flex flex-col min-h-[calc(100vh-8rem)]",
        showTabs ? "" : "items-center justify-center px-4 sm:px-6",
      )}
    >
      {!showTabs && (
        <motion.div
          className="flex items-center gap-3 mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <button
            type="button"
            onClick={onBack}
            disabled={isProcessing}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            ← Cambiar origen
          </button>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-white"
            style={{ background: "hsl(var(--manifest-brand))" }}
          >
            {MANIFEST_LABELS[manifestType] || manifestType}
          </span>
        </motion.div>
      )}

      {showTabs ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="flex flex-col flex-1 px-6 pb-6 mt-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <button
                type="button"
                onClick={onBack}
                disabled={isProcessing}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                ← Cambiar origen
              </button>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-white"
                style={{ background: "hsl(var(--manifest-brand))" }}
              >
                {MANIFEST_LABELS[manifestType] || manifestType}
              </span>
            </motion.div>

            <TabsList className="bg-muted p-1 rounded-xl shadow-sm border border-border">
              <TabsTrigger
                value="manual"
                disabled={isProcessing || isManualProcessing}
                className="rounded-lg data-[state=active]:bg-[hsl(var(--manifest-brand))] data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {t("spreadsheet.tabManual", "Ingreso Manual")}
              </TabsTrigger>
              <TabsTrigger
                value="upload"
                disabled={isProcessing || isManualProcessing}
                className="rounded-lg data-[state=active]:bg-[hsl(var(--manifest-brand))] data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
              >
                <Upload className="w-4 h-4 mr-2" />
                {t("spreadsheet.tabUpload", "Subir Archivo")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="upload"
            className="mt-0 outline-none flex-1 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <div className="flex-1 flex flex-col items-center justify-center">
              {renderUploadContent()}
            </div>
          </TabsContent>

          <TabsContent
            value="manual"
            className="mt-0 outline-none flex-1 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <div className="flex-1 flex flex-col min-h-[500px]">
              {manifestType === "colombia_air" ? (
                <ColAirSpreadsheetGrid
                  onSubmit={handleColAirSpreadsheetSubmit}
                  isProcessing={isManualProcessing}
                  onBulkEmail={handleBulkEmail as any}
                />
              ) : (
                <SpreadsheetGrid
                  onSubmit={handleSpreadsheetSubmit}
                  isProcessing={isManualProcessing}
                  importedRows={importedRows}
                  onBulkEmail={handleBulkEmail}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        renderUploadContent()
      )}
    </div>
  );

  function renderUploadContent() {
    return (
      <AnimatePresence mode="wait">
        {!isProcessing && !selectedFile ? (
          /* ── Drop zone ── */
          <motion.div
            key="dropzone"
            className="w-full max-w-xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-12 sm:p-16 cursor-pointer transition-all duration-300",
                isDragging
                  ? "border-[hsl(var(--manifest-brand))] bg-[hsl(var(--manifest-brand-subtle))] scale-[1.02]"
                  : "border-border bg-background hover:border-[hsl(var(--manifest-brand)/0.4)] hover:bg-accent/50",
              )}
              role="button"
              tabIndex={0}
              aria-label="Arrastra un archivo o haz clic para seleccionar"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  inputRef.current?.click();
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleInputChange}
                className="sr-only"
                aria-hidden="true"
              />

              <motion.div
                animate={
                  isDragging ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }
                }
                transition={{ duration: 0.3 }}
                className="mb-5"
              >
                <div
                  className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-300",
                    isDragging
                      ? "bg-[hsl(var(--manifest-brand))] text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Upload className="w-7 h-7" />
                </div>
              </motion.div>

              <p className="text-base font-semibold text-foreground text-center">
                {isDragging
                  ? "Suelta el archivo aquí"
                  : "Arrastra tu manifiesto aquí"}
              </p>
              <p className="text-sm text-muted-foreground mt-1.5 text-center">
                o{" "}
                <span className="underline underline-offset-2">
                  haz clic para seleccionar
                </span>
              </p>
              <p className="text-xs text-muted-foreground/60 mt-4">
                Excel (.xlsx, .xls) o CSV — Máximo 10 MB
              </p>
            </motion.div>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-700">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="ml-auto p-0.5 rounded hover:bg-red-100 transition-colors"
                    aria-label="Cerrar error"
                  >
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* ── Processing state ── */
          <motion.div
            key="processing"
            className="w-full max-w-md flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* File info */}
            {selectedFile && (
              <motion.div
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background border border-border mb-8 w-full"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "hsl(var(--manifest-brand-subtle))" }}
                >
                  <FileSpreadsheet
                    className="w-5 h-5"
                    style={{ color: "hsl(var(--manifest-brand))" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </motion.div>
            )}

            {/* AI Processing animation */}
            <motion.div
              className="flex flex-col items-center mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div
                className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "hsl(var(--manifest-brand))" }}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Sparkles className="w-7 h-7 text-white" />
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  style={{ border: "2px solid hsl(var(--manifest-brand))" }}
                  animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </motion.div>

              <p className="text-sm font-medium text-foreground text-center">
                {currentStep || "Analizando archivo con IA..."}
              </p>
            </motion.div>

            {/* Progress bar */}
            <div className="w-full mb-6">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>
                  {completedSteps} de {totalSteps} pasos
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "hsl(var(--manifest-brand))" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Processing steps */}
            {processingSteps && processingSteps.length > 0 && (
              <div className="w-full space-y-1.5">
                {processingSteps.map((step, idx) => (
                  <motion.div
                    key={step.id}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    {step.status === "completed" ? (
                      <Check
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "hsl(var(--manifest-brand))" }}
                      />
                    ) : step.status === "processing" ? (
                      <Loader2
                        className="w-3.5 h-3.5 shrink-0 animate-spin"
                        style={{ color: "hsl(var(--manifest-brand))" }}
                      />
                    ) : step.status === "error" ? (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-xs transition-colors",
                        step.status === "completed"
                          ? "text-foreground"
                          : step.status === "processing"
                            ? "text-foreground font-medium"
                            : step.status === "error"
                              ? "text-red-600"
                              : "text-muted-foreground",
                      )}
                    >
                      {step.step}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
});
