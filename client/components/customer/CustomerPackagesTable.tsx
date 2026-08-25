import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { PackageDetailsModal } from "./PackageDetailsModal";
import Papa from "papaparse";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Download,
  Eye,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Package } from "@/types";
import { cn } from "@/lib/utils";

interface CustomerPackagesTableProps {
  packages: Package[];
  className?: string;
}

type SortField =
  | "trackingNumber"
  | "status"
  | "weight"
  | "createdAt"
  | "destination";
type SortDirection = "asc" | "desc";

export function CustomerPackagesTable({
  packages,
  className,
}: CustomerPackagesTableProps) {
  const { t } = useLocale(["customers", "packages", "common"]);
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter and sort packages
  const filteredAndSortedPackages = useMemo(() => {
    let filtered = [...packages];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (pkg) =>
          pkg.trackingNumber.toLowerCase().includes(query) ||
          pkg.destination?.toLowerCase().includes(query) ||
          pkg.origin?.toLowerCase().includes(query),
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((pkg) => pkg.status === statusFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === "createdAt") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortField === "weight") {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [packages, searchQuery, statusFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedPackages.length / pageSize);
  const paginatedPackages = filteredAndSortedPackages.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleExportCSV = () => {
    const csvData = filteredAndSortedPackages.map((pkg) => ({
      trackingNumber: pkg.trackingNumber,
      status: pkg.status,
      weight: pkg.weight,
      origin: pkg.origin,
      destination: pkg.destination,
      route: pkg.route?.name || "",
      createdAt: new Date(pkg.createdAt).toLocaleDateString(),
      value: pkg.calculatedCost || 0,
    }));

    const csv = Papa.unparse(csvData, { header: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `customer-packages-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "delivered":
        return "default";
      case "in_transit":
        return "secondary";
      case "pending":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return t("packages.statusPending");
      case "in_transit":
        return t("packages.statusInTransit");
      case "delivered":
        return t("packages.statusDelivered");
      case "consolidated":
      case "consolidated_completed":
        return t("packages.statusConsolidated");
      default:
        return status;
    }
  };

  if (packages.length === 0) {
    return (
      <div
        className={cn(
          "text-center py-12",
          isDark ? "text-gray-400" : "text-gray-600",
        )}
        data-testid="packages-empty-state"
      >
        <p>{t("customers.detailsPage.packages.noPackages")}</p>
      </div>
    );
  }

  return (
    <div
      className={cn("space-y-4", className)}
      data-testid="packages-table-container"
    >
      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search
              className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4",
                isDark ? "text-gray-400" : "text-gray-500",
              )}
            />
            <Input
              type="text"
              placeholder={t("customers.detailsPage.packages.search")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
              data-testid="input-package-search"
            />
          </div>
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger
            className="w-full sm:w-48"
            data-testid="select-status-filter"
          >
            <SelectValue
              placeholder={t("customers.detailsPage.packages.filterByStatus")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="pending">
              {t("packages.statusPending")}
            </SelectItem>
            <SelectItem value="in_transit">
              {t("packages.statusInTransit")}
            </SelectItem>
            <SelectItem value="delivered">
              {t("packages.statusDelivered")}
            </SelectItem>
            <SelectItem value="consolidated">
              {t("packages.statusConsolidated")}
            </SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={handleExportCSV}
          data-testid="btn-export-csv"
        >
          <Download className="h-4 w-4 mr-2" />
          {t("customers.detailsPage.packages.exportCSV")}
        </Button>
      </div>

      {/* Results count */}
      <div
        className={cn("text-sm", isDark ? "text-gray-400" : "text-gray-600")}
      >
        {t("common.showing")} {paginatedPackages.length} {t("common.of")}{" "}
        {filteredAndSortedPackages.length}{" "}
        {t("customers.detailsPage.packages.title")}
      </div>

      {/* Table */}
      <div
        className={cn(
          "rounded-lg border overflow-x-auto",
          isDark ? "border-gray-700" : "border-gray-200",
        )}
      >
        <Table data-testid="packages-table">
          <TableHeader>
            <TableRow className={isDark ? "bg-gray-800" : "bg-gray-50"}>
              <TableHead>
                <button
                  onClick={() => handleSort("trackingNumber")}
                  className="flex items-center gap-1 hover:underline"
                  data-testid="sort-tracking"
                >
                  {t("customers.detailsPage.packages.columns.tracking")}
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("status")}
                  className="flex items-center gap-1 hover:underline"
                  data-testid="sort-status"
                >
                  {t("customers.detailsPage.packages.columns.status")}
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("weight")}
                  className="flex items-center gap-1 hover:underline"
                  data-testid="sort-weight"
                >
                  {t("customers.detailsPage.packages.columns.weight")}
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </TableHead>
              <TableHead>
                {t("customers.detailsPage.packages.columns.origin")}
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("destination")}
                  className="flex items-center gap-1 hover:underline"
                  data-testid="sort-destination"
                >
                  {t("customers.detailsPage.packages.columns.destination")}
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("createdAt")}
                  className="flex items-center gap-1 hover:underline"
                  data-testid="sort-created"
                >
                  {t("customers.detailsPage.packages.columns.created")}
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                {t("customers.detailsPage.packages.columns.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedPackages.map((pkg) => (
              <TableRow
                key={pkg.id}
                className={cn(
                  "cursor-pointer hover:bg-opacity-50",
                  isDark ? "hover:bg-gray-700" : "hover:bg-gray-50",
                )}
                onClick={() => {
                  setSelectedPackage(pkg);
                  setIsModalOpen(true);
                }}
                data-testid={`package-row-${pkg.id}`}
              >
                <TableCell className="font-mono text-sm">
                  {pkg.trackingNumber}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(pkg.status)}>
                    {getStatusLabel(pkg.status)}
                  </Badge>
                </TableCell>
                <TableCell>{pkg.weight} kg</TableCell>
                <TableCell>{pkg.origin}</TableCell>
                <TableCell>{pkg.destination}</TableCell>
                <TableCell>
                  {new Date(pkg.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPackage(pkg);
                      setIsModalOpen(true);
                    }}
                    data-testid={`btn-view-${pkg.id}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {t("customers.detailsPage.packages.viewDetails")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm",
              isDark ? "text-gray-400" : "text-gray-600",
            )}
          >
            {t("common.rowsPerPage")}:
          </span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-20" data-testid="select-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm",
              isDark ? "text-gray-400" : "text-gray-600",
            )}
          >
            {t("common.page")} {currentPage} {t("common.of")} {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            data-testid="btn-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentPage(Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage === totalPages}
            data-testid="btn-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Package Details Modal */}
      <PackageDetailsModal
        package={selectedPackage}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPackage(null);
        }}
        onViewFullDetails={(packageId) => {
          setIsModalOpen(false);
          navigate(`/tracking/${packageId}`);
        }}
      />
    </div>
  );
}
