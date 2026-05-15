import { useState, type ReactNode } from "react"
import type { Table } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  ChevronDownIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  History,
  Layers,
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
  type CopyFormat,
  type ExportFormat,
  type Scope,
} from "../actions/table-formats"
import { BulkCopyDialog } from "../actions/bulk-copy-dialog"
import type { DataTableMeta, InfiniteScrollConfig } from "../core/data-table-types"
import { resolveDataActionState } from "../actions/data-actions"
import { executeCopyAction, executeExportAction } from "../actions/data-action-executor"
import { saveDataFile } from "../actions/data-file-save"

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
  mode?: "full" | "bulk-copy" | "view" | "none"
  onResetTable?: () => void
  menuItems?: ReactNode
}

const SCOPE_LABEL: Record<Scope, string> = {
  selected: "Selected",
  filtered: "Filtered",
  all: "All",
}

function columnLabel(id: string) {
  if (id === "deleted_by_email") return "Deleted By"
  return id
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function DataTableViewOptions<TData>({ table, tableId, onSidePanelToggle, infiniteScroll, allowDataExport = true, allowDataCopy = allowDataExport, mode = "full", onResetTable, menuItems }: DataTableViewOptionsProps<TData>) {
  const [scope, setScope] = useState<Scope>("all")
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false)

  if (mode === "none") return null
  const canUseDataActions = allowDataExport && mode === "full"
  const canUseCopyActions = allowDataCopy && mode === "full"
  const canUseBulkCopy = allowDataCopy && (mode === "full" || mode === "bulk-copy")
  const showScopeControls = canUseDataActions || canUseCopyActions || canUseBulkCopy
  const tableMeta = table.options.meta as DataTableMeta | undefined
  const {
    hasSelection,
    selectedIds,
    effectiveScope,
    scopeCounts,
    selectedScopeCount,
  } = resolveDataActionState({
    table,
    tableMeta,
    infiniteScroll,
    scope,
  })

  async function exportAs(format: ExportFormat) {
    await executeExportAction({
      table,
      tableId,
      tableMeta,
      infiniteScroll,
      effectiveScope,
      selectedIds,
      scopeCount: scopeCounts[effectiveScope],
      notifier: {
        loading: (message, id) => toast.loading(message, { id }),
        success: (message, id) => toast.success(message, id ? { id } : undefined),
        error: (message, id) => toast.error(message, id ? { id } : undefined),
        dismiss: (id) => toast.dismiss(id),
      },
      format,
      saveFile: saveDataFile,
    })
  }

  async function copyAs(format: CopyFormat) {
    await executeCopyAction({
      table,
      tableId,
      tableMeta,
      infiniteScroll,
      effectiveScope,
      selectedIds,
      scopeCount: scopeCounts[effectiveScope],
      notifier: {
        loading: (message, id) => toast.loading(message, { id }),
        success: (message, id) => toast.success(message, id ? { id } : undefined),
        error: (message, id) => toast.error(message, id ? { id } : undefined),
        dismiss: (id) => toast.dismiss(id),
      },
      format,
      writeClipboard: (content) => navigator.clipboard.writeText(content),
    })
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
                checked={col.getIsVisible()}
                onCheckedChange={(value) => col.toggleVisibility(!!value)}
              >
                {columnLabel(col.id)}
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
          {showScopeControls && (
            <>
              <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)}>
                {(["selected", "filtered", "all"] as Scope[]).map((s) => (
                  <DropdownMenuRadioItem
                    key={s}
                    value={s}
                    disabled={s === "selected" && !hasSelection}
                  >
                    {SCOPE_LABEL[s]} ({scopeCounts[s]})
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
            </>
          )}

          {canUseBulkCopy && (
            <DropdownMenuItem
              disabled={selectedScopeCount === 0}
              onClick={() => setBulkCopyOpen(true)}
            >
              <Layers />
              Format
            </DropdownMenuItem>
          )}

          {onSidePanelToggle && (
            <DropdownMenuItem onClick={onSidePanelToggle}>
              <History />
              Changes
            </DropdownMenuItem>
          )}

          {menuItems}

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
          {(showScopeControls || onSidePanelToggle || menuItems || canUseDataActions || canUseCopyActions) && (
            <DropdownMenuSeparator />
          )}
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
