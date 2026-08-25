import { flexRender, type Table } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataGridProps<TData> {
  table: Table<TData>;
  height?: number;
  className?: string;
  onRowAdd?: () => void;
  searchState?: {
    query: string;
    matches: number;
    currentMatch: number;
  } | null;
  columnSizeVars?: React.CSSProperties;
}

export function DataGrid<TData>({
  table,
  height = 600,
  className,
  onRowAdd,
  searchState,
}: DataGridProps<TData>) {
  const rows = table.getRowModel().rows;
  const headers = table.getFlatHeaders();

  const [sortState, setSortState] = React.useState({});

  return (
    <Card className={cn("w-full overflow-hidden", className)}>
      {/* Toolbar */}
      {searchState && (
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="flex-1" />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="relative cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      const sorting = table.getState().sorting;
                      const currentSort = sorting.find(
                        (s) => s.id === header.column.id,
                      );
                      const newDesc =
                        currentSort?.desc === false
                          ? true
                          : currentSort?.desc === true
                            ? undefined
                            : false;

                      if (newDesc === undefined) {
                        table.setSorting(
                          sorting.filter((s) => s.id !== header.column.id),
                        );
                      } else {
                        table.setSorting(
                          sorting
                            .filter((s) => s.id !== header.column.id)
                            .concat([{ id: header.column.id, desc: newDesc }]),
                        );
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.getCanSort() && (
                        <span className="text-xs text-muted-foreground">
                          {table
                            .getState()
                            .sorting.find((s) => s.id === header.column.id)
                            ?.desc === false
                            ? "↑"
                            : table
                                  .getState()
                                  .sorting.find(
                                    (s) => s.id === header.column.id,
                                  )?.desc === true
                              ? "↓"
                              : "⇅"}
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className="text-center py-8 text-muted-foreground"
                >
                  No data found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </UITable>
      </div>

      {/* Add Row Footer */}
      {onRowAdd && (
        <div className="border-t p-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRowAdd}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add row
          </Button>
        </div>
      )}
    </Card>
  );
}
