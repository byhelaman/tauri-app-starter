import { useCallback, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckCircle2,
  Clock,
  Globe,
  Handshake,
  ListTodo,
  LoaderCircle,
  Phone,
  Store,
  Truck,
  Upload,
  XCircle,
} from "lucide-react"
import {
  createColumns,
  type EditableOrderField,
  type Order,
  type Status,
} from "@/features/orders/columns"
import { DataTable } from "@/components/data-table/data-table"
import type { FacetedFilterOption } from "@/components/data-table/data-table-types"
import { ImportDialog } from "@/components/data-table/import-dialog"
import { buildBulkCopyText } from "@/components/data-table/bulk-copy"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { ToggleActionButtons } from "@/components/toggle-action-buttons"
import { PageHeader } from "@/components/page-header"
import { useQueueHighlights, useTableHighlights } from "@/features/orders/table-highlights"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  createQueueColumns,
  type QueueOrder,
  type QueueStatus,
} from "@/features/orders/modal-columns"

const fetchOrders = async (): Promise<Order[]> => {
  const res = await fetch("/api/orders")
  if (!res.ok) throw new Error("Failed to fetch orders")
  return res.json()
}

const fetchQueueOrders = async (): Promise<QueueOrder[]> => {
  const res = await fetch("/api/queue-orders")
  if (!res.ok) throw new Error("Failed to fetch queue orders")
  return res.json()
}

const STATUS_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Pending", value: "pending", icon: Clock },
  { label: "Processing", value: "processing", icon: LoaderCircle },
  { label: "Shipped", value: "shipped", icon: Truck },
  { label: "Delivered", value: "delivered", icon: CheckCircle2 },
  { label: "Cancelled", value: "cancelled", icon: XCircle },
]

const CHANNEL_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Online", value: "Online", icon: Globe },
  { label: "Retail", value: "Retail", icon: Store },
  { label: "Partner", value: "Partner", icon: Handshake },
  { label: "Phone", value: "Phone", icon: Phone },
]

const QUEUE_STATUS_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Queued", value: "queued", icon: Clock },
  { label: "Processing", value: "processing", icon: LoaderCircle },
  { label: "Ready", value: "ready", icon: Truck },
  { label: "Delivered", value: "delivered", icon: CheckCircle2 },
]

