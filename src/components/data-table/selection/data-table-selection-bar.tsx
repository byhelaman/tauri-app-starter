import type { ReactNode } from "react"
import type { Table } from "@tanstack/react-table"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DataTableSelectionState } from "../core/data-table-types"

interface DataTableSelectionBarProps<TData> {
  table: Table<TData>
  selectedCount: number
  isSelectionCountPending: boolean
  displaySelectedCount: number
  currentScopeTotal: number
  visibleSelectedIds: string[]
  selectionState: DataTableSelectionState
  clearSelection: () => void
  bulkActions?: (
    selectedLoadedRows: TData[],
    clearSelection: () => void,
    selectedIds: string[],
    selection: DataTableSelectionState,
    meta: { selectedCount: number; isSelectionCountPending: boolean }
  ) => ReactNode
}

export function DataTableSelectionBar<TData>({
  table,
  selectedCount,
  isSelectionCountPending,
  displaySelectedCount,
  currentScopeTotal,
  visibleSelectedIds,
  selectionState,
  clearSelection,
  bulkActions,
}: DataTableSelectionBarProps<TData>) {
  if (selectedCount <= 0) return null

  const selectedLoadedRows = table.getFilteredSelectedRowModel().rows
  const hasViewSelectionContext = displaySelectedCount !== selectedCount

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
      <div className="relative">
        {hasViewSelectionContext && (
          <div className="absolute bottom-full left-0 mb-1 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
            {displaySelectedCount.toLocaleString()} of {currentScopeTotal.toLocaleString()} in view
          </div>
        )}
        <div className="flex items-center gap-3 rounded-lg border bg-background p-2 shadow-lg">
          <span className="pl-2 text-sm">
            {selectedCount.toLocaleString()} selected
          </span>
          {bulkActions && (
            <>
              <div className="h-4 w-px bg-border" />
              {bulkActions(
                selectedLoadedRows.map((row) => row.original),
                clearSelection,
                visibleSelectedIds,
                selectionState,
                { selectedCount, isSelectionCountPending }
              )}
            </>
          )}
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="icon-sm" onClick={clearSelection}><X /></Button>
        </div>
      </div>
    </div>
  )
}
