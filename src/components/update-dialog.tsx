import { useEffect, useState } from "react"
import { useUpdaterContext } from "@/components/updater-context"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Progress } from "@/components/ui/progress"

export function UpdateDialog() {
  const {
    downloadAndInstall,
    closeUpdateDialog,
    update,
    isChecking,
    isDownloading,
    progress,
    error,
  } = useUpdaterContext()

  // Mantiene los datos visibles durante la animación de cierre
  const [lastKnownUpdate, setLastKnownUpdate] = useState<typeof update>(null)

  useEffect(() => {
    if (update) setLastKnownUpdate(update)
  }, [update])

  const displayUpdate = update || lastKnownUpdate
  if (!displayUpdate) return null

  const progressPercent = progress?.total
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0

  return (
    <AlertDialog open={!!update}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Nueva versión disponible: {displayUpdate.version}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {displayUpdate.body || "Hay una nueva versión disponible. ¿Deseas actualizar ahora?"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isDownloading && (
          <div className="py-2">
            <Progress value={progressPercent} />
            <p className="text-muted-foreground mt-2 text-center text-sm">
              Descargando... {progressPercent}%
            </p>
          </div>
        )}

        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDownloading} onClick={closeUpdateDialog}>
            Más tarde
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={downloadAndInstall}
            disabled={isDownloading || isChecking}
          >
            {isDownloading ? "Instalando..." : "Actualizar ahora"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
