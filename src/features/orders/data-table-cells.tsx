import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

export const cellInputClass = "border-transparent bg-transparent shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background/30 dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-background/30 text-left"

export function renderReadOnlyCell(value: string | number, className?: string) {
  return <Input readOnly defaultValue={value} className={cn(cellInputClass, className)} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const multiValueFilter: FilterFn<any> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  return filterValue.includes(row.getValue(columnId))
}

export function createSelectColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    minSize: 36,
    maxSize: 36,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enablePinning: false,
  }
}
