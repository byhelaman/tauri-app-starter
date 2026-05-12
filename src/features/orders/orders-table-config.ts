import {
  CheckCircle2,
  Clock,
  Globe,
  Handshake,
  LoaderCircle,
  Phone,
  Store,
  Truck,
  XCircle,
} from "lucide-react"
import type { FacetedFilterOption } from "@/components/data-table/data-table-types"

export const STATUS_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Pending", value: "pending", icon: Clock },
  { label: "Processing", value: "processing", icon: LoaderCircle },
  { label: "Shipped", value: "shipped", icon: Truck },
  { label: "Delivered", value: "delivered", icon: CheckCircle2 },
  { label: "Cancelled", value: "cancelled", icon: XCircle },
]

export const CHANNEL_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Online", value: "Online", icon: Globe },
  { label: "Retail", value: "Retail", icon: Store },
  { label: "Partner", value: "Partner", icon: Handshake },
  { label: "Phone", value: "Phone", icon: Phone },
]

export const PRIORITY_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "High", value: "High", icon: Clock },
  { label: "Medium", value: "Medium", icon: Clock },
  { label: "Low", value: "Low", icon: Clock },
]

export const ORDER_COPY_FIELDS = [
  "date",
  "customer",
  "product",
  "category",
  "time",
  "code",
  "status",
  "channel",
  "quantity",
  "amount",
  "region",
  "payment",
  "priority",
]

export const QUEUE_COPY_FIELDS = [
  "time",
  "code",
  "customer",
  "status",
  "channel",
  "agent",
  "priority",
]
