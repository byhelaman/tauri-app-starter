import { http, HttpResponse, delay } from "msw"
import { generateOrders, generateQueueOrders } from "./orders"
import { TABLE_HISTORY_MOCK } from "./table-history-mock"
import type { HistoryDetail } from "@/components/data-table/data-table-types"
import type { Order } from "@/features/orders/columns"


// In-memory state for realistic CRUD
let orders = generateOrders(100)
let queueOrders = generateQueueOrders(25)
const orderHistory = [...TABLE_HISTORY_MOCK]

function addHistoryEntry(action: "create" | "update" | "delete", description: string, details?: HistoryDetail[]) {
  orderHistory.unshift({
    id: `HIST-${Math.floor(Math.random() * 10000)}`,
    action,
    description,
    actorEmail: "admin@example.com",
    createdAt: new Date().toISOString(),
    details
  })
}

export const handlers = [
  // Get all orders (paginated)
  http.get("/api/orders", ({ request }) => {
    const url = new URL(request.url)
    const limit = Number.parseInt(url.searchParams.get("limit") || "20", 10)
    const offset = Number.parseInt(url.searchParams.get("offset") || "0", 10)
    const search = url.searchParams.get("search")?.toLowerCase() || ""
    const date = url.searchParams.get("date") || ""
    const filtersRaw = url.searchParams.get("filters")
    let filters: { id: string; value: unknown }[] = []
    if (filtersRaw) {
      try {
        filters = JSON.parse(filtersRaw)
      } catch {
        // ignore malformed filter JSON
      }
    }

    // 5% chance of returning 429 Too Many Requests
    if (Math.random() < 0.05) {
      return new HttpResponse(null, {
        status: 429,
        statusText: "Too Many Requests",
      })
    }

    let filteredOrders = [...orders]

    // Apply date filter (exact match on order.date "YYYY-MM-DD")
    if (date) {
      filteredOrders = filteredOrders.filter(order => order.date === date)
    }

    // Apply search (Dynamic global search across all fields)
    if (search) {
      filteredOrders = filteredOrders.filter(order => 
        Object.values(order).some(val => 
          String(val).toLowerCase().includes(search)
        )
      )
    }

    // Apply column filters (basic example for status/channel)
    if (filters.length > 0) {
      for (const filter of filters) {
        const { id, value } = filter
        if (Array.isArray(value) && value.length > 0 && id in orders[0]) {
          filteredOrders = filteredOrders.filter(order => 
            value.includes(String(order[id as keyof Order]))
          )
        }
      }
    }

    const paginatedOrders = filteredOrders.slice(offset, offset + limit)

    return HttpResponse.json({
      data: paginatedOrders,
      total: filteredOrders.length,
    })
  }),

  // Create an order
  http.post("/api/orders", async ({ request }) => {
    const newOrder = await request.json() as Partial<Order>
    const order = {
      id: `ORD-${Math.floor(Math.random() * 10000)}`,
      status: "pending",
      date: new Date().toISOString().split("T")[0],
      ...newOrder,
    } as Order
    orders.unshift(order)
    addHistoryEntry("create", `Created new order ${order.id}`)
    return HttpResponse.json(order, { status: 201 })
  }),

  // Patch an order
  http.patch("/api/orders/:id", async ({ request, params }) => {
    const { id } = params
    const updates = await request.json() as Partial<Order>

    const orderIndex = orders.findIndex((o) => o.id === id)
    if (orderIndex === -1) {
      return new HttpResponse("Order not found", { status: 404 })
    }

    const oldOrder = orders[orderIndex]
    
    // Calculate changed fields for history details
    const details: HistoryDetail[] = (Object.keys(updates) as Array<keyof Order>)
      .map((key) => ({
        field: String(key),
        oldValue: oldOrder[key] as string | number | undefined,
        newValue: updates[key] as string | number | undefined
      }))
      .filter(detail => detail.oldValue !== detail.newValue)

    // Apply updates
    orders[orderIndex] = { ...oldOrder, ...updates }
    
    if (details.length > 0) {
      addHistoryEntry("update", `Updated order ${id}`, details)
    }
    
    return HttpResponse.json(orders[orderIndex])
  }),

  // Delete an order
  http.delete("/api/orders/:id", ({ params }) => {
    const { id } = params
    orders = orders.filter((o) => o.id !== id)
    addHistoryEntry("delete", `Deleted order ${id}`)
    return new HttpResponse(null, { status: 204 })
  }),

  // Bulk delete orders
  http.post("/api/orders/bulk-delete", async ({ request }) => {
    const { ids } = await request.json() as { ids: string[] }
    orders = orders.filter((o) => !ids.includes(o.id))
    addHistoryEntry("delete", `Deleted ${ids.length} orders in bulk`)
    return new HttpResponse(null, { status: 204 })
  }),

  // Get queue orders
  http.get("/api/queue-orders", async () => {
    await delay(300)
    return HttpResponse.json({
      data: queueOrders,
      total: queueOrders.length
    })
  }),

  // Get order history (paginated)
  http.get("/api/orders/history", async ({ request }) => {
    await delay(400)
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get("limit")) || 20
    const offset = Number(url.searchParams.get("offset")) || 0
    
    const paginatedHistory = orderHistory.slice(offset, offset + limit)
    return HttpResponse.json(paginatedHistory)
  }),

  // Patch a queue order
  http.patch("/api/queue-orders/:code", async ({ request, params }) => {
    const { code } = params
    const updates = await request.json() as Partial<typeof queueOrders[0]>

    const index = queueOrders.findIndex((o) => o.code === code)
    if (index === -1) return new HttpResponse("Queue order not found", { status: 404 })

    queueOrders[index] = { ...queueOrders[index], ...updates }
    return HttpResponse.json(queueOrders[index])
  }),

  // Delete a queue order
  http.delete("/api/queue-orders/:code", ({ params }) => {
    const { code } = params
    queueOrders = queueOrders.filter((o) => o.code !== code)
    return new HttpResponse(null, { status: 204 })
  }),
]
