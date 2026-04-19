import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { MoreHorizontalIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTableColumnHeader } from "./data-table-column-header"

export type QueueStatus = "queued" | "processing" | "ready" | "delivered"

export interface QueueOrder {
  time: string
  code: string
  customer: string
  status: QueueStatus
  channel: "Online" | "Retail" | "Partner" | "Phone"
  agent: string
  priority: boolean
}

const QUEUE_STATUSES: QueueStatus[] = ["queued", "processing", "ready", "delivered"]
const cellInputClass = "border-transparent bg-transparent shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30 w-fit"

function ReadOnlyCell({ value, className }: { value: string | number; className?: string }) {
  return <Input readOnly defaultValue={value} className={cn(cellInputClass, className)} />
}

const multiValueFilter: FilterFn<QueueOrder> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  return filterValue.includes(row.getValue(columnId))
}

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
      accessorKey: "time",
      header: ({ column, table }) => (
        <DataTableColumnHeader table={table} column={column} title="Time" className="justify-center" />
      ),
      cell: ({ row }) => <p className="mx-auto w-30 text-center">{row.getValue("time") as string}</p>,
    },
    {
      accessorKey: "code",
      header: ({ column, table }) => (
        <DataTableColumnHeader table={table} column={column} title="Code" className="justify-center" />
      ),
      cell: ({ row }) => <p className="mx-auto w-25 text-center font-mono text-muted-foreground">{row.getValue("code") as string}</p>,
    },
    {
      accessorKey: "customer",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Customer" />,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("customer") as string} className="w-40" />,
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: multiValueFilter,
      cell: ({ row }) => (
        <Select
          value={row.getValue("status") as string}
          onValueChange={(value) => onStatusChange(row.original.code, value as QueueStatus)}
        >
          <SelectTrigger className="w-34 capitalize">
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
      header: "Channel",
      filterFn: multiValueFilter,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("channel") as string} className="w-22" />,
    },
    {
      accessorKey: "agent",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Assigned" />,
      cell: ({ row }) => <ReadOnlyCell value={row.getValue("agent") as string} className="w-30" />,
    },
    {
      accessorKey: "priority",
      header: "Priority",
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