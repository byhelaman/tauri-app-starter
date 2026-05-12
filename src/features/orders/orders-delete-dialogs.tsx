import { toast } from "sonner"
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
import type { DataTableSelectionState } from "@/components/data-table/data-table-types"
import { MAX_BULK_ORDER_ROWS } from "@/features/orders/api"
import type { Order } from "@/features/orders/columns"

export interface BulkDeleteRequest {
  count: number
  selection: DataTableSelectionState
  clearSelection: () => void
}

interface OrderDeleteDialogProps {
  order: Order | null
  onOpenChange: (open: boolean) => void
  onDelete: (id: string) => void
}

export function OrderDeleteDialog({
  order,
  onOpenChange,
  onDelete,
}: OrderDeleteDialogProps) {
  return (
    <AlertDialog
      open={!!order}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete order?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <span className="font-medium text-foreground">{order?.code}</span>. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (!order) return
              onDelete(order.id)
              toast.success("Order deleted")
              onOpenChange(false)
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface OrdersBulkDeleteDialogProps {
  request: BulkDeleteRequest | null
  onOpenChange: (open: boolean) => void
  onDelete: (selection: DataTableSelectionState) => Promise<void>
}

export function OrdersBulkDeleteDialog({
  request,
  onOpenChange,
  onDelete,
}: OrdersBulkDeleteDialogProps) {
  const exceedsManualLimit = !!request
    && request.selection.mode === "ids"
    && request.count > MAX_BULK_ORDER_ROWS

  return (
    <AlertDialog
      open={!!request}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {request?.count.toLocaleString()} orders?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will delete the selected orders. This action cannot be undone.
            {exceedsManualLimit && (
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
            disabled={!request || exceedsManualLimit}
            onClick={async () => {
              if (!request) return
              const toastId = "bulk-delete-orders"
              toast.loading(`Deleting ${request.count.toLocaleString()} orders...`, { id: toastId })
              try {
                await onDelete(request.selection)
                toast.success(`${request.count.toLocaleString()} orders deleted`, { id: toastId })
                request.clearSelection()
                onOpenChange(false)
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
  )
}
