/**
 * useOrdersRealtime — Realtime sync via Supabase Postgres Changes (WebSockets)
 *
 * Suscribe a cambios agregados de orders y a cambios directos de queue_orders.
 * Las cargas masivas de orders emiten un evento por sentencia SQL mediante
 * order_change_events, no un evento por fila.
 *
 * Query key: ["orders", "infinite", ...filters] — el prefijo ["orders", "infinite"]
 * matchea todas las combinaciones de filtro activas en cache.
 *
 * Prerequisito: Habilitar Realtime en Supabase para:
 *   order_change_events ✓  queue_orders ✓
 */

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"

const REALTIME_INVALIDATION_DEBOUNCE_MS = 750
type OrderChangeEvent = { actor_id?: string | null }

/** Prefijo de query key para infinite scroll — coincide con ordersQueryKey en useOrders */
const ORDERS_KEY = ["orders", "infinite"] as const

export function useOrdersRealtime() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  useEffect(() => {
    if (!supabase || !user?.id) return
    let ordersTimer: ReturnType<typeof setTimeout> | undefined
    let queueTimer: ReturnType<typeof setTimeout> | undefined

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

    const invalidateQueue = () => {
      if (queueTimer) clearTimeout(queueTimer)
      queueTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["queueOrders"] })
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

      // ── Queue orders: cualquier cambio ────────────────────────
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_orders" },
        invalidateQueue
      )

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Catch-up refetch tras reconexión (laptop sleep, WiFi drop)
        invalidateOrders()
        invalidateQueue()
      }
      if (status === "CHANNEL_ERROR") {
        console.error("[Realtime] Orders channel error — Supabase will retry")
      }
    })

    return () => {
      if (ordersTimer) clearTimeout(ordersTimer)
      if (queueTimer) clearTimeout(queueTimer)
      void supabase!.removeChannel(channel)
    }
  }, [queryClient, user?.id])
}
