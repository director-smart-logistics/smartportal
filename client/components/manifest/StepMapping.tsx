import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plane,
  Ship,
  Truck,
  Mail,
  Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  autoDetectColumns,
  extractRows,
  validateRow,
  detectDuplicates,
} from "@/lib/utils/manifest";
import {
  ManifestRow,
  ManifestRowWithMeta,
  ValidationError,
} from "@shared/manifest";

const REQUIRED_FIELDS = [
  "trackingNumber",
  "weight",
  "description",
  "customerName",
];
const OPTIONAL_FIELDS = [
  "guideId",
  "manifestNumber",
  "origin",
  "destination",
  "customerId",
  "type",
  "status",
];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

interface StepMappingProps {
  rawData: string[][];
  fileType: "csv" | "xlsx";
  fileName: string;
  onNext: (data: {
    columnMapping: Record<string, number>;
    rows: ManifestRowWithMeta[];
    validationErrors: Record<number, string[]>;
    duplicates: Map<string, number[]>;
  }) => void;
  onBack: () => void;
}

export default function StepMapping({
  rawData,
  fileType,
  fileName,
  onNext,
  onBack,
}: StepMappingProps) {
  const { t } = useLocale(["manifests", "common"]);
  const { toast } = useToast();

  const [headers] = rawData;
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>(
    () => {
      const detected = autoDetectColumns(headers, REQUIRED_FIELDS);
      return detected;
    },
  );

  const [defaultType, setDefaultType] = useState<string>("air");
  const [defaultOrigin, setDefaultOrigin] = useState<string>("USA");
  const [defaultDestination, setDefaultDestination] = useState<string>("CR");
  const [defaultStatus, setDefaultStatus] = useState<string>("received");
  const [defaultManifestNumber, setDefaultManifestNumber] =
    useState<string>("");
  const [validationErrors, setValidationErrors] = useState<
    Record<number, string[]>
  >({});

  // Auto-detect columns on component mount
  useEffect(() => {
    const detected = autoDetectColumns(headers, REQUIRED_FIELDS);
    setColumnMapping(detected);
  }, [headers]);

  // Extract and validate rows
  const { processedRows, duplicates, errorCount, validCount } = useMemo(() => {
    const rawRows = extractRows(
      rawData,
      columnMapping,
      defaultType,
      defaultOrigin,
      defaultDestination,
      defaultStatus,
      defaultManifestNumber,
    );
    const errors: Record<number, string[]> = {};
    const processedRows: ManifestRowWithMeta[] = [];
    let validCount = 0;
    let errorCount = 0;

    rawRows.forEach((row, idx) => {
      const validationIssues = validateRow(row, idx);

      if (validationIssues.length === 0) {
        processedRows.push({
          ...(row as ManifestRow),
          rowIndex: idx,
          isDuplicate: false,
          duplicateOf: [],
          validationErrors: [],
          isValid: true,
        });
        validCount++;
      } else {
        errors[idx] = validationIssues.map((e) => `${e.field}: ${e.error}`);
        errorCount++;
        processedRows.push({
          ...(row as ManifestRow),
          rowIndex: idx,
          isDuplicate: false,
          duplicateOf: [],
          validationErrors: validationIssues,
          isValid: false,
        });
      }
    });

    // Detect duplicates within valid rows
    const validRowsOnly = processedRows.filter((r) => r.isValid);
    const duplicatesInFile = detectDuplicates(
      validRowsOnly.map(
        (r) =>
          ({
            trackingNumber: r.trackingNumber,
            customerName: r.customerName,
            origin: r.origin,
            destination: r.destination,
            weight: r.weight,
          }) as ManifestRow,
      ),
    );

    const duplicatesMap = new Map<string, number[]>();
    duplicatesInFile.forEach((dup) => {
      const rowIndices = validRowsOnly
        .map((r, idx) =>
          r.trackingNumber === dup.trackingNumber
            ? processedRows.indexOf(r)
            : -1,
        )
        .filter((idx) => idx >= 0);
      duplicatesMap.set(dup.trackingNumber, rowIndices);
      rowIndices.forEach((idx) => {
        if (processedRows[idx]) {
          processedRows[idx].isDuplicate = true;
          processedRows[idx].duplicateOf = rowIndices.filter((i) => i !== idx);
        }
      });
    });

    setValidationErrors(errors);

    return {
      processedRows,
      duplicates: duplicatesMap,
      errorCount,
      validCount,
    };
  }, [
    columnMapping,
    rawData,
    defaultType,
    defaultOrigin,
    defaultDestination,
    defaultStatus,
    defaultManifestNumber,
  ]);

  const missingRequired = useMemo(() => {
    return REQUIRED_FIELDS.filter(
      (field) =>
        columnMapping[field] === undefined || columnMapping[field] === null,
    );
  }, [columnMapping]);

  const handleMappingChange = (field: string, colIndex: string) => {
    const idx = colIndex === "" ? -1 : parseInt(colIndex);
    setColumnMapping((prev) => ({
      ...prev,
      [field]: idx >= 0 ? idx : undefined,
    }));
  };

  const handleAutoDetect = () => {
    const detected = autoDetectColumns(headers, REQUIRED_FIELDS);
    setColumnMapping(detected);
    toast({
      description: t("manifests.autoDetecting"),
    });
  };

  const handleNext = () => {
    if (missingRequired.length > 0) {
      toast({
        title: t("common.error"),
        description: `${t("manifests.noColumnsDetected")}: ${missingRequired.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (processedRows.length === 0) {
      toast({
        title: t("common.error"),
        description: t("manifests.noDataInFile"),
        variant: "destructive",
      });
      return;
    }

    onNext({
      columnMapping,
      rows: processedRows,
      validationErrors,
      duplicates,
    });
  };

  return (
    <div className="space-y-6">
      {/* Column Mapping Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("manifests.mapColumns")}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoDetect}
            className="gap-1"
            data-testid="auto-detect-btn"
          >
            <RotateCcw className="w-3 h-3" />
            {t("manifests.autoDetect")}
          </Button>
        </div>

        {/* Two Column Layout: System Fields (Left) | Column Selectors (Right) */}
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-2 gap-4">
            {/* Left Column - System Fields Labels (Right Aligned, Vertically Centered) */}
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-600 text-right">
                  {t("manifests.columnRequired")}
                </p>
                {REQUIRED_FIELDS.map((field) => (
                  <div
                    key={field}
                    className="flex items-center justify-end gap-2 h-10"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="text-xs">
                          {t(`manifests.tooltip.${field}`)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <label className="text-sm font-semibold text-gray-900">
                      {t(`manifests.${field}`)}
                    </label>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-gray-200 pt-4">
                <p className="text-xs font-medium text-gray-600 text-right">
                  {t("manifests.columnOptional")}
                </p>
                {OPTIONAL_FIELDS.map((field) => (
                  <div
                    key={field}
                    className="flex items-center justify-end gap-2 h-10"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="text-xs">
                          {t(`manifests.tooltip.${field}`)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <label className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      {t(`manifests.${field}`)}
                      {field === "customerId" && (
                        <img
                          src="/logo.svg"
                          alt="Smart Logistics"
                          className="w-4 h-4 inline-block"
                        />
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column - Column Selectors (Left Aligned) */}
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-600">
                  {t("manifests.selectSourceColumn")}
                </p>
                {REQUIRED_FIELDS.map((field) => (
                  <div key={field} className="space-y-1 max-w-xs">
                    <Select
                      value={columnMapping[field]?.toString() ?? ""}
                      onValueChange={(value) =>
                        handleMappingChange(field, value)
                      }
                    >
                      <SelectTrigger
                        data-testid={`mapping-${field}`}
                        className="border-gray-300"
                      >
                        <SelectValue
                          placeholder={`${t("manifests.selectColumnFor")} ${t(`manifests.${field}`)}`}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {headers.map((header, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {columnMapping[field] === undefined && (
                      <p className="text-xs text-gray-700 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t("manifests.required")}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-gray-200 pt-4">
                <p className="text-xs font-medium text-gray-600">
                  {t("manifests.selectSourceColumn")}
                </p>
                {OPTIONAL_FIELDS.map((field) => (
                  <div key={field} className="space-y-1 max-w-xs">
                    <Select
                      value={columnMapping[field]?.toString() ?? "unmapped"}
                      onValueChange={(value) => {
                        if (value === "unmapped") {
                          const newMapping = { ...columnMapping };
                          delete newMapping[field];
                          setColumnMapping(newMapping);
                        } else {
                          handleMappingChange(field, value);
                        }
                      }}
                    >
                      <SelectTrigger
                        data-testid={`mapping-${field}`}
                        className="border-gray-300"
                      >
                        <SelectValue placeholder={t("manifests.unmapped")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped">
                          {t("manifests.unmapped")}
                        </SelectItem>
                        {headers.map((header, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {/* Default Values Section */}
              <div className="space-y-3 border-t border-gray-200 pt-4 mt-4">
                <p className="text-xs font-medium text-gray-600">
                  {t("manifests.defaultValues")}{" "}
                  <span className="text-gray-500">
                    ({t("manifests.forUnmappedOrEmpty")})
                  </span>
                </p>

                {/* Número de Manifiesto */}
                {columnMapping.manifestNumber === undefined && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-900">
                      {t("manifests.manifestNumber")}
                    </label>
                    <Input
                      type="text"
                      placeholder="Ej: MAN-2026-001"
                      value={defaultManifestNumber}
                      onChange={(e) => setDefaultManifestNumber(e.target.value)}
                      className="max-w-xs border-gray-300"
                    />
                    <p className="text-xs text-gray-500">
                      {t("manifests.manifestNumberDescription")}
                    </p>
                  </div>
                )}

                {/* Origen */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-900">
                    {t("manifests.defaultOrigin")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={defaultOrigin}
                    onValueChange={setDefaultOrigin}
                  >
                    <SelectTrigger className="max-w-xs border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USA">USA</SelectItem>
                      <SelectItem value="MX">México</SelectItem>
                      <SelectItem value="CH">China</SelectItem>
                      <SelectItem value="COL">Colombia</SelectItem>
                      <SelectItem value="OTHER">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Destino */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-900">
                    {t("manifests.defaultDestination")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={defaultDestination}
                    onValueChange={setDefaultDestination}
                  >
                    <SelectTrigger className="max-w-xs border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CR">Costa Rica</SelectItem>
                      <SelectItem value="USA">USA</SelectItem>
                      <SelectItem value="MX">México</SelectItem>
                      <SelectItem value="CH">China</SelectItem>
                      <SelectItem value="COL">Colombia</SelectItem>
                      <SelectItem value="OTHER">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Estado */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-900">
                    {t("manifests.defaultStatus")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={defaultStatus}
                    onValueChange={setDefaultStatus}
                  >
                    <SelectTrigger className="max-w-xs border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre-alert">Pre-Alertado</SelectItem>
                      <SelectItem value="received">Recibido</SelectItem>
                      <SelectItem value="in-transit">En Tránsito</SelectItem>
                      <SelectItem value="customs">Aduanas</SelectItem>
                      <SelectItem value="held">Retenido</SelectItem>
                      <SelectItem value="in-route">En Ruta</SelectItem>
                      <SelectItem value="consolidated">Consolidado</SelectItem>
                      <SelectItem value="delivered">Entregado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Tipo de Envío */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-900">
                    {t("manifests.defaultShipmentType")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Select value={defaultType} onValueChange={setDefaultType}>
                    <SelectTrigger className="max-w-xs border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="air">
                        <div className="flex items-center gap-2">
                          <Plane className="h-4 w-4 text-gray-700" />
                          <span>{t("manifests.typeAir")}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="sea">
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-gray-700" />
                          <span>{t("manifests.typeSea")}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="freight">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-gray-700" />
                          <span>{t("manifests.typeFreight")}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="local">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-700" />
                          <span>{t("manifests.typeLocal")}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </div>

      {/* Preview Statistics */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {t("manifests.preview")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3 border-gray-200">
            <p className="text-xs text-gray-600">{t("manifests.totalRows")}</p>
            <p className="text-lg font-bold text-gray-900">
              {processedRows.length}
            </p>
          </Card>
          <Card className="p-3 border-gray-200">
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-gray-800" />
              {t("manifests.validRows")}
            </p>
            <p className="text-lg font-bold text-gray-900">{validCount}</p>
          </Card>
          <Card className="p-3 border-gray-200">
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-gray-700" />
              {t("manifests.duplicateRows")}
            </p>
            <p className="text-lg font-bold text-gray-800">{duplicates.size}</p>
          </Card>
          <Card className="p-3 border-gray-200">
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-gray-700" />
              {t("manifests.errorRows")}
            </p>
            <p className="text-lg font-bold text-gray-800">{errorCount}</p>
          </Card>
        </div>
      </div>

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
          onClick={handleNext}
          disabled={missingRequired.length > 0 || processedRows.length === 0}
          className="bg-gray-900 text-white hover:bg-gray-800 px-8"
          data-testid="next-btn"
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
