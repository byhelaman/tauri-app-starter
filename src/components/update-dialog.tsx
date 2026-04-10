import { useEffect, useState } from "react"
import { Download, DownloadIcon, Package } from "lucide-react"
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

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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

  // Keep data visible during close animation
  const [lastKnownUpdate, setLastKnownUpdate] = useState<typeof update>(null)

  useEffect(() => {
    if (update) setLastKnownUpdate(update)
  }, [update])

  const displayUpdate = update || lastKnownUpdate
  if (!displayUpdate) return null

  const progressPercent = progress?.total
    ? Math.round((progress.downloaded / progress.total) * 100)
    : null

  const isDone = progressPercent === 100

  return (
    <AlertDialog open={!!update}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Update available — v{displayUpdate.version}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {displayUpdate.body || "A new version is available. Would you like to update now?"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isDownloading && (
          <div className="flex flex-col gap-2 py-1">
            <Progress value={progressPercent ?? 0} className="h-2" />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {isDone ? (
                <span className="text-foreground">Download complete — installing…</span>
              ) : progressPercent !== null ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <Download className="size-4" />
                    Downloading…
                  </span>
                  <span>
                    {formatBytes(progress!.downloaded)} / {formatBytes(progress!.total!)} — {progressPercent}%
                  </span>
                </>
              ) : (
                <span>Starting download…</span>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDownloading} onClick={closeUpdateDialog}>
            Later
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={downloadAndInstall}
            disabled={isDownloading || isChecking}
          >
            {isDownloading ? (isDone ? "Installing…" : "Downloading…") : "Update now"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
