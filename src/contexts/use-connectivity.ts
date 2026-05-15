import { useContext } from "react"
import { ConnectivityContext } from "./connectivity-context-value"

export function useConnectivity() {
  const context = useContext(ConnectivityContext)
  if (context === undefined) {
    throw new Error("useConnectivity must be used within a ConnectivityProvider")
  }
  return context
}
