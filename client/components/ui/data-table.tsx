import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  X,
  Edit,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ColumnDef<T> {
  accessorKey: string;
  header: string | React.ReactNode;
  cell?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  filterable?: boolean;
  filterOptions?: { value: string; label: string }[];
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  onDelete?: (row: T) => void;
  onEdit?: (row: T) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  pageSize?: number;
  className?: string;
  showCheckbox?: boolean;
}

export function DataTable<T extends { id?: string }>(
  {
    columns,
    data,
    isLoading = false,
    onRowClick,
    onDelete,
    onEdit,
    onSelectionChange,
    searchPlaceholder = "Search...",
    emptyMessage = "No data found",
    pageSize = 10,
    className,
    showCheckbox = true,
  }: DataTableProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const [sortBy, setSortBy] = React.useState<string>("");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterBy, setFilterBy] = React.useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(
    new Set(),
  );

  // Filter columns
  const filterableColumns = React.useMemo(
    () => columns.filter((col) => col.filterable),
    [columns],
  );

  // Filter data
  const filteredData = React.useMemo(() => {
    let result = [...data];

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const value = (row as any)[col.accessorKey];
          return String(value).toLowerCase().includes(query);
        }),
      );
    }

    // Apply filters
    Object.entries(filterBy).forEach(([key, value]) => {
      if (value) {
        result = result.filter((row) => String((row as any)[key]) === value);
      }
    });

    return result;
  }, [data, searchQuery, filterBy, columns]);

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!sortBy) return filteredData;

    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];

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
  const paginatedData = React.useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedData.slice(startIdx, startIdx + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(columnKey);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (columnKey: string) => {
    if (sortBy !== columnKey) {
      return <ChevronsUpDown className="w-4 h-4 opacity-50" />;
    }
    return sortOrder === "asc" ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  const handleSelectRow = (rowId: string | undefined) => {
    if (!rowId) return;
    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowId)) {
      newSelected.delete(rowId);
    } else {
      newSelected.add(rowId);
    }
    setSelectedRows(newSelected);
    onSelectionChange?.(Array.from(newSelected));
  };

  const handleSelectAll = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    } else {
      const newSelected = new Set(paginatedData.map((row) => (row as any).id));
      setSelectedRows(newSelected);
      onSelectionChange?.(Array.from(newSelected));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("space-y-4", className)}>
      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search */}
        <Input
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="max-w-sm border-gray-200 dark:border-gray-700"
        />

        {/* Column Filters */}
        {filterableColumns.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filterableColumns.map((col) => (
              <Select
                key={col.accessorKey}
                value={filterBy[col.accessorKey] || ""}
                onValueChange={(value) => {
                  setFilterBy((prev) => ({
                    ...prev,
                    [col.accessorKey]: value,
                  }));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[180px] border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder={`Filter by ${col.header}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {col.filterOptions?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            {Object.values(filterBy).some((v) => v) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterBy({});
                  setCurrentPage(1);
                }}
                className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50"
              >
                <X className="w-4 h-4 mr-1" />
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <TableRow className="hover:bg-transparent">
              {showCheckbox && (
                <TableHead className="w-12 px-4 py-3 text-left">
                  <Checkbox
                    checked={
                      paginatedData.length > 0 &&
                      selectedRows.size === paginatedData.length
                    }
                    onCheckedChange={() => handleSelectAll()}
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.accessorKey}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide",
                    column.sortable &&
                      "cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors",
                    column.headerClassName,
                  )}
                  onClick={() =>
                    column.sortable && handleSort(column.accessorKey)
                  }
                >
                  <div className="flex items-center gap-2">
                    <span>{column.header}</span>
                    {column.sortable && getSortIcon(column.accessorKey)}
                  </div>
                </TableHead>
              ))}
              {(onEdit || onDelete) && (
                <TableHead className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Actions
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={
                    columns.length +
                    (onEdit || onDelete ? 1 : 0) +
                    (showCheckbox ? 1 : 0)
                  }
                  className="text-center py-12 text-gray-500 dark:text-gray-400"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, idx) => {
                const rowId = (row as any).id;
                const isSelected = selectedRows.has(rowId);
                return (
                  <TableRow
                    key={rowId || idx}
                    className={cn(
                      "border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors",
                      isSelected && "bg-gray-100 dark:bg-gray-800/50",
                      onRowClick && !showCheckbox && "cursor-pointer",
                    )}
                  >
                    {showCheckbox && (
                      <TableCell
                        className="w-12 px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelectRow(rowId)}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell
                        key={column.accessorKey}
                        className={cn(
                          "px-4 py-3 text-sm text-gray-900 dark:text-gray-100",
                          column.className,
                          onRowClick && !showCheckbox && "cursor-pointer",
                        )}
                        onClick={() => !showCheckbox && onRowClick?.(row)}
                      >
                        {column.cell
                          ? column.cell((row as any)[column.accessorKey], row)
                          : (row as any)[column.accessorKey]}
                      </TableCell>
                    ))}
                    {(onEdit || onDelete) && (
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {onEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(row);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(row);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Showing {(currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, sortedData.length)} of{" "}
            {sortedData.length} results
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 disabled:opacity-50"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 disabled:opacity-50"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

DataTable.displayName = "DataTable";
