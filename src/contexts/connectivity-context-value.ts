import { createContext } from "react"
import type { ConnectivityStatus } from "@/lib/connectivity"

export type ConnectivityContextType = {
  status: ConnectivityStatus
}

export const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined)
