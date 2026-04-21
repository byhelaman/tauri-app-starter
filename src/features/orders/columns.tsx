import type { ColumnDef } from "@tanstack/react-table"
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
import { createSelectColumn, multiValueFilter, renderReadOnlyCell } from "./data-table-cells"

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

export function createColumns(
  onDelete: (code: string) => void,
  onStatusChange: (code: string, status: Status) => void,
): ColumnDef<Order>[] {
  return [
    createSelectColumn<Order>(),
    {
      accessorKey: "date",
      minSize: 124,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Date" className="justify-center" />,
      cell: ({ row }) => renderReadOnlyCell(row.getValue("date") as string),
    },
    {
      accessorKey: "customer",
      enableGlobalFilter: true,
      minSize: 160,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Customer" />,
      cell: ({ row }) => renderReadOnlyCell(row.getValue("customer") as string),
    },
    {
      accessorKey: "product",
      enableGlobalFilter: true,
      minSize: 240,
      maxSize: 600,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Product" />,
      cell: ({ row }) => renderReadOnlyCell(row.getValue("product") as string),
    },
    {
      accessorKey: "category",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Category" />,
      filterFn: multiValueFilter,
      cell: ({ row }) => renderReadOnlyCell(row.getValue("category") as string),
    },
    {
      accessorKey: "time",
      minSize: 140,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Time" className="justify-center" />,
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!Array.isArray(filterValue) || filterValue.length === 0) return true
        const time = row.getValue("time") as string
        const startHour = time.split(" - ")[0]?.trim().split(":")[0] ?? ""
        return filterValue.includes(startHour)
      },
      cell: ({ row }) => renderReadOnlyCell(row.getValue("time") as string),
    },
    {
      accessorKey: "code",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Code" />,
      cell: ({ row }) => renderReadOnlyCell(row.getValue("code") as string, "font-mono"),
    },
    {
      accessorKey: "status",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
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
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: "Channel",
      filterFn: multiValueFilter,
      cell: ({ row }) => renderReadOnlyCell(row.getValue("channel") as string),
    },
    {
      accessorKey: "quantity",
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Qty" />,
      cell: ({ row }) => renderReadOnlyCell(row.getValue("quantity") as number, "font-mono"),
    },
    {
      accessorKey: "amount",
      minSize: 130,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Amount" />,
      cell: ({ row }) => {
        const value = row.getValue("amount") as number
        const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
        return renderReadOnlyCell(formatted, "font-mono")
      },
    },
    {
      id: "actions",
      minSize: 44,
      maxSize: 44,
      enableHiding: false,
      cell: ({ row }) => (
        <DataTableRowActions order={row.original} onDelete={onDelete} />
      ),
    },
  ]
}
