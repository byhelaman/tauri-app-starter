import { useQuery } from "@tanstack/react-query"
import * as api from "@/features/orders/api"
import type { Order } from "@/features/orders/columns"

/**
 * Hook dedicado a estadísticas de órdenes para el dashboard.
 *
 * Separado de useOrders para evitar que la página de órdenes
 * ejecute esta query costosa (limit: 1000) cuando no la necesita.
 *
 * TODO: Reemplazar con una RPC de agregación server-side
 *       (SELECT COUNT, SUM, etc.) cuando el volumen de órdenes crezca.
 */
export function useOrdersStats(): { orders: Order[]; totalOrders: number; isOrdersLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["orders", "stats"],
    queryFn: () => api.fetchOrders({ limit: 1000, offset: 0 }),
    staleTime: 30_000,
  })

  return {
    orders: data?.data ?? [],
    totalOrders: data?.total ?? 0,
    isOrdersLoading: isLoading,
  }
}
