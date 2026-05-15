import { Clock3Icon, RefreshCwIcon, WifiOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/use-auth"
import { useConnectivity } from "@/contexts/use-connectivity"

export function AppStatusBanner() {
  const { health, refreshSession } = useAuth()
  const { status } = useConnectivity()

  if (health.status === "clock-skew") {
    return (
      <div role="status" className="flex items-center justify-between gap-3 border-b bg-amber-500/10 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Clock3Icon className="size-4 shrink-0" />
          <span>
            Device time appears {health.direction === "behind" ? "behind" : "ahead"}. Correct the system clock, then refresh the app to restore authentication.
          </span>
        </div>
      </div>
    )
  }

  if (status === "offline") {
    return (
      <div role="status" className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-sm">
        <WifiOffIcon className="size-4 shrink-0" />
        <span>You are offline. Changes may not sync until the connection returns.</span>
      </div>
    )
  }

  if (status === "reconnecting") {
    return (
      <div role="status" className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm">
        <RefreshCwIcon className="size-4 shrink-0 animate-spin" />
        <span>Connection restored. Reconnecting...</span>
      </div>
    )
  }

  if (health.status === "refresh-error") {
    return (
      <div role="status" className="flex items-center justify-between gap-3 border-b bg-amber-500/10 px-4 py-2 text-sm">
        <span>Session refresh failed. Some data may be stale until authentication is restored.</span>
        <Button variant="outline" size="sm" onClick={() => void refreshSession()}>
          Retry
        </Button>
      </div>
    )
  }

  return null
}
