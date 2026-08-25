import type { Table } from "@tanstack/react-table";
import { EyeIcon, EyeOffIcon, SettingsIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface DataGridViewMenuProps<TData> {
  table: Table<TData>;
}

export function DataGridViewMenu<TData>({
  table,
}: DataGridViewMenuProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm font-semibold">
          Show/Hide Columns
        </div>
        {table.getAllColumns().map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(checked) => column.toggleVisibility(checked)}
          >
            {column.getIsVisible() ? (
              <EyeIcon className="h-4 w-4 mr-2" />
            ) : (
              <EyeOffIcon className="h-4 w-4 mr-2" />
            )}
            {column.columnDef.header as string}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
