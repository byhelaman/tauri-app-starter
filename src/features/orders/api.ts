import type { Order } from "@/features/orders/columns"
import type { QueueOrder } from "@/features/orders/modal-columns"
import type { HistoryEntry } from "@/components/data-table/data-table-types"

export const fetchOrders = async (): Promise<Order[]> => {
  const res = await fetch("/api/orders")
  if (!res.ok) throw new Error("Failed to fetch orders")
  return res.json()
}

export const fetchQueueOrders = async (): Promise<QueueOrder[]> => {
  const res = await fetch("/api/queue-orders")
  if (!res.ok) throw new Error("Failed to fetch queue orders")
  return res.json()
}

export const fetchOrderHistory = async (): Promise<HistoryEntry[]> => {
  const res = await fetch("/api/orders/history")
  if (!res.ok) throw new Error("Failed to fetch history")
  return res.json()
}

export const updateOrder = async ({ id, ...updates }: Partial<Order> & { id: string }) => {
  const res = await fetch(`/api/orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error("Failed to update")
  return res.json()
}

export const createOrder = async (orderData: Partial<Order>) => {
  const res = await fetch(`/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData),
  })
  if (!res.ok) throw new Error("Failed to create")
  return res.json()
}

export const deleteOrder = async (id: string) => {
  const res = await fetch(`/api/orders/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete")
}

export const bulkDeleteOrders = async (ids: string[]) => {
  const res = await fetch(`/api/orders/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error("Failed to bulk delete")
}

export const updateQueueOrder = async ({ code, ...updates }: Partial<QueueOrder> & { code: string }) => {
  const res = await fetch(`/api/queue-orders/${code}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error("Failed to update")
  return res.json()
}

export const deleteQueueOrder = async (code: string) => {
  const res = await fetch(`/api/queue-orders/${code}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete")
}
