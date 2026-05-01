import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { PackageCheckIcon, PackageIcon, TruckIcon, PlusIcon, PencilIcon, TrashIcon, DollarSignIcon } from "lucide-react"
import { useOrdersStats } from "@/features/orders/hooks/useOrdersStats"
import { fetchOrderHistory } from "@/features/orders/api"
import { formatRelativeTime } from "@/lib/date-utils"
import type { HistoryEntry } from "@/components/data-table/data-table-types"
import type { LucideIcon } from "lucide-react"

interface DashboardStat {
  label: string
  value: string
  detail: string
  change: string
  tone: "positive" | "neutral" | "warning"
  icon: LucideIcon
}

interface ActivityEntry {
  user: string
  action: string
  target: string
  time: string
  icon: LucideIcon
}

interface UpcomingEntry {
  title: string
  description: string
  when: string
  tag: string
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
  const { stats, totalOrders, isOrdersLoading } = useOrdersStats()

  const { data: recentActivity = [] as HistoryEntry[], isLoading: isHistoryLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["dashboard", "history"],
    queryFn: () => fetchOrderHistory({ limit: 5 }),
  })

  const dashboardStats = useMemo<DashboardStat[]>(() => {
    const byStatus   = stats.by_status  ?? {}
    const pending    = (byStatus["pending"]    ?? 0) + (byStatus["processing"] ?? 0)
    const delivered  = byStatus["delivered"]  ?? 0
    const completion = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0
    const revenue    = stats.revenue ?? 0

    if (totalOrders === 0) {
      return [
        { label: "Orders",            value: "0",   detail: `Based on ${PERIOD_LABELS[period] ?? period}`, change: "None",      tone: "neutral", icon: PackageIcon },
        { label: "Revenue",           value: "$0",  detail: "Net after refunds",                           change: "None",      tone: "neutral", icon: DollarSignIcon },
        { label: "Pending shipments", value: "0",   detail: "0 need review",                               change: "None",      tone: "neutral", icon: TruckIcon },
        { label: "Completion rate",   value: "0%",  detail: "On-time delivery",                            change: "None",      tone: "neutral", icon: PackageCheckIcon },
      ]
    }

    return [
      {
        label:  "Orders",
        value:  totalOrders.toString(),
        detail: `Based on ${PERIOD_LABELS[period] ?? period}`,
        change: "Active",
        tone:   "positive",
        icon:   PackageIcon,
      },
      {
        label:  "Revenue",
        value:  revenue >= 1000 ? `$${(revenue / 1000).toFixed(1)}k` : `$${revenue.toFixed(0)}`,
        detail: "Net after refunds",
        change: "Stable",
        tone:   "positive",
        icon:   DollarSignIcon,
      },
      {
        label:  "Pending shipments",
        value:  pending.toString(),
        detail: `${byStatus["pending"] ?? 0} need review`,
        change: "Attention",
        tone:   "warning",
        icon:   TruckIcon,
      },
      {
        label:  "Completion rate",
        value:  `${completion.toFixed(1)}%`,
        detail: "On-time delivery",
        change: "Stable",
        tone:   "neutral",
        icon:   PackageCheckIcon,
      },
    ]
  }, [stats, totalOrders, period])

  const activity = useMemo<ActivityEntry[]>(() => {
    return recentActivity.slice(0, 5).map(entry => {
      let icon = PencilIcon
      if (entry.action === "create") icon = PlusIcon
      if (entry.action === "delete") icon = TrashIcon
      return {
        user:   entry.actorEmail.split("@")[0].split(".").join(" "),
        action: entry.action,
        target: entry.description,
        time:   formatRelativeTime(entry.createdAt),
        icon,
      }
    })
  }, [recentActivity])

  // upcoming: sección pendiente de implementación real (requiere campo ship_date en orders)
  const upcoming = useMemo<UpcomingEntry[]>(() => [], [])

  return {
    stats:    dashboardStats,
    activity,
    upcoming,
    isLoading: isOrdersLoading || isHistoryLoading,
  }
}
