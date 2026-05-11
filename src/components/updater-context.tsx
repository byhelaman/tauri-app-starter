import type { ReactNode } from "react"
import { useUpdater } from "@/hooks/use-updater"
import { UpdaterContext } from "./updater-context-value"

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater()
  return (
    <UpdaterContext.Provider value={updater}>
      {children}
    </UpdaterContext.Provider>
  )
}

