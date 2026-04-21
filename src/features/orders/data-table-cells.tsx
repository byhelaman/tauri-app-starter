import { useState } from "react"
import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

export const cellInputClass = "border-transparent bg-transparent shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background/30 dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-background/30 text-left"

export interface InlineEditableCellOptions {
  className?: string
  enableEditing?: boolean
  validate?: (value: string) => boolean
  onCommit?: (value: string, isValid: boolean) => void
}

function normalizeCellOptions(classNameOrOptions?: string | InlineEditableCellOptions): InlineEditableCellOptions {
  if (typeof classNameOrOptions === "string") {
    return { className: classNameOrOptions }
  }
  return classNameOrOptions ?? {}
}

function InlineEditableCell({
  value,
  className,
  enableEditing = false,
  validate,
  onCommit,
}: {
  value: string | number
} & InlineEditableCellOptions) {
  const nextValue = String(value ?? "")

  const [hasError, setHasError] = useState(false)
  const [wasBlurred, setWasBlurred] = useState(false)

  function handleBlur(currentValue: string) {
    if (!enableEditing) {
      return
    }

    setWasBlurred(true)

    const isValid = validate ? validate(currentValue) : true
    setHasError(!isValid)

    if (currentValue !== nextValue) {
      onCommit?.(currentValue, isValid)
    }
  }

  return (
    <Input
      key={nextValue}
      readOnly={!enableEditing}
      defaultValue={nextValue}
      onBlur={(event) => {
        handleBlur(event.currentTarget.value)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        }
      }}
      aria-invalid={(wasBlurred && hasError) || undefined}
      className={cn(
        cellInputClass,
        !enableEditing && "cursor-default hover:bg-transparent focus-visible:bg-transparent",
        className
      )}
    />
  )
}

export function renderReadOnlyCell(value: string | number, classNameOrOptions?: string | InlineEditableCellOptions) {
  const options = normalizeCellOptions(classNameOrOptions)
  return <InlineEditableCell value={value} {...options} />
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
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enablePinning: false,
  }
}
