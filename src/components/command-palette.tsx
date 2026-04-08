import { useEffect, useState } from "react"
import { LayoutDashboard, Users, BarChart2, FolderKanban, Settings, Bell, User, LogOut } from "lucide-react"
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

export function CommandPalette() {
  const { signOut } = useAuth()
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

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 w-48 justify-between px-3 text-muted-foreground font-normal text-sm"
      >
        <span>Search...</span>
        <KbdGroup className="hidden sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => setOpen(false)}>
                <LayoutDashboard />
                Dashboard
              </CommandItem>
              <CommandItem onSelect={() => setOpen(false)}>
                <FolderKanban />
                Projects
              </CommandItem>
              <CommandItem onSelect={() => setOpen(false)}>
                <Users />
                Team
              </CommandItem>
              <CommandItem onSelect={() => setOpen(false)}>
                <BarChart2 />
                Analytics
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Account">
              <CommandItem onSelect={() => setOpen(false)}>
                <User />
                Profile
                <CommandShortcut>⇧⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => setOpen(false)}>
                <Settings />
                Settings
              </CommandItem>
              <CommandItem onSelect={() => setOpen(false)}>
                <Bell />
                Notifications
              </CommandItem>
              <CommandItem onSelect={() => { setOpen(false); signOut() }}>
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
