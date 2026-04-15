import { DollarSignIcon, PackageCheckIcon, PackageIcon, TruckIcon, XCircleIcon, type LucideIcon } from "lucide-react"

export interface ActivityEntry {
  user: string
  action: string
  target: string
  time: string
  icon: LucideIcon
}

export interface UpcomingEntry {
  title: string
  description: string
  when: string
  tag: string
}

export const ACTIVITY: ActivityEntry[] = [
  { user: "Alex Rivera", action: "created order", target: "ORD-X1G03", time: "2m ago", icon: PackageIcon },
  { user: "Sara Chen", action: "marked shipped", target: "ORD-U6D90", time: "18m ago", icon: TruckIcon },
  { user: "John Doe", action: "delivered", target: "ORD-T0C34", time: "1h ago", icon: PackageCheckIcon },
  { user: "Alex Rivera", action: "received payment for", target: "ORD-P7Y44", time: "3h ago", icon: DollarSignIcon },
  { user: "Sara Chen", action: "cancelled", target: "ORD-Q3Z81", time: "5h ago", icon: XCircleIcon },
]

export const UPCOMING: UpcomingEntry[] = [
  { title: "ORD-G8P17 ship date", description: "Hooli · Team Plan License", when: "Today, 3:00 PM", tag: "Shipment" },
  { title: "ORD-M2V58 follow-up", description: "Massive Dynamic · Enterprise Plan", when: "Tomorrow", tag: "Follow-up" },
  { title: "ORD-J0S72 payment due", description: "Oscorp · API Rate Tier", when: "Thu, 10:00 AM", tag: "Payment" },
  { title: "ORD-V9E12 kickoff", description: "Vandelay · Data Migration", when: "Apr 22", tag: "Service" },
  { title: "ORD-O1X96 audit call", description: "Black Mesa · Security Review", when: "Apr 28", tag: "Service" },
]
