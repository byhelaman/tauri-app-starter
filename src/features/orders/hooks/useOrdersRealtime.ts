/**
 * useOrdersRealtime — Realtime sync via Supabase Postgres Changes (WebSockets)
 *
 * Suscribe a `postgres_changes` en las tablas `orders` y `queue_orders`
 * y parchea el cache de React Query quirúrgicamente usando `setQueriesData`
 * en lugar de `invalidateQueries` — evita "thundering herd" de SELECT queries
 * cuando hay muchos usuarios conectados simultáneamente.
 *
 * Query key: ["orders", "infinite", ...filters] — el prefijo ["orders", "infinite"]
 * matchea todas las combinaciones de filtro activas en cache.
 *
 * Prerequisito: Habilitar Realtime en el Supabase Dashboard
 *   Database → Replication → Source → orders ✓  queue_orders ✓
 */

import { useEffect } from "react"
import { useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import type { Order } from "../columns"

type OrderPage = { data: Order[]; total: number }

/** Prefijo de query key para infinite scroll — coincide con ordersQueryKey en useOrders */
const ORDERS_KEY = ["orders", "infinite"] as const

export function useOrdersRealtime() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  useEffect(() => {
    if (!supabase || !user?.id) return

    const channel = supabase
      .channel("orders-realtime")

      // ── Orders: INSERT ────────────────────────────────────────
      // Una nueva fila puede pertenecer a cualquier combinación de filtros.
      // Invalidamos todas las queries de infinite scroll para que refetchen.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          if ((payload.new as Order & { updated_by?: string }).updated_by === user.id) return
          queryClient.invalidateQueries({ queryKey: ORDERS_KEY })
          queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
        }
      )

      // ── Orders: UPDATE ────────────────────────────────────────
      // Parcha quirúrgicamente la entidad en TODAS las páginas de TODAS
      // las queries de infinite scroll en cache, sin network request.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          if ((payload.new as Order & { updated_by?: string }).updated_by === user.id) return
          const updated = payload.new as Order

          queryClient.setQueriesData<InfiniteData<OrderPage>>(
            { queryKey: ORDERS_KEY },
            (old) => {
              if (!old) return old
              const inAnyPage = old.pages.some(p => p.data.some(o => o.id === updated.id))
              if (!inAnyPage) return old
              return {
                ...old,
                pages: old.pages.map(page => ({
                  ...page,
                  data: page.data.map(o => o.id === updated.id ? { ...o, ...updated } : o),
                })),
              }
            }
          )
        }
      )

      // ── Orders: DELETE ────────────────────────────────────────
      // Elimina la fila de todas las páginas en cache y ajusta el total.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id

          queryClient.setQueriesData<InfiniteData<OrderPage>>(
            { queryKey: ORDERS_KEY },
            (old) => {
              if (!old) return old
              const inAnyPage = old.pages.some(p => p.data.some(o => o.id === deletedId))
              if (!inAnyPage) return old
              return {
                ...old,
                pages: old.pages.map(page => {
                  const hadOrder = page.data.some(o => o.id === deletedId)
                  if (!hadOrder) return page
                  return {
                    data:  page.data.filter(o => o.id !== deletedId),
                    total: Math.max(0, page.total - 1),
                  }
                }),
              }
            }
          )
          queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
        }
      )

      // ── Queue orders: cualquier cambio ────────────────────────
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["queueOrders"] })
        }
      )

      // ── Order history: INSERT (trigger de auditoría) ──────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_history" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
          queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
        }
      )

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Catch-up refetch tras reconexión (laptop sleep, WiFi drop)
        queryClient.invalidateQueries({ queryKey: ["orders"] })
        queryClient.invalidateQueries({ queryKey: ["queueOrders"] })
      }
      if (status === "CHANNEL_ERROR") {
        console.error("[Realtime] Orders channel error — Supabase will retry")
      }
    })

    return () => { void supabase!.removeChannel(channel) }
  }, [queryClient, user?.id])
}
