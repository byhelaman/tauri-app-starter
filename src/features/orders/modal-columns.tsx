import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { MoreHorizontalIcon } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { createSelectColumn, multiValueFilter, renderCell } from "@/components/data-table/data-table-cells"

export type QueueStatus = "queued" | "processing" | "ready" | "delivered"

export interface QueueOrder {
  id: string
  time: string
  code: string
  customer: string
  status: QueueStatus
  channel: "Online" | "Retail" | "Partner" | "Phone"
  agent: string
  priority: boolean
}

const QUEUE_STATUSES: QueueStatus[] = ["queued", "processing", "ready", "delivered"]

const priorityFilter: FilterFn<QueueOrder> = (row, columnId, filterValue) => {
  if (filterValue !== true) return true
  return row.getValue(columnId) === true
}

export function createQueueColumns(
  onStatusChange: (code: string, status: QueueStatus) => void,
  onTogglePriority: (code: string) => void,
  onRemoveFromQueue: (code: string) => void,
): ColumnDef<QueueOrder>[] {
  return [
    createSelectColumn<QueueOrder>(),
    {
      accessorKey: "time",
      minSize: 140,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Time" className="justify-center" />,
      cell: ({ row }) => renderCell(row.getValue("time") as string, "font-mono"),
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
          onValueChange={(value) => onStatusChange(row.original.code, value as QueueStatus)}
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
      minSize: 120,
      maxSize: 180,
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Priority" />,
      filterFn: priorityFilter,
      cell: ({ row }) => {
        const isPriority = row.getValue("priority") as boolean
        return (
          <Badge variant={isPriority ? "destructive" : "secondary"}>
            {isPriority ? "High" : "Normal"}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      minSize: 44,
      maxSize: 44,
      enableHiding: false,
      cell: ({ row }) => {
        const order = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontalIcon data-icon />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit">
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(order.code)}>
                Copy code
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTogglePriority(order.code)}>
                {order.priority ? "Set normal priority" : "Set high priority"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onRemoveFromQueue(order.code)}>
                Remove from queue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}