import { createElement } from "react"
import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import type { DataTableMeta } from "./data-table-types"
import { Checkbox } from "@/components/ui/checkbox"
import { InlineEditableCell, type InlineEditableCellOptions } from "./inline-editable-cell"

function normalizeCellOptions(classNameOrOptions?: string | InlineEditableCellOptions): InlineEditableCellOptions {
  if (typeof classNameOrOptions === "string") {
    return { className: classNameOrOptions }
  }
  return classNameOrOptions ?? {}
}

export function renderCell(value: string | number, classNameOrOptions?: string | InlineEditableCellOptions) {
  const options = normalizeCellOptions(classNameOrOptions)
  return createElement(InlineEditableCell, { value, ...options })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const multiValueFilter: FilterFn<any> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  return filterValue.includes(row.getValue(columnId))
}

export function createSelectColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    minSize: 36,
    maxSize: 36,
    header: ({ table }) => {
      const meta = table.options.meta as DataTableMeta | undefined

      if (meta?.isSelectingAll) {
        return createElement(Checkbox, {
          checked: meta.isSelectingAll === "selectAll",
          disabled: true,
          className: "opacity-50 cursor-wait",
          "aria-label": "Processing selection...",
        })
      }

      const selectedCount = meta?.displaySelectedCount ?? meta?.selectedCount ?? meta?.visibleSelectedCount ?? 0
      const isAllVisibleSelected = meta?.isInfiniteScroll && meta?.totalRowCount !== undefined && meta.totalRowCount > 0
        ? selectedCount === meta.totalRowCount
        : table.getIsAllPageRowsSelected()

      const isSomeVisibleSelected = meta?.isInfiniteScroll
        ? selectedCount > 0 && !isAllVisibleSelected
        : table.getIsSomePageRowsSelected()

      return createElement(Checkbox, {
        checked: isAllVisibleSelected || (isSomeVisibleSelected && "indeterminate"),
        onCheckedChange: (value) => {
          if (value && meta?.isInfiniteScroll && meta?.selectAll) {
            void meta.selectAll()
          } else if (!value && meta?.isInfiniteScroll && meta?.deselectAll) {
            void meta.deselectAll()
          } else {
            table.toggleAllPageRowsSelected(!!value)
          }
        },
        "aria-label": "Select all",
      })
    },
    cell: ({ row }) => createElement(Checkbox, {
      checked: row.getIsSelected(),
      onCheckedChange: (value) => row.toggleSelected(!!value),
      "aria-label": "Select row",
    }),
    enableSorting: false,
    enableHiding: false,
    enablePinning: false,
  }
}
