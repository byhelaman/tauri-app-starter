import { Radio, Truck } from "lucide-react"
import type { Order } from "./columns"
import type { QueueOrder } from "./modal-columns"
import { useHighlights, type HighlightConfig } from "@/hooks/use-highlights"

const ORDER_HIGHLIGHTS: HighlightConfig<Order>[] = [
  {
    id: "online",
    label: "Online",
    icon: Radio,
    theme: "green",
    condition: (row) => row.channel?.toLowerCase() === "online",
  },
]

const QUEUE_HIGHLIGHTS: HighlightConfig<QueueOrder>[] = [
  {
    id: "ready",
    label: "Ready",
    icon: Truck,
    theme: "blue",
    condition: (row) => row.status === "ready",
  },
]

export function useTableHighlights() {
  return useHighlights(ORDER_HIGHLIGHTS)
}

export function useQueueHighlights() {
  return useHighlights(QUEUE_HIGHLIGHTS)
}
