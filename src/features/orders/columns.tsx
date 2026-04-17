import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTableColumnHeader } from "./data-table-column-header"
import { DataTableRowActions } from "./data-table-row-actions"

export type Status = "pending" | "processing" | "shipped" | "delivered" | "cancelled"

export interface Order {
  date: string
  customer: string
  product: string
  category: string
  time: string
  code: string
  status: Status
  channel: string
  quantity: number
  amount: number
}

const STATUSES: Status[] = ["pending", "processing", "shipped", "delivered", "cancelled"]

const cellInputClass = "border-transparent bg-transparent shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30 w-fit"

function ReadOnlyCell({ value, className }: { value: string | number; className?: string }) {
  return <Input readOnly defaultValue={value} className={cn(cellInputClass, className)} />
}

const multiValueFilter: FilterFn<Order> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  return filterValue.includes(row.getValue(columnId))
}

export function createColumns(
  onDelete: (code: string) => void,
  onStatusChange: (code: string, status: Status) => void,
): ColumnDef<Order>[] {
  return [
    {
      id: "select",
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
    },
    {
      accessorKey: "date",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Date" className="justify-center" />,
      cell: ({ row }) => <p className="w-25 text-center mx-auto">{row.getValue("date") as string}</p>,
    },
    {
      accessorKey: "customer",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Customer" />,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("customer") as string} className="w-40" />,
    },
    {
      accessorKey: "product",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Product" />,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("product") as string} />,
    },
    {
      accessorKey: "category",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Category" />,
      filterFn: multiValueFilter,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("category") as string} className="w-30" />,
    },
    {
      accessorKey: "time",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Time" className="justify-center" />,
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!Array.isArray(filterValue) || filterValue.length === 0) return true
        const time = row.getValue("time") as string
        const startHour = time.split(" - ")[0]?.trim().split(":")[0] ?? ""
        return filterValue.includes(startHour)
      },
      cell: ({ row }) => <p className="w-30 text-center mx-auto font-mono">{row.getValue("time") as string}</p>,
    },
    {
      accessorKey: "code",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Code" className="justify-center"/>,
      cell: ({ row }) => <p className="font-mono text-muted-foreground mx-auto w-25 text-center">{row.getValue("code") as string}</p>,
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: multiValueFilter,
      cell: ({ row }) => (
        <Select
          value={row.getValue("status") as string}
          onValueChange={(value) => onStatusChange(row.original.code, value as Status)}
        >
          <SelectTrigger className="w-32 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    },
    {
      accessorKey: "channel",
      header: "Channel",
      filterFn: multiValueFilter,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("channel") as string} className="w-30" />,
    },
    {
      accessorKey: "quantity",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Qty" className="justify-end" />,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("quantity") as number} className="text-right font-mono w-15" />,
    },
    {
      accessorKey: "amount",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Amount" className="justify-end" />,
      cell: ({ row }) => {
        const value = row.getValue("amount") as number
        const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
        return <p className="text-right font-mono">{formatted}</p>
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => (
        <DataTableRowActions order={row.original} onDelete={onDelete} />
      ),
    },
  ]
}
