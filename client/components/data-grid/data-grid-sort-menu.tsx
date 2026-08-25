import type { Table } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface DataGridSortMenuProps<TData> {
  table: Table<TData>;
}

export function DataGridSortMenu<TData>({
  table,
}: DataGridSortMenuProps<TData>) {
  const sorting = table.getState().sorting;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowUpDown className="h-4 w-4 mr-2" />
          Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {table.getAllColumns().map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={sorting.some((s) => s.id === column.id)}
            onCheckedChange={() => {
              const currentSort = sorting.find((s) => s.id === column.id);
              if (currentSort) {
                table.setSorting(sorting.filter((s) => s.id !== column.id));
              } else {
                table.setSorting([...sorting, { id: column.id, desc: false }]);
              }
            }}
          >
            {column.columnDef.header as string}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
