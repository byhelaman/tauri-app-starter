import { useState } from "react"
import type { Table } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  ChevronDownIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  History,
  Layers,
  PrinterIcon,
  RotateCcwIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  FORMAT_META,
  formatRows,
  getScopeRows,
  type CopyFormat,
  type ExportFormat,
  type Scope,
} from "./table-formats"
import { BulkCopyDialog } from "./bulk-copy-dialog"

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
  tableId: string
  onSidePanelToggle?: () => void
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

async function saveFile(content: string, filename: string, mime: string, ext: string) {
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

const SCOPE_LABEL: Record<Scope, string> = {
  selected: "Selected",
  filtered: "Filtered",
  all: "All",
}

export function DataTableViewOptions<TData>({ table, tableId, onSidePanelToggle }: DataTableViewOptionsProps<TData>) {
  const selectedCount = table.getSelectedRowModel().rows.length
  const filteredCount = table.getFilteredRowModel().rows.length
  const totalCount = table.getCoreRowModel().rows.length

  const [scope, setScope] = useState<Scope>("all")
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false)
  const effectiveScope: Scope = scope === "selected" && selectedCount === 0 ? "filtered" : scope

  const scopeCounts: Record<Scope, number> = {
    selected: selectedCount,
    filtered: filteredCount,
    all: totalCount,
  }

  async function exportAs(format: ExportFormat) {
    const rows = getScopeRows(table, effectiveScope)
    const content = formatRows(table, rows, format, true)
    const meta = FORMAT_META[format]
    const ok = await saveFile(content, `${tableId}-${effectiveScope}.${meta.ext}`, meta.mime, meta.ext)
    if (ok) toast.success(`Exported ${rows.length} rows as ${meta.label}`)
  }

  async function copyAs(format: CopyFormat) {
    const rows = getScopeRows(table, effectiveScope)
    const content = formatRows(table, rows, format, false)
    await navigator.clipboard.writeText(content)
    toast.success(`Copied ${rows.length} rows as ${FORMAT_META[format].label}`)
  }

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
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)}>
            {(["selected", "filtered", "all"] as Scope[]).map((s) => (
              <DropdownMenuRadioItem
                key={s}
                value={s}
                disabled={s === "selected" && selectedCount === 0}
              >
                {SCOPE_LABEL[s]} ({scopeCounts[s]})
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={scopeCounts[effectiveScope] === 0}
            onClick={() => setBulkCopyOpen(true)}
          >
            <Layers />
            Bulk Copy
          </DropdownMenuItem>

          {onSidePanelToggle && (
            <DropdownMenuItem onClick={onSidePanelToggle}>
              <History />
              Changes
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <DownloadIcon />
              Export as
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {(["csv", "tsv", "json", "md"] as ExportFormat[]).map((f) => (
                <DropdownMenuItem key={f} onClick={() => exportAs(f)}>
                  {FORMAT_META[f].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ClipboardCopyIcon />
              Copy as
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {(["tsv", "csv", "json", "md"] as CopyFormat[]).map((f) => (
                <DropdownMenuItem key={f} onClick={() => copyAs(f)}>
                  {FORMAT_META[f].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

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

      <BulkCopyDialog
        table={table}
        tableId={tableId}
        scope={effectiveScope}
        open={bulkCopyOpen}
        onOpenChange={setBulkCopyOpen}
      />
    </div>
  )
}
