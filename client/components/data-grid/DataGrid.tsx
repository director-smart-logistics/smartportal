import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Settings2,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonDataTable } from "@/components/SkeletonLoaders";
import { useLocale } from "@/hooks/useLocale";

export interface DataGridColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  render?: (value: any, row: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
}

export interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  data: T[];
  pageSize?: number;
  searchableFields?: (keyof T)[];
  onRowClick?: (row: T, index: number) => void;
  onExport?: (data: T[]) => void;
  title?: string;
  description?: string;
  loading?: boolean;
  emptyMessage?: string;
  rowClassName?: (row: T, index: number) => string;
  hideColumnToggle?: boolean;
}

export function DataGrid<T extends Record<string, any>>({
  columns,
  data,
  pageSize = 10,
  searchableFields = [],
  onRowClick,
  onExport,
  title,
  description,
  loading = false,
  emptyMessage = "No data found",
  rowClassName,
  hideColumnToggle = false,
}: DataGridProps<T>) {
  const { t } = useLocale(["common"]);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(columns.map((col) => String(col.key))),
  );

  // Filter data
  const filteredData = useMemo(() => {
    if (!searchQuery || searchableFields.length === 0) {
      return data;
    }

    const lowerQuery = searchQuery.toLowerCase();
    return data.filter((row) =>
      searchableFields.some((field) => {
        const value = row[field];
        return String(value).toLowerCase().includes(lowerQuery);
      }),
    );
  }, [data, searchQuery, searchableFields]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortBy) return filteredData;

    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    return sorted;
  }, [filteredData, sortBy, sortOrder]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedData.slice(startIdx, startIdx + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (column: DataGridColumn<T>) => {
    if (!column.sortable) return;

    if (sortBy === String(column.key)) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(String(column.key));
      setSortOrder("asc");
    }
  };

  const toggleColumnVisibility = (key: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleColumns(newVisible);
  };

  const handleExport = () => {
    if (onExport) {
      onExport(sortedData);
    }
  };

  const visibleColumnsArray = columns.filter((col) =>
    visibleColumns.has(String(col.key)),
  );

  return (
    <Card className="w-full" role="region" aria-label={title || "Data table"}>
      {/* Header */}
      {(title || description || searchableFields.length > 0) && (
        <div className="p-6 border-b">
          {title && (
            <h3 className="text-lg font-semibold mb-1" id="datagrid-title">
              {title}
            </h3>
          )}
          {description && (
            <p
              className="text-sm text-muted-foreground mb-4"
              id="datagrid-description"
            >
              {description}
            </p>
          )}

          <div className="flex items-center gap-2">
            {searchableFields.length > 0 && (
              <div className="flex-1 relative">
                <label htmlFor="datagrid-search-input" className="sr-only">
                  {t("search")}
                </label>
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="datagrid-search-input"
                  placeholder={t("common.search") + "..."}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 h-9"
                  data-testid="datagrid-search"
                  aria-label={t("common.search")}
                />
              </div>
            )}

            {onExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                data-testid="datagrid-export"
                aria-label={t("common.export")}
              >
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("common.export")}
              </Button>
            )}

            {!hideColumnToggle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="datagrid-columns"
                    aria-label="Toggle column visibility"
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-sm font-semibold">
                    {t("common.columns")}
                  </div>
                  <DropdownMenuSeparator />
                  {columns.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={String(col.key)}
                      checked={visibleColumns.has(String(col.key))}
                      onCheckedChange={() =>
                        toggleColumnVisibility(String(col.key))
                      }
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="p-6">
          <SkeletonDataTable rows={pageSize} />
        </div>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Table data"
          aria-describedby={description ? "datagrid-description" : undefined}
        >
          <Table
            role="table"
            aria-labelledby={title ? "datagrid-title" : undefined}
          >
            <TableHeader>
              <TableRow role="row">
                {visibleColumnsArray.map((col) => (
                  <TableHead
                    key={String(col.key)}
                    className={cn(
                      col.width && `w-[${col.width}]`,
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                    )}
                    role="columnheader"
                    scope="col"
                    aria-sort={
                      sortBy === String(col.key)
                        ? sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {col.sortable ? (
                      <button
                        onClick={() => handleSort(col)}
                        className={cn(
                          "flex items-center gap-2 font-semibold cursor-pointer hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary rounded px-1",
                          sortBy === String(col.key)
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                        data-testid={`sort-${String(col.key)}`}
                        aria-label={`${col.label}, sortable column. Click to sort`}
                      >
                        {col.label}
                        <ArrowUpDown
                          className={cn(
                            "h-3 w-3",
                            sortBy === String(col.key) &&
                              sortOrder === "desc" &&
                              "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow role="row">
                  <TableCell
                    colSpan={visibleColumnsArray.length}
                    className="text-center py-8"
                    role="cell"
                  >
                    <p className="text-muted-foreground" role="status">
                      {emptyMessage}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row, idx) => (
                  <TableRow
                    key={idx}
                    className={cn(
                      onRowClick &&
                        "cursor-pointer hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary",
                      rowClassName?.(row, idx),
                    )}
                    onClick={() => onRowClick?.(row, idx)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && onRowClick) {
                        onRowClick(row, idx);
                      }
                    }}
                    tabIndex={onRowClick ? 0 : -1}
                    role="row"
                    data-testid={`datagrid-row-${idx}`}
                    aria-rowindex={idx + 1}
                  >
                    {visibleColumnsArray.map((col) => (
                      <TableCell
                        key={String(col.key)}
                        className={cn(
                          col.align === "center" && "text-center",
                          col.align === "right" && "text-right",
                        )}
                      >
                        {col.render
                          ? col.render(row[String(col.key)], row, idx)
                          : row[String(col.key)]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between p-4 border-t bg-muted/50">
        <div
          className="text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {t("common.showing")}{" "}
          {paginatedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}{" "}
          {t("common.to")} {Math.min(currentPage * pageSize, sortedData.length)}{" "}
          {t("common.of")} {sortedData.length}
        </div>
        <nav
          className="flex items-center gap-1"
          aria-label="Pagination"
          role="navigation"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            data-testid="datagrid-first"
            aria-label={t("common.firstPage")}
            aria-disabled={currentPage === 1}
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => p - 1)}
            disabled={currentPage === 1}
            data-testid="datagrid-prev"
            aria-label={t("common.previousPage")}
            aria-disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          <div className="px-2 text-sm" aria-live="polite" aria-atomic="true">
            {t("common.page")} {currentPage} {t("common.of")} {totalPages}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => p + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
            data-testid="datagrid-next"
            aria-label={t("common.nextPage")}
            aria-disabled={currentPage === totalPages || totalPages === 0}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0}
            data-testid="datagrid-last"
            aria-label={t("common.lastPage")}
            aria-disabled={currentPage === totalPages || totalPages === 0}
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </Card>
  );
}
