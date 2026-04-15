import type { ColumnDef, FilterFn } from "@tanstack/react-table"
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

const multiValueFilter: FilterFn<Order> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  return filterValue.includes(row.getValue(columnId))
}

export function createColumns(
  onDelete: (code: string) => void,
  onStatusChange: (code: string, status: Status) => void,
  onProductChange: (code: string, product: string) => void,
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
      cell: ({ row }) => (
        <div className="text-center font-mono text-muted-foreground">{row.getValue("date")}</div>
      ),
    },
    {
      accessorKey: "customer",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Customer" />,
      cell: ({ row }) => <span className="min-w-32">{row.getValue("customer")}</span>,
    },
    {
      accessorKey: "product",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Product" />,
      cell: ({ row }) => (
        <Input
          defaultValue={row.getValue("product") as string}
          onBlur={(e) => {
            const next = e.target.value
            if (next !== row.original.product) onProductChange(row.original.code, next)
          }}
          className="border-transparent bg-transparent shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30"
        />
      ),
    },
    {
      accessorKey: "category",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Category" />,
      filterFn: multiValueFilter,
      cell: ({ row }) => <span>{row.getValue("category")}</span>,
    },
    {
      accessorKey: "time",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Time" className="justify-center" />,
      cell: ({ row }) => (
        <div className="text-center font-mono">{row.getValue("time")}</div>
      ),
    },
    {
      accessorKey: "code",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Code" className="justify-center" />,
      cell: ({ row }) => (
        <div className="text-center font-mono text-muted-foreground">{row.getValue("code")}</div>
      ),
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
      cell: ({ row }) => <span>{row.getValue("channel")}</span>,
    },
    {
      accessorKey: "quantity",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Qty" className="justify-end" />,
      cell: ({ row }) => (
        <div className="text-right font-mono">{row.getValue("quantity")}</div>
      ),
    },
    {
      accessorKey: "amount",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Amount" className="justify-end" />,
      cell: ({ row }) => {
        const value = row.getValue("amount") as number
        const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
        return <div className="text-right font-mono">{formatted}</div>
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
