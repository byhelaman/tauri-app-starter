import type { Column } from "@tanstack/react-table"
import { Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"

interface DataTableIntervalFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  /** Horas disponibles desde el servidor (e.g. ["06", "08", "14", "21"]) */
  hours?: string[]
}

/**
 * Retorna las horas disponibles para el filtro.
 * - Si se pasan `hours` desde el servidor: úsalas directamente.
 * - Fallback: rango completo 00-23 (todos los valores posibles de TIME).
 *
 * No usamos getFacetedUniqueValues() porque con paginación server-side
 * solo contiene las filas de la página actual, no el total de la BD.
 */
export function getAvailableHours<TData, TValue>(
  _column: Column<TData, TValue>,
  hours?: string[]
): string[] {
  if (hours && hours.length > 0) return hours
  return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
}

export function DataTableIntervalFilter<TData, TValue>({
  column,
  title = "Interval",
  hours,
}: DataTableIntervalFilterProps<TData, TValue>) {
  if (!column) return null

  const filterValue = column.getFilterValue()
  const selectedValues = new Set(
    Array.isArray(filterValue) ? (filterValue as string[]) : []
  )
  const availableHours = getAvailableHours(column, hours)

  const toggle = (value: string) => {
    const next = new Set(selectedValues)
    if (next.has(value)) {
      next.delete(value)
    } else {
      next.add(value)
    }
    column.setFilterValue(next.size ? Array.from(next) : undefined)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="border-dashed">
          <Clock />
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-8" />
              <Badge variant="secondary" className="rounded-sm px-1 lg:hidden">
                {selectedValues.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1">
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  availableHours
                    .filter((h) => selectedValues.has(h))
                    .map((h) => (
                      <Badge key={h} variant="secondary" className="rounded-sm px-1">
                        {h}:00
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="hidden w-40 p-0 lg:block">
        <div className="max-h-60 overflow-auto scrollbar p-1">
          {availableHours.map((hour) => (
            <DropdownMenuCheckboxItem
              key={hour}
              checked={selectedValues.has(hour)}
              onCheckedChange={() => toggle(hour)}
              onSelect={(e) => e.preventDefault()}
            >
              <Clock />
              {hour}:00
            </DropdownMenuCheckboxItem>
          ))}
        </div>
        {selectedValues.size > 0 && (
          <>
            <Separator />
            <div className="p-1">
              <Button
                variant="ghost"
                // size="sm"
                className="w-full justify-center font-normal"
                onClick={() => column.setFilterValue(undefined)}
              >
                Clear filters
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
