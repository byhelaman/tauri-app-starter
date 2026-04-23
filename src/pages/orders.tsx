import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  Clock,
  Globe,
  Handshake,
  ListTodo,
  LoaderCircle,
  Phone,
  Plus,
  Store,
  Truck,
  Upload,
  XCircle,
} from "lucide-react"
import { useOrders } from "@/features/orders/hooks/useOrders"
import {
  createColumns,
  type Order,
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
} from "@/features/orders/modal-columns"
import { OrderDialog } from "@/features/orders/order-dialog"

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
  const {
    orders,
    isOrdersLoading,
    queueOrders,
    isQueueLoading,
    actions
  } = useOrders()

  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ selected: Order[], clearSelection: () => void } | null>(null)
  const [rowDeleteTarget, setRowDeleteTarget] = useState<Order | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [addOrderOpen, setAddOrderOpen] = useState(false)

  const { toolbarActions, rowClassName } = useTableHighlights()
  const { toolbarActions: queueToolbarActions, rowClassName: queueRowClassName } = useQueueHighlights()

  const handleDeleteRequest = useCallback((order: Order) => {
    setRowDeleteTarget(order)
  }, [])

  const columns = useMemo(
    () => createColumns(actions.deleteOrder, actions.handleStatusChange, actions.handleCellChange),
    [actions.deleteOrder, actions.handleStatusChange, actions.handleCellChange]
  )
  const queueColumns = useMemo(
    () => createQueueColumns(actions.handleQueueStatusChange, actions.handleQueuePriorityToggle, actions.handleQueueRemove),
    [actions.handleQueueStatusChange, actions.handleQueuePriorityToggle, actions.handleQueueRemove]
  )

  const copyQueueCode = useCallback((order: QueueOrder) => {
    navigator.clipboard.writeText(order.code)
    toast.success("Order code copied")
  }, [])

  const tableData = orders

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
            <Button onClick={() => setAddOrderOpen(true)}>
              <Plus data-icon="inline-start" />
              Add Order
            </Button>
          </div>
        }
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} title="Import orders" />
      <OrderDialog
        open={addOrderOpen}
        onOpenChange={setAddOrderOpen}
        onSubmit={(newOrder) => actions.createOrder(newOrder)}
      />
      <DataTable
        columns={columns}
        data={tableData}
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
        rowContextMenu={(order) => {
          return (
            <>
              <ContextMenuItem onSelect={() => toast.info(`Viewing details for ${order.id}`)}>
                View details
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => toast.info(`Duplicating order ${order.id}`)}>
                Duplicate order
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => {
                navigator.clipboard.writeText(`https://tracking.com/${order.id}`)
                toast.success("Tracking link copied")
              }}>
                Copy tracking link
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => toast.info(`Drafting email for ${order.customer}`)}>
                Send email
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem 
                onSelect={() => handleDeleteRequest(order)}
              >
                Cancel order
              </ContextMenuItem>
            </>
          )
        }}
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
                  <ContextMenuItem onSelect={() => actions.handleQueuePriorityToggle(order.code)}>
                    {order.priority ? "Set normal priority" : "Set high priority"}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => actions.handleQueueRemove(order.code)}>
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
                actions.deleteOrder(rowDeleteTarget.id)
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
                actions.deleteBulkOrders(ids)
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
