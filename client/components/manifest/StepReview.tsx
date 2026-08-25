import { useState, useMemo } from "react";
import { useLocale } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  X,
} from "lucide-react";
import { ManifestRowWithMeta } from "@shared/manifest";
import { cn } from "@/lib/utils";

interface StepReviewProps {
  rows: ManifestRowWithMeta[];
  fileName: string;
  validationErrors: Record<number, string[]>;
  onNext: () => void;
  onBack: () => void;
}

export default function StepReview({
  rows,
  fileName,
  validationErrors,
  onNext,
  onBack,
}: StepReviewProps) {
  const { t } = useLocale(["manifests", "common"]);
  const [validFilter, setValidFilter] = useState("");
  const [failedFilter, setFailedFilter] = useState("");

  const validRows = rows.filter((r) => r.isValid && !r.isDuplicate);
  const duplicateRows = rows.filter((r) => r.isDuplicate);
  const errorRows = rows.filter((r) => !r.isValid);

  // Filter valid rows
  const filteredValidRows = useMemo(() => {
    if (!validFilter.trim()) return validRows;
    const search = validFilter.toLowerCase();
    return validRows.filter(
      (row) =>
        row.trackingNumber.toLowerCase().includes(search) ||
        row.customerName.toLowerCase().includes(search) ||
        row.description?.toLowerCase().includes(search) ||
        String(row.weight).includes(search),
    );
  }, [validRows, validFilter]);

  // Filter failed rows
  const filteredFailedRows = useMemo(() => {
    if (!failedFilter.trim()) return [...errorRows, ...duplicateRows];
    const search = failedFilter.toLowerCase();
    const filtered = [
      ...errorRows.filter(
        (row) =>
          row.trackingNumber.toLowerCase().includes(search) ||
          row.customerName?.toLowerCase().includes(search),
      ),
      ...duplicateRows.filter(
        (row) =>
          row.trackingNumber.toLowerCase().includes(search) ||
          row.customerName?.toLowerCase().includes(search),
      ),
    ];
    return filtered;
  }, [errorRows, duplicateRows, failedFilter]);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 border-gray-200">
          <p className="text-xs text-gray-600">{t("manifests.totalRows")}</p>
          <p className="text-lg font-bold text-gray-900">{rows.length}</p>
        </Card>
        <Card className="p-3 border-gray-200">
          <p className="text-xs text-gray-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-gray-800" />
            {t("manifests.validRows")}
          </p>
          <p className="text-lg font-bold text-gray-900">{validRows.length}</p>
        </Card>
        <Card className="p-3 border-gray-200">
          <p className="text-xs text-gray-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-gray-700" />
            {t("manifests.duplicateRows")}
          </p>
          <p className="text-lg font-bold text-gray-800">
            {duplicateRows.length}
          </p>
        </Card>
        <Card className="p-3 border-gray-200">
          <p className="text-xs text-gray-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-gray-700" />
            {t("manifests.errorRows")}
          </p>
          <p className="text-lg font-bold text-gray-800">{errorRows.length}</p>
        </Card>
      </div>

      {/* Info Box */}
      <div className="bg-gray-100 border border-gray-300 rounded p-4 flex gap-3">
        <AlertCircle className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-gray-700">
          <p className="font-medium">{t("manifests.summaryBefore")}</p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>{t("manifests.summaryValidRowsWillBeImported")}</li>
            <li>{t("manifests.summaryDuplicatesWillBeSkipped")}</li>
            <li>{t("manifests.summaryErrorRowsNotProcessed")}</li>
          </ul>
        </div>
      </div>

      {/* Valid Records Data Table */}
      {validRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-900">
                {t("manifests.validRows")} ({filteredValidRows.length} of{" "}
                {validRows.length})
              </h3>
            </div>
          </div>

          {/* Filter Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t("manifests.searchPlaceholder")}
              value={validFilter}
              onChange={(e) => setValidFilter(e.target.value)}
              className="pl-10 pr-10 h-9 text-sm border-gray-300"
            />
            {validFilter && (
              <button
                onClick={() => setValidFilter("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="border border-gray-300 rounded overflow-hidden">
            {/* Table Header */}
            <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 grid grid-cols-12 gap-4 sticky top-0">
              <div className="col-span-1">
                <p className="text-xs font-semibold text-gray-700">#</p>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-semibold text-gray-700">
                  {t("manifests.trackingNumber")}
                </p>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-semibold text-gray-700">
                  {t("manifests.customerName")}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-semibold text-gray-700">
                  {t("manifests.weight")}
                </p>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-semibold text-gray-700">
                  {t("manifests.description")}
                </p>
              </div>
            </div>

            {/* Table Body */}
            <div className="max-h-56 overflow-y-auto">
              {filteredValidRows.length > 0 ? (
                filteredValidRows.map((row, idx) => (
                  <div
                    key={row.rowIndex}
                    className={cn(
                      "px-4 py-3 grid grid-cols-12 gap-4 border-b border-gray-200 hover:bg-gray-50 transition-colors",
                      idx === filteredValidRows.length - 1 && "border-b-0",
                    )}
                    data-testid={`valid-row-${row.rowIndex}`}
                  >
                    <div className="col-span-1">
                      <p className="text-xs text-gray-600">
                        {row.rowIndex + 1}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {row.trackingNumber}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs text-gray-700 truncate">
                        {row.customerName}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-600">{row.weight}</p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs text-gray-600 truncate">
                        {row.description || "-"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-gray-500">
                    {t("manifests.noRecordsMatchFilter")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Failed Records Data Table */}
      {(errorRows.length > 0 || duplicateRows.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-900">
                {t("manifests.failedRecords")} ({filteredFailedRows.length} of{" "}
                {errorRows.length + duplicateRows.length})
              </h3>
            </div>
          </div>

          <p className="text-xs text-gray-600">
            {t("manifests.failedRecordsInfo")}
          </p>

          {/* Filter Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t("manifests.searchPlaceholder")}
              value={failedFilter}
              onChange={(e) => setFailedFilter(e.target.value)}
              className="pl-10 pr-10 h-9 text-sm border-gray-300"
            />
            {failedFilter && (
              <button
                onClick={() => setFailedFilter("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="border border-gray-300 rounded overflow-hidden">
            {/* Table Header */}
            <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 grid grid-cols-12 gap-3 sticky top-0 overflow-x-auto">
              <div className="col-span-1">
                <p className="text-xs font-semibold text-gray-700">#</p>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {t("manifests.trackingNumber")}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {t("manifests.customerName")}
                </p>
              </div>
              <div className="col-span-1">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {t("manifests.weight")}
                </p>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {t("manifests.description")}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-semibold text-gray-700">
                  {t("manifests.status")}
                </p>
              </div>
            </div>

            {/* Table Body */}
            <div className="max-h-56 overflow-y-auto">
              {filteredFailedRows.length > 0 ? (
                filteredFailedRows.map((row, idx) => {
                  const hasErrors = validationErrors[row.rowIndex];
                  const isDuplicate = duplicateRows.some(
                    (r) => r.rowIndex === row.rowIndex,
                  );

                  return (
                    <div key={row.rowIndex} className="space-y-0">
                      {/* Main Row */}
                      <div
                        className={cn(
                          "px-4 py-3 grid grid-cols-12 gap-3 border-b border-gray-200 hover:bg-gray-50 transition-colors",
                          idx === filteredFailedRows.length - 1 && "border-b-0",
                        )}
                        data-testid={
                          isDuplicate
                            ? `duplicate-row-${row.rowIndex}`
                            : `error-row-${row.rowIndex}`
                        }
                      >
                        <div className="col-span-1">
                          <p className="text-xs text-gray-600">
                            {row.rowIndex + 1}
                          </p>
                        </div>
                        <div className="col-span-3">
                          <p className="text-xs font-semibold text-gray-900 truncate">
                            {row.trackingNumber}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-gray-700 truncate">
                            {row.customerName || "-"}
                          </p>
                        </div>
                        <div className="col-span-1">
                          <p className="text-xs text-gray-600">{row.weight}</p>
                        </div>
                        <div className="col-span-3">
                          <p className="text-xs text-gray-600 truncate">
                            {row.description || "-"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <Badge
                            variant="secondary"
                            className="text-xs bg-gray-200 text-gray-900 whitespace-nowrap"
                          >
                            {isDuplicate
                              ? t("manifests.duplicate")
                              : t("manifests.error")}
                          </Badge>
                        </div>
                      </div>

                      {/* Error Details Row */}
                      {(hasErrors || isDuplicate) && (
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                          {isDuplicate ? (
                            <div className="text-xs text-gray-600">
                              <span className="font-medium">
                                {t("manifests.duplicateInFile")}:
                              </span>{" "}
                              {t("manifests.rowIndex")}:{" "}
                              {row.duplicateOf.map((i) => i + 1).join(", ")}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-700">
                                {t("manifests.errorDetails")}:
                              </p>
                              <ul className="space-y-0.5">
                                {hasErrors?.map((error, errorIdx) => (
                                  <li
                                    key={errorIdx}
                                    className="text-xs text-gray-700"
                                  >
                                    • {error}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-gray-500">
                    {t("manifests.noRecordsMatchFilter")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Records Message */}
      {validRows.length === 0 &&
        errorRows.length === 0 &&
        duplicateRows.length === 0 && (
          <div className="border border-gray-300 rounded p-8 text-center">
            <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              {t("manifests.noRecordsToReview")}
            </p>
          </div>
        )}

      {/* Action Buttons */}
      <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
        <Button
          variant="outline"
          onClick={onBack}
          size="sm"
          className="border-gray-300 text-gray-900 hover:bg-gray-100"
          data-testid="back-btn"
        >
          {t("common.previous")}
        </Button>
        <div className="flex-1" />
        <Button
          onClick={onNext}
          disabled={validRows.length === 0}
          className="bg-gray-900 text-white hover:bg-gray-800 px-8"
          data-testid="next-btn"
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
