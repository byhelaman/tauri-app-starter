import type { RefObject, ReactNode } from "react"
import { flexRender, type ColumnDef, type Row, type Table as ReactTable } from "@tanstack/react-table"
import type { VirtualItem } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DataTableSkeleton } from "./data-table-skeleton"
import { getColumnSizeStyle, getPinnedColumnStyle } from "../core/data-table-utils"
import {
  activateGridCell,
  gridDirectionFromKey,
  isGridEditingTarget,
  moveGridFocus,
} from "../core/grid-navigation"
import {
  findGridInteractiveControl,
  gridCellCopyValue,
  gridCellFromElement,
  shouldDelegateCellBackgroundClick,
} from "../core/grid-cell-model"

interface DataTableViewportProps<TData, TValue> {
  table: ReactTable<TData>
  columns: ColumnDef<TData, TValue>[]
  rows: Row<TData>[]
  virtualRows: VirtualItem[] | null
  paddingTop: number
  paddingBottom: number
  scrollRef: RefObject<HTMLDivElement | null>
  scrollAreaClassName?: string
  tableHeaderClassName?: string
  headerHeight: number
  rightPinnedWidth: number
  leftPinnedWidth: number
  cellPadding: number
  leftEdgeId?: string
  rightEdgeId?: string
  isLoading: boolean
  isInfiniteScroll: boolean
  isFetchingNextPage?: boolean
  rowClassName?: (row: TData) => string | undefined
  rowContextMenu?: (row: TData) => ReactNode
  sidePanel?: (onClose: () => void) => ReactNode
  isSidePanelOpen: boolean
  onCloseSidePanel: () => void
}

