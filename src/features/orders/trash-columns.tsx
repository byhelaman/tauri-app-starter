import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { createSelectColumn, multiValueFilter, renderCell } from "@/components/data-table/data-table-cells"
import type { DeletedOrder } from "./api"

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function createTrashColumns(): ColumnDef<DeletedOrder>[] {
  return [
    createSelectColumn<DeletedOrder>(),
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
      cell: ({ row }) => renderCell(row.getValue("customer") as string),
    },
    {
      accessorKey: "product",
      enableGlobalFilter: true,
      minSize: 240,
      maxSize: 600,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Product" />,
      cell: ({ row }) => renderCell(row.getValue("product") as string),
    },
    {
      accessorKey: "category",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Category" />,
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("category") as string),
    },
    {
      id: "time",
      accessorFn: (row) => row.start_time && row.end_time ? `${row.start_time} - ${row.end_time}` : "",
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
      cell: ({ row }) => renderCell(row.getValue("code") as string, { className: "font-mono" }),
    },
    {
      accessorKey: "status",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: "Status",
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("status") as string, { className: "capitalize" }),
    },
    {
      accessorKey: "channel",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: "Channel",
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("channel") as string),
    },
    {
      accessorKey: "region",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: "Region",
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("region") as string),
    },
    {
      accessorKey: "payment",
      enableGlobalFilter: true,
      minSize: 130,
      maxSize: 180,
      header: "Payment",
      filterFn: multiValueFilter,
      cell: ({ row }) => renderCell(row.getValue("payment") as string),
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
      cell: ({ row }) => renderCell(row.getValue("quantity") as number | string, { className: "font-mono" }),
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
      accessorKey: "deleted_at",
      minSize: 180,
      maxSize: 220,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Deleted At" />,
      cell: ({ row }) => renderCell(formatDateTime(row.getValue("deleted_at") as string)),
    },
    {
      accessorKey: "deleted_by_email",
      minSize: 190,
      maxSize: 260,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Deleted By" />,
      cell: ({ row }) => renderCell(row.getValue("deleted_by_email") as string),
    }
  ]
}
