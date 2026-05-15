import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export interface AutocompleteSuggestion {
  value: string
  label: string
  type: string
}

/**
 * Hook para obtener sugerencias de autocompletado desde la base de datos.
 * Usa la RPC `search_orders_autocomplete` que aprovecha índices GIN trigram
 * para respuestas ultra-rápidas (< 20ms).
 *
 * Solo dispara la query cuando `debouncedQuery` tiene al menos 1 caracter.
 */
export function useSearchAutocomplete(debouncedQuery: string) {
  return useQuery({
    queryKey: ["orders", "autocomplete", debouncedQuery],
    queryFn: async (): Promise<AutocompleteSuggestion[]> => {
      if (!supabase) return []
      const { data, error } = await supabase.rpc("search_orders_autocomplete", {
        query_text: debouncedQuery.trim(),
      })
      if (error) throw new Error(error.message)
      return (data as AutocompleteSuggestion[]) ?? []
    },
    enabled: !!supabase && debouncedQuery.trim().length >= 1,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}
