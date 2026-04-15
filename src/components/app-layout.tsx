import { useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { BellIcon, ChevronDown, Settings } from "lucide-react"
import { UserNav } from "@/components/user-nav"
import { CommandPalette } from "@/components/command-palette"
import { NotificationsModal, DEMO_NOTIFICATIONS } from "@/components/notifications-modal"
import { ProfileModal } from "@/components/profile-modal"
import { SettingsModal } from "@/components/settings-modal"
import { SystemModal } from "@/components/system-modal"
import { ShortcutsModal } from "@/components/shortcuts-modal"
import { Titlebar } from "@/components/window-controls"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Team", to: "/team" },
  { label: "Analytics", to: "/analytics" },
  { label: "Orders", to: "/orders" },
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
  askExportLocation: boolean
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
  askExportLocation: true,
}

const SETTINGS_STORAGE_KEY = "app-settings"

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [modal, setModal] = useState<ModalType>(null)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)) } catch { /* noop */ }
  }, [settings])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      // Modals
      if (mod && e.shiftKey && e.code === "KeyP") {
        e.preventDefault()
        setModal("profile")
      }
      if (e.altKey && !mod && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault()
        setModal("settings")
      }
      if (e.shiftKey && !mod && !e.altKey && e.code === "KeyS") {
        e.preventDefault()
        setModal("system")
      }
      if (mod && key === "n") {
        e.preventDefault()
        setModal("notifications")
      }
      if (mod && e.key === "/") {
        e.preventDefault()
        setModal("shortcuts")
      }

      // Navigation (Ctrl/Cmd + 1…N)
      if (mod && !e.shiftKey && !e.altKey) {
        const idx = parseInt(key, 10) - 1
        if (idx >= 0 && idx < NAV_ITEMS.length) {
          e.preventDefault()
          navigate(NAV_ITEMS[idx].to)
        }
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
      <Titlebar>
        <nav className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="lg:hidden">
              {NAV_ITEMS.map(({ label, to }) => (
                <DropdownMenuItem key={to} onSelect={() => navigate(to)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden lg:flex md:items-center md:gap-1">
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
          </div>
        </nav>

        <div className="flex items-center gap-4">
          <CommandPalette
            onOpenProfile={() => setModal("profile")}
            onOpenSettings={() => setModal("settings")}
            onOpenNotifications={() => setModal("notifications")}
            onOpenSystem={() => setModal("system")}
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
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label="Settings"
              onClick={() => setModal("settings")}
            >
              <Settings aria-hidden="true" />
            </Button>
            <UserNav
              onOpenProfile={() => setModal("profile")}
              onOpenSettings={() => setModal("settings")}
              onOpenSystem={() => setModal("system")}
              onOpenShortcuts={() => setModal("shortcuts")}
            />
          </div>
        </div>
      </Titlebar>

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
