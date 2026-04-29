import { useState, useCallback, useEffect } from "react"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { loadSettings } from "@/lib/settings"

// Forma mínima para una actualización simulada en modo desarrollo.
interface SimulatedUpdate extends Pick<Update, "version" | "body"> {
  downloadAndInstall: Update["downloadAndInstall"]
  available: boolean
  currentVersion: string
  date: string | undefined
  rid: number
}

interface UpdateProgress {
  downloaded: number
  total: number | null
}

interface UseUpdaterReturn {
  checkForUpdates: () => Promise<Update | null>
  downloadAndInstall: () => Promise<void>
  closeUpdateDialog: () => void
  simulateUpdate: () => void
  update: Update | null
  isChecking: boolean
  isDownloading: boolean
  progress: UpdateProgress | null
  error: string | null
}

const POLL_INTERVAL = 4 * 60 * 60 * 1000 // 4 horas

export function useUpdater(): UseUpdaterReturn {
  const [update, setUpdate] = useState<Update | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(() => loadSettings().autoUpdate)

  const checkForUpdates = useCallback(async (): Promise<Update | null> => {
    setIsChecking(true)
    setError(null)
    try {
      const result = await check()
      setUpdate(result)
      return result
    } catch (err) {
      console.error("Failed to check for updates:", err)
      setError(err instanceof Error ? err.message : "Failed to check for updates")
      return null
    } finally {
      setIsChecking(false)
    }
  }, [])

  // Mantiene el updater sincronizado con cambios de Settings en esta ventana y entre pestañas.
  useEffect(() => {
    function refreshAutoUpdateSetting() {
      setAutoUpdateEnabled(loadSettings().autoUpdate)
    }

    window.addEventListener("storage", refreshAutoUpdateSetting)
    window.addEventListener("app-settings-changed", refreshAutoUpdateSetting)

    return () => {
      window.removeEventListener("storage", refreshAutoUpdateSetting)
      window.removeEventListener("app-settings-changed", refreshAutoUpdateSetting)
    }
  }, [])

  // Verifica al montar y cada 4 horas solo cuando auto-update está habilitado.
  useEffect(() => {
    if (!autoUpdateEnabled) {
      setUpdate(null)
      return
    }

    checkForUpdates()
    const id = setInterval(checkForUpdates, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [autoUpdateEnabled, checkForUpdates])

  const [isSimulated, setIsSimulated] = useState(false)

  const downloadAndInstall = useCallback(async () => {
    if (!update) return

    setIsDownloading(true)
    setProgress({ downloaded: 0, total: null })
    setError(null)

    if (isSimulated) {
      const total = 8 * 1024 * 1024 // 8 MB fake size
      const steps = 40
      const chunkSize = total / steps
      setProgress({ downloaded: 0, total })
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, 60))
        setProgress({ downloaded: chunkSize * i, total })
      }
      await new Promise((r) => setTimeout(r, 600))
      setIsDownloading(false)
      setProgress(null)
      setIsSimulated(false)
      setUpdate(null)
      return
    }

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setProgress({ downloaded: 0, total: event.data.contentLength ?? null })
            break
          case "Progress":
            setProgress((prev) => ({
              downloaded: (prev?.downloaded ?? 0) + event.data.chunkLength,
              total: prev?.total ?? null,
            }))
            break
          case "Finished":
            break
        }
      })
      await relaunch()
    } catch (err) {
      console.error("Failed to install update:", err)
      setError(err instanceof Error ? err.message : "Failed to install update")
      setIsDownloading(false)
    }
  }, [update, isSimulated])

  const closeUpdateDialog = useCallback(() => {
    setUpdate(null)
    setIsSimulated(false)
  }, [])

  const simulateUpdate = useCallback(() => {
    // Solo disponible en dev — evita bundlear/expoonr este flujo en producción
    if (!import.meta.env.DEV) return
    setIsSimulated(true)
    const mock: SimulatedUpdate = {
      version: "9.9.9",
      body: "Bug fixes and performance improvements.",
      available: true,
      currentVersion: "0.0.0",
      date: undefined,
      rid: 0,
      downloadAndInstall: async () => { /* no-op in simulation */ },
    }
    setUpdate(mock as unknown as Update)
  }, [])

  return {
    checkForUpdates,
    downloadAndInstall,
    closeUpdateDialog,
    simulateUpdate,
    update,
    isChecking,
    isDownloading,
    progress,
    error,
  }
}
