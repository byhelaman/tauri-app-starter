import { useCallback, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import type { SortingState } from "@tanstack/react-table"
import {
  ListTodo,
  Plus,
  Upload,
} from "lucide-react"
import { useOrders } from "@/features/orders/hooks/useOrders"
import {
  type Order,
} from "@/features/orders/columns"
import { DatePicker } from "@/components/ui/date-picker"
import { Separator } from "@/components/ui/separator"
import type { DataTableSelectionState } from "@/components/data-table/data-table-types"
import { ImportDialog } from "@/components/data-table/import-dialog"
import { PageHeader } from "@/components/page-header"
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
import { OrderDialog } from "@/features/orders/order-dialog"
import { MAX_BULK_ORDER_ROWS, fetchOrdersStartHours } from "@/features/orders/api"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/use-auth"
import { QueueDialog } from "@/features/orders/queue-dialog"
import { TrashDialog } from "@/features/orders/trash-dialog"
import { OrdersTableSection } from "@/features/orders/orders-table-section"

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

  const orders = useOrders({ dateFilter, sorting })

  // Horas de inicio realmente presentes en la BD — para el filtro de Interval
  const { data: startHours } = useQuery({
    queryKey: ["orders", "startHours"],
    queryFn: fetchOrdersStartHours,
    staleTime: 5 * 60_000, // 5 min — no cambia frecuentemente
  })

  const handleDeleteRequest = useCallback((order: Order) => {
    setOrderToDelete(order)
  }, [])

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
        onSubmit={(newOrder) => orders.actions.createOrder(newOrder)}
      />
      <OrdersTableSection
        orders={orders}
        sorting={sorting}
        onSortingChange={setSorting}
        startHours={startHours}
        canExportOrders={canExportOrders}
        canCopyOrders={canCopyOrders}
        canDeleteOrders={canDeleteOrders}
        canBulkDeleteOrders={canBulkDeleteOrders}
        canViewTrash={canViewTrash}
        onResetDateFilter={() => setSelectedDate(undefined)}
        onOpenTrash={() => setIsTrashDialogOpen(true)}
        onRequestDelete={handleDeleteRequest}
        onRequestBulkDelete={setBulkDeleteOp}
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
                orders.actions.deleteOrder(orderToDelete.id)
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
                  await orders.actions.deleteBulkOrders(bulkDeleteOp.selection)
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
