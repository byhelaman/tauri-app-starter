import type { CSSProperties } from "react"
import type { Column, ColumnDef } from "@tanstack/react-table"

export type SizableColumnDef<TData, TValue> = ColumnDef<TData, TValue> & {
  size?: number
  minSize?: number
  maxSize?: number
}

export function getColumnSizeStyle<TData, TValue>(columnDef: ColumnDef<TData, TValue>): CSSProperties | undefined {
  const sizing = columnDef as SizableColumnDef<TData, TValue>

  const hasSizing =
    typeof sizing.size === "number" ||
    typeof sizing.minSize === "number" ||
    typeof sizing.maxSize === "number"

  if (!hasSizing) return undefined

  return {
    width: typeof sizing.size === "number" ? `${sizing.size}px` : undefined,
    minWidth: typeof sizing.minSize === "number" ? `${sizing.minSize}px` : undefined,
    maxWidth: typeof sizing.maxSize === "number" ? `${sizing.maxSize}px` : undefined,
  }
}

export function getPinnedColumnStyle<TData, TValue>(
  column: Column<TData, TValue>,
  isHeader: boolean,
  isEdge: boolean,
  isFirst: boolean,
): CSSProperties | undefined {
  const pin = column.getIsPinned()
  if (!pin) return undefined

  const offset = pin === "left" ? column.getStart("left") : column.getAfter("right")
  const size = column.getSize()

  const accentShadow = isFirst && pin === "left" && !isHeader
    ? "inset 2px 0 0 0 var(--highlight-accent, transparent)"
    : undefined

  const edgeShadow = isEdge
    ? pin === "left"
      ? "inset -1px 0 0 var(--border), 6px 0 8px -8px var(--border)"
      : "inset 1px 0 0 var(--border), -6px 0 8px -8px var(--border)"
    : undefined

  const shadows = [accentShadow, edgeShadow].filter(Boolean).join(", ") || undefined

  return {
    position: "sticky",
    width: `${size}px`,
    minWidth: `${size}px`,
    maxWidth: `${size}px`,
    left: pin === "left" ? `${offset}px` : undefined,
    right: pin === "right" ? `${offset}px` : undefined,
    boxShadow: shadows,
  }
}
