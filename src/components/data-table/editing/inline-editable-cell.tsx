import { startTransition, useReducer, useRef } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Autocomplete } from "@/components/ui/autocomplete"
import { moveGridFocus, type GridDirection } from "../core/grid-navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface InlineEditableCellOptions {
  className?: string
  enableEditing?: boolean
  validate?: (value: string) => boolean
  validationMessage?: string
  onCommit?: (value: string, isValid: boolean) => void
  autocompleteOptions?: { label: string; value: string }[]
  restrictive?: boolean
}

type EditMode = "idle" | "editing" | "invalid"

type EditState = {
  mode: EditMode
  draftValue: string
  hasError: boolean
  initialEditValue: string | null
}

type EditAction =
  | { type: "start"; value: string; initialEditValue: string | null }
  | { type: "change"; value: string }
  | { type: "valid" }
  | { type: "invalid" }
  | { type: "retry" }
  | { type: "cancel"; value: string }

const initialEditState: EditState = {
  mode: "idle",
  draftValue: "",
  hasError: false,
  initialEditValue: null,
}

function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "start":
      return {
        mode: "editing",
        draftValue: action.value,
        hasError: false,
        initialEditValue: action.initialEditValue,
      }
    case "change":
      return {
        ...state,
        draftValue: action.value,
        hasError: false,
      }
    case "valid":
      return {
        ...state,
        mode: "idle",
        hasError: false,
        initialEditValue: null,
      }
    case "invalid":
      return {
        ...state,
        mode: "invalid",
        hasError: true,
      }
    case "retry":
      return {
        ...state,
        mode: "editing",
        hasError: true,
      }
    case "cancel":
      return {
        mode: "idle",
        draftValue: action.value,
        hasError: false,
        initialEditValue: null,
      }
    default:
      return state
  }
}

