import { useCallback, useEffect, useState } from "react"
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
} from "@/features/orders/tables/columns"
import { DatePicker } from "@/components/ui/date-picker"
import { Separator } from "@/components/ui/separator"
import { ImportDialog } from "@/components/data-table/actions/import-dialog"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { OrderDialog } from "@/features/orders/dialogs/order-dialog"
import { fetchOrdersStartHours } from "@/features/orders/api"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/use-auth"
import { QueueDialog } from "@/features/orders/dialogs/queue-dialog"
import { TrashDialog } from "@/features/orders/dialogs/trash-dialog"
import { OrdersTableSection } from "@/features/orders/tables/orders-table-section"
import {
  OrderDeleteDialog,
  OrdersBulkDeleteDialog,
  type BulkDeleteRequest,
} from "@/features/orders/dialogs/orders-delete-dialogs"

export function OrdersPage() {
  const { hasPermission } = useAuth()
  const canExportOrders = hasPermission("orders.export")
  const canCopyOrders = hasPermission("orders.export")
  const canDeleteOrders = hasPermission("orders.delete")
  const canBulkDeleteOrders = hasPermission("orders.delete")
  const canViewTrash = hasPermission("orders.trash.view")
  const canEmptyTrash = hasPermission("orders.trash.empty")
  const [bulkDeleteOp, setBulkDeleteOp] = useState<BulkDeleteRequest | null>(null)
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

  // Detectar archivos arrastrados a la ventana (HTML5) para abrir el modal automáticamente
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault()
        setIsImportDialogOpen(true)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault() // Evita que el navegador bloquee el drop
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault() // Evita abrir el archivo en el navegador si cae fuera del dropzone
    }

    window.addEventListener("dragenter", handleDragEnter)
    window.addEventListener("dragover", handleDragOver)
    window.addEventListener("drop", handleDrop)

    return () => {
      window.removeEventListener("dragenter", handleDragEnter)
      window.removeEventListener("dragover", handleDragOver)
      window.removeEventListener("drop", handleDrop)
    }
  }, [])

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

      <OrderDeleteDialog
        order={orderToDelete}
        onOpenChange={(open) => { if (!open) setOrderToDelete(null) }}
        onDelete={orders.actions.deleteOrder}
      />

      <OrdersBulkDeleteDialog
        request={bulkDeleteOp}
        onOpenChange={(open) => { if (!open) setBulkDeleteOp(null) }}
        onDelete={orders.actions.deleteBulkOrders}
      />

    </main>
  )
}
