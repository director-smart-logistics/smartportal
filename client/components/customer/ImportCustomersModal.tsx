import { useState, useCallback } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  UploadIcon,
  FileTextIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  DownloadIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  validateCustomerCSV,
  type ValidationResult,
} from "@/lib/validators/customerImportValidator";
import { downloadErrorCSV } from "@/lib/utils/errorCsvGenerator";

interface ImportCustomersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingCustomers: any[];
}

type ImportStage = "upload" | "preview" | "processing" | "complete";

export function ImportCustomersModal({
  isOpen,
  onClose,
  onSuccess,
  existingCustomers,
}: ImportCustomersModalProps) {
  const { t } = useLocale(["customers", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<ImportStage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    created: number;
    errors: any[];
  } | null>(null);

  const resetState = () => {
    setStage("upload");
    setFile(null);
    setParsedData([]);
    setValidationResult(null);
    setIsProcessing(false);
    setProgress(0);
    setImportResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): boolean => {
    // Check file type
    if (!file.name.endsWith(".csv")) {
      toast({
        title: t("common.error"),
        description: "Only CSV files are allowed",
        variant: "destructive",
      });
      return false;
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast({
        title: t("common.error"),
        description: "File size must not exceed 5MB",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const parseCSV = async (file: File) => {
    return new Promise<any[]>((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error("CSV parsing failed"));
            return;
          }
          resolve(results.data);
        },
        error: (error) => {
          reject(error);
        },
      });
    });
  };

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files[0];
      if (!droppedFile) return;

      if (!validateFile(droppedFile)) return;

      setFile(droppedFile);
      setIsProcessing(true);

      try {
        const data = await parseCSV(droppedFile);
        if (data.length === 0) {
          toast({
            title: t("common.error"),
            description: "CSV file is empty",
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }

        setParsedData(data);

        // Validate data
        const result = await validateCustomerCSV(data, existingCustomers);
        setValidationResult(result);
        setStage("preview");
      } catch (error) {
        console.error("Error processing CSV:", error);
        toast({
          title: t("common.error"),
          description: "Failed to process CSV file",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [existingCustomers, t, toast],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      if (!validateFile(selectedFile)) return;

      setFile(selectedFile);
      setIsProcessing(true);

      try {
        const data = await parseCSV(selectedFile);
        if (data.length === 0) {
          toast({
            title: t("common.error"),
            description: "CSV file is empty",
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }

        setParsedData(data);

        // Validate data
        const result = await validateCustomerCSV(data, existingCustomers);
        setValidationResult(result);
        setStage("preview");
      } catch (error) {
        console.error("Error processing CSV:", error);
        toast({
          title: t("common.error"),
          description: "Failed to process CSV file",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [existingCustomers, t, toast],
  );

  const handleImport = async () => {
    if (!validationResult || validationResult.valid.length === 0) return;

    setStage("processing");
    setIsProcessing(true);
    setProgress(0);

    try {
      const response = await fetch("/api/customers/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ customers: validationResult.valid }),
      });

      if (!response.ok) {
        throw new Error("Import failed");
      }

      const result = await response.json();
      setImportResult(result);
      setProgress(100);
      setStage("complete");

      // Invalidate customers query to refresh list
      queryClient.invalidateQueries({ queryKey: ["customers"] });

      toast({
        title: t("common.success"),
        description: `${result.created} customers imported successfully`,
      });

      if (result.errors.length === 0) {
        setTimeout(() => {
          handleClose();
          onSuccess();
        }, 2000);
      }
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: t("common.error"),
        description: "Failed to import customers",
        variant: "destructive",
      });
      setStage("preview");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadErrors = () => {
    if (validationResult && validationResult.invalid.length > 0) {
      downloadErrorCSV(validationResult.invalid);
      toast({
        title: t("common.success"),
        description: "Error report downloaded",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="import-customers-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadIcon className="h-5 w-5" />
            {t("customers.import")}
          </DialogTitle>
          <DialogDescription>
            {stage === "upload" && "Upload a CSV file to import customers"}
            {stage === "preview" &&
              "Review validation results before importing"}
            {stage === "processing" && "Importing customers..."}
            {stage === "complete" && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        {/* Upload Stage */}
        {stage === "upload" && (
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleFileDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                isDragging
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                  : "border-gray-300 dark:border-gray-700 hover:border-gray-400",
              )}
              data-testid="drop-zone"
            >
              <FileTextIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium mb-2">
                Drag and drop CSV file here
              </p>
              <p className="text-sm text-gray-500 mb-4">or click to browse</p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="file-input"
                data-testid="file-input"
              />
              <label htmlFor="file-input">
                <Button type="button" variant="outline" asChild>
                  <span>Browse Files</span>
                </Button>
              </label>
              <p className="text-xs text-gray-500 mt-4">
                Maximum file size: 5MB • CSV only
              </p>
            </div>

            {isProcessing && (
              <div className="text-center">
                <Progress value={50} className="mb-2" />
                <p className="text-sm text-gray-500">Processing CSV...</p>
              </div>
            )}
          </div>
        )}

        {/* Preview Stage */}
        {stage === "preview" && validationResult && (
          <div className="space-y-4">
            {/* Validation Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Total Rows</p>
                <p className="text-2xl font-bold">
                  {validationResult.summary.total}
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300 mb-1 flex items-center gap-1">
                  <CheckCircleIcon className="h-4 w-4" />
                  Valid
                </p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {validationResult.summary.valid}
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                  <AlertCircleIcon className="h-4 w-4" />
                  Invalid
                </p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {validationResult.summary.invalid}
                </p>
              </div>
            </div>

            {/* Preview Table */}
            {validationResult.valid.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Preview (First 5 Rows)</h3>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>ID Number</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>City</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResult.valid.slice(0, 5).map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{row.fullName}</TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>{row.idNumber}</TableCell>
                          <TableCell>{row.phone}</TableCell>
                          <TableCell>{row.city || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Error List */}
            {validationResult.invalid.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircleIcon className="h-5 w-5" />
                    Validation Errors ({validationResult.invalid.length} rows)
                  </h3>
                  <Button
                    onClick={handleDownloadErrors}
                    variant="outline"
                    size="sm"
                    data-testid="download-errors"
                  >
                    <DownloadIcon className="h-4 w-4 mr-2" />
                    Download Error Report
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {validationResult.invalid.slice(0, 10).map((invalid) => (
                    <div key={invalid.row} className="text-sm">
                      <span className="font-medium">Row {invalid.row}:</span>{" "}
                      {invalid.errors.join(", ")}
                    </div>
                  ))}
                  {validationResult.invalid.length > 10 && (
                    <p className="text-sm italic">
                      ... and {validationResult.invalid.length - 10} more errors
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing Stage */}
        {stage === "processing" && (
          <div className="space-y-4 py-8">
            <Progress value={progress} className="mb-4" />
            <p className="text-center text-gray-500">
              Importing {validationResult?.valid.length} customers...
            </p>
          </div>
        )}

        {/* Complete Stage */}
        {stage === "complete" && importResult && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950 p-6 rounded-lg text-center">
              <CheckCircleIcon className="h-12 w-12 text-green-600 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-green-700 dark:text-green-300 mb-1">
                Import Complete!
              </h3>
              <p className="text-green-600 dark:text-green-400">
                Successfully imported {importResult.created} customers
              </p>
            </div>

            {importResult.errors.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg">
                <p className="font-medium text-yellow-700 dark:text-yellow-300 mb-2">
                  {importResult.errors.length} customers failed to import
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
                  {importResult.errors.map((error, idx) => (
                    <div key={idx}>
                      Row {error.index + 1}: {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === "upload" && (
            <Button onClick={handleClose} variant="outline">
              {t("common.cancel")}
            </Button>
          )}

          {stage === "preview" && (
            <>
              <Button onClick={resetState} variant="outline">
                <XIcon className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              {validationResult && validationResult.valid.length > 0 && (
                <Button
                  onClick={handleImport}
                  disabled={isProcessing}
                  data-testid="import-confirm"
                >
                  <UploadIcon className="h-4 w-4 mr-2" />
                  Import {validationResult.valid.length} Valid Customers
                </Button>
              )}
            </>
          )}

          {stage === "complete" && (
            <Button onClick={handleClose} data-testid="import-close">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
