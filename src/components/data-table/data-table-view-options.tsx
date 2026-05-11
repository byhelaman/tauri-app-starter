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
  getExportFieldIds,
  getScopeRows,
  type CopyFormat,
  type ExportFormat,
  type Scope,
} from "./table-formats"
import { BulkCopyDialog } from "./bulk-copy-dialog"
import type { DataTableMeta, InfiniteScrollConfig } from "./data-table-types"

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
  tableId: string
  onSidePanelToggle?: () => void
  /** Contexto de infinite scroll para mostrar totales reales y fetch server-side */
  infiniteScroll?: InfiniteScrollConfig
  /** Permite acciones que extraen datos fuera de la tabla visible */
  allowDataExport?: boolean
  /** Permite acciones de copia masiva fuera de la tabla visible */
  allowDataCopy?: boolean
  mode?: "full" | "bulk-copy" | "none"
  onResetTable?: () => void
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

export function DataTableViewOptions<TData>({ table, tableId, onSidePanelToggle, infiniteScroll, allowDataExport = true, allowDataCopy = allowDataExport, mode = "full", onResetTable }: DataTableViewOptionsProps<TData>) {
  const [scope, setScope] = useState<Scope>("all")
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false)

  if (mode === "none") return null
  const canUseDataActions = allowDataExport && mode === "full"
  const canUseCopyActions = allowDataCopy && mode === "full"
  const canUseBulkCopy = allowDataCopy && (mode === "full" || mode === "bulk-copy")
  const tableMeta = table.options.meta as DataTableMeta | undefined
  const usesServerScope = tableMeta?.isInfiniteScroll === true
  const selectedCount = usesServerScope && tableMeta?.selectionState?.mode === "operations"
    ? tableMeta.selectedCount ?? 0
    : tableMeta?.visibleSelectedCount ?? table.getSelectedRowModel().rows.length
  const selectedIds = tableMeta?.visibleSelectedIds
    ?? Object.keys(table.getState().rowSelection).filter((id) => table.getState().rowSelection[id])
  const filteredCount = table.getFilteredRowModel().rows.length
  const totalCount = table.getCoreRowModel().rows.length

  // Solo las tablas con selección server-side usan totales reales del backend.
  // El modal puede recibir infiniteScroll para render/carga, pero su scope es local.
  const serverTotal = usesServerScope ? infiniteScroll?.totalRowCount : undefined
  const serverUnfilteredTotal = usesServerScope ? infiniteScroll?.unfilteredTotalRowCount : undefined
  const effectiveFilteredCount = serverTotal ?? filteredCount
  const effectiveTotalCount = serverUnfilteredTotal ?? totalCount

  const effectiveScope: Scope = scope === "selected" && selectedCount === 0 ? "filtered" : scope

  const scopeCounts: Record<Scope, number> = {
    selected: selectedCount,
    filtered: effectiveFilteredCount,
    all: effectiveTotalCount,
  }
  const selectedScopeCount = scopeCounts[effectiveScope]

  function selectedFilterExportRequest(format: ExportFormat, purpose: "copy" | "export") {
    const selection = tableMeta?.selectionState
    if (!usesServerScope) return null
    if (effectiveScope !== "selected" || !selection) return null
    if (selection.mode === "operations") {
      return {
        scope: infiniteScroll?.currentScope ?? { search: "", filters: [] },
        operations: selection.operations,
        purpose,
        format,
        fields: getExportFieldIds(table),
      }
    }
    return {
      scope: infiniteScroll?.currentScope ?? { search: "", filters: [] },
      operations: [{ type: "selectIds" as const, ids: selectedIds }],
      purpose,
      format,
      fields: getExportFieldIds(table),
    }
  }

  function scopeExportRequest(format: ExportFormat, purpose: "copy" | "export") {
    if (!usesServerScope) return null
    const scope = effectiveScope === "filtered"
      ? infiniteScroll?.currentScope
      : effectiveScope === "all" && infiniteScroll?.currentScope
        ? {
          ...infiniteScroll.currentScope,
          search: "",
          filters: [],
          date: undefined,
        }
        : undefined
    if (!scope) return null
    return {
      scope,
      purpose,
      format,
      fields: getExportFieldIds(table),
    }
  }

  async function exportAs(format: ExportFormat) {
    const meta = FORMAT_META[format]
    const serverExportRequest = selectedFilterExportRequest(format, "export") ?? scopeExportRequest(format, "export")
    if (serverExportRequest && infiniteScroll?.exportByScope) {
      const toastId = "export-scope"
      toast.loading(`Generating ${scopeCounts[effectiveScope].toLocaleString()} rows...`, { id: toastId })
      try {
        const result = await infiniteScroll.exportByScope(serverExportRequest)
        const ok = await saveFile(result.content, `${tableId}-${effectiveScope}.${meta.ext}`, meta.mime, meta.ext)
        if (ok) toast.success(`Exported ${result.rowCount.toLocaleString()} rows as ${meta.label}`, { id: toastId })
        else toast.dismiss(toastId)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to export rows", { id: toastId })
      }
      return
    }
    const rows = getScopeRows(table, effectiveScope)
    const content = formatRows(table, rows, format, true)
    const ok = await saveFile(content, `${tableId}-${effectiveScope}.${meta.ext}`, meta.mime, meta.ext)
    if (ok) toast.success(`Exported ${rows.length} rows as ${meta.label}`)
  }

  async function copyAs(format: CopyFormat) {
    const serverExportRequest = selectedFilterExportRequest(format, "copy") ?? scopeExportRequest(format, "copy")
    if (serverExportRequest && infiniteScroll?.exportByScope) {
      const toastId = "copy-scope"
      toast.loading(`Generating ${scopeCounts[effectiveScope].toLocaleString()} rows...`, { id: toastId })
      try {
        const result = await infiniteScroll.exportByScope(serverExportRequest)
        await navigator.clipboard.writeText(result.content)
        toast.success(`Copied ${result.rowCount.toLocaleString()} rows as ${FORMAT_META[format].label}`, { id: toastId })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to copy rows", { id: toastId })
      }
      return
    }
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

          {canUseBulkCopy && (
            <DropdownMenuItem
              disabled={selectedScopeCount === 0}
              onClick={() => setBulkCopyOpen(true)}
            >
              <Layers />
              Bulk Copy
            </DropdownMenuItem>
          )}

          {onSidePanelToggle && (
            <DropdownMenuItem onClick={onSidePanelToggle}>
              <History />
              Changes
            </DropdownMenuItem>
          )}

          {(canUseDataActions || canUseCopyActions) && (
            <>
              <DropdownMenuSeparator />

              {canUseDataActions && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <DownloadIcon />
                    Export as
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(["csv", "tsv", "json", "md"] as ExportFormat[]).map((f) => (
                      <DropdownMenuItem key={f} disabled={selectedScopeCount === 0} onClick={() => exportAs(f)}>
                        {FORMAT_META[f].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {canUseCopyActions && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ClipboardCopyIcon />
                    Copy as
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(["tsv", "csv", "json", "md"] as CopyFormat[]).map((f) => (
                      <DropdownMenuItem key={f} disabled={selectedScopeCount === 0} onClick={() => copyAs(f)}>
                        {FORMAT_META[f].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </>
          )}

          {mode === "full" && (
            <DropdownMenuItem onClick={() => window.print()}>
              <PrinterIcon />
              Print
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              setScope("all")
              onResetTable?.()
            }}
          >
            <RotateCcwIcon />
            Reset Table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {canUseBulkCopy && (
        <BulkCopyDialog
          table={table}
          tableId={tableId}
          scope={effectiveScope}
          open={bulkCopyOpen}
          onOpenChange={setBulkCopyOpen}
        />
      )}

    </div>
  )
}
