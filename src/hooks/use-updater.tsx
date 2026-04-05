import { useState, useCallback, useEffect } from "react"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

interface UpdateProgress {
  downloaded: number
  total: number | null
}

interface UseUpdaterReturn {
  checkForUpdates: () => Promise<Update | null>
  downloadAndInstall: () => Promise<void>
  closeUpdateDialog: () => void
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

  const checkForUpdates = useCallback(async (): Promise<Update | null> => {
    setIsChecking(true)
    setError(null)
    try {
      const result = await check()
      setUpdate(result)
      return result
    } catch (err) {
      console.error("Error al verificar actualizaciones:", err)
      setError(err instanceof Error ? err.message : "Error al verificar actualizaciones")
      return null
    } finally {
      setIsChecking(false)
    }
  }, [])

  // Verificar al montar y luego cada 4 horas
  useEffect(() => {
    checkForUpdates()
    const id = setInterval(checkForUpdates, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [checkForUpdates])

  const downloadAndInstall = useCallback(async () => {
    if (!update) return

    setIsDownloading(true)
    setProgress({ downloaded: 0, total: null })
    setError(null)

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
      console.error("Error al instalar actualización:", err)
      setError(err instanceof Error ? err.message : "Error al instalar la actualización")
      setIsDownloading(false)
    }
  }, [update])

  const closeUpdateDialog = useCallback(() => {
    setUpdate(null)
  }, [])

  return {
    checkForUpdates,
    downloadAndInstall,
    closeUpdateDialog,
    update,
    isChecking,
    isDownloading,
    progress,
    error,
  }
}
