import { useCallback, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import type { SortingState } from "@tanstack/react-table"
import {
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Handshake,
  ListTodo,
  LoaderCircle,
  Phone,
  Plus,
  Store,
  Trash2,
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
import { DatePicker } from "@/components/ui/date-picker"
import { Separator } from "@/components/ui/separator"
import type { DataTableSelectionState, FacetedFilterOption } from "@/components/data-table/data-table-types"
import { ImportDialog } from "@/components/data-table/import-dialog"
import { buildBulkCopyText, resolveBulkCopySettings } from "@/components/data-table/bulk-copy"
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
} from "@/features/orders/modal-columns"
import { TableHistoryCard } from "@/components/data-table/table-history-card"
import { OrderDialog } from "@/features/orders/order-dialog"
import { MAX_BULK_ORDER_ROWS, fetchOrderHistory, fetchOrdersStartHours, fetchOrdersByIds } from "@/features/orders/api"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"

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

const ORDER_COPY_FIELDS = [
  "date",
  "customer",
  "product",
  "category",
  "time",
  "code",
  "status",
  "channel",
  "quantity",
  "amount",
  "region",
  "payment",
  "priority",
]

const QUEUE_COPY_FIELDS = [
  "time",
  "code",
  "customer",
  "status",
  "channel",
  "agent",
  "priority",
]

const PRIORITY_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "High", value: "High", icon: Clock },
  { label: "Medium", value: "Medium", icon: Clock },
  { label: "Low", value: "Low", icon: Clock },
]

