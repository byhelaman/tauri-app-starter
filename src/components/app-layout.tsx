import { lazy, Suspense, useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { BellIcon, ChevronDown, Settings } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { UserNav } from "@/components/user-nav"
import { CommandPalette } from "@/components/command-palette"
import { NotificationsModal } from "@/components/notifications-modal"
import { ProfileModal } from "@/components/profile-modal"
import { SettingsModal } from "@/components/settings-modal"
import { SystemModal } from "@/features/system/system-modal"
import { ShortcutsModal } from "@/components/shortcuts-modal"
import { useAuth } from "@/contexts/auth-context"
import { type AppSettings, SETTINGS_STORAGE_KEY, loadSettings, syncGeneralSettings } from "@/lib/settings"
import { Titlebar } from "@/components/window-controls"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabase"
import { useAppShortcuts } from "@/hooks/use-app-shortcuts"

// U-02: Lazy-load ChatWidget — react-markdown y remark-gfm son pesados.
// Solo se carga cuando el usuario tiene el permiso ai.chat, y se monta al primer render.
const ChatWidget = lazy(() =>
  import("@/features/chat/chat-widget").then((m) => ({ default: m.ChatWidget }))
)

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Orders", to: "/orders" },
]

type ModalType = "profile" | "settings" | "notifications" | "system" | "shortcuts" | null

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

  // C-01: Atajos de teclado extraídos a un hook dedicado
  useAppShortcuts({ canOpenSystem, onSetModal: setModal })

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      window.dispatchEvent(new Event("app-settings-changed"))
    } catch {
      /* noop */
    }
    syncGeneralSettings(settings)
  }, [settings])

  // U-01: Cargar unreadCount al montar sin esperar que se abra el modal.
  // La query usa el mismo queryKey que NotificationsModal para compartir la cache.
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase.rpc("get_my_notifications", { p_limit: 50 })
      if (error) throw error
      return (data ?? []) as { id: number; read: boolean }[]
    },
    enabled: !!supabase,
  })
  const unreadCount = notifications.filter((n) => !n.read).length

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
      />
      <SystemModal
        open={canOpenSystem && modal === "system"}
        onOpenChange={(open) => setModal(open && canOpenSystem ? "system" : null)}
      />
      <ShortcutsModal
        open={modal === "shortcuts"}
        onOpenChange={(open) => setModal(open ? "shortcuts" : null)}
      />
      {/* U-02: Suspense con fallback null — el botón no aparece hasta que el chunk carga */}
      {hasPermission("ai.chat") && (
        <Suspense fallback={null}>
          <ChatWidget key={user?.id ?? "anon"} />
        </Suspense>
      )}
    </div>
  )
}
