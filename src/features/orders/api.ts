import { supabase } from "@/lib/supabase"
import type { Order, Status } from "@/features/orders/columns"
import type { QueueOrder } from "@/features/orders/modal-columns"
import type { HistoryEntry } from "@/components/data-table/data-table-types"
import type { ColumnFiltersState } from "@tanstack/react-table"

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error("Supabase client not configured")
  return supabase
}

/** Extrae el primer filtro de valor único por columnId */
function pickFilter(filters: ColumnFiltersState, id: string): string | null {
  const f = filters.find((f) => f.id === id)
  if (!f) return null
  const v = f.value
  if (Array.isArray(v) && v.length === 1) return v[0] as string
  if (typeof v === "string") return v
  return null
}

/** Extrae la primera hora seleccionada del filtro de columna 'time' */
function pickHourFilter(filters: ColumnFiltersState): string | null {
  const f = filters.find((f) => f.id === "time")
  if (!f) return null
  const v = f.value
  if (Array.isArray(v) && v.length >= 1) return v[0] as string
  return null
}

// ── Orders ────────────────────────────────────────────────────────────────────

export const fetchOrders = async ({
  limit = 20,
  offset = 0,
  search = "",
  filters = [],
  date,
}: {
  limit?: number
  offset?: number
  search?: string
  filters?: ColumnFiltersState
  date?: string
} = {}): Promise<{ data: Order[]; total: number }> => {
  const db = assertSupabase()

  const { data, error } = await db.rpc("get_orders", {
    p_limit:      limit,
    p_offset:     offset,
    p_search:     search || "",
    p_status:     pickFilter(filters, "status"),
    p_channel:    pickFilter(filters, "channel"),
    p_date:       date ?? null,
    p_start_hour: pickHourFilter(filters),
  })

  if (error) throw new Error(error.message)

  const result = data as { data: Order[]; total: number }
  return { data: result.data ?? [], total: result.total ?? 0 }
}

// ── Queue Orders ──────────────────────────────────────────────────────────────

export const fetchQueueOrders = async (): Promise<{ data: QueueOrder[]; total: number }> => {
  const db = assertSupabase()
  const { data, error } = await db.rpc("get_queue_orders")
  if (error) throw new Error(error.message)
  const result = data as { data: QueueOrder[]; total: number }
  return { data: result.data ?? [], total: result.total ?? 0 }
}

// ── Orders Start Hours (para el filtro de Interval) ────────────────────────────

export const fetchOrdersStartHours = async (): Promise<string[]> => {
  const db = assertSupabase()
  const { data, error } = await db.rpc("get_orders_start_hours")
  if (error) throw new Error(error.message)
  return (data as string[]) ?? []
}

// ── Order History ─────────────────────────────────────────────────────────────

export const fetchOrderHistory = async ({
  limit = 20,
  offset = 0,
} = {}): Promise<HistoryEntry[]> => {
  const db = assertSupabase()
  const { data, error } = await db.rpc("get_order_history", {
    p_limit:  limit,
    p_offset: offset,
  })
  if (error) throw new Error(error.message)
  // Map snake_case → camelCase to match HistoryEntry interface
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id:          String(r.id),
    action:      r.action as HistoryEntry["action"],
    user:        (r.actor_email as string).split("@")[0].split(".").join(" "),
    description: r.description as string,
    actorEmail:  r.actor_email as string,
    createdAt:   r.created_at as string,
    details:     r.details as HistoryEntry["details"],
  }))
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export const updateOrder = async ({ id, ...updates }: Partial<Order> & { id: string }) => {
  const db = assertSupabase()
  const { data, error } = await db
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Order
}

export const createOrder = async (orderData: Partial<Order>) => {
  const db = assertSupabase()
  const { data, error } = await db
    .from("orders")
    .insert(orderData)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Order
}

export const deleteOrder = async (id: string) => {
  const db = assertSupabase()
  const { error } = await db.from("orders").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

export const bulkDeleteOrders = async (ids: string[]) => {
  const db = assertSupabase()
  const { error } = await db.from("orders").delete().in("id", ids)
  if (error) throw new Error(error.message)
}

export const updateQueueOrder = async ({
  code,
  ...updates
}: Partial<QueueOrder> & { code: string }) => {
  const db = assertSupabase()
  const { data, error } = await db
    .from("queue_orders")
    .update(updates)
    .eq("code", code)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as QueueOrder
}

export const deleteQueueOrder = async (code: string) => {
  const db = assertSupabase()
  const { error } = await db.from("queue_orders").delete().eq("code", code)
  if (error) throw new Error(error.message)
}

export const updateOrderStatus = async (id: string, status: Status) => {
  const db = assertSupabase()
  const { error } = await db.from("orders").update({ status }).eq("id", id)
  if (error) throw new Error(error.message)
}