export function InlineEditableCell({
  value,
  className,
  enableEditing = false,
  validate,
  validationMessage = "The value entered is not valid for this cell.",
  onCommit,
  autocompleteOptions,
  restrictive = false,
}: {
  value: string | number
} & InlineEditableCellOptions) {
  const propValue = String(value ?? "")
  const nextValue = propValue

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editContainerRef = useRef<HTMLDivElement>(null)
  const gridCellRef = useRef<HTMLElement | null>(null)
  const skipNextBlurRef = useRef(false)
  const [editState, dispatchEdit] = useReducer(editReducer, initialEditState)
  const isEditing = editState.mode !== "idle"

  function gridCell() {
    return containerRef.current?.closest<HTMLElement>("[data-grid-cell='true']")
      ?? editContainerRef.current?.closest<HTMLElement>("[data-grid-cell='true']")
      ?? gridCellRef.current
  }

  function beginEditing(initialValue: string | null = null) {
    skipNextBlurRef.current = false
    dispatchEdit({
      type: "start",
      value: initialValue ?? nextValue,
      initialEditValue: initialValue,
    })
  }

  function scheduleFocus(action: "current" | GridDirection) {
    requestAnimationFrame(() => {
      if (!containerRef.current) return
      if (action === "current") {
        ;(gridCell() ?? containerRef.current).focus()
      } else {
        moveGridFocus(containerRef.current, action)
      }
    })
  }

  function handleCommit(currentValue: string, focusAction?: "current" | GridDirection) {
    if (!enableEditing) {
      dispatchEdit({ type: "cancel", value: nextValue })
      if (focusAction) scheduleFocus(focusAction)
      return
    }

    const isValid = validate ? validate(currentValue) : true

    if (!isValid) {
      skipNextBlurRef.current = true
      dispatchEdit({ type: "invalid" })
      return
    }

    dispatchEdit({ type: "valid" })

    if (currentValue !== propValue) {
      startTransition(() => {
        onCommit?.(currentValue, true)
      })
    }
    if (focusAction) scheduleFocus(focusAction)
  }

  const handleRetry = () => {
    skipNextBlurRef.current = false
    dispatchEdit({ type: "retry" })
    requestAnimationFrame(() => {
      const input = editContainerRef.current?.querySelector("input")
      input?.focus()
    })
  }

  const handleCancelEdit = () => {
    skipNextBlurRef.current = false
    dispatchEdit({ type: "cancel", value: nextValue })
    scheduleFocus("current")
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key.startsWith("Arrow")) {
      e.preventDefault()
      const direction = e.key.replace("Arrow", "").toLowerCase() as "up" | "down" | "left" | "right"
      if (containerRef.current) moveGridFocus(containerRef.current, direction)
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      navigator.clipboard.writeText(nextValue)
      return
    }

    if (enableEditing && (e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        if (text) handleCommit(text)
      })
      return
    }

    if (enableEditing && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault()
      beginEditing("")
      return
    }

    if (e.key === "Enter" || e.key === "F2") {
      if (enableEditing) {
        beginEditing()
      }
    }

    if (enableEditing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      beginEditing(e.key)
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    let direction: "up" | "down" | "left" | "right" | null = null

    if (e.key === "Enter") {
      direction = "down"
    } else if (editState.initialEditValue !== null) {
      if (e.key === "ArrowUp") direction = "up"
      else if (e.key === "ArrowDown") direction = "down"
      else if (e.key === "ArrowLeft") direction = "left"
      else if (e.key === "ArrowRight") direction = "right"
    }

    if (direction) {
      e.preventDefault()
      handleCommit(editState.draftValue, direction)
    } else if (e.key === "Escape") {
      e.preventDefault()
      dispatchEdit({ type: "cancel", value: nextValue })
      scheduleFocus("current")
    }
  }

  if (!isEditing) {
    return (
      <div
        ref={(node) => {
          containerRef.current = node
          if (!node) return
          const cell = node.closest<HTMLElement>("[data-grid-cell='true']")
          gridCellRef.current = cell
          if (cell) {
            node.removeAttribute("tabindex")
          } else {
            node.tabIndex = 0
          }
        }}
        data-grid-editable={enableEditing || undefined}
        onMouseDown={(event) => {
          const cell = gridCell()
          if (!cell) return
          event.preventDefault()
          cell.focus()
        }}
        onDoubleClick={() => {
          beginEditing()
        }}
        onKeyDown={handleGridKeyDown}
        onPaste={handlePaste}
        aria-invalid={editState.hasError || undefined}
        className={cn(
          "flex h-8 w-full min-w-0 items-center rounded-lg bg-transparent px-2.5 py-1 text-base transition-colors md:text-sm",
          "hover:bg-input/30",
          className
        )}
      >
        <span className="truncate">{nextValue}</span>
      </div>
    )
  }

  return (
    <div ref={editContainerRef} className="relative flex w-full min-w-0">
      <div className={cn(
        "flex h-8 w-full min-w-0 items-center border border-transparent px-2.5 py-1 text-base md:text-sm opacity-0 pointer-events-none",
        className
      )}>
        <span className="truncate">{nextValue}</span>
      </div>
      {autocompleteOptions ? (
        <Autocomplete
          options={autocompleteOptions}
          value={editState.draftValue}
          restrictive={restrictive}
          onChange={(val) => {
            dispatchEdit({ type: "change", value: val })
            handleCommit(val, "current")
          }}
          onInputValueChange={(value) => dispatchEdit({ type: "change", value })}
          onBlur={(committedValue) => {
            if (skipNextBlurRef.current) return
            if (committedValue !== undefined) {
              handleCommit(committedValue)
            } else {
              dispatchEdit({ type: "cancel", value: nextValue })
            }
          }}
          onKeyDown={handleInputKeyDown}
          autoFocus
          wrapperClassName="absolute inset-0"
          className={cn("h-full w-full bg-background shadow-sm", className)}
        />
      ) : (
        <Input
          ref={inputRef}
          readOnly={!enableEditing}
          value={editState.draftValue}
          onChange={(e) => dispatchEdit({ type: "change", value: e.target.value })}
          autoFocus
          onBlur={(e) => {
            if (enableEditing) {
              handleCommit(e.currentTarget.value)
            } else {
              dispatchEdit({ type: "cancel", value: nextValue })
            }
          }}
          onKeyDown={handleInputKeyDown}
          aria-invalid={editState.hasError || undefined}
          className={cn("absolute inset-0 h-8 w-full bg-background shadow-sm", className)}
        />
      )}

      <AlertDialog
        open={editState.mode === "invalid"}
        onOpenChange={() => undefined}
      >
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            if (isEditing) {
              e.preventDefault()
              const input = editContainerRef.current?.querySelector("input")
              input?.focus()
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Data Validation Error</AlertDialogTitle>
            <AlertDialogDescription>
              {validationMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleRetry}>Retry</AlertDialogAction>
            <AlertDialogCancel onClick={handleCancelEdit}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
