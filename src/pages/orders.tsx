import { useCallback, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import type { SortingState } from "@tanstack/react-table"
import {
  Copy,
  ListTodo,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { useOrders } from "@/features/orders/hooks/useOrders"
import {
  createColumns,
  type Order,
} from "@/features/orders/columns"
import { DataTable } from "@/components/data-table/data-table"
import { DatePicker } from "@/components/ui/date-picker"
import { Separator } from "@/components/ui/separator"
import type { DataTableSelectionState } from "@/components/data-table/data-table-types"
import { ImportDialog } from "@/components/data-table/import-dialog"
import { resolveBulkCopySettings } from "@/components/data-table/bulk-copy"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
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
import { TableHistoryCard } from "@/components/data-table/table-history-card"
import { OrderDialog } from "@/features/orders/order-dialog"
import { MAX_BULK_ORDER_ROWS, fetchOrderHistory, fetchOrdersStartHours } from "@/features/orders/api"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/use-auth"
import { QueueDialog } from "@/features/orders/queue-dialog"
import { TrashDialog } from "@/features/orders/trash-dialog"
import {
  CHANNEL_FILTER_OPTIONS,
  ORDER_COPY_FIELDS,
  STATUS_FILTER_OPTIONS,
} from "@/features/orders/orders-table-config"

export function OrdersPage() {
  const { hasPermission } = useAuth()
  const canExportOrders = hasPermission("orders.export")
  const canCopyOrders = hasPermission("orders.copy")
  const canDeleteOrders = hasPermission("orders.delete")
  const canBulkDeleteOrders = hasPermission("orders.bulk_delete")
  const canViewTrash = hasPermission("orders.trash.view")
  const canEmptyTrash = hasPermission("orders.trash.empty")
  const [bulkDeleteOp, setBulkDeleteOp] = useState<{
    count: number
    selection: DataTableSelectionState
    clearSelection: () => void
  } | null>(null)
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false)
  const [isTrashDialogOpen, setIsTrashDialogOpen] = useState(false)
  const [isAddOrderDialogOpen, setIsAddOrderDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>()

  // Format date for the API ("YYYY-MM-DD") — undefined when no date is selected
  const dateFilter = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined

  const [sorting, setSorting] = useState<SortingState>([])

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

  const copyContextValue = useCallback(async (content: string, successMessage: string) => {
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
          <div className="flex items-center gap-2">
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
        allowDataCopy={canCopyOrders}
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
          viewMenuItems: canViewTrash ? (
            <DropdownMenuItem onSelect={() => setIsTrashDialogOpen(true)}>
              <Trash2 />
              Trash
            </DropdownMenuItem>
          ) : undefined,
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
        bulkActions={(_selectedLoadedRows, clearSelection, selectedIds, selection) => (
          <>
            {canCopyOrders && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const toastId = "copy-all"
                  toast.loading(`Preparing copy...`, { id: toastId })
                  try {
                    const copySettings = resolveBulkCopySettings("orders", ORDER_COPY_FIELDS)
                    const exportResult = await infiniteScroll.exportByScope!({
                      scope: infiniteScroll.currentScope ?? { search: "", filters: [] },
                      operations: selection.mode === "operations"
                        ? selection.operations
                        : [{ type: "selectIds", ids: selectedIds }],
                      purpose: "copy",
                      ...copySettings,
                    })
                    const content = exportResult.content
                    if (!content) { toast.error("Nothing to copy", { id: toastId }); return }

                    await navigator.clipboard.writeText(content)
                    const copiedCount = exportResult.rowCount
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

      <QueueDialog
        open={isQueueDialogOpen}
        onOpenChange={setIsQueueDialogOpen}
        canCopyOrders={canCopyOrders}
        copyContextValue={copyContextValue}
      />

      <TrashDialog
        open={isTrashDialogOpen}
        onOpenChange={setIsTrashDialogOpen}
        canViewTrash={canViewTrash}
        canEmptyTrash={canEmptyTrash}
        copyContextValue={copyContextValue}
      />

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
