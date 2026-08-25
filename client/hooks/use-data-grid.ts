import * as React from "react";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ColumnSizingState,
  ColumnSizingInfoState,
} from "@tanstack/react-table";

export interface UseDataGridOptions<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  enableSearch?: boolean;
  onDataChange?: (data: TData[]) => void;
  meta?: Record<string, any>;
}

export function useDataGrid<TData>({
  data,
  columns,
  enableSearch = true,
  onDataChange,
  meta: metaOptions,
}: UseDataGridOptions<TData>) {
  const dataGridRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);
  const rowMapRef = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const cellMapRef = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const [searchState, setSearchState] = React.useState<{
    query: string;
    matches: number;
    currentMatch: number;
  } | null>(enableSearch ? { query: "", matches: 0, currentMatch: 0 } : null);

  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [columnSizingInfo, setColumnSizingInfo] = React.useState<ColumnSizingInfoState>({} as ColumnSizingInfoState);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnSizing,
      columnSizingInfo,
    },
    onColumnSizingChange: setColumnSizing,
    onColumnSizingInfoChange: setColumnSizingInfo,
    meta: {
      dataGridRef,
      headerRef,
      footerRef,
      rowMapRef,
      cellMapRef,
      searchState,
      onDataChange,
      ...metaOptions,
    },
  });

  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => dataGridRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const columnSizeVars = React.useMemo(() => {
    const headers = table.getFlatHeaders();
    const colSizes: Record<string, number> = {};
    headers.forEach((header) => {
      colSizes[`--header-${header.id}-size`] = header.getSize();
    });
    return colSizes as React.CSSProperties;
  }, [table.getState().columnSizing]);

  return {
    table,
    dataGridRef,
    headerRef,
    rowMapRef,
    footerRef,
    rowVirtualizer,
    searchState,
    columnSizeVars,
    setSearchState,
  };
}
