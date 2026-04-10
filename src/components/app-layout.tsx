import { useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { BellIcon } from "lucide-react"
import { UserNav } from "@/components/user-nav"
import { CommandPalette } from "@/components/command-palette"
import { NotificationsModal, DEMO_NOTIFICATIONS } from "@/components/notifications-modal"
import { ProfileModal } from "@/components/profile-modal"
import { SettingsModal } from "@/components/settings-modal"
import { SystemModal } from "@/components/system-modal"
import { ShortcutsModal } from "@/components/shortcuts-modal"
import { Button } from "@/components/ui/button"

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Team", to: "/team" },
  { label: "Analytics", to: "/analytics" },
  { label: "Tasks", to: "/tasks" },
]

type ModalType = "profile" | "settings" | "notifications" | "system" | "shortcuts" | null

export interface AppSettings {
  launchAtLogin: boolean
  startMinimized: boolean
  closeToTray: boolean
  emailNotifications: boolean
  pushNotifications: boolean
  weeklyDigest: boolean
  showOnlineStatus: boolean
  usageAnalytics: boolean
  autoUpdate: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  emailNotifications: true,
  pushNotifications: false,
  weeklyDigest: true,
  showOnlineStatus: true,
  usageAnalytics: true,
  autoUpdate: true,
}

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [modal, setModal] = useState<ModalType>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey

      // Modals
      if (mod && e.shiftKey && e.key === "P") {
        e.preventDefault()
        setModal("profile")
      }
      if (mod && e.key === ",") {
        e.preventDefault()
        setModal("settings")
      }
      if (mod && e.shiftKey && e.key === "S") {
        e.preventDefault()
        setModal("system")
      }
      if (mod && e.key === "n") {
        e.preventDefault()
        setModal("notifications")
      }
      if (mod && e.key === "/") {
        e.preventDefault()
        setModal("shortcuts")
      }

      // Navigation
      if (mod && e.key === "1") {
        e.preventDefault()
        navigate("/")
      }
      if (mod && e.key === "2") {
        e.preventDefault()
        navigate("/projects")
      }
      if (mod && e.key === "3") {
        e.preventDefault()
        navigate("/team")
      }
      if (mod && e.key === "4") {
        e.preventDefault()
        navigate("/analytics")
      }
      if (mod && e.key === "5") {
        e.preventDefault()
        navigate("/tasks")
      }

      // Close modal
      if (e.key === "Escape") {
        setModal(null)
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [navigate])
  const [unreadCount, setUnreadCount] = useState(() =>
    DEMO_NOTIFICATIONS.filter((n) => !n.read).length
  )

  return (
    <div className="flex flex-col h-svh">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur px-4 py-2 flex items-center gap-6">
        <nav className="flex items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ label, to }) => {
            const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to)
            return (
              <Button
                key={to}
                variant={isActive ? "secondary" : "ghost"}
                onClick={() => navigate(to)}
              >
                {label}
              </Button>
            )
          })}
        </nav>

        <CommandPalette
          onOpenProfile={() => setModal("profile")}
          onOpenSettings={() => setModal("settings")}
          onOpenNotifications={() => setModal("notifications")}
          onOpenShortcuts={() => setModal("shortcuts")}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
            onClick={() => setModal("notifications")}
          >
            <BellIcon aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400" />
            )}
          </Button>
          <UserNav
            onOpenProfile={() => setModal("profile")}
            onOpenSettings={() => setModal("settings")}
            onOpenNotifications={() => setModal("notifications")}
            onOpenSystem={() => setModal("system")}
            onOpenShortcuts={() => setModal("shortcuts")}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        <Outlet />
      </div>

      <ProfileModal
        open={modal === "profile"}
        onOpenChange={(open) => setModal(open ? "profile" : null)}
      />
      <SettingsModal
        open={modal === "settings"}
        onOpenChange={(open) => setModal(open ? "settings" : null)}
        settings={settings}
        onSettingsChange={setSettings}
      />
      <NotificationsModal
        open={modal === "notifications"}
        onOpenChange={(open) => setModal(open ? "notifications" : null)}
        onUnreadCountChange={setUnreadCount}
      />
      <SystemModal
        open={modal === "system"}
        onOpenChange={(open) => setModal(open ? "system" : null)}
      />
      <ShortcutsModal
        open={modal === "shortcuts"}
        onOpenChange={(open) => setModal(open ? "shortcuts" : null)}
      />
    </div>
  )
}
