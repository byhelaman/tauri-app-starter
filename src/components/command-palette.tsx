import { useEffect, useState } from "react"
import { LayoutDashboard, Users, BarChart2, FolderKanban, Settings, Bell, User, LogOut } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

interface CommandPaletteProps {
  onOpenProfile?: () => void
  onOpenSettings?: () => void
  onOpenNotifications?: () => void
}

export function CommandPalette({ onOpenProfile, onOpenSettings, onOpenNotifications }: CommandPaletteProps) {
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
        className="h-8 w-48 justify-between px-3 text-muted-foreground font-normal text-sm"
      >
        <span>Search...</span>
        <KbdGroup className="hidden sm:flex">
          <Kbd>⌘K</Kbd>
        </KbdGroup>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
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
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Account">
              <CommandItem onSelect={() => run(onOpenProfile)}>
                <User />
                Profile
                <CommandShortcut>⇧⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(onOpenSettings)}>
                <Settings />
                Settings
                <CommandShortcut>⌘,</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(onOpenNotifications)}>
                <Bell />
                Notifications
              </CommandItem>
              <CommandItem onSelect={() => run(signOut)}>
                <LogOut />
                Sign out
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
