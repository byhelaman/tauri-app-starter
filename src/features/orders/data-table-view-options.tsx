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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

function readAskExportLocation(): boolean {
  try {
    const raw = localStorage.getItem("app-settings")
    if (!raw) return true
    const parsed = JSON.parse(raw) as { askExportLocation?: boolean }
    return parsed.askExportLocation !== false
  } catch {
    return true
  }
}

async function saveFile(content: string, filename: string, mime: string, ext: "csv" | "tsv" | "json") {
  if (isTauri && readAskExportLocation()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog")
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const path = await save({
        defaultPath: filename,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      })
      if (!path) return false
      await writeTextFile(path, content)
      return true
    } catch (err) {
      console.error("Tauri save failed, falling back to browser download", err)
    }
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return true
}

function getExportData<TData>(table: Table<TData>) {
  const visibleColumns = table.getVisibleFlatColumns().filter((col) => col.id !== "select" && col.id !== "actions")
  const headers = visibleColumns.map((col) => col.id)
  const rows = table.getFilteredRowModel().rows
  return { visibleColumns, headers, rows }
}

async function exportToCsv<TData>(table: Table<TData>) {
  const { visibleColumns, headers, rows } = getExportData(table)
  const body = rows.map((row) =>
    visibleColumns.map((col) => {
      const str = String(row.getValue(col.id) ?? "")
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str
    }).join(",")
  )
  const ok = await saveFile([headers.join(","), ...body].join("\n"), "table-export.csv", "text/csv", "csv")
  if (ok) toast.success(`Exported ${rows.length} rows as CSV`)
}

async function exportToTsv<TData>(table: Table<TData>) {
  const { visibleColumns, headers, rows } = getExportData(table)
  const body = rows.map((row) =>
    visibleColumns.map((col) => String(row.getValue(col.id) ?? "").replace(/\t/g, " ")).join("\t")
  )
  const ok = await saveFile([headers.join("\t"), ...body].join("\n"), "table-export.tsv", "text/tab-separated-values", "tsv")
  if (ok) toast.success(`Exported ${rows.length} rows as TSV`)
}

async function exportToJson<TData>(table: Table<TData>) {
  const { visibleColumns, rows } = getExportData(table)
  const data = rows.map((row) =>
    Object.fromEntries(visibleColumns.map((col) => [col.id, row.getValue(col.id)]))
  )
  const ok = await saveFile(JSON.stringify(data, null, 2), "table-export.json", "application/json", "json")
  if (ok) toast.success(`Exported ${rows.length} rows as JSON`)
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
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <DownloadIcon />
              Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => exportToCsv(table)}>CSV (.csv)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToTsv(table)}>TSV (.tsv)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToJson(table)}>JSON (.json)</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => copyToClipboard(table)}>
            <ClipboardCopyIcon />
            Copy
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
