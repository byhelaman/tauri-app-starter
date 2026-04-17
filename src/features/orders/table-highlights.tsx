import { Radio } from "lucide-react"
import type { Order } from "./columns"
import { useHighlights, type HighlightConfig } from "@/hooks/use-highlights"

const ORDER_HIGHLIGHTS: HighlightConfig<Order>[] = [
  {
    id: "online",
    label: "Online",
    icon: Radio,
    theme: "green",
    condition: (row) => row.channel?.toLowerCase() === "online",
  },
  // {
  //   id: "cancelled",
  //   label: "Cancelled",
  //   icon: XCircle,
  //   theme: "red",
  //   condition: (row) => row.status?.toLowerCase() === "cancelled",
  // }
]

export function useTableHighlights() {
  return useHighlights(ORDER_HIGHLIGHTS)
}
