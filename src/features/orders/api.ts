import { supabase } from "@/lib/supabase"
import type { Order, Status } from "@/features/orders/columns"
import type { HistoryEntry } from "@/components/data-table/data-table-types"
import type {
  ColumnFiltersState,
  SortingState,
} from "@tanstack/react-table"
import type {
  DataTableSelectionOperation,
  DataTableSelectionScope,
  DataTableSelectionState,
  ServerExportFormat,
  ServerScopeExportResult,
} from "@/components/data-table/data-table-types"
import { expandDataActionFields } from "@/components/data-table/data-action-fields"
import { pickNormalizedFilter, pickNormalizedHourFilter } from "@/lib/table-filter-normalization"

// ── Helpers ──────────────────────────────────────────────────────────────────

export const MAX_BULK_ORDER_ROWS = 10_000

function assertSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error("Supabase client not configured")
  return supabase
}

function pickFilter(filters: ColumnFiltersState, id: string): string[] | null {
  return pickNormalizedFilter(filters, id)
}

function pickHourFilter(filters: ColumnFiltersState): string[] | null {
  return pickNormalizedHourFilter(filters)
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
    p_priority:   pickFilter(filters, "priority"),
    p_date:       date ?? null,
    p_start_hour: pickHourFilter(filters),
    p_sort_col:   sorting[0]?.id ?? null,
    p_sort_dir:   sorting[0]?.desc ? "desc" : (sorting[0] ? "asc" : null),
  })

  if (error) throw new Error(error.message)

  const result = data as { data: Order[]; total: number }
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

  return {
    rowCount:      typeof value.rowCount === "number" ? value.rowCount : undefined,
    search:        typeof value.search === "string" ? value.search : null,
    status:        Array.isArray(value.status) ? value.status.map(String) : null,
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
  await bulkDeleteOrders([id])
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

function scopeJson(scope: DataTableSelectionScope) {
  return {
    search: scope.search || "",
    status: pickFilter(scope.filters, "status"),
    channel: pickFilter(scope.filters, "channel"),
    priority: pickFilter(scope.filters, "priority"),
    date: scope.date ?? null,
    start_hour: pickHourFilter(scope.filters),
  }
}

function operationsRpcParam(operations: DataTableSelectionOperation[] = []) {
  return operations.map((operation) => {
    if (operation.type === "selectIds" || operation.type === "deselectIds") {
      return { type: operation.type, ids: operation.ids }
    }
    return { type: operation.type, scope: scopeJson(operation.scope) }
  })
}

export const bulkDeleteOrdersBySelection = async (selection: DataTableSelectionState) => {
  if (selection.mode === "ids") {
    return bulkDeleteOrders(selection.ids)
  }
  const db = assertSupabase()
  const { data, error } = await db.rpc("bulk_delete_orders_by_selection", {
    p_operations: operationsRpcParam(selection.operations),
    p_expected_count: selection.selectedCount,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

export const exportOrdersByScope = async ({
  scope,
  operations,
  format,
  fields,
  headers,
  template,
}: {
  scope: DataTableSelectionScope
  operations?: DataTableSelectionOperation[]
  format: ServerExportFormat
  fields: string[]
  headers?: boolean
  template?: string
}): Promise<ServerScopeExportResult> => {
  const db = assertSupabase()
  if (operations && operations.length > 0) {
    const { data, error } = await db.rpc("export_orders_by_selection", {
      p_operations: operationsRpcParam(operations),
      p_sort_col: scope.sorting?.[0]?.id ?? null,
      p_sort_dir: scope.sorting?.[0]?.desc ? "desc" : (scope.sorting?.[0] ? "asc" : null),
      p_format: format,
      p_fields: expandDataActionFields(fields),
      p_headers: headers ?? true,
      p_template: template ?? null,
    })
    if (error) throw new Error(error.message)
    const result = data as { content?: string; row_count?: number } | null
    return {
      content: result?.content ?? "",
      rowCount: result?.row_count ?? 0,
    }
  }
  const { data, error } = await db.rpc("export_orders_by_selection", {
    p_operations: operationsRpcParam([{ type: "select", scope, total: 0 }]),
    p_sort_col: scope.sorting?.[0]?.id ?? null,
    p_sort_dir: scope.sorting?.[0]?.desc ? "desc" : (scope.sorting?.[0] ? "asc" : null),
    p_format: format,
    p_fields: expandDataActionFields(fields),
    p_headers: headers ?? true,
    p_template: template ?? null,
  })
  if (error) throw new Error(error.message)
  const result = data as { content?: string; row_count?: number } | null
  return {
    content: result?.content ?? "",
    rowCount: result?.row_count ?? 0,
  }
}

export const countOrdersBySelection = async (selection: DataTableSelectionState, scope?: DataTableSelectionScope): Promise<number> => {
  if (selection.mode === "ids") return selection.ids.length
  const db = assertSupabase()
  const { data, error } = await db.rpc("count_orders_by_selection", {
    p_operations: operationsRpcParam(selection.operations),
    p_scope: scope ? scopeJson(scope) : null,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
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

export const updateOrderStatus = async (id: string, status: Status) => {
  const db = assertSupabase()
  const { error } = await db.from("orders").update({ status }).eq("id", id)
  if (error) throw new Error(error.message)
}
