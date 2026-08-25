import { useState, useRef } from "react";
import { useLocale } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Upload, File, X, Download } from "lucide-react";
import {
  isValidFileType,
  isValidFileSize,
  parseCSV,
  parseXLSX,
  formatFileSize,
} from "@/lib/utils/manifest";

interface StepUploadProps {
  onNext: (data: {
    rawData: string[][];
    fileName: string;
    fileType: "csv" | "xlsx";
  }) => void;
}

export default function StepUpload({ onNext }: StepUploadProps) {
  const { t } = useLocale(["manifests", "common"]);
  const { toast } = useToast();

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    // Validate file type
    if (!isValidFileType(file)) {
      toast({
        title: t("common.error"),
        description: t("manifests.invalidFileType"),
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (!isValidFileSize(file)) {
      toast({
        title: t("common.error"),
        description: t("manifests.fileTooBig"),
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: t("common.error"),
        description: t("manifests.selectFile"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileType = selectedFile.name.endsWith(".xlsx") ? "xlsx" : "csv";
      let rawData: string[][];

      if (fileType === "xlsx") {
        rawData = await parseXLSX(selectedFile);
      } else {
        const text = await selectedFile.text();
        rawData = parseCSV(text);
      }

      if (!rawData || rawData.length === 0) {
        toast({
          title: t("common.error"),
          description: t("manifests.noDataInFile"),
          variant: "destructive",
        });
        return;
      }

      onNext({
        rawData,
        fileName: selectedFile.name,
        fileType,
      });
    } catch (error) {
      console.error("File processing error:", error);
      toast({
        title: t("common.error"),
        description: t("manifests.fileUploadError"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area - Full Width */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? "border-gray-900 bg-gray-100"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onClick={() => fileInputRef.current?.click()}
        data-testid="upload-drop-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFileInputChange}
          className="hidden"
          data-testid="file-input"
        />

        <Upload className="w-12 h-12 mx-auto mb-3 text-gray-600" />
        <p className="font-medium text-gray-900 mb-1">
          {t("manifests.dragDropFile")}
        </p>
        <p className="text-xs text-gray-600">
          {t("manifests.supportedFormats")}
        </p>
        <p className="text-xs text-gray-600">{t("manifests.fileSize")}</p>
      </div>

      {/* Selected File Info */}
      {selectedFile && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <File className="w-5 h-5 text-gray-900 mt-1 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-gray-900 truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-gray-500 hover:text-gray-900 transition-colors"
              data-testid="clear-file-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Info Messages */}
          <div className="bg-gray-100 border border-gray-300 rounded p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-700">
              <p className="font-medium">{t("manifests.supportedColumns")}:</p>
              <p className="mt-1">
                <span className="font-medium">
                  {t("manifests.columnRequired")}:
                </span>{" "}
                {t("manifests.trackingNumber")}, {t("manifests.weight")},{" "}
                {t("manifests.description")}, {t("manifests.guideId")},{" "}
                {t("manifests.customerName")}
              </p>
              <p className="mt-1">
                <span className="font-medium">
                  {t("manifests.columnOptional")}:
                </span>{" "}
                {t("manifests.origin")}, {t("manifests.destination")},{" "}
                {t("manifests.customerId")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Row - 70/30 Layout */}
      <div className="grid grid-cols-10 gap-4">
        {/* Left Side - 70% - Download Template Link */}
        <div className="col-span-7 flex items-center">
          <a
            href="/templates/manifest-template.csv"
            download
            className="text-sm text-blue-600 hover:underline flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t("common.downloadTemplate") || "Download Template"}
          </a>
        </div>

        {/* Right Side - 30% - Next Button */}
        <div className="col-span-3">
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isLoading}
            className="w-full bg-gray-900 text-white hover:bg-gray-800"
            data-testid="upload-btn"
          >
            {isLoading ? "Processing..." : t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
