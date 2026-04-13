import type { Table } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  ChevronDownIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  PrinterIcon,
  RotateCcwIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

function exportToCsv<TData>(table: Table<TData>) {
  const visibleColumns = table.getVisibleFlatColumns().filter((col) => col.id !== "select" && col.id !== "actions")
  const headers = visibleColumns.map((col) => col.id)
  const rows = table.getFilteredRowModel().rows.map((row) =>
    visibleColumns.map((col) => {
      const value = row.getValue(col.id)
      const str = String(value ?? "")
      return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
    })
  )
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "table-export.csv"
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`Exported ${rows.length} rows`)
}

function copyToClipboard<TData>(table: Table<TData>) {
  const visibleColumns = table.getVisibleFlatColumns().filter((col) => col.id !== "select" && col.id !== "actions")
  const headers = visibleColumns.map((col) => col.id)
  const rows = table.getFilteredRowModel().rows.map((row) =>
    visibleColumns.map((col) => String(row.getValue(col.id) ?? ""))
  )
  const text = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n")
  navigator.clipboard.writeText(text)
  toast.success(`Copied ${rows.length} rows to clipboard`)
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Columns
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {table
            .getAllColumns()
            .filter((col) => typeof col.accessorFn !== "undefined" && col.getCanHide())
            .map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                className="capitalize"
                checked={col.getIsVisible()}
                onCheckedChange={(value) => col.toggleVisibility(!!value)}
              >
                {col.id}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Actions
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => exportToCsv(table)}>
            <DownloadIcon />
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyToClipboard(table)}>
            <ClipboardCopyIcon />
            Copy to clipboard
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.print()}>
            <PrinterIcon />
            Print
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              table.resetColumnFilters()
              table.resetSorting()
              table.resetColumnVisibility()
              table.resetRowSelection()
            }}
          >
            <RotateCcwIcon />
            Reset table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
