/**
 * useOrdersRealtime — Realtime sync via Supabase Postgres Changes (WebSockets)
 *
 * Suscribe a `postgres_changes` en las tablas `orders` y `queue_orders`
 * y parchea el cache de React Query quirúrgicamente usando `setQueriesData`
 * en lugar de `invalidateQueries` — evita "thundering herd" de SELECT queries
 * cuando hay muchos usuarios conectados simultáneamente.
 *
 * Prerequisito: Habilitar Realtime en el Supabase Dashboard
 *   Database → Replication → Source → orders ✓  queue_orders ✓
 */

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import type { Order } from "../columns"

export function useOrdersRealtime() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  useEffect(() => {
    if (!supabase || !user?.id) return

    const channel = supabase
      .channel("orders-realtime")

      // ── Orders: INSERT ────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          if ((payload.new as Order & { updated_by?: string }).updated_by === user.id) return
          // Nueva fila puede pertenecer a cualquier página — invalidar
          queryClient.invalidateQueries({ queryKey: ["orders", "paginated"] })
          queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
        }
      )

      // ── Orders: UPDATE ────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          if ((payload.new as Order & { updated_by?: string }).updated_by === user.id) return
          const updated = payload.new as Order

          // Parchar todas las páginas paginadas en caché (sin network request)
          queryClient.setQueriesData<{ data: Order[]; total: number }>(
            { queryKey: ["orders", "paginated"] },
            (old) => {
              if (!old) return old
              const hasOrder = old.data.some((o) => o.id === updated.id)
              if (!hasOrder) return old
              return {
                ...old,
                data: old.data.map((o) => o.id === updated.id ? { ...o, ...updated } : o),
              }
            }
          )
        }
      )

      // ── Orders: DELETE ────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          queryClient.setQueriesData<{ data: Order[]; total: number }>(
            { queryKey: ["orders", "paginated"] },
            (old) => {
              if (!old) return old
              const hadOrder = old.data.some((o) => o.id === deletedId)
              if (!hadOrder) return old
              return {
                ...old,
                data:  old.data.filter((o) => o.id !== deletedId),
                total: old.total - 1,
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
