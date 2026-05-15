import { SearchIcon } from "lucide-react"
import { Autocomplete } from "@/components/ui/autocomplete"

export interface DataTableSearchAutocompleteProps {
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
  onCommit: (selectedValue?: string) => void
  placeholder?: string
}

export function DataTableSearchAutocomplete({
  value,
  options,
  onChange,
  onCommit,
  placeholder = "Search...",
}: DataTableSearchAutocompleteProps) {
  return (
    <div
      className="group/input-group cursor-text relative flex h-8 w-full max-w-xs shrink-0 items-center rounded-lg border border-input transition-colors outline-none has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 dark:bg-input/30"
      onClick={(event) => {
        if ((event.target as HTMLElement).tagName !== "INPUT") {
          event.currentTarget.querySelector("input")?.focus()
        }
      }}
    >
      <div className="flex items-center justify-center py-1.5 pl-2 text-muted-foreground [&>svg:not([class*='size-'])]:size-4">
        <SearchIcon />
      </div>
      <Autocomplete
        value={value}
        options={options}
        placeholder={placeholder}
        filterClientSide={false}
        onInputValueChange={onChange}
        onChange={(nextValue) => {
          onChange(nextValue)
          onCommit(nextValue)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onCommit(value)
          }
        }}
        wrapperClassName="flex-1 min-w-0"
        className="flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent h-8"
      />
    </div>
  )
}
