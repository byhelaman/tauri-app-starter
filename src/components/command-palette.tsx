import { useEffect, useState } from "react"
import { LayoutDashboard, Users, BarChart2, FolderKanban, Settings, Bell, User, LogOut, KeyboardIcon, ShieldIcon, ShoppingCart } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

interface CommandPaletteProps {
  onOpenProfile?: () => void
  onOpenSettings?: () => void
  onOpenNotifications?: () => void
  onOpenSystem?: () => void
  onOpenShortcuts?: () => void
}

export function CommandPalette({ onOpenProfile, onOpenSettings, onOpenNotifications, onOpenSystem, onOpenShortcuts }: CommandPaletteProps) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [])

  function run(fn?: () => void) {
    setOpen(false)
    fn?.()
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-60 lg:w-80 justify-between px-3 text-muted-foreground font-normal text-sm"
      >
        <span>Search...</span>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} className="gap-0">
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => run(() => navigate("/"))}>
                <LayoutDashboard />
                Dashboard
              </CommandItem>
              <CommandItem onSelect={() => run(() => navigate("/projects"))}>
                <FolderKanban />
                Projects
              </CommandItem>
              <CommandItem onSelect={() => run(() => navigate("/team"))}>
                <Users />
                Team
              </CommandItem>
              <CommandItem onSelect={() => run(() => navigate("/analytics"))}>
                <BarChart2 />
                Analytics
              </CommandItem>
              <CommandItem onSelect={() => run(() => navigate("/orders"))}>
                <ShoppingCart />
                Orders
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Account">
              <CommandItem onSelect={() => run(onOpenProfile)}>
                <User />
                Profile
              </CommandItem>
              <CommandItem onSelect={() => run(onOpenSettings)}>
                <Settings />
                Settings
              </CommandItem>
              <CommandItem onSelect={() => run(onOpenNotifications)}>
                <Bell />
                Notifications
              </CommandItem>
              <CommandItem onSelect={() => run(onOpenShortcuts)}>
                <KeyboardIcon />
                Keyboard shortcuts
              </CommandItem>
              <CommandItem onSelect={() => run(onOpenSystem)}>
                <ShieldIcon />
                System
              </CommandItem>
              <CommandItem onSelect={() => run(signOut)}>
                <LogOut />
                Sign out
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="p-2 px-3 bg-muted text-sm flex flex-wrap items-center gap-1.5">
          <KbdGroup>
            <Kbd className="bg-background">↑/↓</Kbd>
          </KbdGroup>
          <span>to navigate.</span>
        </div>
      </CommandDialog>
    </>
  )
}
