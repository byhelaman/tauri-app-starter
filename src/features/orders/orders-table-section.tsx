import { useMemo } from "react"
import { toast } from "sonner"
import type { OnChangeFn, SortingState } from "@tanstack/react-table"
import { Copy, Trash2 } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { resolveBulkCopySettings } from "@/components/data-table/bulk-copy"
import { TableHistoryCard } from "@/components/data-table/table-history-card"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { fetchOrderHistory } from "@/features/orders/api"
import { createColumns, type Order } from "@/features/orders/columns"
import type { BulkDeleteRequest } from "@/features/orders/orders-delete-dialogs"
import type { useOrders } from "@/features/orders/hooks/useOrders"
import { useTableHighlights } from "@/features/orders/table-highlights"
import {
  CHANNEL_FILTER_OPTIONS,
  ORDER_COPY_FIELDS,
  STATUS_FILTER_OPTIONS,
} from "@/features/orders/orders-table-config"

type OrdersModel = ReturnType<typeof useOrders>

interface OrdersTableSectionProps {
  orders: OrdersModel
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  startHours?: string[]
  canExportOrders: boolean
  canCopyOrders: boolean
  canDeleteOrders: boolean
  canBulkDeleteOrders: boolean
  canViewTrash: boolean
  onResetDateFilter: () => void
  onOpenTrash: () => void
  onRequestDelete: (order: Order) => void
  onRequestBulkDelete: (request: BulkDeleteRequest) => void
}

export function OrdersTableSection({
  orders,
  sorting,
  onSortingChange,
  startHours,
  canExportOrders,
  canCopyOrders,
  canDeleteOrders,
  canBulkDeleteOrders,
  canViewTrash,
  onResetDateFilter,
  onOpenTrash,
  onRequestDelete,
  onRequestBulkDelete,
}: OrdersTableSectionProps) {
  const { toolbarActions, rowClassName } = useTableHighlights()
  const columns = useMemo(
    () => createColumns(
      orders.actions.deleteOrder,
      orders.actions.handleStatusChange,
      orders.actions.handleCellChange
    ),
    [orders.actions.deleteOrder, orders.actions.handleCellChange, orders.actions.handleStatusChange]
  )

  return (
    <DataTable
      columns={columns}
      data={orders.pageData}
      isLoading={orders.isPageLoading}
      infiniteScroll={orders.infiniteScroll}
      allowDataExport={canExportOrders}
      allowDataCopy={canCopyOrders}
      columnFilters={orders.columnFilters}
      onColumnFiltersChange={orders.setColumnFilters}
      globalFilter={orders.globalFilter}
      onGlobalFilterChange={orders.setGlobalFilter}
      sorting={sorting}
      onSortingChange={onSortingChange}
      onSortingRefresh={orders.refreshCurrentOrderSort}
      onResetView={onResetDateFilter}
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
          <DropdownMenuItem onSelect={onOpenTrash}>
            <Trash2 />
            Trash
          </DropdownMenuItem>
        ) : undefined,
        searchDebounceMs: 300,
      }}
      rowContextMenu={(order) => (
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
              <ContextMenuItem onSelect={() => onRequestDelete(order)}>
                Cancel order
              </ContextMenuItem>
            </>
          )}
        </>
      )}
      bulkActions={(_selectedLoadedRows, clearSelection, selectedIds, selection) => (
        <>
          {canCopyOrders && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const toastId = "copy-all"
                toast.loading("Preparing copy...", { id: toastId })
                try {
                  const copySettings = resolveBulkCopySettings("orders", ORDER_COPY_FIELDS)
                  const exportResult = await orders.infiniteScroll.exportByScope!({
                    scope: orders.infiniteScroll.currentScope ?? { search: "", filters: [] },
                    operations: selection.mode === "operations"
                      ? selection.operations
                      : [{ type: "selectIds", ids: selectedIds }],
                    purpose: "copy",
                    ...copySettings,
                  })
                  const content = exportResult.content
                  if (!content) {
                    toast.error("Nothing to copy", { id: toastId })
                    return
                  }

                  await navigator.clipboard.writeText(content)
                  toast.success(`Copied ${exportResult.rowCount.toLocaleString()} rows`, { id: toastId })
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
                onRequestBulkDelete({
                  count: selection.mode === "operations" ? selection.selectedCount : selectedIds.length,
                  selection,
                  clearSelection,
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
  )
}
