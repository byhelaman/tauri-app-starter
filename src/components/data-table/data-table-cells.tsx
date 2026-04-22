import { useState, useRef } from "react"
import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"


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

function moveFocus(element: HTMLElement, direction: "up" | "down" | "left" | "right") {
  const td = element.closest("td")
  const tr = td?.closest("tr")
  if (!td || !tr) return

  let targetTd: Element | null | undefined = null

  if (direction === "up") {
    targetTd = tr.previousElementSibling?.children[td.cellIndex]
  } else if (direction === "down") {
    targetTd = tr.nextElementSibling?.children[td.cellIndex]
  } else if (direction === "left") {
    targetTd = td.previousElementSibling
  } else if (direction === "right") {
    targetTd = td.nextElementSibling
  }

  if (targetTd) {
    const focusable = targetTd.querySelector<HTMLElement>('[tabindex="0"], input, button')
    focusable?.focus()
  }
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

  const [isEditing, setIsEditing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [wasBlurred, setWasBlurred] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const [initialEditValue, setInitialEditValue] = useState<string | null>(null)

  function handleCommit(currentValue: string) {
    if (!enableEditing) {
      setIsEditing(false)
      return
    }

    setWasBlurred(true)
    const isValid = validate ? validate(currentValue) : true
    setHasError(!isValid)

    if (currentValue !== nextValue) {
      onCommit?.(currentValue, isValid)
    }
    setIsEditing(false)
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key.startsWith("Arrow")) {
      e.preventDefault()
      const direction = e.key.replace("Arrow", "").toLowerCase() as "up" | "down" | "left" | "right"
      if (containerRef.current) moveFocus(containerRef.current, direction)
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      navigator.clipboard.writeText(nextValue)
      return
    }

    if (enableEditing && e.key === "Delete") {
      e.preventDefault()
      handleCommit("")
      return
    }

    if (enableEditing && e.key === "Backspace") {
      e.preventDefault()
      setInitialEditValue("")
      setIsEditing(true)
      return
    }

    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault()
      setInitialEditValue(null)
      setIsEditing(true)
      return
    }

    if (enableEditing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      setInitialEditValue(e.key)
      setIsEditing(true)
      return
    }
  }

  if (!isEditing) {
    return (
      <div
        ref={containerRef}
        tabIndex={0}
        onDoubleClick={() => {
          setInitialEditValue(null)
          setIsEditing(true)
        }}
        onKeyDown={handleGridKeyDown}
        aria-invalid={(wasBlurred && hasError) || undefined}
        className={cn(
          "flex h-8 w-full min-w-0 items-center rounded-lg border border-transparent bg-transparent px-2.5 py-1 text-base transition-colors outline-none md:text-sm",
          "hover:bg-input/30",
          "focus:border-ring focus:ring-3 focus:ring-ring/50 focus:bg-background dark:focus:bg-input/30",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          "focus:aria-invalid:border-ring focus:aria-invalid:ring-ring/50 dark:focus:aria-invalid:border-ring dark:focus:aria-invalid:ring-ring/50",
          className
        )}
      >
        <span className="truncate">{nextValue}</span>
      </div>
    )
  }

  return (
    <Input
      ref={inputRef}
      readOnly={!enableEditing}
      defaultValue={initialEditValue !== null ? initialEditValue : nextValue}
      autoFocus
      onBlur={(e) => {
        if (enableEditing) {
          handleCommit(e.currentTarget.value)
        } else {
          setIsEditing(false)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          const td = inputRef.current?.closest("td")
          handleCommit(e.currentTarget.value)
          
          if (td) {
            setTimeout(() => {
              const tr = td.closest("tr")
              const nextTd = tr?.nextElementSibling?.children[td.cellIndex]
              const focusable = nextTd?.querySelector<HTMLElement>('[tabindex="0"], input, button')
              if (focusable) focusable.focus()
              else td.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
            }, 0)
          }
        } else if (e.key === "Escape") {
          e.preventDefault()
          const td = inputRef.current?.closest("td")
          setIsEditing(false)
          setTimeout(() => {
            td?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
          }, 0)
        }
      }}
      aria-invalid={(wasBlurred && hasError) || undefined}
      className={cn(
        "min-w-full bg-background shadow-sm",
        className
      )}
    />
  )
}

export function renderCell(value: string | number, classNameOrOptions?: string | InlineEditableCellOptions) {
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
