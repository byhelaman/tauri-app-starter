import { Minus, X } from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

interface WindowControlsProps {
  variant?: "inline" | "floating"
}

export function WindowControls({ variant = "inline" }: WindowControlsProps) {
  if (!isTauri) return null

  const appWindow = getCurrentWindow()

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "flex items-center gap-0.5",
        variant === "inline" && "ml-2",
        variant === "floating" && "fixed top-0 left-0 right-0 z-50 flex justify-end p-2 px-4 h-12",
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Minimize"
        onClick={() => appWindow.minimize()}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        className="hover:bg-destructive/10 hover:text-destructive"
        onClick={() => appWindow.close()}
      >
        <X />
      </Button>
    </div>
  )
}
