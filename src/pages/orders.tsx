import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  Clock,
  Globe,
  Handshake,
  LoaderCircle,
  Phone,
  Store,
  Truck,
  Upload,
  XCircle,
} from "lucide-react"
import { createColumns, type Order, type Status } from "@/features/orders/columns"
import { INITIAL_ORDERS } from "@/mocks/orders"
import { DataTable } from "@/features/orders/data-table"
import type { FacetedFilterOption } from "@/features/orders/data-table-types"
import { ImportDialog } from "@/features/orders/import-dialog"
import { buildBulkCopyText } from "@/features/orders/bulk-copy"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { PageHeader } from "@/components/page-header"
import { useTableHighlights } from "@/features/orders/table-highlights"
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
import { INITIAL_QUEUE_ORDERS } from "@/mocks/orders"

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
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)
  const [queueOrders, setQueueOrders] = useState<QueueOrder[]>(INITIAL_QUEUE_ORDERS)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ selected: Order[], clearSelection: () => void } | null>(null)
  const [rowDeleteTarget, setRowDeleteTarget] = useState<Order | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [tableModalOpen, setTableModalOpen] = useState(false)

  const { toolbarActions, rowClassName } = useTableHighlights()

  const handleDeleteRequest = useCallback((order: Order) => {
    setRowDeleteTarget(order)
  }, [])

  const handleStatusChange = useCallback((code: string, status: Status) => {
    setOrders((prev) => prev.map((o) => o.code === code ? { ...o, status } : o))
  }, [])

  const copyCode = useCallback((order: Order) => {
    navigator.clipboard.writeText(order.code)
    toast.success("Order code copied")
  }, [])

  const handleDelete = useCallback((code: string) => {
    setOrders((prev) => prev.filter((o) => o.code !== code))
  }, [])

  const handleQueueStatusChange = useCallback((code: string, status: QueueStatus) => {
    setQueueOrders((prev) => prev.map((o) => o.code === code ? { ...o, status } : o))
  }, [])

  const handleQueuePriorityToggle = useCallback((code: string) => {
    setQueueOrders((prev) => prev.map((o) => o.code === code ? { ...o, priority: !o.priority } : o))
  }, [])

  const handleQueueRemove = useCallback((code: string) => {
    setQueueOrders((prev) => prev.filter((o) => o.code !== code))
    toast.success("Removed from queue")
  }, [])

  const copyQueueCode = useCallback((order: QueueOrder) => {
    navigator.clipboard.writeText(order.code)
    toast.success("Order code copied")
  }, [])

  const columns = useMemo(() => createColumns(handleDelete, handleStatusChange), [handleDelete, handleStatusChange])
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
              View table
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload data-icon="inline-start" />
              Import
            </Button>
          </div>
        }
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <DataTable
        columns={columns}
        data={orders}
        tableId="orders"
        filterColumn="customer"
        filterPlaceholder="Search..."
        facetedFilters={[
          { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
          { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
        ]}
        intervalFilter={{ columnId: "time", title: "Interval" }}
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
        toolbarActions={toolbarActions}
        rowClassName={rowClassName}
        defaultPageSize={25}
      />

      <Dialog open={tableModalOpen} onOpenChange={setTableModalOpen}>
        <DialogContent className="w-[95vw]! h-auto! max-w-310! max-h-205!">
          <DialogHeader>
            <DialogTitle>Orders table</DialogTitle>
            <DialogDescription>Operational queue view with simplified columns.</DialogDescription>
          </DialogHeader>
          <DialogBody className="py-1 overflow-y-hidden">
            <DataTable
              columns={queueColumns}
              data={queueOrders}
              tableId="orders-queue"
              filterColumn="customer"
              filterPlaceholder="Search queue..."
              facetedFilters={[
                { columnId: "status", title: "Status", options: QUEUE_STATUS_FILTER_OPTIONS },
                { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
              ]}
              toolbarActions={(table) => {
                const priorityColumn = table.getColumn("priority")
                if (!priorityColumn) return null
                const priorityOnly = priorityColumn.getFilterValue() === true

                return (
                  <Button
                    variant="outline"
                    onClick={() => priorityColumn.setFilterValue(priorityOnly ? undefined : true)}
                    className={priorityOnly
                      ? "border-dashed border-red-400 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-600 dark:border-red-500 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-400"
                      : "border-dashed"
                    }
                  >
                    <Clock data-icon="inline-start" />
                    Priority only
                  </Button>
                )
              }}
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
              scrollAreaClassName="max-h-[min(calc(100svh-22rem),30rem)]"
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
                setOrders((prev) => prev.filter((o) => o.code !== rowDeleteTarget.code))
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
                const codes = bulkDeleteTarget.selected.map((o) => o.code)
                setOrders((prev) => prev.filter((o) => !codes.includes(o.code)))
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
