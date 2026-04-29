import { useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Orders", to: "/orders" },
]

type ModalType = "profile" | "settings" | "notifications" | "system" | "shortcuts" | null

interface UseAppShortcutsOptions {
  canOpenSystem: boolean
  onSetModal: (modal: ModalType) => void
}

/**
 * Registra atajos de teclado globales para la aplicación.
 * Extraído de AppLayout para mantenerlo enfocado en la UI.
 */
export function useAppShortcuts({ canOpenSystem, onSetModal }: UseAppShortcutsOptions) {
  const navigate = useNavigate()

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && e.shiftKey && e.code === "KeyP") {
        e.preventDefault()
        onSetModal("profile")
      }
      if (e.altKey && !mod && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault()
        onSetModal("settings")
      }
      if (canOpenSystem && e.shiftKey && mod && !e.altKey && e.code === "KeyS") {
        e.preventDefault()
        onSetModal("system")
      }
      if (mod && key === "n") {
        e.preventDefault()
        onSetModal("notifications")
      }
      if (mod && e.key === "/") {
        e.preventDefault()
        onSetModal("shortcuts")
      }

      // Navigation (Ctrl/Cmd + 1…N)
      if (mod && !e.shiftKey && !e.altKey) {
        const idx = parseInt(key, 10) - 1
        if (idx >= 0 && idx < NAV_ITEMS.length) {
          e.preventDefault()
          navigate(NAV_ITEMS[idx].to)
        }
      }

      if (e.key === "Escape") {
        onSetModal(null)
      }
    },
    [canOpenSystem, navigate, onSetModal]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [handleKey])
}
