import type { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDownIcon, MoreHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"

export type Status = "backlog" | "todo" | "in progress" | "done" | "cancelled"
export type Priority = "low" | "medium" | "high"

export interface Task {
  id: string
  title: string
  status: Status
  priority: Priority
  assignee: string
}

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "outline" | "destructive"> = {
  backlog: "outline",
  todo: "secondary",
  "in progress": "default",
  done: "secondary",
  cancelled: "destructive",
}

const PRIORITY_VARIANT: Record<Priority, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
}

export const columns: ColumnDef<Task>[] = [
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
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground">{row.getValue("id")}</span>
    ),
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Title
        <ArrowUpDownIcon />
      </Button>
    ),
    cell: ({ row }) => <span>{row.getValue("title")}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as Status
      return <Badge variant={STATUS_VARIANT[status]} className="capitalize">{status}</Badge>
    },
  },
  {
    accessorKey: "priority",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Priority
        <ArrowUpDownIcon />
      </Button>
    ),
    cell: ({ row }) => {
      const priority = row.getValue("priority") as Priority
      return <Badge variant={PRIORITY_VARIANT[priority]} className="capitalize">{priority}</Badge>
    },
  },
  {
    accessorKey: "assignee",
    header: "Assignee",
    cell: ({ row }) => <span className="capitalize">{row.getValue("assignee")}</span>,
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs">
            <MoreHorizontalIcon />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem>
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem>Edit</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