export function DataTableViewport<TData, TValue>({
  table,
  columns,
  rows,
  virtualRows,
  paddingTop,
  paddingBottom,
  scrollRef,
  scrollAreaClassName,
  tableHeaderClassName,
  headerHeight,
  rightPinnedWidth,
  leftPinnedWidth,
  cellPadding,
  leftEdgeId,
  rightEdgeId,
  isLoading,
  isInfiniteScroll,
  isFetchingNextPage,
  rowClassName,
  rowContextMenu,
  sidePanel,
  isSidePanelOpen,
  onCloseSidePanel,
}: DataTableViewportProps<TData, TValue>) {
  function handleGridCellMouseDown(event: React.MouseEvent<HTMLTableCellElement>) {
    if (!(event.target instanceof HTMLElement)) return
    if (isGridEditingTarget(event.target)) return
    if (event.target.closest("button, [role='checkbox'], input, textarea, select, [data-radix-collection-item]")) return

    const interactive = findGridInteractiveControl(event.currentTarget)
    if (shouldDelegateCellBackgroundClick(event.currentTarget) && interactive) {
      event.preventDefault()
      interactive.focus()
      if (interactive instanceof HTMLButtonElement) {
        interactive.click()
      }
      return
    }

    event.currentTarget.focus()
  }

  function handleGridKeyDownCapture(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    const gridCell = event.target instanceof HTMLElement ? gridCellFromElement(event.target) : null

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && gridCell) {
      const copyValue = gridCellCopyValue(gridCell)
      if (copyValue !== undefined) {
        event.preventDefault()
        void navigator.clipboard.writeText(copyValue)
      }
      return
    }

    if ((event.key === "Enter" || event.key === "F2") && event.target instanceof HTMLTableCellElement) {
      event.preventDefault()
      activateGridCell(event.target, event.key)
      return
    }

    const direction = gridDirectionFromKey(event.key)
    if (!direction || isGridEditingTarget(event.target)) return
    if (!(event.target instanceof HTMLElement)) return
    if (!gridCellFromElement(event.target)) return

    event.preventDefault()
    event.stopPropagation()
    moveGridFocus(event.target, direction)
  }

  function handleGridDoubleClickCapture(event: React.MouseEvent<HTMLTableSectionElement>) {
    if (!(event.target instanceof HTMLElement)) return
    const cell = gridCellFromElement(event.target)
    if (!cell || event.target !== cell) return
    activateGridCell(cell, "F2")
  }

  return (
    <div className="flex flex-1 min-h-0 w-full overflow-hidden rounded-md border">
      <div
        ref={scrollRef}
        className={cn("overflow-auto flex-1 scrollbar", scrollAreaClassName)}
        style={{ scrollPadding: `${headerHeight}px ${rightPinnedWidth}px ${cellPadding}px ${leftPinnedWidth}px` }}
      >
        <Table containerClassName="overflow-visible">
          <TableHeader className={cn("sticky top-0 z-50 bg-(--table-bg,var(--color-background))", tableHeaderClassName)}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="group">
                {headerGroup.headers.map((header) => {
                  const pin = header.column.getIsPinned()
                  const isFirst = pin === "left" && header.column.getStart("left") === 0
                  const isEdge = pin === "left" ? header.column.id === leftEdgeId : pin === "right" ? header.column.id === rightEdgeId : false
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.getIsPinned() &&
                        "z-40 bg-(--table-bg,var(--color-background)) transition-colors group-hover:bg-[color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))]"
                      )}
                      style={{
                        ...(header.column.getIsPinned() ? undefined : getColumnSizeStyle(header.column.columnDef)),
                        ...getPinnedColumnStyle(header.column, true, isEdge, isFirst),
                      }}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            onKeyDownCapture={handleGridKeyDownCapture}
            onDoubleClickCapture={handleGridDoubleClickCapture}
          >
            {paddingTop > 0 && (
              <TableRow><TableCell colSpan={columns.length} style={{ height: paddingTop, padding: 0, border: 0 }} /></TableRow>
            )}

            {(virtualRows ?? rows).map((item) => {
              const row = virtualRows ? rows[(item as VirtualItem).index] : (item as Row<TData>)
              if (!row) return null
              const rowEl = (
                <TableRow key={row.id} className={cn("group/row group", rowClassName?.(row.original))} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => {
                    const pin = cell.column.getIsPinned()
                    const isFirst = pin === "left" && cell.column.getStart("left") === 0
                    const isEdge = pin === "left" ? cell.column.id === leftEdgeId : pin === "right" ? cell.column.id === rightEdgeId : false
                    return (
                      <TableCell
                        key={cell.id}
                        data-grid-cell="true"
                        data-grid-cell-interaction={cell.column.columnDef.meta?.grid?.interaction ?? "readonly"}
                        tabIndex={0}
                        onMouseDown={handleGridCellMouseDown}
                        className={cn(
                          "relative outline-none",
                          "after:pointer-events-none after:absolute after:inset-0 after:border after:border-transparent after:transition-colors",
                          "focus:bg-background focus:after:border-2 focus:after:border-ring",
                          cell.column.getIsPinned() &&
                          "relative z-10 group-hover/row:z-30 focus:z-40 border-b group-last/row:border-b-0 bg-(--highlight-bg,var(--table-bg,var(--color-background))) transition-colors group-hover:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-has-data-open:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-has-aria-expanded:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-data-[state=selected]:bg-muted"
                        )}
                        style={{
                          ...(cell.column.getIsPinned() ? undefined : getColumnSizeStyle(cell.column.columnDef)),
                          ...getPinnedColumnStyle(cell.column, false, isEdge, isFirst),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
              if (!rowContextMenu) return rowEl
              return (
                <ContextMenu key={row.id} modal={false}>
                  <ContextMenuTrigger asChild>{rowEl}</ContextMenuTrigger>
                  <ContextMenuContent>{rowContextMenu(row.original)}</ContextMenuContent>
                </ContextMenu>
              )
            })}

            {isLoading && !isInfiniteScroll && rows.length < table.getState().pagination.pageSize && (
              <DataTableSkeleton
                table={table}
                rowCount={table.getState().pagination.pageSize - rows.length}
                leftEdgeId={leftEdgeId}
                rightEdgeId={rightEdgeId}
              />
            )}

            {isLoading && isInfiniteScroll && (
              <DataTableSkeleton
                table={table}
                rowCount={100}
                leftEdgeId={leftEdgeId}
                rightEdgeId={rightEdgeId}
              />
            )}

            {!isLoading && isFetchingNextPage && (
              <DataTableSkeleton
                table={table}
                rowCount={5}
                leftEdgeId={leftEdgeId}
                rightEdgeId={rightEdgeId}
              />
            )}

            {paddingBottom > 0 && (
              <TableRow><TableCell colSpan={columns.length} style={{ height: paddingBottom, padding: 0, border: 0 }} /></TableRow>
            )}

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">No results.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {sidePanel && isSidePanelOpen && (
        <div className="w-96 shrink-0 border-l bg-muted/10 flex flex-col">
          {sidePanel(onCloseSidePanel)}
        </div>
      )}
    </div>
  )
}
