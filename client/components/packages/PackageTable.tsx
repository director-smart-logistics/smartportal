import { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
  Edit,
  Trash2,
  EyeIcon,
  Package as PackageIcon,
  Plane,
  MapPin,
  Truck,
  CheckCircle,
} from "lucide-react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { TimelineStage } from "@/components/packages/TimelineStage";
import type { Package } from "@/types";

interface PackageTableProps {
  data: (Package & { calculatedCost?: number })[];
  onEdit: (pkg: Package) => void;
  onDelete: (pkg: Package) => void;
}

const PACKAGE_STATUSES = [
  {
    value: "pending",
    label: "Pending",
    color: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  {
    value: "intake",
    label: "Intake",
    color: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  {
    value: "in_transit",
    label: "In Transit",
    color: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  {
    value: "custom_released",
    label: "Custom Released",
    color: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  {
    value: "consolidated_completed",
    label: "Consolidated",
    color: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  {
    value: "delivered",
    label: "Delivered",
    color: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  {
    value: "failed",
    label: "Failed",
    color: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
];

interface ExpandedRows {
  [key: string]: boolean;
}

const STATUS_TIMELINE: Record<string, any[]> = {
  pending: [
    {
      title: "Pending",
      description: "Package registered in the system",
      date: "2025-01-15 09:30 AM",
      isCompleted: true,
      isCurrent: true,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
  ],
  intake: [
    {
      title: "Pending",
      description: "Package registered in the system",
      date: "2025-01-15 09:30 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "Intake",
      description: "Package received and scanned",
      date: "2025-01-15 02:15 PM",
      isCompleted: true,
      isCurrent: true,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
  ],
  in_transit: [
    {
      title: "Pending",
      description: "Package registered in the system",
      date: "2025-01-15 09:30 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "Intake",
      description: "Package received and scanned",
      date: "2025-01-15 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "In Transit",
      description: "Shipped from Miami hub",
      date: "2025-01-16 02:15 PM",
      isCompleted: true,
      isCurrent: true,
      icon: <Plane className="h-4 w-4 inline" />,
    },
    {
      title: "In Customs",
      description: "Customs clearance in progress",
      date: "2025-01-17 11:00 AM",
      isCompleted: false,
      isCurrent: false,
      icon: <MapPin className="h-4 w-4 inline" />,
    },
  ],
  custom_released: [
    {
      title: "Pending",
      description: "Package registered in the system",
      date: "2025-01-15 09:30 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "Intake",
      description: "Package received and scanned",
      date: "2025-01-15 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "In Transit",
      description: "Shipped from Miami hub",
      date: "2025-01-16 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <Plane className="h-4 w-4 inline" />,
    },
    {
      title: "In Customs",
      description: "Customs clearance completed",
      date: "2025-01-17 11:00 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <MapPin className="h-4 w-4 inline" />,
    },
    {
      title: "Released from Customs",
      description: "Package consolidation",
      date: "2025-01-18 04:45 PM",
      isCompleted: true,
      isCurrent: true,
      icon: <Truck className="h-4 w-4 inline" />,
    },
  ],
  consolidated_completed: [
    {
      title: "Pending",
      description: "Package registered in the system",
      date: "2025-01-15 09:30 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "Intake",
      description: "Package received and scanned",
      date: "2025-01-15 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "In Transit",
      description: "Shipped from Miami hub",
      date: "2025-01-16 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <Plane className="h-4 w-4 inline" />,
    },
    {
      title: "In Customs",
      description: "Customs clearance completed",
      date: "2025-01-17 11:00 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <MapPin className="h-4 w-4 inline" />,
    },
    {
      title: "Consolidated",
      description: "Package consolidation completed",
      date: "2025-01-18 04:45 PM",
      isCompleted: true,
      isCurrent: true,
      icon: <Truck className="h-4 w-4 inline" />,
    },
  ],
  delivered: [
    {
      title: "Pending",
      description: "Package registered in the system",
      date: "2025-01-15 09:30 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "Intake",
      description: "Package received and scanned",
      date: "2025-01-15 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "In Transit",
      description: "Shipped from Miami hub",
      date: "2025-01-16 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <Plane className="h-4 w-4 inline" />,
    },
    {
      title: "In Customs",
      description: "Customs clearance completed",
      date: "2025-01-17 11:00 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <MapPin className="h-4 w-4 inline" />,
    },
    {
      title: "In Route",
      description: "Out for delivery",
      date: "2025-01-19 08:00 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <Truck className="h-4 w-4 inline" />,
    },
    {
      title: "Delivered",
      description: "Package delivered successfully",
      date: "2025-01-19 04:30 PM",
      isCompleted: true,
      isCurrent: true,
      icon: <CheckCircle className="h-4 w-4 inline" />,
    },
  ],
  failed: [
    {
      title: "Pending",
      description: "Package registered in the system",
      date: "2025-01-15 09:30 AM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "Intake",
      description: "Package received and scanned",
      date: "2025-01-15 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <PackageIcon className="h-4 w-4 inline" />,
    },
    {
      title: "In Transit",
      description: "Shipped from Miami hub",
      date: "2025-01-16 02:15 PM",
      isCompleted: true,
      isCurrent: false,
      icon: <Plane className="h-4 w-4 inline" />,
    },
    {
      title: "Delivery Failed",
      description: "Unable to deliver package",
      date: "2025-01-19 10:00 AM",
      isCompleted: true,
      isCurrent: true,
      icon: <Truck className="h-4 w-4 inline" />,
    },
  ],
};

export function PackageTable({ data, onEdit, onDelete }: PackageTableProps) {
  const { t } = useLocale(["packages", "common"]);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const pageSize = 10;
  const [expandedRows, setExpandedRows] = useState<ExpandedRows>({});

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize,
  });

  const toggleRowExpanded = (packageId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [packageId]: !prev[packageId],
    }));
  };

  const columns: ColumnDef<Package & { calculatedCost?: number }>[] = [
    {
      id: "expand",
      header: ({ table }) => (
        <button
          aria-label="Toggle all rows expanded"
          title="Toggle all rows expanded"
          className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          data-testid="expand-all-button"
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      ),
      cell: ({ row }) => (
        <button
          onClick={() => toggleRowExpanded(row.original.id)}
          aria-label={
            expandedRows[row.original.id]
              ? "Collapse timeline"
              : "Expand timeline"
          }
          title={
            expandedRows[row.original.id]
              ? "Collapse timeline"
              : "Expand timeline"
          }
          className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          data-testid={`expand-row-${row.original.id}`}
        >
          {expandedRows[row.original.id] ? (
            <ChevronUpIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
        </button>
      ),
      size: 40,
      enableHiding: false,
    },
    {
      accessorKey: "trackingNumber",
      header: "Tracking #",
      cell: ({ row }) => (
        <span
          className="font-medium"
          data-testid={`tracking-${row.original.id}`}
        >
          {row.getValue("trackingNumber")}
        </span>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => (
        <div className="flex flex-col text-sm">
          <span
            className="text-card-foreground font-medium"
            data-testid={`customer-${row.original.id}`}
          >
            {(row.getValue("customerName") as string)?.toUpperCase()}
          </span>
          <span
            className="text-muted-foreground text-xs"
            data-testid={`customer-id-${row.original.id}`}
          >
            {row.original.customerId}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "originLocationId",
      header: "Origin",
      cell: ({ row }) => (
        <span data-testid={`origin-${row.original.id}`}>
          {row.getValue("originLocationId") || "—"}
        </span>
      ),
    },
    {
      accessorKey: "destinationLocationId",
      header: "Destination",
      cell: ({ row }) => (
        <span data-testid={`destination-${row.original.id}`}>
          {row.getValue("destinationLocationId") || "—"}
        </span>
      ),
    },
    {
      accessorKey: "weight",
      header: "Weight",
      cell: ({ row }) => (
        <span data-testid={`weight-${row.original.id}`}>
          {Number(row.getValue("weight")).toFixed(2)} kg
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const statusValue = row.getValue("status") as string;
        const status = PACKAGE_STATUSES.find((s) => s.value === statusValue);
        return (
          <Badge
            className={`rounded-sm px-1.5 capitalize ${status?.color || "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200"}`}
            data-testid={`status-${row.original.id}`}
          >
            {status?.label || statusValue}
          </Badge>
        );
      },
    },
    {
      accessorKey: "calculatedCost",
      header: "Cost",
      cell: ({ row }) => {
        const cost = row.original.calculatedCost || 0;
        return (
          <span data-testid={`cost-${row.original.id}`}>
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(cost)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800"
            aria-label="View details"
            title="View details"
            onClick={() => toggleRowExpanded(row.original.id)}
            data-testid={`view-details-${row.original.id}`}
          >
            <EyeIcon
              className="h-4 w-4 text-slate-600 dark:text-slate-400"
              aria-hidden="true"
            />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800"
                  aria-label="More options"
                  data-testid={`actions-menu-${row.original.id}`}
                >
                  <EllipsisVerticalIcon
                    className="h-4 w-4 text-slate-600 dark:text-slate-400"
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => onEdit(row.original)}
                  data-testid={`edit-${row.original.id}`}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(row.original)}
                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950"
                  data-testid={`delete-${row.original.id}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      size: 100,
      enableHiding: false,
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay: 2,
  });

  return (
    <div className="w-full space-y-4" data-testid="package-table-container">
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-950">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-slate-200 dark:border-slate-800"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="text-slate-700 dark:text-slate-300 h-12 first:pl-4"
                      data-testid={`header-${header.id}`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
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
                  className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors"
                  data-testid={`table-row-${row.original.id}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="first:pl-4 py-3">
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
                  className="h-24 text-center text-muted-foreground"
                  data-testid="no-results"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Timeline Rows */}
      {table.getRowModel().rows?.length
        ? table.getRowModel().rows.map((row) =>
            expandedRows[row.original.id] ? (
              <div
                key={`timeline-${row.original.id}`}
                className={`border border-slate-200 dark:border-slate-800 rounded-lg p-6 ${isDark ? "bg-slate-950/50" : "bg-slate-50/50"}`}
                data-testid={`timeline-row-${row.original.id}`}
                role="region"
                aria-label={`Package chronology for ${row.original.trackingNumber}`}
              >
                <div className="max-w-4xl">
                  <h4
                    className={`text-sm font-semibold mb-6 ${isDark ? "text-slate-100" : "text-slate-900"}`}
                    data-testid={`timeline-title-${row.original.id}`}
                  >
                    {t("packages.timeline") || "Package Chronology"} -{" "}
                    {row.original.trackingNumber}
                  </h4>
                  <div className="space-y-0">
                    {(
                      STATUS_TIMELINE[row.original.status] ||
                      STATUS_TIMELINE["pending"]
                    ).map((stage: any, index: number) => (
                      <TimelineStage
                        key={`${row.original.id}-stage-${index}`}
                        title={stage.title}
                        description={stage.description}
                        date={stage.date}
                        isCompleted={stage.isCompleted}
                        isCurrent={stage.isCurrent}
                        icon={stage.icon}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null,
          )
        : null}

      <div
        className="flex items-center justify-between gap-3 px-4 py-4 max-sm:flex-col md:max-lg:flex-col"
        data-testid="pagination-controls"
      >
        <p
          className="text-muted-foreground text-sm whitespace-nowrap"
          aria-live="polite"
          data-testid="pagination-info"
        >
          Showing{" "}
          <span className="font-semibold">
            {table.getRowModel().rows.length === 0
              ? 0
              : table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                1}{" "}
            to{" "}
            {Math.min(
              Math.max(
                table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                  table.getState().pagination.pageSize,
                0,
              ),
              table.getRowCount(),
            )}
          </span>{" "}
          of{" "}
          <span className="font-semibold">
            {table.getRowCount().toString()}
          </span>
        </p>

        <div data-testid="pagination-buttons">
          <Pagination>
            <PaginationContent className="gap-1">
              <PaginationItem>
                <Button
                  className="disabled:pointer-events-none disabled:opacity-50 border-slate-300 dark:border-slate-700"
                  variant={"outline"}
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Go to previous page"
                  data-testid="previous-page-button"
                >
                  <ChevronLeftIcon aria-hidden="true" className="h-4 w-4" />
                  Previous
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
                      size="icon"
                      variant={isActive ? "default" : "outline"}
                      className={`${!isActive && "border-slate-300 dark:border-slate-700"}`}
                      onClick={() => table.setPageIndex(page - 1)}
                      aria-current={isActive ? "page" : undefined}
                      data-testid={`page-button-${page}`}
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
                  className="disabled:pointer-events-none disabled:opacity-50 border-slate-300 dark:border-slate-700"
                  variant={"outline"}
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Go to next page"
                  data-testid="next-page-button"
                >
                  Next
                  <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}
