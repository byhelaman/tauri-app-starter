import { useMemo, useState } from "react"
import type { SortingState } from "@tanstack/react-table"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { buildBulkCopyText, resolveBulkCopySettings } from "@/components/data-table/bulk-copy"
import { ContextMenuItem } from "@/components/ui/context-menu"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useOrders } from "@/features/orders/hooks/useOrders"
import { createQueueColumns, type QueueOrder } from "@/features/orders/modal-columns"
import {
  CHANNEL_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  QUEUE_COPY_FIELDS,
  STATUS_FILTER_OPTIONS,
} from "@/features/orders/orders-table-config"
import { QueueDataTable } from "@/features/orders/orders-data-tables"

interface QueueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canCopyOrders: boolean
  copyContextValue: (content: string, successMessage: string) => Promise<void>
}

export function QueueDialog({
  open,
  onOpenChange,
  canCopyOrders,
  copyContextValue,
}: QueueDialogProps) {
  const [queueSorting, setQueueSorting] = useState<SortingState>([])
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
    enabled: open,
  })

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw]! h-auto! max-w-310! max-h-205!"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Connected queue</DialogTitle>
          <DialogDescription>Queue view linked to your current orders.</DialogDescription>
        </DialogHeader>
        <DialogBody className="py-1 overflow-y-hidden">
          <QueueDataTable
            columns={queueColumns}
            data={queueRows}
            isLoading={isQueuePageLoading}
            infiniteScroll={queueInfiniteScroll}
            allowDataCopy={canCopyOrders}
            columnFilters={queueColumnFilters}
            onColumnFiltersChange={setQueueColumnFilters}
            globalFilter={queueGlobalFilter}
            onGlobalFilterChange={setQueueGlobalFilter}
            sorting={queueSorting}
            onSortingChange={setQueueSorting}
            onSortingRefresh={refreshCurrentQueueSort}
            toolbar={{
              searchable: true,
              filterPlaceholder: "Search queue...",
              facetedFilters: [
                { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
                { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
                { columnId: "priority", title: "Priority", options: PRIORITY_FILTER_OPTIONS },
              ],
              viewActionsMode: "bulk-copy",
            }}
            bulkActions={(_selectedLoadedRows, _clearSelection, selectedIds, selection) => (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const toastId = "copy-queue-selection"
                  toast.loading("Preparing copy...", { id: toastId })
                  try {
                    const copySettings = resolveBulkCopySettings("orders-queue", QUEUE_COPY_FIELDS)
                    const exportResult = await queueInfiniteScroll.exportByScope!({
                      scope: queueInfiniteScroll.currentScope ?? { search: "", filters: [] },
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
            rowContextMenu={(order) => (
              <>
                <ContextMenuItem
                  onSelect={() => void copyContextValue(order.code, "Order code copied")}
                >
                  Copy code
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    const content = buildBulkCopyText(
                      [order as unknown as Record<string, unknown>],
                      "orders-queue",
                      QUEUE_COPY_FIELDS
                    )
                    void copyContextValue(content, "Row copied")
                  }}
                >
                  Copy row
                </ContextMenuItem>
              </>
            )}
          />
        </DialogBody>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