export function OrdersPage() {
  const queryClient = useQueryClient()

  const { data: orders = [], isLoading: isOrdersLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
  })

  const { data: queueOrders = [], isLoading: isQueueLoading } = useQuery({
    queryKey: ["queueOrders"],
    queryFn: fetchQueueOrders,
  })

  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ selected: Order[], clearSelection: () => void } | null>(null)
  const [rowDeleteTarget, setRowDeleteTarget] = useState<Order | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [tableModalOpen, setTableModalOpen] = useState(false)

  const { toolbarActions, rowClassName } = useTableHighlights()
  const { toolbarActions: queueToolbarActions, rowClassName: queueRowClassName } = useQueueHighlights()

  const handleDeleteRequest = useCallback((order: Order) => {
    setRowDeleteTarget(order)
  }, [])

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Order> & { id: string }) => {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error("Failed to update")
      return res.json()
    },
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] })
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"])
      queryClient.setQueryData<Order[]>(["orders"], (old = []) => {
        return old.map(order => order.id === newOrder.id ? { ...order, ...newOrder } : order)
      })
      return { previousOrders }
    },
    onError: (_err, _newOrder, context) => {
      queryClient.setQueryData(["orders"], context?.previousOrders)
      toast.error("Failed to update order")
    },
  })

  const updateOrderById = useCallback((orderId: string, updater: (order: Order) => Order) => {
    const currentOrders = queryClient.getQueryData<Order[]>(["orders"]) || []
    const current = currentOrders.find((order) => order.id === orderId)
    if (!current) return

    const updated = updater(current)
    if (updated === current) return

    updateOrderMutation.mutate(updated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  const handleStatusChange = useCallback((orderId: string, status: Status) => {
    updateOrderById(orderId, (order) => ({ ...order, status }))
  }, [updateOrderById])

  const handleCellChange = useCallback((orderId: string, field: EditableOrderField, value: string, isValid: boolean) => {
    updateOrderById(orderId, (order) => {
      switch (field) {
        case "date":
          return { ...order, date: value }
        case "customer":
          return { ...order, customer: value }
        case "product":
          return { ...order, product: value }
        case "category":
          return { ...order, category: value }
        case "time":
          return { ...order, time: value }
        case "code":
          return { ...order, code: value }
        case "channel":
          return { ...order, channel: value }
        case "quantity": {
          const normalized = value.trim()
          return {
            ...order,
            quantity: isValid ? Number.parseInt(normalized, 10) : value,
          }
        }
        default:
          return order
      }
    })
  }, [updateOrderById])

  const copyCode = useCallback((order: Order) => {
    navigator.clipboard.writeText(order.code)
    toast.success("Order code copied")
  }, [])

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] })
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"])
      queryClient.setQueryData<Order[]>(["orders"], (old = []) => old.filter(order => order.id !== id))
      return { previousOrders }
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(["orders"], context?.previousOrders)
      toast.error("Failed to delete order")
    },
  })

  const deleteBulkOrdersMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/orders/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error("Failed to bulk delete")
    },
    onMutate: async (ids) => {
      const idSet = new Set(ids)
      await queryClient.cancelQueries({ queryKey: ["orders"] })
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"])
      queryClient.setQueryData<Order[]>(["orders"], (old = []) => old.filter(order => !idSet.has(order.id)))
      return { previousOrders }
    },
    onError: (_err, _ids, context) => {
      queryClient.setQueryData(["orders"], context?.previousOrders)
      toast.error("Failed to delete orders")
    },
  })

  const handleDelete = useCallback((orderId: string) => {
    deleteOrderMutation.mutate(orderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateQueueOrderMutation = useMutation({
    mutationFn: async ({ code, ...updates }: Partial<QueueOrder> & { code: string }) => {
      const res = await fetch(`/api/queue-orders/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error("Failed to update")
      return res.json()
    },
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) => {
        return old.map(order => order.code === newOrder.code ? { ...order, ...newOrder } : order)
      })
      return { previousOrders }
    },
    onError: (_err, _newOrder, context) => {
      queryClient.setQueryData(["queueOrders"], context?.previousOrders)
    },
  })

  const deleteQueueOrderMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/queue-orders/${code}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
    },
    onMutate: async (code) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) => old.filter(order => order.code !== code))
      return { previousOrders }
    },
    onError: (_err, _code, context) => {
      queryClient.setQueryData(["queueOrders"], context?.previousOrders)
    },
  })

  const handleQueueStatusChange = useCallback((code: string, status: QueueStatus) => {
    updateQueueOrderMutation.mutate({ code, status })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleQueuePriorityToggle = useCallback((code: string) => {
    const currentOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"]) || []
    const order = currentOrders.find(o => o.code === code)
    if (order) {
      updateQueueOrderMutation.mutate({ code, priority: !order.priority })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  const handleQueueRemove = useCallback((code: string) => {
    deleteQueueOrderMutation.mutate(code)
    toast.success("Removed from queue")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copyQueueCode = useCallback((order: QueueOrder) => {
    navigator.clipboard.writeText(order.code)
    toast.success("Order code copied")
  }, [])

  const columns = useMemo(
    () => createColumns(handleDelete, handleStatusChange, handleCellChange),
    [handleCellChange, handleDelete, handleStatusChange]
  )
  const queueColumns = useMemo(
    () => createQueueColumns(handleQueueStatusChange, handleQueuePriorityToggle, handleQueueRemove),
    [handleQueuePriorityToggle, handleQueueRemove, handleQueueStatusChange]
  )

  return (
    <main className="h-full overflow-hidden flex flex-col p-6 gap-6">
      <PageHeader
        title="Orders"
        description="Track customer orders and their fulfillment status."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setTableModalOpen(true)}>
              <ListTodo data-icon="inline-start" />
              Queue
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload data-icon="inline-start" />
              Import
            </Button>
          </div>
        }
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} title="Import orders" />
      <DataTable
        columns={columns}
        data={orders}
        isLoading={isOrdersLoading}
        tableId="orders"
        toolbar={{
          searchable: true,
          filterPlaceholder: "Search...",
          facetedFilters: [
            { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
            { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
          ],
          intervalFilter: { columnId: "time", title: "Interval" },
          actions: toolbarActions,
          searchDebounceMs: 300,
        }}
        rowContextMenu={(order) => (
          <>
            <ContextMenuItem onSelect={() => copyCode(order)}>Copy code</ContextMenuItem>
            <ContextMenuItem onSelect={() => toast.info("Order editing coming soon")}>Edit order</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => handleDeleteRequest(order)}>
              Delete
            </ContextMenuItem>
          </>
        )}
        bulkActions={(selected, clearSelection) => (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const content = buildBulkCopyText(selected as unknown as Record<string, unknown>[], "orders")
                if (!content) {
                  toast.error("Nothing to copy")
                  return
                }
                try {
                  await navigator.clipboard.writeText(content)
                  toast.success(`Copied ${selected.length} ${selected.length === 1 ? "row" : "rows"}`)
                } catch {
                  toast.error("Could not copy to clipboard")
                }
              }}
            >
              Copy
            </Button>
            <Button
              variant="destructive"
              size="sm"
              aria-label="Delete"
              onClick={() => setBulkDeleteTarget({ selected, clearSelection })}
            >
              Delete
            </Button>
          </>
        )}
        rowClassName={rowClassName}
        getRowId={(row) => row.id}
        defaultPageSize={25}
      />

      <Dialog open={tableModalOpen} onOpenChange={setTableModalOpen}>
        <DialogContent
          className="w-[95vw]! h-auto! max-w-310! max-h-205!"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Connected queue</DialogTitle>
            <DialogDescription>Live queue linked to your current orders.</DialogDescription>
          </DialogHeader>
          <DialogBody className="py-1 overflow-y-hidden">
            <DataTable
              columns={queueColumns}
              data={queueOrders}
              isLoading={isQueueLoading}
              tableId="orders-queue"
              toolbar={{
                searchable: true,
                filterPlaceholder: "Search queue...",
                facetedFilters: [
                  { columnId: "status", title: "Status", options: QUEUE_STATUS_FILTER_OPTIONS },
                  { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
                ],
                actions: (table) => {
                  const priorityColumn = table.getColumn("priority")
                  if (!priorityColumn) return null
                  const priorityOnly = priorityColumn.getFilterValue() === true

                  return (
                    <>
                      <ToggleActionButtons
                        items={[
                          {
                            id: "priority-only",
                            label: "Priority",
                            icon: Clock,
                            theme: "red",
                            active: priorityOnly,
                            onToggle: () => priorityColumn.setFilterValue(priorityOnly ? undefined : true),
                          },
                        ]}
                      />
                      {queueToolbarActions}
                    </>
                  )
                },
                searchDebounceMs: 300,
              }}
              rowClassName={queueRowClassName}
              getRowId={(row) => row.id}
              rowContextMenu={(order) => (
                <>
                  <ContextMenuItem onSelect={() => copyQueueCode(order)}>Copy code</ContextMenuItem>
                  <ContextMenuItem onSelect={() => handleQueuePriorityToggle(order.code)}>
                    {order.priority ? "Set normal priority" : "Set high priority"}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => handleQueueRemove(order.code)}>
                    Remove from queue
                  </ContextMenuItem>
                </>
              )}
              defaultPageSize={25}
              layout={{
                scrollAreaClassName: "max-h-[min(calc(100svh-22rem),30rem)] [--table-bg:var(--color-popover)]",
              }}
            />
          </DialogBody>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!rowDeleteTarget}
        onOpenChange={(open) => { if (!open) setRowDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium text-foreground">{rowDeleteTarget?.code}</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!rowDeleteTarget) return
                const rowId = rowDeleteTarget.id
                deleteOrderMutation.mutate(rowId)
                toast.success("Order deleted")
                setRowDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!bulkDeleteTarget}
        onOpenChange={(open) => { if (!open) setBulkDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeleteTarget?.selected.length} orders?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected orders. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!bulkDeleteTarget) return
                const ids = bulkDeleteTarget.selected.map((order) => order.id)
                deleteBulkOrdersMutation.mutate(ids)
                toast.success(`${bulkDeleteTarget.selected.length} orders deleted`)
                bulkDeleteTarget.clearSelection()
                setBulkDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
