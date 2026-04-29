import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { PackageCheckIcon, PackageIcon, TruckIcon, PlusIcon, PencilIcon, TrashIcon, DollarSignIcon } from "lucide-react"
import { useOrders } from "@/features/orders/hooks/useOrders"
import { fetchOrderHistory } from "@/features/orders/api"
import { formatRelativeTime } from "@/lib/date-utils"
import type { HistoryEntry } from "@/components/data-table/data-table-types"
import type { DashboardStat, ActivityEntry, UpcomingEntry } from "@/mocks/dashboard"

// Maps period keys to milliseconds for the time window
const PERIOD_MS: Record<string, number> = {
  "7d":  7  * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "3m":  90 * 24 * 60 * 60 * 1000,
  "6m":  180 * 24 * 60 * 60 * 1000,
  "9m":  270 * 24 * 60 * 60 * 1000,
  "1y":  365 * 24 * 60 * 60 * 1000,
}

const PERIOD_LABELS: Record<string, string> = {
  "7d":  "last 7 days",
  "30d": "last 30 days",
  "3m":  "last 3 months",
  "6m":  "last 6 months",
  "9m":  "last 9 months",
  "1y":  "last year",
}

export function useDashboardData({ period = "7d" }: { period?: string } = {}) {
  const { orders, isOrdersLoading } = useOrders({ statsOnly: true })

  const { data: recentActivity = [] as HistoryEntry[], isLoading: isHistoryLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["dashboard", "history"],
    queryFn: () => fetchOrderHistory({ limit: 5 }),
  })

  const stats = useMemo<DashboardStat[]>(() => {
    if (!orders.length) {
      return [
        { label: "Orders", value: "0", detail: `Based on ${PERIOD_LABELS[period] ?? period}`, change: "None", tone: "neutral", icon: PackageIcon },
        { label: "Revenue", value: "$0", detail: "Net after refunds", change: "None", tone: "neutral", icon: DollarSignIcon },
        { label: "Pending shipments", value: "0", detail: "0 need review", change: "None", tone: "neutral", icon: TruckIcon },
        { label: "Completion rate", value: "0%", detail: "On-time delivery", change: "None", tone: "neutral", icon: PackageCheckIcon },
      ]
    }

    const now = new Date()
    const windowMs = PERIOD_MS[period] ?? PERIOD_MS["7d"]
    const cutoff = new Date(now.getTime() - windowMs)

    const recentOrders = orders.filter(order => new Date(order.date) >= cutoff)
    const pendingOrders = orders.filter(order => order.status === "pending" || order.status === "processing")
    const deliveredOrders = orders.filter(order => order.status === "delivered")
    
    // Revenue is computed from delivered orders within the period
    const deliveredInPeriod = orders.filter(order => 
      order.status === "delivered" && new Date(order.date) >= cutoff
    )
    const revenue = deliveredInPeriod.reduce((sum, order) => sum + Number(order.amount), 0)
    
    const completionRate = orders.length > 0 ? (deliveredOrders.length / orders.length) * 100 : 0

    return [
      {
        label: "Orders",
        value: recentOrders.length.toString(),
        detail: `Based on ${PERIOD_LABELS[period] ?? period}`,
        change: "Active",
        tone: "positive",
        icon: PackageIcon,
      },
      {
        label: "Revenue",
        value: revenue >= 1000 ? `$${(revenue / 1000).toFixed(1)}k` : `$${revenue.toFixed(0)}`,
        detail: "Net after refunds",
        change: "Stable",
        tone: "positive",
        icon: DollarSignIcon,
      },
      {
        label: "Pending shipments",
        value: pendingOrders.length.toString(),
        detail: `${orders.filter(order => order.status === "pending").length} need review`,
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
  }, [orders, period])

  const activity = useMemo<ActivityEntry[]>(() => {
    return recentActivity.slice(0, 5).map(entry => {
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
  }, [recentActivity])

  const upcoming = useMemo<UpcomingEntry[]>(() => {
    const pending = orders.filter(order => order.status === "pending" || order.status === "processing").slice(0, 5)
    return pending.map((order, i) => {
      const days = i + 1
      return {
        title: `${order.code} ship date`,
        description: `${order.customer} · ${order.product}`,
        when: days === 1 ? "Tomorrow" : `In ${days} days`,
        tag: order.status === "processing" ? "Shipment" : "Review",
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
