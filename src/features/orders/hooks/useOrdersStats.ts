import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

interface OrdersStats {
  total:      number
  revenue:    number
  by_status:  Record<string, number>
  by_channel: Record<string, number>
}

/**
 * Hook dedicado a estadísticas de órdenes para el dashboard.
 * Usa la RPC get_orders_stats() — una sola query de agregación server-side,
 * sin cargar filas individuales.
 */
export function useOrdersStats() {
  const { data, isLoading } = useQuery({
    queryKey: ["orders", "stats"],
    queryFn: async (): Promise<OrdersStats> => {
      if (!supabase) return { total: 0, revenue: 0, by_status: {}, by_channel: {} }
      const { data, error } = await supabase.rpc("get_orders_stats")
      if (error) throw new Error(error.message)
      return data as OrdersStats
    },
    staleTime: 30_000,
    enabled: !!supabase,
  })

  return {
    stats:           data ?? { total: 0, revenue: 0, by_status: {}, by_channel: {} },
    totalOrders:     data?.total ?? 0,
    isOrdersLoading: isLoading,
  }
}
