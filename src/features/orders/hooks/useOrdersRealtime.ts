/**
 * useOrdersRealtime — Realtime sync via Supabase Postgres Changes (WebSockets)
 *
 * Suscribe a cambios agregados de orders mediante order_change_events.
 * Las cargas masivas emiten un evento por sentencia SQL, no un evento por fila.
 *
 * Query key: ["orders", "infinite", ...filters] — el prefijo ["orders", "infinite"]
 * matchea todas las combinaciones de filtro activas en cache.
 *
 * Prerequisito: Habilitar Realtime en Supabase para:
 *   order_change_events ✓
 */

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/use-auth"

const REALTIME_INVALIDATION_DEBOUNCE_MS = 750
type OrderChangeEvent = { actor_id?: string | null }

/** Prefijo de query key para infinite scroll — coincide con ordersQueryKey en useOrders */
const ORDERS_KEY = ["orders", "infinite"] as const

export function useOrdersRealtime(enabled = true) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  useEffect(() => {
    if (!enabled) return
    if (!supabase || !user?.id) return
    let ordersTimer: ReturnType<typeof setTimeout> | undefined

    const invalidateOrders = () => {
      if (ordersTimer) clearTimeout(ordersTimer)
      ordersTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY })
        queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
        queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
        queryClient.invalidateQueries({ queryKey: ["orders", "startHours"] })
        queryClient.invalidateQueries({ queryKey: ["orders", "unfiltered-count"] })
      }, REALTIME_INVALIDATION_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel("orders-realtime")

      // ── Orders: evento agregado por sentencia ─────────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_change_events" },
        (payload) => {
          const change = payload.new as OrderChangeEvent
          if (change.actor_id && change.actor_id === user.id) return
          invalidateOrders()
        }
      )

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Catch-up refetch tras reconexión (laptop sleep, WiFi drop)
        invalidateOrders()
      }
      if (status === "CHANNEL_ERROR") {
        console.error("[Realtime] Orders channel error — Supabase will retry")
      }
    })

    return () => {
      if (ordersTimer) clearTimeout(ordersTimer)
      void supabase!.removeChannel(channel)
    }
  }, [enabled, queryClient, user?.id])
}
