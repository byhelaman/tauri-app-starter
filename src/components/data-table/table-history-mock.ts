import type { HistoryEntry } from "./data-table-types"

export const TABLE_HISTORY_MOCK: HistoryEntry[] = [
  {
    id: "1",
    action: "update",
    description: "Updated order status and delivery amount",
    actorEmail: "admin@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(), // 2m ago
    details: [
      { field: "status", oldValue: "pending", newValue: "shipped" },
      { field: "amount", oldValue: 120.50, newValue: 145.00 }
    ],
  },
  {
    id: "2",
    action: "create",
    description: "Created new order ORD-74HR4",
    actorEmail: "sarah.jones@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1h ago
  },
  {
    id: "3",
    action: "update",
    description: "Modified customer contact information",
    actorEmail: "admin@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3h ago
    details: [
      { field: "phone", oldValue: "+1 555-0102", newValue: "+1 555-0199" }
    ],
  },
  {
    id: "4",
    action: "delete",
    description: "Deleted duplicate order ORD-SMF5F",
    actorEmail: "mike.ross@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // Yesterday
  },
  {
    id: "5",
    action: "update",
    description: "Adjusted item quantity and priority",
    actorEmail: "sarah.jones@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), // Yesterday
    details: [
      { field: "quantity", oldValue: 1, newValue: 5 },
      { field: "priority", oldValue: "Low", newValue: "High" }
    ],
  },
  {
    id: "6",
    action: "create",
    description: "Manual entry for bulk order",
    actorEmail: "system@internal.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2d ago
  },
  {
    id: "7",
    action: "update",
    description: "Applied discount and updated tax",
    actorEmail: "admin@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3d ago
    details: [
      { field: "discount", oldValue: "0%", newValue: "15%" },
      { field: "tax_amount", oldValue: 12.00, newValue: 10.20 }
    ],
  },
  {
    id: "8",
    action: "update",
    description: "Changed shipping carrier",
    actorEmail: "logistics@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(), // 5d ago
    details: [
      { field: "carrier", oldValue: "FedEx", newValue: "DHL" }
    ],
  },
  {
    id: "9",
    action: "delete",
    description: "Removed cancelled order ORD-99KL2",
    actorEmail: "admin@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 1w ago
  },
  {
    id: "10",
    action: "update",
    description: "Updated internal notes",
    actorEmail: "mike.ross@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(), // 8d ago
    details: [
      { field: "notes", oldValue: "Waiting for approval", newValue: "Approved by manager" }
    ],
  },
  {
    id: "11",
    action: "create",
    description: "Imported 50 orders from CSV",
    actorEmail: "importer@internal.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(), // 10d ago
  },
  {
    id: "12",
    action: "update",
    description: "Refactor status codes",
    actorEmail: "system@internal.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(), // 15d ago
    details: [
      { field: "status_id", oldValue: 1, newValue: 101 },
      { field: "status_label", oldValue: "New", newValue: "Processing" }
    ],
  }
]
