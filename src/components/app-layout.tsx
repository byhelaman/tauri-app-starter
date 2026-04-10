import { useEffect, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import { BellIcon } from "lucide-react"
import { UserNav } from "@/components/user-nav"
import { CommandPalette } from "@/components/command-palette"
import { NotificationsModal, DEMO_NOTIFICATIONS } from "@/components/notifications-modal"
import { ProfileModal } from "@/components/profile-modal"
import { SettingsModal } from "@/components/settings-modal"
import { SystemModal } from "@/components/system-modal"
import { Button } from "@/components/ui/button"

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Team", to: "/team" },
  { label: "Analytics", to: "/analytics" },
  { label: "Tasks", to: "/tasks" },
]

type ModalType = "profile" | "settings" | "notifications" | "system" | null

export function AppLayout() {
  const [modal, setModal] = useState<ModalType>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault()
        setModal("profile")
      }
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault()
        setModal("settings")
      }
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault()
        setModal("system")
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [])
  const [unreadCount, setUnreadCount] = useState(() =>
    DEMO_NOTIFICATIONS.filter((n) => !n.read).length
  )

  return (
    <div className="flex flex-col h-svh">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur px-4 py-2 flex items-center gap-6">
        <nav className="flex items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ label, to }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {({ isActive }) => (
                <Button variant={isActive ? "secondary" : "ghost"}>
                  {label}
                </Button>
              )}
            </NavLink>
          ))}
        </nav>

        <CommandPalette
          onOpenProfile={() => setModal("profile")}
          onOpenSettings={() => setModal("settings")}
          onOpenNotifications={() => setModal("notifications")}
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
    </div>
  )
}
