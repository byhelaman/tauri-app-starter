/**
 * useOrdersPresence — Collaborative cell-locking via Supabase Presence
 *
 * Shows which cells are being edited by other users in real time and optionally
 * blocks concurrent edits to the same cell.
 *
 * ─── How it works ────────────────────────────────────────────────────────────
 *
 * 1. When the local user starts editing a cell, call `trackCell(orderId, field)`.
 *    This publishes their editing state to all connected users via Presence.
 *
 * 2. Other users receive a `sync` event and see the cell highlighted with the
 *    editor's assigned color. The cell input can be disabled to prevent conflicts.
 *
 * 3. When the local user finishes editing (commit or cancel), call `untrackCell()`.
 *
 * ─── Prerequisites ───────────────────────────────────────────────────────────
 *
 * - Supabase client configured and authenticated (`supabase` from lib/supabase)
 * - `useAuth()` providing `user.id` and `user.email` (or display name)
 * - The `orders-presence` channel does NOT require a database table — Presence
 *   is purely in-memory on Supabase's realtime server.
 *
 * ─── Integration points ─────────────────────────────────────────────────────
 *
 * 1. Call `useOrdersPresence()` in orders.tsx (or inside useOrders)
 * 2. Pass `activeCells` map to column definitions or DataTable
 * 3. In data-table-cells.tsx, accept an optional `lockedBy` prop:
 *    - Show a colored border matching the remote user's color
 *    - Disable the input to prevent simultaneous editing
 *    - Show a tooltip with the remote user's display name
 *
 * ─── Color assignment ────────────────────────────────────────────────────────
 *
 * Colors are assigned deterministically from the user ID hash so they remain
 * stable across sessions and don't collide often in small teams.
 */

// import { useCallback, useEffect, useMemo, useRef, useState } from "react"
// import { supabase } from "@/lib/supabase"
// import { useAuth } from "@/contexts/auth-context"

// ── Types ────────────────────────────────────────────────────────────────────

export type CellKey = `${string}:${string}` // "orderId:field"

export interface PresenceUser {
  userId: string
  displayName: string
  color: string
}

export interface OrdersPresenceState {
  /** Map of "orderId:field" → remote user info for cells being edited by others */
  activeCells: Map<CellKey, PresenceUser>
  /** Call when the local user starts editing a cell */
  trackCell: (orderId: string, field: string) => void
  /** Call when the local user finishes editing */
  untrackCell: () => void
}

// ── Color palette for presence indicators ────────────────────────────────────

const PRESENCE_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
] as const

export function userColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]
}

// ── Hook (commented — ready to uncomment) ────────────────────────────────────

export function useOrdersPresence(): OrdersPresenceState {
  // const { user } = useAuth()
  // const [activeCells, setActiveCells] = useState<Map<CellKey, PresenceUser>>(new Map())
  // const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  //
  // useEffect(() => {
  //   if (!supabase || !user?.id) return
  //
  //   const channel = supabase.channel("orders-presence", {
  //     config: { presence: { key: user.id } },
  //   })
  //
  //   channel.on("presence", { event: "sync" }, () => {
  //     const state = channel.presenceState()
  //     const cells = new Map<CellKey, PresenceUser>()
  //
  //     for (const [userId, presences] of Object.entries(state)) {
  //       if (userId === user.id) continue // skip own presence
  //       const latest = presences[presences.length - 1] as {
  //         cell?: { orderId: string; field: string }
  //         displayName?: string
  //       }
  //       if (latest?.cell) {
  //         const key: CellKey = `${latest.cell.orderId}:${latest.cell.field}`
  //         cells.set(key, {
  //           userId,
  //           displayName: latest.displayName ?? userId.slice(0, 8),
  //           color: userColor(userId),
  //         })
  //       }
  //     }
  //
  //     setActiveCells(cells)
  //   })
  //
  //   channel.subscribe()
  //   channelRef.current = channel
  //
  //   return () => {
  //     void supabase.removeChannel(channel)
  //     channelRef.current = null
  //   }
  // }, [user?.id])
  //
  // const trackCell = useCallback((orderId: string, field: string) => {
  //   if (!channelRef.current || !user) return
  //   channelRef.current.track({
  //     cell: { orderId, field },
  //     displayName: user.email?.split("@")[0] ?? user.id.slice(0, 8),
  //   })
  // }, [user])
  //
  // const untrackCell = useCallback(() => {
  //   if (!channelRef.current) return
  //   channelRef.current.untrack()
  // }, [])
  //
  // return { activeCells, trackCell, untrackCell }

  // Stub return while Presence is disabled
  return {
    activeCells: new Map(),
    trackCell: () => {},
    untrackCell: () => {},
  }
}
