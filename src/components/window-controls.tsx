import { useEffect, useState, type ReactNode } from "react"
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
    <div
      data-tauri-drag-region
      className={cn(
        "z-50 flex shrink-0 items-center justify-between backdrop-blur p-2 gap-4",
        className,
      )}
    >
      <div data-tauri-drag-region className="flex-1 flex items-center min-w-0 justify-between">
        {children}
      </div>
      {isTauri && <WindowControls />}
    </div>
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

function WindowControls() {
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
        className="text-muted-foreground"
        onClick={() => appWindow.minimize()}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={maximized ? "Restore" : "Maximize"}
        className="text-muted-foreground"
        onClick={() => appWindow.toggleMaximize()}
      >
        {maximized ? <Minimize /> : <Maximize />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => appWindow.close()}
      >
        <X />
      </Button>
    </div>
  )
}
