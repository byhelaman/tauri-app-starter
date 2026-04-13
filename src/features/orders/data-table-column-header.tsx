import type { Column, Table } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

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
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  const sorted = column.getIsSorted()

  function handleSort() {
    table.setSorting((prev) => {
      const existing = prev.find((s) => s.id === column.id)
      const others = prev.filter((s) => s.id !== column.id)
      if (!existing) {
        return [{ id: column.id, desc: false }, ...others]
      }
      if (!existing.desc) {
        return [{ id: column.id, desc: true }, ...others]
      }
      return others
    })
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="ghost"
        className="-ml-3"
        onClick={handleSort}
      >
        <span>{title}</span>
        {sorted === "desc" ? (
          <ArrowDown />
        ) : sorted === "asc" ? (
          <ArrowUp />
        ) : (
          <ArrowUpDown />
        )}
        {/* {sortIndex > 0 && (
          <span className="ml-0.5 text-xs text-muted-foreground">{sortIndex + 1}</span>
        )} */}
      </Button>
    </div>
  )
}
