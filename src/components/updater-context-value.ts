import { createContext } from "react"
import type { useUpdater } from "@/hooks/use-updater"

export type UpdaterContextValue = ReturnType<typeof useUpdater>

export const UpdaterContext = createContext<UpdaterContextValue | null>(null)
