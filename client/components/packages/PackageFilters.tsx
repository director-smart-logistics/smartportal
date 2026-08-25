import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, X, FileText, Calendar, Ship } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { useState } from "react";

interface PackageFilters {
  manifestNumber: string;
  type: "air" | "sea" | "other" | "";
  dateFrom: string;
  dateTo: string;
}

interface PackageFiltersProps {
  onFiltersChange: (filters: PackageFilters) => void;
  loading?: boolean;
  initialFilters?: PackageFilters;
}

export function PackageFilters({
  onFiltersChange,
  loading = false,
  initialFilters,
}: PackageFiltersProps) {
  const { t } = useLocale(["packages", "common"]);
  const [filters, setFilters] = useState<PackageFilters>(
    initialFilters || {
      manifestNumber: "",
      type: "",
      dateFrom: "",
      dateTo: "",
    },
  );

  const handleInputChange = (field: keyof PackageFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplyFilters = () => {
    onFiltersChange(filters);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      manifestNumber: "",
      type: "" as "" | "other" | "air" | "sea",
      dateFrom: "",
      dateTo: "",
    };
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const hasActiveFilters =
    filters.manifestNumber ||
    filters.type ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Manifest Number - Prominent */}
      <div className="flex items-center gap-2 min-w-[280px] flex-1">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <Input
          id="manifestNumber"
          placeholder="Buscar por manifiesto..."
          value={filters.manifestNumber}
          onChange={(e) => handleInputChange("manifestNumber", e.target.value)}
          className="font-mono h-9"
        />
      </div>

      {/* Type */}
      <div className="flex items-center gap-2 min-w-[150px]">
        <Ship className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filters.type}
          onValueChange={(value) => handleInputChange("type", value)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="air">Aéreo</SelectItem>
            <SelectItem value="sea">Marítimo</SelectItem>
            <SelectItem value="other">Otro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Date From */}
      <div className="flex items-center gap-2 min-w-[140px]">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Input
          id="dateFrom"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => {
            const val = e.target.value;
            setFilters((prev) => ({ ...prev, dateFrom: val, dateTo: val }));
          }}
          className="h-9"
        />
      </div>

      {/* Date To */}
      <div className="flex items-center gap-2 min-w-[140px]">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Input
          id="dateTo"
          type="date"
          value={filters.dateTo}
          onChange={(e) => handleInputChange("dateTo", e.target.value)}
          className="h-9"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 ml-auto">
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={loading}
            className="h-9 px-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          onClick={handleApplyFilters}
          disabled={loading}
          className="h-9 px-4"
        >
          <Search className="h-4 w-4 mr-2" />
          {loading ? "..." : "Buscar"}
        </Button>
      </div>
    </div>
  );
}
