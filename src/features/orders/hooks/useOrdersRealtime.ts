/**
 * useOrdersRealtime — Realtime sync via Supabase Postgres Changes (WebSockets)
 *
 * Subscribes to `postgres_changes` on the `orders` and `queue_orders` tables
 * and patches the React Query cache surgically using `setQueriesData` instead
 * of `invalidateQueries` — this avoids a "thundering herd" of SELECT * queries
 * when many users are connected simultaneously.
 *
 * ─── Prerequisites before enabling ───────────────────────────────────────────
 *
 * 1. Create `orders` and `queue_orders` tables in Supabase with at minimum:
 *    - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
 *    - `updated_by UUID REFERENCES auth.users(id)` — set via trigger
 *    - All business columns matching the Order / QueueOrder TypeScript types
 *
 * 2. Create a trigger that auto-fills `updated_by` with `auth.uid()`:
 *    ```sql
 *    CREATE OR REPLACE FUNCTION set_updated_by()
 *    RETURNS TRIGGER AS $$
 *    BEGIN
 *      NEW.updated_by = auth.uid();
 *      RETURN NEW;
 *    END;
 *    $$ LANGUAGE plpgsql SECURITY DEFINER;
 *
 *    CREATE TRIGGER orders_set_updated_by
 *      BEFORE INSERT OR UPDATE ON orders
 *      FOR EACH ROW EXECUTE FUNCTION set_updated_by();
 *    ```
 *
 * 3. Enable Realtime on both tables in the Supabase Dashboard:
 *    Database → Replication → Source → Enable for `orders` and `queue_orders`
 *
 * 4. Configure RLS policies for SELECT / INSERT / UPDATE / DELETE.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 * Call `useOrdersRealtime()` inside `useOrders()` to activate the subscription.
 * Uncomment the import and call once all prerequisites are met.
 */

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
// import { supabase } from "@/lib/supabase"
// import { useAuth } from "@/contexts/auth-context"
// import type { Order } from "../columns"
// import type { QueueOrder } from "../modal-columns"

export function useOrdersRealtime() {
  const queryClient = useQueryClient()
  // const { user } = useAuth()

  useEffect(() => {
    // ──────────────────────────────────────────────────────────────────────
    // TODO: Uncomment the entire block below when Supabase tables are ready.
    // ──────────────────────────────────────────────────────────────────────
    //
    // if (!supabase || !user?.id) return
    //
    // const channel = supabase
    //   .channel("orders-realtime")
    //
    //   // ── Orders: INSERT ──────────────────────────────────────────────
    //   .on(
    //     "postgres_changes",
    //     { event: "INSERT", schema: "public", table: "orders" },
    //     (payload) => {
    //       if (payload.new.updated_by === user.id) return // skip own changes
    //       // New row could belong to any page — safest to invalidate
    //       queryClient.invalidateQueries({ queryKey: ["orders", "paginated"] })
    //       queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
    //     }
    //   )
    //
    //   // ── Orders: UPDATE ──────────────────────────────────────────────
    //   .on(
    //     "postgres_changes",
    //     { event: "UPDATE", schema: "public", table: "orders" },
    //     (payload) => {
    //       if (payload.new.updated_by === user.id) return // skip own changes
    //       const updated = payload.new as Order
    //
    //       // Patch ALL cached paginated pages surgically (no network request)
    //       queryClient.setQueriesData<{ data: Order[], total: number }>(
    //         { queryKey: ["orders", "paginated"] },
    //         (old) => {
    //           if (!old) return old
    //           const hasOrder = old.data.some(o => o.id === updated.id)
    //           if (!hasOrder) return old
    //           return {
    //             ...old,
    //             data: old.data.map(o => o.id === updated.id ? { ...o, ...updated } : o),
    //           }
    //         }
    //       )
    //
    //       // Also patch the stats query cache
    //       queryClient.setQueriesData<{ data: Order[], total: number }>(
    //         { queryKey: ["orders", "stats"] },
    //         (old) => {
    //           if (!old) return old
    //           return {
    //             ...old,
    //             data: old.data.map(o => o.id === updated.id ? { ...o, ...updated } : o),
    //           }
    //         }
    //       )
    //     }
    //   )
    //
    //   // ── Orders: DELETE ──────────────────────────────────────────────
    //   .on(
    //     "postgres_changes",
    //     { event: "DELETE", schema: "public", table: "orders" },
    //     (payload) => {
    //       const deletedId = (payload.old as { id: string }).id
    //       queryClient.setQueriesData<{ data: Order[], total: number }>(
    //         { queryKey: ["orders", "paginated"] },
    //         (old) => {
    //           if (!old) return old
    //           const hadOrder = old.data.some(o => o.id === deletedId)
    //           if (!hadOrder) return old
    //           return {
    //             ...old,
    //             data: old.data.filter(o => o.id !== deletedId),
    //             total: old.total - 1,
    //           }
    //         }
    //       )
    //       queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
    //     }
    //   )
    //
    //   // ── Queue orders: any change ────────────────────────────────────
    //   .on(
    //     "postgres_changes",
    //     { event: "*", schema: "public", table: "queue_orders" },
    //     () => {
    //       // Queue is small enough to just refetch entirely
    //       queryClient.invalidateQueries({ queryKey: ["queueOrders"] })
    //     }
    //   )
    //
    // channel.subscribe((status) => {
    //   if (status === "SUBSCRIBED") {
    //     // On reconnect after a disconnection (laptop sleep, WiFi drop),
    //     // do a controlled catch-up refetch to avoid stale data.
    //     queryClient.invalidateQueries({ queryKey: ["orders"] })
    //     queryClient.invalidateQueries({ queryKey: ["queueOrders"] })
    //   }
    //   if (status === "CHANNEL_ERROR") {
    //     console.error("[Realtime] Orders channel error — Supabase will retry")
    //   }
    // })
    //
    // return () => {
    //   void supabase.removeChannel(channel)
    // }
    //
  }, [queryClient /*, user?.id */])
}
