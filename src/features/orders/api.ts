import { supabase } from "@/lib/supabase"
import type { Order, Status } from "@/features/orders/columns"
import type { QueueOrder } from "@/features/orders/modal-columns"
import type { HistoryEntry } from "@/components/data-table/data-table-types"
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table"

// ── Helpers ──────────────────────────────────────────────────────────────────

export const MAX_BULK_ORDER_ROWS = 10_000
export const DEFAULT_EXPORT_ORDER_ROWS = MAX_BULK_ORDER_ROWS
const SELECT_IDS_PAGE_SIZE = 10_000

function assertSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error("Supabase client not configured")
  return supabase
}

/** Extrae todos los valores seleccionados por columnId como array (multi-select) */
function pickFilter(filters: ColumnFiltersState, id: string): string[] | null {
  const f = filters.find((f) => f.id === id)
  if (!f) return null
  const v = f.value
  if (Array.isArray(v) && v.length > 0) return v as string[]
  if (typeof v === "string" && v) return [v]
  return null
}

/** Extrae todas las horas seleccionadas del filtro de columna 'time' */
function pickHourFilter(filters: ColumnFiltersState): string[] | null {
  const f = filters.find((f) => f.id === "time")
  if (!f) return null
  const v = f.value
  if (Array.isArray(v) && v.length > 0) return v as string[]
  return null
}

// ── Orders ────────────────────────────────────────────────────────────────────

export const fetchOrders = async ({
  limit = 20,
  offset = 0,
  search = "",
  filters = [],
  date,
  sorting = [],
}: {
  limit?: number
  offset?: number
  search?: string
  filters?: ColumnFiltersState
  date?: string
  sorting?: SortingState
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
    p_sort_col:   sorting[0]?.id ?? null,
    p_sort_dir:   sorting[0]?.desc ? "desc" : (sorting[0] ? "asc" : null),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeHistoryDetails(value: unknown): HistoryEntry["details"] {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => {
    const detail = isRecord(item) ? item : {}
    return {
      recordId:   typeof detail.recordId === "string" ? detail.recordId : undefined,
      recordCode: typeof detail.recordCode === "string" ? detail.recordCode : undefined,
      field:      typeof detail.field === "string" ? detail.field : "record",
      oldValue:   detail.oldValue as string | number | boolean | null | undefined,
      newValue:   detail.newValue as string | number | boolean | null | undefined,
    }
  })
}

function normalizeHistorySummary(value: unknown): HistoryEntry["summary"] {
  if (!isRecord(value) || Array.isArray(value)) return undefined
  const sampleRecords = Array.isArray(value.sampleRecords)
    ? value.sampleRecords
        .filter(isRecord)
        .map((record) => ({
          recordId:   String(record.recordId),
          recordCode: typeof record.recordCode === "string" ? record.recordCode : undefined,
        }))
    : undefined

  return {
    rowCount:      typeof value.rowCount === "number" ? value.rowCount : undefined,
    sampleRecords,
    omittedCount:  typeof value.omittedCount === "number" ? value.omittedCount : undefined,
    search:        typeof value.search === "string" ? value.search : null,
    status:        Array.isArray(value.status) ? value.status.map(String) : null,
    excludedIds:   Array.isArray(value.excludedIds) ? value.excludedIds.map(String) : null,
    deletedIds:    Array.isArray(value.deletedIds) ? value.deletedIds.map(String) : null,
  }
}

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
  return ((data as Record<string, unknown>[]) ?? []).map((r) => {
    const details = normalizeHistoryDetails(r.details)
    return {
      id:          String(r.id),
      action:      r.action as HistoryEntry["action"],
      user:        (r.actor_email as string).split("@")[0].split(".").join(" "),
      description: r.description as string,
      actorEmail:  r.actor_email as string,
      createdAt:   r.created_at as string,
      orderId:     typeof r.order_id === "string" ? r.order_id : undefined,
      recordCode:  details?.[0]?.recordCode ?? (typeof r.record_code === "string" ? r.record_code : undefined),
      details,
      summary:     normalizeHistorySummary(r.details),
    }
  })
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
  if (ids.length === 0) return
  if (ids.length > MAX_BULK_ORDER_ROWS) {
    throw new Error(`Bulk delete is limited to ${MAX_BULK_ORDER_ROWS.toLocaleString()} orders at a time`)
  }
  const db = assertSupabase()
  const { error } = await db.rpc("bulk_delete_orders_by_ids", { p_ids: ids })
  if (error) throw new Error(error.message)
}



