import { forwardRef, type ClipboardEventHandler, type KeyboardEventHandler, type MouseEventHandler } from "react"
import { cn } from "@/lib/utils"

export type GridCellContentKind = "readonly" | "editable"

interface GridCellContentProps {
  kind: GridCellContentKind
  value: string | number
  className?: string
  ariaInvalid?: boolean
  onMouseDown?: MouseEventHandler<HTMLDivElement>
  onDoubleClick?: MouseEventHandler<HTMLDivElement>
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onPaste?: ClipboardEventHandler<HTMLDivElement>
}

export const GridCellContent = forwardRef<HTMLDivElement, GridCellContentProps>(function GridCellContent({
  kind,
  value,
  className,
  ariaInvalid,
  onMouseDown,
  onDoubleClick,
  onKeyDown,
  onPaste,
}, ref) {
  const text = String(value ?? "")

  return (
    <div
      ref={ref}
      data-grid-cell-kind={kind}
      data-grid-copy-value={text}
      aria-invalid={ariaInvalid || undefined}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={cn(
        "flex h-8 w-full min-w-0 items-center rounded-lg bg-transparent px-2.5 py-1 text-base transition-colors hover:bg-input/30 md:text-sm",
        className,
      )}
    >
      <span className="truncate">{text}</span>
    </div>
  )
})
