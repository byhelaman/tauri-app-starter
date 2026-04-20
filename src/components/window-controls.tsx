import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Minus, X, Maximize, Minimize } from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

interface TitlebarProps {
  children?: ReactNode
  className?: string
}

export function Titlebar({ children, className }: TitlebarProps) {
  return (
    <>
      <div
        data-tauri-drag-region
        className={cn(
          "z-50 flex shrink-0 items-center justify-between backdrop-blur p-2 gap-4",
          className,
        )}
      >
        <div
          data-tauri-drag-region
          className={cn("flex-1 flex items-center min-w-0 justify-between", isTauri && "pr-28")}
        >
          {children}
        </div>
      </div>
      {isTauri && <WindowControlsLayer />}
    </>
  )
}

function WindowControlsLayer() {
  const [isElevated, setIsElevated] = useState(false)

  useEffect(() => {
    if (typeof document === "undefined") return

    const updateElevationState = () => {
      const hasOpenDialogOverlay = Boolean(
        document.querySelector('[data-slot="dialog-overlay"][data-state="open"]')
      )
      setIsElevated((prev) => prev === hasOpenDialogOverlay ? prev : hasOpenDialogOverlay)
    }

    updateElevationState()

    const observer = new MutationObserver(updateElevationState)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    })

    return () => observer.disconnect()
  }, [])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed top-2 right-2 pointer-events-auto"
      style={{ zIndex: 70 }}
    >
      <WindowControls isElevated={isElevated} />
    </div>,
    document.body,
  )
}

interface ShellProps {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="flex flex-col h-svh">
      <Titlebar />
      <div className="flex-1 overflow-y-auto min-h-0">
        {children}
      </div>
    </div>
  )
}

interface WindowControlsProps {
  isElevated?: boolean
}

function WindowControls({ isElevated = false }: WindowControlsProps) {
  const appWindow = getCurrentWindow()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized)
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized)
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [appWindow])

  return (
    <div className="flex items-center gap-0.5 ml-2 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Minimize"
        className={cn(!isElevated && "text-muted-foreground")}
        onClick={() => appWindow.minimize()}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={maximized ? "Restore" : "Maximize"}
        className={cn(!isElevated && "text-muted-foreground")}
        onClick={() => appWindow.toggleMaximize()}
      >
        {maximized ? <Minimize /> : <Maximize />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        className={cn(!isElevated && "text-muted-foreground", "hover:bg-destructive/10 hover:text-destructive")}
        onClick={() => appWindow.close()}
      >
        <X />
      </Button>
    </div>
  )
}