export function OrdersPage() {
  const { hasPermission } = useAuth()
  const canExportOrders = hasPermission("orders.export")
  const canDeleteOrders = hasPermission("orders.delete")
  const canBulkDeleteOrders = hasPermission("orders.bulk_delete")
  const [bulkDeleteOp, setBulkDeleteOp] = useState<{
    count: number
    selection: DataTableSelectionState
    clearSelection: () => void
  } | null>(null)
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false)
  const [isAddOrderDialogOpen, setIsAddOrderDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>()

  // Format date for the API ("YYYY-MM-DD") — undefined when no date is selected
  const dateFilter = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined

  const [sorting, setSorting] = useState<SortingState>([])
  const [queueSorting, setQueueSorting] = useState<SortingState>([])

  const {
    pageData,
    isPageLoading,
    infiniteScroll,
    columnFilters,
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
    refreshCurrentOrderSort,
    actions
  } = useOrders({ dateFilter, sorting })

  const {
    pageData: queuePageData,
    isPageLoading: isQueuePageLoading,
    infiniteScroll: queueInfiniteScroll,
    columnFilters: queueColumnFilters,
    setColumnFilters: setQueueColumnFilters,
    globalFilter: queueGlobalFilter,
    setGlobalFilter: setQueueGlobalFilter,
    refreshCurrentOrderSort: refreshCurrentQueueSort,
    actions: queueActions,
  } = useOrders({
    sorting: queueSorting,
    queryScope: "orders-queue",
    realtime: false,
    enabled: isQueueDialogOpen,
  })

  const { toolbarActions, rowClassName } = useTableHighlights()

  // Horas de inicio realmente presentes en la BD — para el filtro de Interval
  const { data: startHours } = useQuery({
    queryKey: ["orders", "startHours"],
    queryFn: fetchOrdersStartHours,
    staleTime: 5 * 60_000, // 5 min — no cambia frecuentemente
  })

  const handleDeleteRequest = useCallback((order: Order) => {
    setOrderToDelete(order)
  }, [])

  const columns = useMemo(
    () => createColumns(actions.deleteOrder, actions.handleStatusChange, actions.handleCellChange),
    [actions.deleteOrder, actions.handleStatusChange, actions.handleCellChange]
  )
  const queueColumns = useMemo(
    () => createQueueColumns(queueActions.handleStatusChange),
    [queueActions.handleStatusChange]
  )

  const queueRows = useMemo<QueueOrder[]>(
    () => queuePageData.map((order) => ({
      ...order,
      time: order.start_time && order.end_time ? `${order.start_time} - ${order.end_time}` : "",
      agent: "",
    })),
    [queuePageData]
  )

  const copyQueueContextValue = useCallback(async (content: string, successMessage: string) => {
    if (!content) {
      toast.error("Nothing to copy")
      return
    }

    try {
      await navigator.clipboard.writeText(content)
      toast.success(successMessage)
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }, [])


  return (
    <main className="h-full overflow-hidden flex flex-col p-6 gap-6">
      <PageHeader
        title="Orders"
        description="Track customer orders and their fulfillment status."
        actions={
          <div className="flex items-center jus gap-2">
            <Button variant="outline" onClick={() => setIsQueueDialogOpen(true)}>
              <ListTodo />
              Queue
            </Button>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
              <Upload />
              Import
            </Button>
            <Button onClick={() => setIsAddOrderDialogOpen(true)}>
              <Plus />
              Add Order
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1 my-auto" />
            <DatePicker date={selectedDate} setDate={setSelectedDate} />
          </div>
        }
      />
      <ImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} title="Import orders" />
      <OrderDialog
        open={isAddOrderDialogOpen}
        onOpenChange={setIsAddOrderDialogOpen}
        onSubmit={(newOrder) => actions.createOrder(newOrder)}
      />
      <DataTable
        columns={columns}
        data={pageData}
        isLoading={isPageLoading}
        infiniteScroll={infiniteScroll}
        allowDataExport={canExportOrders}
        columnFilters={columnFilters}
        onColumnFiltersChange={setColumnFilters}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        sorting={sorting}
        onSortingChange={setSorting}
        onSortingRefresh={refreshCurrentOrderSort}
        onResetView={() => setSelectedDate(undefined)}
        tableId="orders"
        sidePanel={(onClose) => (
          <TableHistoryCard 
            tableId="orders" 
            onClose={onClose} 
            queryKey={["orders", "history"]}
            queryFn={fetchOrderHistory}
          />
        )}
        toolbar={{
          searchable: true,
          filterPlaceholder: "Search...",
          facetedFilters: [
            { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
            { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
          ],
          intervalFilter: { columnId: "time", title: "Interval", hours: startHours },
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
              {canDeleteOrders && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem 
                    onSelect={() => handleDeleteRequest(order)}
                  >
                    Cancel order
                  </ContextMenuItem>
                </>
              )}
            </>
          )
        }}
        bulkActions={(selectedLoadedRows, clearSelection, selectedIds, selection) => (
          <>
            {canExportOrders && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const toastId = "copy-all"
                  toast.loading(`Preparing copy...`, { id: toastId })
                  try {
                    const copySettings = resolveBulkCopySettings("orders", ORDER_COPY_FIELDS)
                    const rowsToCopy = selection.mode === "operations"
                      ? null
                      : selectedIds.length === selectedLoadedRows.length
                        ? selectedLoadedRows
                        : await fetchOrdersByIds(selectedIds)

                    const exportResult = selection.mode === "operations"
                      ? await infiniteScroll.exportByScope!({
                        scope: infiniteScroll.currentScope ?? { search: "", filters: [] },
                        operations: selection.operations,
                        ...copySettings,
                      })
                      : null
                    const content = exportResult?.content
                      ?? buildBulkCopyText(rowsToCopy as unknown as Record<string, unknown>[], "orders", ORDER_COPY_FIELDS)
                    if (!content) { toast.error("Nothing to copy", { id: toastId }); return }
                    
                    await navigator.clipboard.writeText(content)
                    const copiedCount = selection.mode === "operations"
                      ? exportResult?.rowCount ?? 0
                      : (rowsToCopy?.length ?? 0)
                    toast.success(`Copied ${copiedCount.toLocaleString()} rows`, { id: toastId })
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not copy to clipboard", { id: toastId })
                  }
                }}
              >
                <Copy />
                Copy
              </Button>
            )}
            {canBulkDeleteOrders && (
              <Button
                variant="destructive"
                size="sm"
                aria-label="Delete"
                onClick={() => {
                  setBulkDeleteOp({
                    count: selection.mode === "operations" ? selection.selectedCount : selectedIds.length,
                    selection,
                    clearSelection
                  })
                }}
              >
                <Trash2 />
                Delete
              </Button>
            )}
          </>
        )}

        rowClassName={rowClassName}
        getRowId={(row) => row.id}
        defaultPageSize={25}
      />

      <Dialog open={isQueueDialogOpen} onOpenChange={setIsQueueDialogOpen}>
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
              data={queueRows}
              isLoading={isQueuePageLoading}
              infiniteScroll={queueInfiniteScroll}
              allowDataExport={canExportOrders}
              columnFilters={queueColumnFilters}
              onColumnFiltersChange={setQueueColumnFilters}
              globalFilter={queueGlobalFilter}
              onGlobalFilterChange={setQueueGlobalFilter}
              sorting={queueSorting}
              onSortingChange={setQueueSorting}
              onSortingRefresh={refreshCurrentQueueSort}
              tableId="orders-queue"
              toolbar={{
                searchable: true,
                filterPlaceholder: "Search queue...",
                facetedFilters: [
                  { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
                  { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
                  { columnId: "priority", title: "Priority", options: PRIORITY_FILTER_OPTIONS },
                ],
                searchDebounceMs: 300,
                viewActionsMode: "bulk-copy",
              }}
              bulkActions={(selectedLoadedRows, _clearSelection, selectedIds, selection) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const toastId = "copy-queue-selection"
                    toast.loading("Preparing copy...", { id: toastId })
                    try {
                      const copySettings = resolveBulkCopySettings("orders-queue", QUEUE_COPY_FIELDS)
                      const rowsToCopy = selection.mode === "operations"
                        ? null
                        : selectedIds.length === selectedLoadedRows.length
                          ? selectedLoadedRows
                          : await fetchOrdersByIds(selectedIds)
                      const exportResult = selection.mode === "operations"
                        ? await queueInfiniteScroll.exportByScope!({
                          scope: queueInfiniteScroll.currentScope ?? { search: "", filters: [] },
                          operations: selection.operations,
                          ...copySettings,
                        })
                        : null
                      const content = exportResult?.content
                        ?? buildBulkCopyText(rowsToCopy as unknown as Record<string, unknown>[], "orders-queue", QUEUE_COPY_FIELDS)
                      if (!content) {
                        toast.error("Nothing to copy", { id: toastId })
                        return
                      }

                      await navigator.clipboard.writeText(content)
                      const copiedCount = selection.mode === "operations"
                        ? exportResult?.rowCount ?? 0
                        : (rowsToCopy?.length ?? 0)
                      toast.success(`Copied ${copiedCount.toLocaleString()} rows`, { id: toastId })
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not copy to clipboard", { id: toastId })
                    }
                  }}
                >
                  <Copy />
                  Copy
                </Button>
              )}
              rowContextMenu={(order) => (
                <>
                  <ContextMenuItem
                    onSelect={() => void copyQueueContextValue(order.code, "Order code copied")}
                  >
                    Copy code
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => void copyQueueContextValue(order.time, "Time copied")}
                  >
                    Copy time
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => void copyQueueContextValue(order.customer, "Customer copied")}
                  >
                    Copy customer
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      const content = buildBulkCopyText(
                        [order as unknown as Record<string, unknown>],
                        "orders-queue",
                        QUEUE_COPY_FIELDS
                      )
                      void copyQueueContextValue(content, "Row copied")
                    }}
                  >
                    Copy row
                  </ContextMenuItem>
                </>
              )}
              getRowId={(row) => row.id}
              layout={{
                scrollAreaClassName: "max-h-[min(calc(100svh-22rem),30rem)] [--table-bg:var(--color-popover)]",
              }}
            />
          </DialogBody>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!orderToDelete}
        onOpenChange={(open) => { if (!open) setOrderToDelete(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium text-foreground">{orderToDelete?.code}</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!orderToDelete) return
                actions.deleteOrder(orderToDelete.id)
                toast.success("Order deleted")
                setOrderToDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!bulkDeleteOp}
        onOpenChange={(open) => { if (!open) setBulkDeleteOp(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {bulkDeleteOp?.count.toLocaleString()} orders?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the selected orders. This action cannot be undone.
              {bulkDeleteOp && bulkDeleteOp.selection.mode === "ids" && bulkDeleteOp.count > MAX_BULK_ORDER_ROWS && (
                <span className="mt-2 block font-medium text-destructive">
                  Bulk delete is limited to {MAX_BULK_ORDER_ROWS.toLocaleString()} orders at a time.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!bulkDeleteOp || (bulkDeleteOp.selection.mode === "ids" && bulkDeleteOp.count > MAX_BULK_ORDER_ROWS)}
              onClick={async () => {
                if (!bulkDeleteOp) return
                const toastId = "bulk-delete-orders"
                toast.loading(`Deleting ${bulkDeleteOp.count.toLocaleString()} orders...`, { id: toastId })
                try {
                  await actions.deleteBulkOrders(bulkDeleteOp.selection)
                  toast.success(`${bulkDeleteOp.count.toLocaleString()} orders deleted`, { id: toastId })
                  bulkDeleteOp.clearSelection()
                  setBulkDeleteOp(null)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not delete orders", { id: toastId })
                }
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
