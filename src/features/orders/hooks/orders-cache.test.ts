import { describe, expect, it } from "vitest"
import type { DataTableSelectionState } from "@/components/data-table/core/data-table-types"
import type { Order } from "../tables/columns"
import {
  applyOptimisticBulkDelete,
  applyOptimisticOrderDelete,
  applyOptimisticOrderUpdate,
  orderMatchesActiveQuery,
  type OrdersInfiniteData,
} from "./orders-cache"

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "a",
    date: "2026-05-14",
    customer: "Acme",
    product: "Plan",
    category: "Software",
    start_time: "08:10",
    end_time: "09:10",
    code: "ORD-A",
    status: "processing",
    channel: "Online",
    quantity: 1,
    amount: 10,
    region: "Europe",
    payment: "Card",
    priority: "High",
    ...overrides,
  }
}

function data(rows: Order[]): OrdersInfiniteData {
  return {
    pages: [{ data: rows, total: rows.length }],
    pageParams: [0],
  }
}

describe("orders cache helpers", () => {
  it("matches active filters and search consistently", () => {
    expect(orderMatchesActiveQuery(order(), {
      filters: [{ id: "status", value: ["processing"] }],
      search: "acme",
    })).toBe(true)

    expect(orderMatchesActiveQuery(order(), {
      filters: [{ id: "channel", value: ["Retail"] }],
      search: "",
    })).toBe(false)

    expect(orderMatchesActiveQuery(order(), {
      filters: [{ id: "time", value: ["8"] }],
      date: "2026-05-14",
    })).toBe(true)

    expect(orderMatchesActiveQuery(order(), {
      filters: [{ id: "time", value: ["9"] }],
      date: "2026-05-14",
    })).toBe(false)
  })

  it("removes an updated order from the cached result when it leaves the active query", () => {
    const next = applyOptimisticOrderUpdate(
      data([order()]),
      { id: "a", status: "shipped" },
      { filters: [{ id: "status", value: ["processing"] }] },
    )

    expect(next?.pages[0]).toEqual({ data: [], total: 0 })
  })

  it("removes one deleted order and decrements only pages that contained it", () => {
    const next = applyOptimisticOrderDelete(
      {
        pages: [
          { data: [order({ id: "a" })], total: 2 },
          { data: [order({ id: "b" })], total: 2 },
        ],
        pageParams: [0, 1],
      },
      "a",
    )

    expect(next?.pages).toEqual([
      { data: [], total: 1 },
      { data: [order({ id: "b" })], total: 2 },
    ])
  })

  it("removes visible rows for bulk operations without inventing a total decrement for scope deletes", () => {
    const selection: DataTableSelectionState = {
      mode: "operations",
      operations: [{
        type: "select",
        scope: {
          search: "",
          filters: [{ id: "status", value: ["processing"] }],
          sorting: [],
        },
        total: 10,
      }],
    }

    const next = applyOptimisticBulkDelete(
      data([
        order({ id: "a", status: "processing" }),
        order({ id: "b", status: "shipped" }),
      ]),
      selection,
    )

    expect(next?.pages[0]).toEqual({
      data: [order({ id: "b", status: "shipped" })],
      total: 2,
    })
  })

  it("removes exact ids without inventing a total decrement across accumulated selections", () => {
    const selection: DataTableSelectionState = {
      mode: "ids",
      ids: ["a", "c"],
    }

    const next = applyOptimisticBulkDelete(
      data([
        order({ id: "a" }),
        order({ id: "b" }),
      ]),
      selection,
    )

    expect(next?.pages[0]).toEqual({
      data: [order({ id: "b" })],
      total: 2,
    })
  })
})
