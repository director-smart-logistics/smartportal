"use client";

import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/use-toast";

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  SearchIcon,
  PencilIcon,
  CopyIcon,
  RefreshCwIcon,
} from "lucide-react";

import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowData,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getPaginationRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import { SkeletonDataTable } from "@/components/SkeletonLoaders";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    filterVariant?: "text" | "select";
  }
}

export type CustomerTableItem = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dni?: string;
  city?: string;
  country?: string;
  status: "active" | "inactive" | "suspended";
  memberSince?: string;
  createdAt: string;
  slCode?: string;
};

interface CustomerDatatableProps {
  data: CustomerTableItem[];
  isLoading?: boolean;
  onEdit?: (customer: CustomerTableItem) => void;
  onStatusChange?: (customerId: string, status: "active" | "inactive") => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

const CustomerDatatable = ({
  data,
  isLoading = false,
  onEdit,
  onStatusChange,
  onSync,
  isSyncing = false,
}: CustomerDatatableProps) => {
  const { t } = useLocale(["customers", "common"]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const pageSize = 5;

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize,
  });

  const columns: ColumnDef<CustomerTableItem>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
            aria-label={t("common.actions")}
            data-testid="select-all-checkbox"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t("customers.selectRow")}
            data-testid={`select-row-${row.original.id}`}
          />
        ),
        size: 50,
      },
      {
        header: t("customers.customer"),
        accessorKey: "fullName",
        filterFn: (row, columnId, filterValue: string) => {
          if (!filterValue) return true;
          const searchValue = filterValue.toLowerCase();
          const fullName = (row.original.fullName || "").toLowerCase();
          const email = (row.original.email || "").toLowerCase();
          const phone = (row.original.phone || "").toLowerCase();
          const dni = (row.original.dni || "").toLowerCase();
          const slCode = (row.original.slCode || "").toLowerCase();
          return (
            fullName.includes(searchValue) ||
            email.includes(searchValue) ||
            phone.includes(searchValue) ||
            dni.includes(searchValue) ||
            slCode.includes(searchValue)
          );
        },
        cell: ({ row }) => (
          <div
            className="flex flex-col gap-1"
            data-testid={`customer-cell-${row.original.id}`}
          >
            <button
              onClick={() => navigate(`/customers/${row.original.id}`)}
              className="font-medium text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300 hover:underline transition-colors text-left"
              data-testid={`customer-name-${row.original.id}`}
            >
              {row.getValue("fullName")}
            </button>
            <span
              className="text-muted-foreground text-xs"
              data-testid={`customer-sl-code-${row.original.id}`}
            >
              {row.original.slCode || "-"}
            </span>
            <div className="flex items-center gap-1">
              <span
                className="text-muted-foreground text-xs"
                data-testid={`customer-email-${row.original.id}`}
              >
                {row.original.email || "-"}
              </span>
              {row.original.email && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(row.original.email);
                    toast({
                      title: t("common.copied") || "Copied",
                      description:
                        t("common.emailCopied") || "Email copied to clipboard",
                      duration: 2000,
                    });
                  }}
                  className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  title={t("customers.copyEmail")}
                  data-testid={`copy-email-${row.original.id}`}
                >
                  <CopyIcon
                    size={12}
                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                  />
                </button>
              )}
            </div>
          </div>
        ),
        size: 220,
        meta: {
          filterVariant: "text",
          filterPlaceholder: t("customers.searchPlaceholderFilter"),
        },
      },
      {
        header: t("common.phone"),
        accessorKey: "phone",
        cell: ({ row }) => (
          <div
            className="flex items-center gap-1"
            data-testid={`phone-cell-${row.original.id}`}
          >
            <span
              className="text-sm text-foreground"
              data-testid={`phone-${row.original.id}`}
            >
              {row.getValue("phone") || "-"}
            </span>
            {row.getValue("phone") && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    row.getValue("phone") as string,
                  );
                  toast({
                    title: t("common.copied") || "Copied",
                    description:
                      t("common.phoneCopied") ||
                      "Phone number copied to clipboard",
                    duration: 2000,
                  });
                }}
                className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                title={t("customers.copyPhone")}
                data-testid={`copy-phone-${row.original.id}`}
              >
                <CopyIcon
                  size={12}
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                />
              </button>
            )}
          </div>
        ),
        size: 140,
      },
      {
        header: t("customers.idNumber"),
        accessorKey: "dni",
        cell: ({ row }) => (
          <span
            className="text-sm text-foreground"
            data-testid={`dni-cell-${row.original.id}`}
          >
            {row.getValue("dni") || "-"}
          </span>
        ),
        size: 140,
      },
      {
        header: t("packages.status"),
        accessorKey: "status",
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          const isActive = status === "active";

          return (
            <div
              className="flex items-center gap-2"
              data-testid={`status-cell-${row.original.id}`}
            >
              <Switch
                checked={isActive}
                onCheckedChange={() => {
                  onStatusChange?.(
                    row.original.id,
                    isActive ? "inactive" : "active",
                  );
                }}
                aria-label={`Toggle ${status} status`}
                data-testid={`status-switch-${row.original.id}`}
              />
              <Badge
                variant="outline"
                className={cn("capitalize font-medium text-xs", {
                  "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700":
                    status === "active",
                  "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800":
                    status === "inactive",
                  "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700":
                    status === "suspended",
                })}
                data-testid={`status-badge-${row.original.id}`}
              >
                {status}
              </Badge>
            </div>
          );
        },
        size: 160,
        meta: {
          filterVariant: "select",
        },
      },
      {
        header: t("customers.joined"),
        accessorKey: "memberSince",
        cell: ({ row }) => {
          const memberSince = row.original.memberSince;
          const createdAt = row.original.createdAt;
          // Use memberSince if available, otherwise fall back to createdAt
          const date = new Date(memberSince || createdAt);
          return (
            <span
              className="text-sm text-foreground"
              data-testid={`joined-date-${row.original.id}`}
            >
              {date.toLocaleDateString()}
            </span>
          );
        },
        size: 120,
      },
      {
        id: "actions",
        header: () => t("common.actions"),
        cell: ({ row }) => (
          <CustomerRowActions
            customer={row.original}
            onEdit={onEdit}
            t={t}
            testId={`actions-${row.original.id}`}
          />
        ),
        size: 60,
        enableHiding: false,
      },
    ],
    [onEdit, onStatusChange, t],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      columnFilters,
      pagination,
    },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
  });

  const exportToCSV = () => {
    // ALWAYS export ALL customers (not filtered or selected)
    // This ensures users get the complete dataset for import/export workflows
    const allCustomers = data;

    // Map to CSV structure with all fields including new migration fields
    const csvData = allCustomers.map((customer) => ({
      fullName: customer.fullName || "",
      firstName: (customer as any).firstName || "",
      lastName: (customer as any).lastName || "",
      idNumber: (customer as any).idNumber || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: (customer as any).address || "",
      city: customer.city || "",
      country: customer.country || "",
      zipCode: (customer as any).zipCode || "",
      slCode: customer.slCode || "",
      deliveryAddress1: (customer as any).deliveryAddress1 || "",
      deliveryAddress2: (customer as any).deliveryAddress2 || "",
      deliveryAddress3: (customer as any).deliveryAddress3 || "",
      preferredRouteId: (customer as any).preferredRouteId || "",
      notes: (customer as any).notes || "",
      status: customer.status || "active",
    }));

    const csv = Papa.unparse(csvData, { header: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `customers-export-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: t("common.success"),
      description: `${allCustomers.length} ${t("customers.total")} exported to CSV`,
    });
  };

  const exportToExcel = () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const dataToExport =
      selectedRows.length > 0
        ? selectedRows.map((row) => row.original)
        : table.getFilteredRowModel().rows.map((row) => row.original);

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    const cols = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    worksheet["!cols"] = cols;
    XLSX.writeFile(
      workbook,
      `customers-export-${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const exportToJSON = () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const dataToExport =
      selectedRows.length > 0
        ? selectedRows.map((row) => row.original)
        : table.getFilteredRowModel().rows.map((row) => row.original);

    const json = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `customers-export-${new Date().toISOString().split("T")[0]}.json`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay: 2,
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <SkeletonDataTable rows={10} />
      </div>
    );
  }

  return (
    <div
      className="w-full space-y-4"
      data-testid="customer-datatable-container"
    >
      {/* Actions Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Label
            htmlFor="rowSelect"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
          >
            {t("common.rows")}
          </Label>
          <Select
            value={table.getState().pagination.pageSize.toString()}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger id="rowSelect" className="w-fit h-9">
              <SelectValue placeholder="5" />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search Filter */}
          <Filter
            column={table.getColumn("fullName")!}
            t={t}
            testId="customer-search-filter"
            inline
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sync Button */}
          {onSync && (
            <Button
              onClick={onSync}
              size="sm"
              variant="outline"
              className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              disabled={isSyncing}
              data-testid="sync-button"
            >
              <RefreshCwIcon
                className={cn("h-4 w-4", isSyncing && "animate-spin")}
              />
              <span className="hidden sm:inline">
                {isSyncing ? t("common.processing") : "Sync"}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <Table>
          <TableHeader className="bg-slate-100/50 dark:bg-slate-900/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-slate-200 dark:border-slate-800 hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: `${header.getSize()}px` }}
                      className="h-12 px-4 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 first:pl-4 last:pr-4"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          className={cn(
                            "flex h-full items-center justify-between gap-2 select-none hover:text-slate-900 dark:hover:text-slate-100 transition-colors",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (
                              header.column.getCanSort() &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {{
                            asc: (
                              <ChevronUpIcon
                                className="shrink-0 opacity-70"
                                size={16}
                                aria-hidden="true"
                              />
                            ),
                            desc: (
                              <ChevronDownIcon
                                className="shrink-0 opacity-70"
                                size={16}
                                aria-hidden="true"
                              />
                            ),
                          }[header.column.getIsSorted() as string] ?? null}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-950/50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="h-14 px-4 text-sm text-slate-900 dark:text-slate-100 first:pl-4 last:pr-4"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {t("customers.noCustomers")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          className="text-xs font-medium text-muted-foreground"
          aria-live="polite"
        >
          {t("common.showing")}{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {table.getRowModel().rows.length === 0
              ? 0
              : table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                1}
            {" - "}
            {Math.min(
              table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                table.getState().pagination.pageSize,
              table.getRowCount(),
            )}
          </span>{" "}
          {t("common.of")}{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {table.getRowCount().toString()}
          </span>
        </p>

        <div>
          <Pagination>
            <PaginationContent className="gap-1">
              <PaginationItem>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="h-9 disabled:opacity-50 border-slate-300 dark:border-slate-700"
                  aria-label={t("common.previous")}
                >
                  <ChevronLeftIcon size={16} className="mr-1" />
                  <span className="hidden sm:inline text-xs">
                    {t("common.previous")}
                  </span>
                </Button>
              </PaginationItem>

              {showLeftEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              {pages.map((page) => {
                const isActive =
                  page === table.getState().pagination.pageIndex + 1;

                return (
                  <PaginationItem key={page}>
                    <Button
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className={cn("h-9 w-9 p-0", {
                        "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200":
                          isActive,
                        "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900":
                          !isActive,
                      })}
                      onClick={() => table.setPageIndex(page - 1)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {page}
                    </Button>
                  </PaginationItem>
                );
              })}

              {showRightEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              <PaginationItem>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="h-9 disabled:opacity-50 border-slate-300 dark:border-slate-700"
                  aria-label={t("common.next")}
                >
                  <span className="hidden sm:inline text-xs">
                    {t("common.next")}
                  </span>
                  <ChevronRightIcon size={16} className="ml-1" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
};

export default CustomerDatatable;

function Filter({
  column,
  t,
  testId,
  inline,
}: {
  column: Column<any, unknown>;
  t: any;
  testId?: string;
  inline?: boolean;
}) {
  const id = useId();
  const columnFilterValue = column.getFilterValue();
  const { filterVariant } = column.columnDef.meta ?? {};
  const columnHeader =
    typeof column.columnDef.header === "string" ? column.columnDef.header : "";

  const sortedUniqueValues = useMemo(() => {
    const values = Array.from(column.getFacetedUniqueValues().keys());
    const flattenedValues = values.reduce((acc: string[], curr) => {
      if (Array.isArray(curr)) {
        return [...acc, ...curr];
      }
      return [...acc, curr];
    }, []);

    return Array.from(new Set(flattenedValues)).sort();
  }, [column.getFacetedUniqueValues(), filterVariant]);

  if (filterVariant === "select") {
    if (inline) {
      return (
        <div className="flex items-center gap-2" data-testid={testId}>
          <Label
            htmlFor={`${id}-select`}
            className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300"
          >
            {columnHeader}
          </Label>
          <Select
            value={columnFilterValue?.toString() ?? "all"}
            onValueChange={(value) => {
              column.setFilterValue(value === "all" ? undefined : value);
            }}
          >
            <SelectTrigger
              id={`${id}-select`}
              className="w-48 h-9 border-slate-300 dark:border-slate-700"
              data-testid={`${testId}-trigger`}
            >
              <SelectValue
                placeholder={`${t("customers.filterStatus")} ${columnHeader.toLowerCase()}`}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("customers.all")}</SelectItem>
              {sortedUniqueValues.map((value) => (
                <SelectItem
                  key={String(value)}
                  value={String(value)}
                  className="capitalize"
                >
                  {String(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <div className="w-full space-y-2" data-testid={testId}>
        <Label
          htmlFor={`${id}-select`}
          className="text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          {columnHeader}
        </Label>
        <Select
          value={columnFilterValue?.toString() ?? "all"}
          onValueChange={(value) => {
            column.setFilterValue(value === "all" ? undefined : value);
          }}
        >
          <SelectTrigger
            id={`${id}-select`}
            className="h-9 border-slate-300 dark:border-slate-700"
            data-testid={`${testId}-trigger`}
          >
            <SelectValue
              placeholder={`${t("customers.filterStatus")} ${columnHeader.toLowerCase()}`}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("customers.all")}</SelectItem>
            {sortedUniqueValues.map((value) => (
              <SelectItem
                key={String(value)}
                value={String(value)}
                className="capitalize"
              >
                {String(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (inline) {
    return (
      <div className="flex items-center gap-2" data-testid={testId}>
        <Label
          htmlFor={`${id}-input`}
          className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300"
        >
          {columnHeader}
        </Label>
        <div className="relative">
          <Input
            id={`${id}-input`}
            type="text"
            value={(columnFilterValue ?? "") as string}
            onChange={(e) => column.setFilterValue(e.target.value)}
            placeholder={`${t("customers.search")} ${columnHeader.toLowerCase()}`}
            className="h-9 w-48 pl-9 border-slate-300 dark:border-slate-700 text-sm"
            data-testid={`${testId}-input`}
          />
          <div className="text-slate-400 dark:text-slate-600 pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3">
            <SearchIcon size={16} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2" data-testid={testId}>
      <Label
        htmlFor={`${id}-input`}
        className="text-xs font-medium text-slate-700 dark:text-slate-300"
      >
        {columnHeader}
      </Label>
      <div className="relative">
        <Input
          id={`${id}-input`}
          className="h-9 pl-9 border-slate-300 dark:border-slate-700 text-sm"
          value={(columnFilterValue ?? "") as string}
          onChange={(e) => column.setFilterValue(e.target.value)}
          placeholder={`${t("common.search")} ${columnHeader.toLowerCase()}`}
          type="text"
          data-testid={`${testId}-input`}
        />
        <div className="text-slate-400 dark:text-slate-600 pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3">
          <SearchIcon size={16} />
        </div>
      </div>
    </div>
  );
}

function CustomerRowActions({
  customer,
  onEdit,
  t,
  testId,
}: {
  customer: CustomerTableItem;
  onEdit?: (customer: CustomerTableItem) => void;
  t: any;
  testId?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800"
        aria-label={t("customers.view")}
        title={t("customers.viewDetails")}
        onClick={() => navigate(`/customers/${customer.id}`)}
        data-testid={`${testId}-view`}
      >
        <EyeIcon
          className="h-4 w-4 text-slate-600 dark:text-slate-400"
          aria-hidden="true"
        />
      </Button>

      {onEdit && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800"
          aria-label={t("common.edit")}
          title={t("common.edit")}
          onClick={() => onEdit(customer)}
          data-testid={`${testId}-edit`}
        >
          <PencilIcon
            className="h-4 w-4 text-slate-600 dark:text-slate-400"
            aria-hidden="true"
          />
        </Button>
      )}
    </div>
  );
}
