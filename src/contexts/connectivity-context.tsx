import { useEffect, useState, type ReactNode } from "react"
import { nextConnectivityStatus, type ConnectivityStatus } from "@/lib/connectivity"
import { ConnectivityContext } from "./connectivity-context-value"

const RECONNECTING_FEEDBACK_MS = 1500

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectivityStatus>(
    typeof navigator === "undefined" || navigator.onLine ? "online" : "offline"
  )

  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    const handleOffline = () => {
      if (settleTimer) clearTimeout(settleTimer)
      setStatus((current) => nextConnectivityStatus(current, "offline"))
    }
    const handleOnline = () => {
      setStatus((current) => nextConnectivityStatus(current, "online"))
      settleTimer = setTimeout(() => {
        setStatus((current) => nextConnectivityStatus(current, "settled"))
      }, RECONNECTING_FEEDBACK_MS)
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    return () => {
      if (settleTimer) clearTimeout(settleTimer)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  return <ConnectivityContext.Provider value={{ status }}>{children}</ConnectivityContext.Provider>
}
