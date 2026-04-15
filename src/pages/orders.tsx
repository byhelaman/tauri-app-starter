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
  Trash2Icon,
  Truck,
  Upload,
  XCircle,
} from "lucide-react"
import { createColumns, type Order, type Status } from "@/features/orders/columns"
import { INITIAL_ORDERS } from "@/mocks/orders"
import { DataTable } from "@/features/orders/data-table"
import type { FacetedFilterOption } from "@/features/orders/data-table-types"
import { ImportDialog } from "@/features/orders/import-dialog"
import { BulkCopyProvider, BulkCopyButton, BulkCopySettings } from "@/features/orders/bulk-copy-actions"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
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

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ selected: Order[], clearSelection: () => void } | null>(null)
  const [rowDeleteTarget, setRowDeleteTarget] = useState<Order | null>(null)
  const [importOpen, setImportOpen] = useState(false)

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

  const columns = useMemo(() => createColumns(handleDelete, handleStatusChange), [handleDelete, handleStatusChange])

  return (
    <main className="h-full overflow-hidden flex flex-col p-6 gap-6">
      <PageHeader
        title="Orders"
        description="Track customer orders and their fulfillment status."
        actions={
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload data-icon="inline-start" />
            Import
          </Button>
        }
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <DataTable
        columns={columns}
        data={orders}
        filterColumn="customer"
        filterPlaceholder="Search customers..."
        facetedFilters={[
          { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
          { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
        ]}
        rowContextMenu={(order) => (
          <>
            <ContextMenuItem onSelect={() => copyCode(order)}>Copy code</ContextMenuItem>
            <ContextMenuItem onSelect={() => toast.info("Order editing coming soon")}>Edit order</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => handleDeleteRequest(order)}>
              Delete
            </ContextMenuItem>
          </>
        )}
        bulkActions={(selected, clearSelection) => (
          <BulkCopyProvider selected={selected}>
            <BulkCopyButton />
            <Button
              variant="destructive"
              size="icon-sm"
              aria-label="Delete"
              onClick={() => setBulkDeleteTarget({ selected, clearSelection })}
            >
              <Trash2Icon />
            </Button>
            <BulkCopySettings />
          </BulkCopyProvider>
        )}
        defaultPageSize={25}
      />

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
