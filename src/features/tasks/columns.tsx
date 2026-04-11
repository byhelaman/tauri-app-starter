import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "./data-table-column-header"
import { DataTableRowActions } from "./data-table-row-actions"

export type Status = "backlog" | "todo" | "in progress" | "done" | "cancelled"
export type Priority = "low" | "medium" | "high"

export interface Task {
  id: string
  title: string
  status: Status
  priority: Priority
  assignee: string
  date: string
  time: string
  amount: number
}

const STATUSES: Status[] = ["backlog", "todo", "in progress", "done", "cancelled"]

const PRIORITY_VARIANT: Record<Priority, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
}

const multiValueFilter: FilterFn<Task> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  return filterValue.includes(row.getValue(columnId))
}

export function createColumns(onDelete: (id: string) => void, onStatusChange: (id: string, status: Status) => void): ColumnDef<Task>[] {
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
        <div className="text-center text-muted-foreground">{row.getValue("date")}</div>
      ),
    },
    {
      accessorKey: "time",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Time" className="justify-center" />,
      cell: ({ row }) => (
        <div className="text-center font-mono">{row.getValue("time")}</div>
      ),
    },
    {
      accessorKey: "id",
      header: () => <div className="text-center">ID</div>,
      cell: ({ row }) => (
        <div className="text-center font-mono text-muted-foreground">{row.getValue("id")}</div>
      ),
    },
    {
      accessorKey: "title",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Title" />,
      cell: ({ row }) => <span>{row.getValue("title")}</span>,
    },
    {
      accessorKey: "priority",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Priority" />,
      filterFn: multiValueFilter,
      cell: ({ row }) => {
        const priority = row.getValue("priority") as Priority
        return <Badge variant={PRIORITY_VARIANT[priority]} className="capitalize">{priority}</Badge>
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: multiValueFilter,
      cell: ({ row }) => (
        <Select
          value={row.getValue("status") as string}
          onValueChange={(value) => onStatusChange(row.original.id, value as Status)}
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
      accessorKey: "assignee",
      header: "Assignee",
      cell: ({ row }) => <span className="capitalize">{row.getValue("assignee")}</span>,
    },
    {
      accessorKey: "amount",
      header: ({ column, table }) => <DataTableColumnHeader table={table} column={column} title="Amount" />,
      cell: ({ row }) => {
        const value = row.getValue("amount") as number
        const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
        return <span className="font-mono">{formatted}</span>
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => (
        <DataTableRowActions task={row.original} onDelete={onDelete} />
      ),
    },
  ]
}
