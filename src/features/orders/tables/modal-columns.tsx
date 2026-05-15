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
import { DataTableColumnHeader } from "@/components/data-table/view/data-table-column-header"
import { createSelectColumn, multiValueFilter, renderCell } from "@/components/data-table/core/data-table-cells"
import type { Order, Status } from "./columns"

export type QueueStatus = Status

export interface QueueOrder extends Pick<Order, "id" | "start_time" | "end_time" | "code" | "customer" | "status" | "channel" | "priority"> {
  time: string
  agent: string
}

const QUEUE_STATUSES: QueueStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"]

export function createQueueColumns(
  onStatusChange: (orderId: string, status: QueueStatus) => void,
): ColumnDef<QueueOrder>[] {
  return [
    createSelectColumn<QueueOrder>(),
    {
      id: "time",
      accessorFn: (row) => row.time || (row.start_time && row.end_time ? `${row.start_time} - ${row.end_time}` : ""),
      minSize: 140,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Time" className="justify-center" />,
      cell: ({ row }) => renderCell(row.getValue("time") as string, { className: "font-mono" }),
    },
    {
      accessorKey: "code",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Code" className="justify-center" />,
      cell: ({ row }) => renderCell(row.getValue("code") as string, "font-mono"),
    },
    {
      accessorKey: "customer",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Customer" />,
      cell: ({ row }) => renderCell(row.getValue("customer") as string),
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
          onValueChange={(value) => onStatusChange(row.original.id, value as QueueStatus)}
        >
          <SelectTrigger className="w-32 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {QUEUE_STATUSES.map((status) => (
                <SelectItem key={status} value={status} className="capitalize">
                  {status}
                </SelectItem>
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
      cell: ({ row }) => renderCell(row.getValue("channel") as string),
    },
    {
      accessorKey: "agent",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Assigned" />,
      cell: ({ row }) => renderCell(row.getValue("agent") as string),
    },
    {
      accessorKey: "priority",
      enableGlobalFilter: true,
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Priority" />,
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
  ]
}
