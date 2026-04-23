import { useState, useRef, useEffect, startTransition } from "react"
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
  const [isEditing, setIsEditing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [wasBlurred, setWasBlurred] = useState(false)
  
  // Estado Optimista de UI para evitar parpadeos mientras la tabla pesada se actualiza en segundo plano
  const [optimisticValue, setOptimisticValue] = useState<string | null>(null)
  const nextValue = optimisticValue !== null ? optimisticValue : String(value ?? "")

  useEffect(() => {
    // Limpia el valor optimista una vez que la tabla padre ha actualizado nuestra prop real
    setOptimisticValue(null)
  }, [value])

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const [initialEditValue, setInitialEditValue] = useState<string | null>(null)
  
  // Estado para gestionar el movimiento del foco de forma declarativa y evitar setTimeout(0)
  const [pendingFocusAction, setPendingFocusAction] = useState<"current" | "up" | "down" | "left" | "right" | null>(null)

  // useEffect que se encarga de mover el foco una vez que el componente ha vuelto al modo vista (DOM actualizado)
  useEffect(() => {
    if (!isEditing && pendingFocusAction && containerRef.current) {
      if (pendingFocusAction === "current") {
        containerRef.current.focus()
      } else {
        moveFocus(containerRef.current, pendingFocusAction)
      }
      setPendingFocusAction(null)
    }
  }, [isEditing, pendingFocusAction])

  function handleCommit(currentValue: string) {
    if (!enableEditing) {
      setIsEditing(false)
      return
    }

    setWasBlurred(true)
    const isValid = validate ? validate(currentValue) : true
    setHasError(!isValid)

    if (currentValue !== nextValue) {
      setOptimisticValue(currentValue)
      // Usamos el modo concurrente de React para marcar la actualización de la tabla como no urgente,
      // manteniendo así el hilo principal fluido y responsivo.
      startTransition(() => {
        onCommit?.(currentValue, isValid)
      })
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

    if (enableEditing && (e.ctrlKey || e.metaKey) && e.key === "v") {
      // Dejamos que el evento 'onPaste' del div maneje esto para evitar avisos de seguridad
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

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!enableEditing) return
    const text = e.clipboardData.getData("text")
    if (text) {
      e.preventDefault()
      handleCommit(text)
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
        onPaste={handlePaste}
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
    <div className="relative flex w-full min-w-0">
      {/* Marcador de posición invisible que mantiene el ancho exacto de la celda del modo vista */}
      <div className={cn(
        "flex h-8 w-full min-w-0 items-center border border-transparent px-2.5 py-1 text-base md:text-sm opacity-0 pointer-events-none",
        className
      )}>
        <span className="truncate">{nextValue}</span>
      </div>
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
          let direction: "up" | "down" | "left" | "right" | null = null

          if (e.key === "Enter") {
            direction = "down"
          } else if (initialEditValue !== null) {
            // "Modo de sobrescritura" (se escribió directamente en la celda)
            // Las flechas guardan inmediatamente y mueven el foco
            if (e.key === "ArrowUp") direction = "up"
            else if (e.key === "ArrowDown") direction = "down"
            else if (e.key === "ArrowLeft") direction = "left"
            else if (e.key === "ArrowRight") direction = "right"
          }

          if (direction) {
            e.preventDefault()
            handleCommit(e.currentTarget.value)
            setPendingFocusAction(direction)
          } else if (e.key === "Escape") {
            e.preventDefault()
            setIsEditing(false)
            setPendingFocusAction("current")
          }
        }}
        aria-invalid={(wasBlurred && hasError) || undefined}
        className={cn(
          "absolute inset-0 h-8 w-full bg-background shadow-sm",
          className
        )}
      />
    </div>
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
