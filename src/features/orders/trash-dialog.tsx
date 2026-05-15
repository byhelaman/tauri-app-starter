import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { SortingState } from "@tanstack/react-table"
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
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
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
import { fetchDeletedOrdersStartHours, type DeletedOrder } from "@/features/orders/api"
import { useDeletedOrders } from "@/features/orders/hooks/useDeletedOrders"
import { createTrashColumns } from "@/features/orders/trash-columns"
import {
  CHANNEL_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "@/features/orders/orders-table-config"
import { TrashDataTable } from "@/features/orders/orders-data-tables"

interface TrashDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canViewTrash: boolean
  canEmptyTrash: boolean
  copyContextValue: (content: string, successMessage: string) => Promise<void>
}

export function TrashDialog({
  open,
  onOpenChange,
  canViewTrash,
  canEmptyTrash,
  copyContextValue,
}: TrashDialogProps) {
  const [trashSorting, setTrashSorting] = useState<SortingState>([])
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false)
  const [trashOrderToRemove, setTrashOrderToRemove] = useState<DeletedOrder | null>(null)
  const {
    pageData: trashPageData,
    rowCount: trashRowCount,
    isPageLoading: isTrashPageLoading,
    infiniteScroll: trashInfiniteScroll,
    columnFilters: trashColumnFilters,
    setColumnFilters: setTrashColumnFilters,
    globalFilter: trashGlobalFilter,
    setGlobalFilter: setTrashGlobalFilter,
    refreshCurrentOrderSort: refreshCurrentTrashSort,
    actions: trashActions,
    isPending: isTrashPending,
  } = useDeletedOrders({
    sorting: trashSorting,
    enabled: open && canViewTrash,
  })

  const trashColumns = useMemo(() => createTrashColumns(), [])

  const { data: deletedStartHours } = useQuery({
    queryKey: ["orders", "deleted", "startHours"],
    queryFn: fetchDeletedOrdersStartHours,
    staleTime: 5 * 60_000,
    enabled: open && canViewTrash,
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[95vw]! h-auto! max-w-310! max-h-205!"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription>Deleted orders kept outside the active orders table.</DialogDescription>
          </DialogHeader>
          <DialogBody className="py-1 overflow-y-hidden">
            <TrashDataTable
              columns={trashColumns}
              data={trashPageData}
              isLoading={isTrashPageLoading}
              infiniteScroll={trashInfiniteScroll}
              columnFilters={trashColumnFilters}
              onColumnFiltersChange={setTrashColumnFilters}
              globalFilter={trashGlobalFilter}
              onGlobalFilterChange={setTrashGlobalFilter}
              sorting={trashSorting}
              onSortingChange={setTrashSorting}
              onSortingRefresh={refreshCurrentTrashSort}
              toolbar={{
                searchable: true,
                filterPlaceholder: "Search trash...",
                facetedFilters: [
                  { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
                  { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
                ],
                intervalFilter: { columnId: "time", title: "Interval", hours: deletedStartHours },
                viewActionsMode: "view",
              }}
              rowContextMenu={(order) => (
                <>
                  <ContextMenuItem
                    onSelect={() => void copyContextValue(order.code, "Order code copied")}
                  >
                    Copy code
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      const content = [
                        order.date,
                        order.customer,
                        order.product,
                        order.category,
                        `${order.start_time} - ${order.end_time}`,
                        order.code,
                        order.status,
                        order.channel,
                        order.quantity,
                        order.amount,
                        order.region,
                        order.payment,
                        order.priority,
                        order.deleted_at,
                        order.deleted_by_email,
                      ].join(" - ")
                      void copyContextValue(content, "Row copied")
                    }}
                  >
                    Copy row
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => setTrashOrderToRemove(order)}
                  >
                    Remove
                  </ContextMenuItem>
                </>
              )}
            />
          </DialogBody>
          <DialogFooter showCloseButton>
            {canEmptyTrash && (
              <Button
                variant="default"
                disabled={isTrashPending || trashRowCount === 0}
                onClick={() => setIsEmptyTrashDialogOpen(true)}
              >
                Empty Trash
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {trashRowCount.toLocaleString()} orders from trash. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isTrashPending || trashRowCount === 0}
              onClick={async () => {
                await trashActions.emptyTrash()
                setIsEmptyTrashDialogOpen(false)
              }}
            >
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!trashOrderToRemove}
        onOpenChange={(nextOpen) => { if (!nextOpen) setTrashOrderToRemove(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium text-foreground">{trashOrderToRemove?.code}</span> from trash. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isTrashPending}
              onClick={async () => {
                if (!trashOrderToRemove) return
                await trashActions.removeDeletedOrder(trashOrderToRemove.id)
                setTrashOrderToRemove(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
