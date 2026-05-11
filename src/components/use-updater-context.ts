import { useContext } from "react"
import { UpdaterContext, type UpdaterContextValue } from "./updater-context-value"

export function useUpdaterContext(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext)
  if (!ctx) throw new Error("useUpdaterContext must be used within <UpdaterProvider>")
  return ctx
}
