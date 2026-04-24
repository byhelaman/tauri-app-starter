import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { DollarSignIcon, PackageCheckIcon, PackageIcon, TruckIcon, XCircleIcon, PlusIcon, PencilIcon, TrashIcon } from "lucide-react"
import { useOrders } from "@/features/orders/hooks/useOrders"
import { fetchOrderHistory } from "@/features/orders/api"
import type { DashboardStat, ActivityEntry, UpcomingEntry } from "@/mocks/dashboard"

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 1000 / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  return `${days}d ago`
}

export function useDashboardData() {
  const { orders, isOrdersLoading } = useOrders()

  const { data: history = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["dashboard", "history"],
    queryFn: fetchOrderHistory,
  })

  const stats = useMemo<DashboardStat[]>(() => {
    if (!orders.length) return []

    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const recentOrders = orders.filter(o => new Date(o.date) >= oneWeekAgo)
    const pendingOrders = orders.filter(o => o.status === "pending" || o.status === "processing")
    const deliveredOrders = orders.filter(o => o.status === "delivered")
    
    const revenue = deliveredOrders.reduce((sum, o) => sum + Number(o.amount), 0)
    
    const completionRate = orders.length > 0 ? (deliveredOrders.length / orders.length) * 100 : 0

    return [
      {
        label: "Orders this week",
        value: recentOrders.length.toString(),
        detail: "Based on last 7 days",
        change: "Active",
        tone: "positive",
        icon: PackageIcon,
      },
      {
        label: "Revenue",
        value: `$${(revenue / 1000).toFixed(1)}k`,
        detail: "Net after refunds",
        change: "Stable",
        tone: "positive",
        icon: DollarSignIcon,
      },
      {
        label: "Pending shipments",
        value: pendingOrders.length.toString(),
        detail: `${orders.filter(o => o.status === "pending").length} need review`,
        change: "Attention",
        tone: "warning",
        icon: TruckIcon,
      },
      {
        label: "Completion rate",
        value: `${completionRate.toFixed(1)}%`,
        detail: "On-time delivery",
        change: "Stable",
        tone: "neutral",
        icon: PackageCheckIcon,
      },
    ]
  }, [orders])

  const activity = useMemo<ActivityEntry[]>(() => {
    return history.slice(0, 5).map(entry => {
      let icon = PencilIcon
      if (entry.action === "create") icon = PlusIcon
      if (entry.action === "delete") icon = TrashIcon
      
      return {
        user: entry.actorEmail.split('@')[0].replace('.', ' '),
        action: entry.action,
        target: entry.description,
        time: formatRelativeTime(entry.createdAt),
        icon,
      }
    })
  }, [history])

  const upcoming = useMemo<UpcomingEntry[]>(() => {
    const pending = orders.filter(o => o.status === "pending" || o.status === "processing").slice(0, 5)
    return pending.map((o, i) => {
      const days = i + 1
      return {
        title: `${o.code} ship date`,
        description: `${o.customer} · ${o.product}`,
        when: days === 1 ? "Tomorrow" : `In ${days} days`,
        tag: o.status === "processing" ? "Shipment" : "Review",
      }
    })
  }, [orders])

  return {
    stats,
    activity,
    upcoming,
    isLoading: isOrdersLoading || isHistoryLoading,
  }
}
