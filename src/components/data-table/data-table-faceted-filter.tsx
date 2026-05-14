import type { Column } from "@tanstack/react-table"
import { PlusCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"

interface DataTableFacetedFilterProps<TData, TValue> {
    column?: Column<TData, TValue>
    title?: string
    options: {
        label: string
        value: string
        icon?: React.ComponentType<{ className?: string }>
    }[]
    /** Valor draft controlado externamente (modo action-based). */
    draftValue?: string[]
    /** Callback para cambios en modo draft. */
    onDraftChange?: (values: string[] | undefined) => void
}

export function DataTableFacetedFilter<TData, TValue>({
    column,
    title,
    options,
    draftValue,
    onDraftChange,
}: DataTableFacetedFilterProps<TData, TValue>) {
    const isDraftMode = onDraftChange !== undefined
    const filterValue = isDraftMode ? (draftValue ?? []) : column?.getFilterValue()
    const selectedValues = new Set(
        Array.isArray(filterValue) ? (filterValue as string[]) : []
    )

    const toggle = (value: string) => {
        const next = new Set(selectedValues)
        if (next.has(value)) {
            next.delete(value)
        } else {
            next.add(value)
        }
        const result = next.size ? Array.from(next) : undefined
        if (isDraftMode) {
            onDraftChange(result)
        } else {
            column?.setFilterValue(result)
        }
    }

    const clear = () => {
        if (isDraftMode) {
            onDraftChange(undefined)
        } else {
            column?.setFilterValue(undefined)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-dashed">
                    <PlusCircle />
                    {title ?? "Filter"}
                    {selectedValues?.size > 0 && (
                        <>
                            <Separator orientation="vertical" className="mx-1 h-8" />
                            <Badge
                                variant="secondary"
                                className="rounded-sm px-1 lg:hidden"
                            >
                                {selectedValues.size}
                            </Badge>
                            <div className="hidden gap-1 lg:flex">
                                {selectedValues.size > 2 ? (
                                    <Badge
                                        variant="secondary"
                                        className="rounded-sm px-1"
                                    >
                                        {selectedValues.size} selected
                                    </Badge>
                                ) : (
                                    options
                                        .filter((option) => selectedValues.has(option.value))
                                        .map((option) => (
                                            <Badge
                                                variant="secondary"
                                                key={option.value}
                                                className="rounded-sm px-1"
                                            >
                                                {option.label}
                                            </Badge>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="hidden w-40 p-0 lg:block">
                <div className="max-h-56 overflow-auto scrollbar p-1">
                    {options.map((option) => (
                        <DropdownMenuCheckboxItem
                            key={option.value}
                            className="capitalize"
                            checked={selectedValues.has(option.value)}
                            onCheckedChange={() => toggle(option.value)}
                            onSelect={(e) => e.preventDefault()}
                        >
                            {option.icon && <option.icon />}
                            {option.label}
                        </DropdownMenuCheckboxItem>
                    ))}
                </div>
                {selectedValues.size > 0 && (
                    <>
                        <Separator />
                        <div className="p-1">
                            <Button
                                variant="ghost"
                                className="w-full justify-center font-normal"
                                onClick={clear}
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
