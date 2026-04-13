import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Handshake,
  LoaderCircle,
  Phone,
  Store,
  Trash2Icon,
  Truck,
  XCircle,
} from "lucide-react"
import { createColumns, type Order, type Status } from "@/features/orders/columns"
import { DataTable } from "@/features/orders/data-table"
import type { FacetedFilterOption } from "@/features/orders/data-table-types"
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

const INITIAL_ORDERS: Order[] = [
  { date: "2026-04-01", customer: "Acme Corp", product: "Pro Plan License", category: "Software", time: "09:12", code: "ORD-A3F91", status: "delivered", channel: "Online", quantity: 3, amount: 1500.00 },
  { date: "2026-04-02", customer: "Globex Inc", product: "Mechanical Keyboard", category: "Hardware", time: "10:45", code: "ORD-B7K22", status: "processing", channel: "Retail", quantity: 12, amount: 3240.00 },
  { date: "2026-04-03", customer: "Initech", product: "Onboarding Consultation", category: "Services", time: "14:20", code: "ORD-C1D08", status: "pending", channel: "Partner", quantity: 1, amount: 450.00 },
  { date: "2026-04-04", customer: "Umbrella Co", product: "Annual Support Plan", category: "Subscription", time: "08:05", code: "ORD-D9E47", status: "shipped", channel: "Online", quantity: 2, amount: 800.50 },
  { date: "2026-04-05", customer: "Stark Industries", product: "4K Monitor 27\"", category: "Hardware", time: "13:30", code: "ORD-E2M61", status: "delivered", channel: "Online", quantity: 5, amount: 2975.00 },
  { date: "2026-04-06", customer: "Wayne Enterprises", product: "Analytics Add-on", category: "Software", time: "17:15", code: "ORD-F4N83", status: "processing", channel: "Phone", quantity: 4, amount: 2100.00 },
  { date: "2026-04-07", customer: "Hooli", product: "Team Plan License", category: "Software", time: "11:10", code: "ORD-G8P17", status: "pending", channel: "Online", quantity: 25, amount: 4500.00 },
  { date: "2026-04-08", customer: "Soylent Corp", product: "Accessibility Audit", category: "Services", time: "09:40", code: "ORD-H5Q04", status: "shipped", channel: "Partner", quantity: 1, amount: 1250.00 },
  { date: "2026-04-09", customer: "Cyberdyne Systems", product: "Wireless Mouse", category: "Hardware", time: "15:25", code: "ORD-I6R55", status: "cancelled", channel: "Retail", quantity: 8, amount: 320.00 },
  { date: "2026-04-10", customer: "Oscorp", product: "API Rate Tier", category: "Subscription", time: "10:50", code: "ORD-J0S72", status: "pending", channel: "Online", quantity: 1, amount: 1800.75 },
  { date: "2026-04-11", customer: "Tyrell Corp", product: "Storage Upgrade", category: "Subscription", time: "14:05", code: "ORD-K3T39", status: "processing", channel: "Online", quantity: 10, amount: 2750.00 },
  { date: "2026-04-12", customer: "Pied Piper", product: "Integration Setup", category: "Services", time: "16:30", code: "ORD-L7U26", status: "delivered", channel: "Phone", quantity: 1, amount: 650.00 },
]

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

  const handleDelete = useCallback((code: string) => {
    setOrders((prev) => prev.filter((o) => o.code !== code))
  }, [])

  const handleStatusChange = useCallback((code: string, status: Status) => {
    setOrders((prev) => prev.map((o) => o.code === code ? { ...o, status } : o))
  }, [])

  const columns = useMemo(() => createColumns(handleDelete, handleStatusChange), [handleDelete, handleStatusChange])

  return (
    <main className="h-full overflow-hidden flex flex-col p-6 gap-6">
      <PageHeader title="Orders" description="Track customer orders and their fulfillment status." />
      <DataTable
        columns={columns}
        data={orders}
        filterColumn="customer"
        filterPlaceholder="Search customers..."
        facetedFilters={[
          { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
          { columnId: "channel", title: "Channel", options: CHANNEL_FILTER_OPTIONS },
        ]}
        bulkActions={(selected, clearSelection) => (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(selected.map((o) => o.code).join(", "))
                toast.success(`${selected.length} codes copied`)
              }}
            >
              <Copy data-icon="inline-start" />
              Copy codes
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteTarget({ selected, clearSelection })}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </>
        )}
      />

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
