import type { Table } from "@tanstack/react-table"
import type {
  DataTableMeta,
  DataTableSelectionOperation,
  InfiniteScrollConfig,
  ServerScopeExportRequest,
} from "../core/data-table-types"
import { getExportFieldIds, type ExportFormat, type Scope } from "./table-formats"

export interface DataActionContext<TData> {
  table: Table<TData>
  tableMeta?: DataTableMeta
  infiniteScroll?: InfiniteScrollConfig
  scope: Scope
}

export function resolveDataActionState<TData>({
  table,
  tableMeta,
  infiniteScroll,
  scope,
}: DataActionContext<TData>) {
  const usesServerScope = tableMeta?.isInfiniteScroll === true
  const selectedCount = usesServerScope && tableMeta?.selectionState?.mode === "operations"
    ? tableMeta.selectedCount ?? 0
    : tableMeta?.visibleSelectedCount ?? table.getSelectedRowModel().rows.length
  const hasSelection = tableMeta?.selectionState?.mode === "operations"
    ? tableMeta.selectionState.operations.length > 0
    : tableMeta?.selectionState?.mode === "ids"
      ? tableMeta.selectionState.ids.length > 0
      : selectedCount > 0
  const selectedIds = tableMeta?.visibleSelectedIds
    ?? Object.keys(table.getState().rowSelection).filter((id) => table.getState().rowSelection[id])
  const filteredCount = table.getFilteredRowModel().rows.length
  const totalCount = table.getCoreRowModel().rows.length
  const effectiveFilteredCount = usesServerScope ? infiniteScroll?.totalRowCount ?? filteredCount : filteredCount
  const effectiveTotalCount = usesServerScope ? infiniteScroll?.unfilteredTotalRowCount ?? totalCount : totalCount
  const effectiveScope: Scope = scope === "selected" && !hasSelection ? "filtered" : scope
  const scopeCounts: Record<Scope, number> = {
    selected: selectedCount,
    filtered: effectiveFilteredCount,
    all: effectiveTotalCount,
  }

  return {
    usesServerScope,
    selectedCount,
    hasSelection,
    selectedIds,
    effectiveScope,
    scopeCounts,
    selectedScopeCount: scopeCounts[effectiveScope],
  }
}

function allRowsScope(infiniteScroll?: InfiniteScrollConfig) {
  if (!infiniteScroll?.currentScope) return undefined
  return {
    ...infiniteScroll.currentScope,
    search: "",
    filters: [],
    date: undefined,
  }
}

function operationsForSelection(
  tableMeta: DataTableMeta | undefined,
  selectedIds: string[],
): DataTableSelectionOperation[] | undefined {
  const selection = tableMeta?.selectionState
  if (!selection) return undefined
  return selection.mode === "operations"
    ? selection.operations
    : [{ type: "selectIds", ids: selectedIds }]
}

export function buildServerDataActionRequest<TData>({
  table,
  tableMeta,
  infiniteScroll,
  effectiveScope,
  selectedIds,
  purpose,
  format,
}: {
  table: Table<TData>
  tableMeta?: DataTableMeta
  infiniteScroll?: InfiniteScrollConfig
  effectiveScope: Scope
  selectedIds: string[]
  purpose: "copy" | "export"
  format: ExportFormat
}): ServerScopeExportRequest | null {
  if (tableMeta?.isInfiniteScroll !== true) return null

  const fields = getExportFieldIds(table)
  if (effectiveScope === "selected") {
    const operations = operationsForSelection(tableMeta, selectedIds)
    if (!operations) return null
    return {
      scope: infiniteScroll?.currentScope ?? { search: "", filters: [] },
      operations,
      purpose,
      format,
      fields,
    }
  }

  const scope = effectiveScope === "filtered"
    ? infiniteScroll?.currentScope
    : allRowsScope(infiniteScroll)
  if (!scope) return null

  return {
    scope,
    purpose,
    format,
    fields,
  }
}
