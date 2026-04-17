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
}

/** Extract the hour from the start_time portion of a "HH:MM - HH:MM" string */
function extractStartHour(timeRange: string): number {
  const startTime = timeRange.split(" - ")[0]?.trim() ?? ""
  return parseInt(startTime.split(":")[0] ?? "", 10)
}

/** Collect all unique start hours present in the column data, sorted */
export function getAvailableHours<TData, TValue>(column: Column<TData, TValue>): string[] {
  const facets = column.getFacetedUniqueValues()
  const hours = new Set<number>()
  for (const [value] of facets) {
    const hour = extractStartHour(String(value))
    if (!isNaN(hour)) hours.add(hour)
  }
  return Array.from(hours)
    .sort((a, b) => a - b)
    .map((h) => String(h).padStart(2, "0"))
}

export function DataTableIntervalFilter<TData, TValue>({
  column,
  title = "Interval",
}: DataTableIntervalFilterProps<TData, TValue>) {
  if (!column) return null

  const filterValue = column.getFilterValue()
  const selectedValues = new Set(
    Array.isArray(filterValue) ? (filterValue as string[]) : []
  )
  const availableHours = getAvailableHours(column)

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
          <Clock data-icon="inline-start" />
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
      <DropdownMenuContent align="start" className="w-40 p-0">
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
