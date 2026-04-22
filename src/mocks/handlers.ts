import { http, HttpResponse } from "msw"
import { generateOrders, generateQueueOrders } from "./orders"

// In-memory state for realistic CRUD
let orders = generateOrders(250)
let queueOrders = generateQueueOrders(25)

export const handlers = [
  // Get all orders
  http.get("/api/orders", () => {
    return HttpResponse.json(orders)
  }),

  // Create an order
  http.post("/api/orders", async ({ request }) => {
    const newOrder = await request.json() as any
    const order = {
      id: `ORD-${Math.floor(Math.random() * 10000)}`,
      status: "pending",
      date: new Date().toISOString().split("T")[0],
      ...newOrder,
    }
    orders.unshift(order)
    return HttpResponse.json(order, { status: 201 })
  }),

  // Patch an order
  http.patch("/api/orders/:id", async ({ request, params }) => {
    const { id } = params
    const updates = await request.json()

    const orderIndex = orders.findIndex((o) => o.id === id)
    if (orderIndex === -1) {
      return new HttpResponse("Order not found", { status: 404 })
    }

    // Apply updates
    orders[orderIndex] = { ...orders[orderIndex], ...(updates as object) }
    
    return HttpResponse.json(orders[orderIndex])
  }),

  // Delete an order
  http.delete("/api/orders/:id", ({ params }) => {
    const { id } = params
    orders = orders.filter((o) => o.id !== id)
    return new HttpResponse(null, { status: 204 })
  }),

  // Bulk delete orders
  http.post("/api/orders/bulk-delete", async ({ request }) => {
    const { ids } = await request.json() as { ids: string[] }
    orders = orders.filter((o) => !ids.includes(o.id))
    return new HttpResponse(null, { status: 204 })
  }),

  // Get queue orders
  http.get("/api/queue-orders", () => {
    return HttpResponse.json(queueOrders)
  }),

  // Patch a queue order
  http.patch("/api/queue-orders/:code", async ({ request, params }) => {
    const { code } = params
    const updates = await request.json()

    const index = queueOrders.findIndex((o) => o.code === code)
    if (index === -1) return new HttpResponse("Queue order not found", { status: 404 })

    queueOrders[index] = { ...queueOrders[index], ...(updates as object) }
    return HttpResponse.json(queueOrders[index])
  }),

  // Delete a queue order
  http.delete("/api/queue-orders/:code", ({ params }) => {
    const { code } = params
    queueOrders = queueOrders.filter((o) => o.code !== code)
    return new HttpResponse(null, { status: 204 })
  }),
]
