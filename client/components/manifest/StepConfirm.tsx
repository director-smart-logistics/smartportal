import { useLocale } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, AlertTriangle, Loader } from "lucide-react";
import { ManifestRowWithMeta } from "@shared/manifest";

interface StepConfirmProps {
  rows: ManifestRowWithMeta[];
  isProcessing: boolean;
  onConfirm: (confirmed: boolean) => void;
  onBack: () => void;
}

export default function StepConfirm({
  rows,
  isProcessing,
  onConfirm,
  onBack,
}: StepConfirmProps) {
  const { t } = useLocale(["manifests", "common"]);

  const validRows = rows.filter((r) => r.isValid && !r.isDuplicate);
  const duplicateRows = rows.filter((r) => r.isDuplicate);
  const errorRows = rows.filter((r) => !r.isValid);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          {t("manifests.confirmSubmit")}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {t("manifests.confirmMessage")}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 border-gray-200">
          <p className="text-xs text-gray-600">{t("manifests.totalRows")}</p>
          <p className="text-lg font-bold text-gray-900">{rows.length}</p>
        </Card>
        <Card className="p-3 border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-gray-800" />
            {t("manifests.toImport")}
          </p>
          <p className="text-lg font-bold text-gray-900">{validRows.length}</p>
        </Card>
        <Card className="p-3 border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-gray-700" />
            {t("manifests.duplicatesSkipped")}
          </p>
          <p className="text-lg font-bold text-gray-800">
            {duplicateRows.length}
          </p>
        </Card>
        <Card className="p-3 border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-gray-700" />
            {t("manifests.errorRows")}
          </p>
          <p className="text-lg font-bold text-gray-800">{errorRows.length}</p>
        </Card>
      </div>

      {/* Info Boxes */}
      <div className="space-y-3">
        {validRows.length > 0 && (
          <div className="bg-gray-100 border border-gray-300 rounded p-4 flex gap-3">
            <CheckCircle2 className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700">
              <p className="font-medium">
                {validRows.length} {t("manifests.packagesWillBeCreated")}
              </p>
              <p className="text-xs mt-1">
                {t("manifests.rowsWillBeImported")}
              </p>
            </div>
          </div>
        )}

        {duplicateRows.length > 0 && (
          <div className="bg-gray-100 border border-gray-300 rounded p-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700">
              <p className="font-medium">
                {duplicateRows.length} {t("manifests.duplicatesWillBeSkipped")}
              </p>
              <p className="text-xs mt-1">
                {t("manifests.duplicateTrackingNumbers")}
              </p>
            </div>
          </div>
        )}

        {errorRows.length > 0 && (
          <div className="bg-blue-50 border border-blue-300 rounded p-4 flex gap-3">
            <AlertCircle className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">
                {errorRows.length} {t("manifests.rowsHaveErrors")}
              </p>
              <p className="text-xs mt-1">{t("manifests.errorRowsInfo")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Details Section */}
      <div className="border-t border-gray-200 pt-4 space-y-2">
        <h4 className="text-sm font-semibold text-gray-900">
          {t("manifests.processingSummary")}
        </h4>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-gray-800 flex-shrink-0 mt-0.5" />
            <span className="text-gray-900">
              {t("manifests.createdPackages")}:{" "}
              <strong>{validRows.length}</strong>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <span className="text-gray-900">
              {t("manifests.duplicatesSkipped")}:{" "}
              <strong>{duplicateRows.length}</strong>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <span className="text-gray-900">
              {t("manifests.errorRows")}: <strong>{errorRows.length}</strong>
            </span>
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
        <Button
          variant="outline"
          onClick={() => onConfirm(false)}
          disabled={isProcessing}
          size="sm"
          className="border-gray-300 text-gray-900 hover:bg-gray-100"
          data-testid="back-btn"
        >
          {t("common.previous")}
        </Button>
        <div className="flex-1" />
        <Button
          onClick={() => onConfirm(true)}
          disabled={isProcessing || validRows.length === 0}
          className="bg-gray-900 text-white hover:bg-gray-800 px-8"
          data-testid="confirm-btn"
        >
          {isProcessing ? (
            <>
              <Loader className="w-4 h-4 animate-spin mr-2" />
              {t("manifests.submitting")}
            </>
          ) : (
            t("manifests.submit")
          )}
        </Button>
      </div>
    </div>
  );
}
