import type { ColumnDef } from "@tanstack/react-table"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableRowActions } from "./data-table-row-actions"
import { createSelectColumn, multiValueFilter, renderCell } from "@/components/data-table/data-table-cells"

export type Status = "pending" | "processing" | "shipped" | "delivered" | "cancelled"

export interface Order {
  id: string
  date: string
  customer: string
  product: string
  category: string
  time: string
  code: string
  status: Status
  channel: string
  quantity: number | string
  amount: number
  region: string
  payment: string
  priority: string
}

export type EditableOrderField =
  | "date"
  | "customer"
  | "product"
  | "category"
  | "time"
  | "code"
  | "channel"
  | "quantity"
  | "region"
  | "payment"
  | "priority"

const STATUSES: Status[] = ["pending", "processing", "shipped", "delivered", "cancelled"]
const CHANNELS = ["Online", "Retail", "Partner", "Phone"] as const

const CODE_PATTERN = /^ORD-[A-Z0-9]{5}$/i

function isRequiredText(value: string) {
  return value.trim().length > 0
}

function isValidQuantity(value: string) {
  const normalized = value.trim()
  return /^\d+$/.test(normalized) && Number(normalized) > 0
}

export function createColumns(
  onDelete: (orderId: string) => void,
  onStatusChange: (orderId: string, status: Status) => void,
  onCellChange: (orderId: string, field: EditableOrderField, value: string, isValid: boolean) => void,
): ColumnDef<Order>[] {
  return [
    createSelectColumn<Order>(),
    {
      accessorKey: "date",
      minSize: 124,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Date" className="justify-center" />,
      cell: ({ row }) => renderCell(row.getValue("date") as string, { className: "font-mono" }),
    },
    {
      accessorKey: "customer",
      enableGlobalFilter: true,
      minSize: 160,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Customer" />,
      cell: ({ row }) => renderCell(row.getValue("customer") as string, {
        enableEditing: true,
        validate: isRequiredText,
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "customer", value, isValid),
      }),
    },
    {
      accessorKey: "product",
      enableGlobalFilter: true,
      minSize: 240,
      maxSize: 600,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Product" />,
      cell: ({ row }) => renderCell(row.getValue("product") as string, {
        enableEditing: true,
        validate: isRequiredText,
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "product", value, isValid),
      }),
    },
    {
      accessorKey: "category",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Category" />,
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("category") as string, {
        enableEditing: true,
        validate: isRequiredText,
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "category", value, isValid),
      }),
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
      cell: ({ row }) => renderCell(row.getValue("time") as string, { className: "font-mono" }),
    },
    {
      accessorKey: "code",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Code" />,
      cell: ({ row }) => renderCell(row.getValue("code") as string, {
        enableEditing: true,
        className: "font-mono",
        validate: (value) => CODE_PATTERN.test(value.trim()),
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "code", value, isValid),
      }),
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
          onValueChange={(value) => onStatusChange(row.original.id ?? row.original.code, value as Status)}
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
      cell: ({ row }) => renderCell(row.getValue("channel") as string, {
        enableEditing: true,
        validate: (value) => CHANNELS.includes(value.trim() as (typeof CHANNELS)[number]),
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "channel", value, isValid),
      }),
    },
    {
      accessorKey: "region",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: "Region",
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("region") as string, {
        enableEditing: true,
        validate: isRequiredText,
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "region", value, isValid),
      }),
    },
    {
      accessorKey: "payment",
      enableGlobalFilter: true,
      minSize: 130,
      maxSize: 180,
      header: "Payment",
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("payment") as string, {
        enableEditing: true,
        validate: isRequiredText,
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "payment", value, isValid),
      }),
    },
    {
      accessorKey: "priority",
      enableGlobalFilter: true,
      minSize: 100,
      maxSize: 150,
      header: "Priority",
      filterFn: multiValueFilter,
      cell: ({ row }) => {
        const priority = row.getValue("priority") as string
        return (
          <Badge variant={priority === "High" ? "destructive" : "secondary"}>
            {priority}
          </Badge>
        )
      },
    },
    {
      accessorKey: "quantity",
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Qty" />,
      cell: ({ row }) => renderCell(row.getValue("quantity") as number | string, {
        enableEditing: true,
        className: "font-mono",
        validate: isValidQuantity,
        onCommit: (value, isValid) => onCellChange(row.original.id ?? row.original.code, "quantity", value, isValid),
      }),
    },
    {
      accessorKey: "amount",
      minSize: 130,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Amount" />,
      cell: ({ row }) => {
        const value = row.getValue("amount") as number
        const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
        return renderCell(formatted, { className: "font-mono" })
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
