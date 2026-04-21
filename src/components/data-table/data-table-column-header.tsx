import type { Column, Table } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, PinIcon, PinOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.ComponentProps<"div"> {
  table: Table<TData>
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  table,
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const sorted = column.getIsSorted()
  const canSort = column.getCanSort()
  const canPin = column.getCanPin()

  function handleSortToggle() {
    if (!canSort) return

    table.setSorting((prev) => {
      const existing = prev.find((s) => s.id === column.id)
      const others = prev.filter((s) => s.id !== column.id)
      if (!existing) return [{ id: column.id, desc: false }, ...others]
      if (!existing.desc) return [{ id: column.id, desc: true }, ...others]
      return others
    })
  }

  function setSort(mode: "asc" | "desc" | "none") {
    if (!canSort) return

    table.setSorting((prev) => {
      const others = prev.filter((s) => s.id !== column.id)
      if (mode === "none") return others
      return [{ id: column.id, desc: mode === "desc" }, ...others]
    })
  }

  if (!canSort && !canPin) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("flex items-center gap-2", className)}>
          <Button
            variant="ghost"
            className="-ml-0.5"
            onClick={handleSortToggle}
          >
            <span>{title}</span>
            {sorted === "desc" ? (
              <ArrowDown />
            ) : sorted === "asc" ? (
              <ArrowUp />
            ) : (
              <ArrowUpDown />
            )}
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-auto min-w-44">
        {canSort && (
          <>
            <ContextMenuItem onSelect={() => setSort("asc")}>
              <ArrowUp data-icon="inline-start" />
              Sort ascending
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setSort("desc")}>
              <ArrowDown data-icon="inline-start" />
              Sort descending
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setSort("none")} disabled={!column.getIsSorted()}>
              <ArrowUpDown data-icon="inline-start" />
              Clear sorting
            </ContextMenuItem>
          </>
        )}

        {canSort && canPin && <ContextMenuSeparator />}

        {canPin && (
          <>
            <ContextMenuItem onSelect={() => column.pin("left")}>
              <PinIcon data-icon="inline-start" />
              Pin left
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => column.pin("right")}>
              <PinIcon data-icon="inline-start" />
              Pin right
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => column.pin(false)} disabled={!column.getIsPinned()}>
              <PinOffIcon data-icon="inline-start" />
              Unpin
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
