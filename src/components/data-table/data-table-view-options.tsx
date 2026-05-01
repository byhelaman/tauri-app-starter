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
  formatRawRows,
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
  /** Cuando true, 'Selected' muestra el total del servidor en vez del conteo local */
  isSelectAllByFilter?: boolean
  /** IDs excluidos manualmente en modo select-all-by-filter */
  excludedIds?: Set<string>
  /** Permite acciones que extraen datos fuera de la tabla visible */
  allowDataExport?: boolean
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

function formatLimit(limit?: number): string {
  return limit == null ? "the configured limit" : limit.toLocaleString()
}

export function DataTableViewOptions<TData>({ table, tableId, onSidePanelToggle, infiniteScroll, isSelectAllByFilter, excludedIds, allowDataExport = true }: DataTableViewOptionsProps<TData>) {
  const tableMeta = table.options.meta as DataTableMeta | undefined
  const selectedCount = isSelectAllByFilter
    ? (infiniteScroll?.totalRowCount ?? 0) - (excludedIds?.size ?? 0)
    : tableMeta?.visibleSelectedCount ?? table.getSelectedRowModel().rows.length
  const selectedIds = tableMeta?.visibleSelectedIds
    ?? Object.keys(table.getState().rowSelection).filter((id) => table.getState().rowSelection[id])
  const filteredCount = table.getFilteredRowModel().rows.length
  const totalCount = table.getCoreRowModel().rows.length

  // En infinite scroll, 'filtered' y 'all' muestran el total real del servidor
  const serverTotal = infiniteScroll?.totalRowCount
  const serverUnfilteredTotal = infiniteScroll?.unfilteredTotalRowCount
  const effectiveFilteredCount = serverTotal ?? filteredCount
  const effectiveTotalCount    = serverUnfilteredTotal ?? totalCount

  const [scope, setScope] = useState<Scope>("all")
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false)
  const effectiveScope: Scope = scope === "selected" && selectedCount === 0 ? "filtered" : scope

  const scopeCounts: Record<Scope, number> = {
    selected: selectedCount,
    filtered: effectiveFilteredCount,
    all: effectiveTotalCount,
  }
  const bulkActionLimit = infiniteScroll?.bulkActionRowLimit
  const selectedScopeCount = scopeCounts[effectiveScope]
  const serverScopeExceedsLimit =
    needsServerFetch(effectiveScope) && bulkActionLimit != null && selectedScopeCount > bulkActionLimit
  const selectedScopeExceedsLimit =
    effectiveScope === "selected" && bulkActionLimit != null && selectedIds.length > bulkActionLimit
  const scopeExceedsLimit = serverScopeExceedsLimit || selectedScopeExceedsLimit

  /** Devuelve true si el scope necesita datos del servidor (infinite scroll + scope != selected) */
  function getServerFetcher(s: Scope): (() => Promise<Record<string, unknown>[]>) | undefined {
    if (s === "all") return infiniteScroll?.fetchAllUnfiltered ?? infiniteScroll?.fetchAllByFilter
    if (s === "filtered") return infiniteScroll?.fetchAllByFilter
    return undefined
  }

  function needsServerFetch(s: Scope): boolean {
    return !!getServerFetcher(s)
  }

  function needsSelectedIdsFetch(s: Scope): boolean {
    return s === "selected" && !!infiniteScroll?.fetchByIds && selectedIds.length > 0
  }

  function serverRowsExceedLimit(count: number): boolean {
    return bulkActionLimit != null && count > bulkActionLimit
  }

  async function exportAs(format: ExportFormat) {
    if (serverScopeExceedsLimit) {
      toast.error(`Export is limited to ${formatLimit(bulkActionLimit)} rows. Narrow the filters first.`)
      return
    }
    const meta = FORMAT_META[format]
    if (needsSelectedIdsFetch(effectiveScope)) {
      if (serverRowsExceedLimit(selectedIds.length)) {
        toast.error(`Export is limited to ${formatLimit(bulkActionLimit)} rows. Narrow the selection first.`)
        return
      }
      const toastId = "export-selected-fetch"
      toast.loading(`Fetching ${selectedIds.length.toLocaleString()} selected rows...`, { id: toastId })
      try {
        const records = await infiniteScroll!.fetchByIds!(selectedIds)
        const content = formatRawRows(table, records, format, true)
        const ok = await saveFile(content, `${tableId}-selected.${meta.ext}`, meta.mime, meta.ext)
        if (ok) toast.success(`Exported ${records.length.toLocaleString()} rows as ${meta.label}`, { id: toastId })
        else toast.dismiss(toastId)
      } catch {
        toast.error("Failed to fetch selected rows from server", { id: toastId })
      }
      return
    }
    if (needsServerFetch(effectiveScope)) {
      const fetchRows = getServerFetcher(effectiveScope)
      if (!fetchRows) return
      const toastId = "export-fetch"
      toast.loading(`Fetching all ${scopeCounts[effectiveScope].toLocaleString()} rows...`, { id: toastId })
      try {
        const records = await fetchRows()
        const content = formatRawRows(table, records, format, true)
        const ok = await saveFile(content, `${tableId}-${effectiveScope}.${meta.ext}`, meta.mime, meta.ext)
        if (ok) toast.success(`Exported ${records.length.toLocaleString()} rows as ${meta.label}`, { id: toastId })
        else toast.dismiss(toastId)
      } catch {
        toast.error("Failed to fetch rows from server", { id: toastId })
      }
      return
    }
    const rows = getScopeRows(table, effectiveScope)
    const content = formatRows(table, rows, format, true)
    const ok = await saveFile(content, `${tableId}-${effectiveScope}.${meta.ext}`, meta.mime, meta.ext)
    if (ok) toast.success(`Exported ${rows.length} rows as ${meta.label}`)
  }

  async function copyAs(format: CopyFormat) {
    if (serverScopeExceedsLimit) {
      toast.error(`Copy is limited to ${formatLimit(bulkActionLimit)} rows. Narrow the filters first.`)
      return
    }
    if (needsSelectedIdsFetch(effectiveScope)) {
      if (serverRowsExceedLimit(selectedIds.length)) {
        toast.error(`Copy is limited to ${formatLimit(bulkActionLimit)} rows. Narrow the selection first.`)
        return
      }
      const toastId = "copy-selected-fetch"
      toast.loading(`Fetching ${selectedIds.length.toLocaleString()} selected rows...`, { id: toastId })
      try {
        const records = await infiniteScroll!.fetchByIds!(selectedIds)
        const content = formatRawRows(table, records, format, false)
        await navigator.clipboard.writeText(content)
        toast.success(`Copied ${records.length.toLocaleString()} rows as ${FORMAT_META[format].label}`, { id: toastId })
      } catch {
        toast.error("Failed to fetch selected rows from server", { id: toastId })
      }
      return
    }
    if (needsServerFetch(effectiveScope)) {
      const fetchRows = getServerFetcher(effectiveScope)
      if (!fetchRows) return
      const toastId = "copy-fetch"
      toast.loading(`Fetching all ${scopeCounts[effectiveScope].toLocaleString()} rows...`, { id: toastId })
      try {
        const records = await fetchRows()
        const content = formatRawRows(table, records, format, false)
        await navigator.clipboard.writeText(content)
        toast.success(`Copied ${records.length.toLocaleString()} rows as ${FORMAT_META[format].label}`, { id: toastId })
      } catch {
        toast.error("Failed to fetch rows from server", { id: toastId })
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

          {allowDataExport && (
            <DropdownMenuItem
              disabled={selectedScopeCount === 0 || scopeExceedsLimit}
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

          {allowDataExport && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <DownloadIcon />
                  Export as
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {(["csv", "tsv", "json", "md"] as ExportFormat[]).map((f) => (
                    <DropdownMenuItem key={f} disabled={selectedScopeCount === 0 || scopeExceedsLimit} onClick={() => exportAs(f)}>
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
                    <DropdownMenuItem key={f} disabled={selectedScopeCount === 0 || scopeExceedsLimit} onClick={() => copyAs(f)}>
                      {FORMAT_META[f].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}

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

      {allowDataExport && (
        <BulkCopyDialog
          table={table}
          tableId={tableId}
          scope={effectiveScope}
          open={bulkCopyOpen}
          onOpenChange={setBulkCopyOpen}
          fetchAllByFilter={infiniteScroll?.fetchAllByFilter}
          fetchAllUnfiltered={infiniteScroll?.fetchAllUnfiltered}
          fetchByIds={infiniteScroll?.fetchByIds}
          selectedIds={selectedIds}
          rowLimit={bulkActionLimit}
          rowCount={selectedScopeCount}
        />
      )}

    </div>
  )
}
