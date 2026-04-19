import { useEffect, useState } from "react"
import { z } from "zod"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { BellIcon, ChevronDown, Settings } from "lucide-react"
import { UserNav } from "@/components/user-nav"
import { CommandPalette } from "@/components/command-palette"
import { NotificationsModal } from "@/components/notifications-modal"
import { ProfileModal } from "@/components/profile-modal"
import { SettingsModal } from "@/components/settings-modal"
import { SystemModal } from "@/components/system-modal"
import { ShortcutsModal } from "@/components/shortcuts-modal"
import { ChatWidget } from "@/components/chat-widget"
import { useAuth } from "@/contexts/auth-context"
import { Titlebar } from "@/components/window-controls"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
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
  emailNotifications: false,
  pushNotifications: false,
  weeklyDigest: false,
  showOnlineStatus: false,
  usageAnalytics: false,
  autoUpdate: false,
  askExportLocation: true,
}

// Esquema en tiempo de ejecución para que valores almacenados corruptos u obsoletos
// se rechacen y las claves desconocidas se eliminen, evitando errores de tipo silenciosos.
const appSettingsSchema = z.object({
  launchAtLogin: z.boolean(),
  startMinimized: z.boolean(),
  closeToTray: z.boolean(),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  weeklyDigest: z.boolean(),
  showOnlineStatus: z.boolean(),
  usageAnalytics: z.boolean(),
  autoUpdate: z.boolean(),
  askExportLocation: z.boolean(),
}).partial()

const SETTINGS_STORAGE_KEY = "app-settings"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = appSettingsSchema.parse(JSON.parse(raw))
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

async function syncGeneralSettings(settings: AppSettings) {
  if (!isTauri) return
  try {
    const [{ load }, autostart] = await Promise.all([
      import("@tauri-apps/plugin-store"),
      import("@tauri-apps/plugin-autostart"),
    ])
    const store = await load("settings.json", { autoSave: true, defaults: {} })
    await store.set("startMinimized", settings.startMinimized)
    await store.set("closeToTray", settings.closeToTray)
    const current = await autostart.isEnabled()
    if (settings.launchAtLogin && !current) await autostart.enable()
    else if (!settings.launchAtLogin && current) await autostart.disable()
  } catch (err) {
    console.error("Failed to sync general settings", err)
  }
}

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, claims, hasPermission } = useAuth()
  const [modal, setModal] = useState<ModalType>(null)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const canOpenSystem =
    claims.hierarchyLevel >= 80 ||
    hasPermission("system.view") ||
    hasPermission("system.manage") ||
    hasPermission("users.view") ||
    hasPermission("users.manage")

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)) } catch { /* noop */ }
    syncGeneralSettings(settings)
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
      if (canOpenSystem && e.shiftKey && !mod && !e.altKey && e.code === "KeyS") {
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
  }, [canOpenSystem, navigate])

  const [unreadCount, setUnreadCount] = useState(0)

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
              <DropdownMenuRadioGroup
                value={NAV_ITEMS.find(({ to }) => to === "/" ? pathname === "/" : pathname.startsWith(to))?.to ?? ""}
                onValueChange={(to) => navigate(to)}
              >
                {NAV_ITEMS.map(({ label, to }) => (
                  <DropdownMenuRadioItem key={to} value={to}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
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

        <div className="flex items-center gap-3">
          <CommandPalette
            onOpenProfile={() => setModal("profile")}
            onOpenSettings={() => setModal("settings")}
            onOpenNotifications={() => setModal("notifications")}
            onOpenSystem={canOpenSystem ? () => setModal("system") : undefined}
            onOpenShortcuts={() => setModal("shortcuts")}
            showSystem={canOpenSystem}
          />
          <div className="flex items-center gap-1">
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
          </div>
            <UserNav
              onOpenProfile={() => setModal("profile")}
              onOpenSettings={() => setModal("settings")}
              onOpenSystem={canOpenSystem ? () => setModal("system") : undefined}
              onOpenShortcuts={() => setModal("shortcuts")}
              canOpenSystem={canOpenSystem}
            />
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
        open={canOpenSystem && modal === "system"}
        onOpenChange={(open) => setModal(open && canOpenSystem ? "system" : null)}
      />
      <ShortcutsModal
        open={modal === "shortcuts"}
        onOpenChange={(open) => setModal(open ? "shortcuts" : null)}
      />
      {hasPermission("ai.chat") && <ChatWidget key={user?.id ?? "anon"} />}
    </div>
  )
}
