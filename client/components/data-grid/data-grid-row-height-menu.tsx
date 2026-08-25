import type { Table } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Rows3Icon } from "lucide-react";
import type { RowHeightValue } from "@/types/data-grid";

interface DataGridRowHeightMenuProps<TData> {
  table: Table<TData>;
}

export function DataGridRowHeightMenu<TData>({
  table,
}: DataGridRowHeightMenuProps<TData>) {
  const rowHeight =
    (table.options.meta?.rowHeight as RowHeightValue | undefined) || "short";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Rows3Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={rowHeight}
          onValueChange={(value) => {
            const v = value as RowHeightValue;
            if (table.options.meta?.onRowHeightChange) {
              table.options.meta.onRowHeightChange(v);
            } else {
              table.options.meta = {
                ...table.options.meta,
                rowHeight: v,
              } as any;
            }
          }}
        >
          <DropdownMenuRadioItem value="short">Short</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="medium">Medium</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="tall">Tall</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