/** Obtiene las órdenes que coinciden con los filtros activos, hasta el límite máximo permitido.
 *  Usado para Export/Copy masivo — no almacena en React Query cache. */
export const fetchAllOrdersByFilter = async ({
  search = "",
  filters = [] as ColumnFiltersState,
  date,
  excludedIds = [],
  sorting = [],
  limit = DEFAULT_EXPORT_ORDER_ROWS,
  offset = 0,
}: {
  search?: string
  filters?: ColumnFiltersState
  date?: string
  excludedIds?: string[]
  sorting?: SortingState
  limit?: number
  offset?: number
} = {}): Promise<Order[]> => {
  if (limit > MAX_BULK_ORDER_ROWS) {
    throw new Error(`Export is limited to ${MAX_BULK_ORDER_ROWS.toLocaleString()} orders at a time`)
  }
  const db = assertSupabase()
  const { data, error } = await db.rpc("get_orders_by_filter", {
    p_search:       search || "",
    p_status:       pickFilter(filters, "status"),
    p_channel:      pickFilter(filters, "channel"),
    p_date:         date ?? null,
    p_start_hour:   pickHourFilter(filters),
    p_excluded_ids: excludedIds.length > 0 ? excludedIds : [],
    p_sort_col:     sorting[0]?.id ?? null,
    p_sort_dir:     sorting[0]?.desc ? "desc" : (sorting[0] ? "asc" : null),
    p_limit:        limit,
    p_offset:       offset,
  })
  if (error) throw new Error(error.message)
  return (data as Order[]) ?? []
}

/** Obtiene SOLO los IDs de las órdenes que coinciden con los filtros. Usado para selecciones masivas sticky. */
export const fetchAllIdsByFilter = async ({
  search = "",
  filters = [] as ColumnFiltersState,
  date,
}: {
  search?: string
  filters?: ColumnFiltersState
  date?: string
} = {}): Promise<string[]> => {
  const db = assertSupabase()
  const ids: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await db.rpc("get_order_ids_by_filter", {
      p_search:       search || "",
      p_status:       pickFilter(filters, "status"),
      p_channel:      pickFilter(filters, "channel"),
      p_date:         date ?? null,
      p_start_hour:   pickHourFilter(filters),
      p_limit:        SELECT_IDS_PAGE_SIZE,
      p_offset:       offset,
    })
    if (error) throw new Error(error.message)

    const page = (data as string[]) ?? []
    ids.push(...page)
    if (page.length < SELECT_IDS_PAGE_SIZE) break
    offset += SELECT_IDS_PAGE_SIZE
  }

  return ids
}

/** Obtiene órdenes completas dado un arreglo de IDs exactos. Usado para Export/Copy. */
export const fetchOrdersByIds = async (ids: string[]): Promise<Order[]> => {
  if (ids.length === 0) return []
  if (ids.length > MAX_BULK_ORDER_ROWS) {
    throw new Error(`Copy/export is limited to ${MAX_BULK_ORDER_ROWS.toLocaleString()} orders at a time`)
  }
  const db = assertSupabase()
  const { data, error } = await db.rpc("get_orders_by_ids", { p_ids: ids })
  if (error) throw new Error(error.message)
  return (data as Order[]) ?? []
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
