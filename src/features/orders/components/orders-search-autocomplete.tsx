import { useEffect, useMemo, useState } from "react"
import { DataTableSearchAutocomplete } from "@/components/data-table/data-table-search-autocomplete"
import { useSearchAutocomplete } from "@/features/orders/hooks/useSearchAutocomplete"

interface OrdersSearchAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onCommit: (selectedValue?: string) => void
  placeholder?: string
}

export function OrdersSearchAutocomplete(props: OrdersSearchAutocompleteProps) {
  const [debouncedSearch, setDebouncedSearch] = useState(props.value)
  const { data: suggestions = [] } = useSearchAutocomplete(debouncedSearch)
  const autocompleteOptions = useMemo(
    () => suggestions.map((suggestion) => ({ label: suggestion.label, value: suggestion.value })),
    [suggestions]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(props.value)
    }, 150)

    return () => window.clearTimeout(timer)
  }, [props.value])

  return (
    <DataTableSearchAutocomplete
      {...props}
      options={autocompleteOptions}
    />
  )
}
