import type { Table } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { TableCell, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { getColumnSizeStyle, getPinnedColumnStyle } from "./data-table-utils"

interface DataTableSkeletonProps<TData> {
  table: Table<TData>
  rowCount: number
  leftEdgeId?: string
  rightEdgeId?: string
}

export function DataTableSkeleton<TData>({
  table,
  rowCount,
  leftEdgeId,
  rightEdgeId,
}: DataTableSkeletonProps<TData>) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <TableRow key={`skeleton-${i}`} className="group/row group">
          {table.getHeaderGroups()[0]?.headers.map((header) => {
            const colId = header.column.id
            const pinned = header.column.getIsPinned()
            const isFirst = pinned === "left" && header.column.getStart("left") === 0
            const isEdge = pinned === "left"
              ? colId === leftEdgeId
              : pinned === "right"
                ? colId === rightEdgeId
                : false

            return (
              <TableCell
                key={`skeleton-cell-${colId}-${i}`}
                className={cn(
                  pinned &&
                    "border-b group-last/row:border-b-0 bg-(--highlight-bg,var(--table-bg,var(--color-background))) transition-colors group-hover:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background))))",
                )}
                style={{
                  ...(pinned ? undefined : getColumnSizeStyle(header.column.columnDef)),
                  ...getPinnedColumnStyle(
                    header.column,
                    false,
                    isEdge,
                    isFirst,
                  ),
                }}
              >
                {colId === "select" ? (
                  <Skeleton className="size-[18px] rounded-[4px]" />
                ) : colId === "actions" ? (
                  <Skeleton className="size-[22px] rounded-sm" />
                ) : (
                  <Skeleton className="h-8 rounded-lg" />
                )}
              </TableCell>
            )
          })}
        </TableRow>
      ))}
    </>
  )
}
