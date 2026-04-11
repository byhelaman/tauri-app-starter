import { useTheme } from "next-themes"
import { toast } from "sonner"
import { FileText, HelpCircle, KeyboardIcon, LogOutIcon, MonitorIcon, MoonIcon, Palette, SettingsIcon, ShieldIcon, SunIcon, User } from "lucide-react"
import { getInitials } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface UserNavProps {
  onOpenProfile?: () => void
  onOpenSettings?: () => void
  onOpenSystem?: () => void
  onOpenShortcuts?: () => void
}

export function UserNav({ onOpenProfile, onOpenSettings, onOpenSystem, onOpenShortcuts }: UserNavProps) {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="User menu">
          <Avatar>
            <AvatarFallback>{getInitials(user?.email ?? "?")}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onOpenProfile}>
            <User />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSettings}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSystem}>
            <ShieldIcon />
            System
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <SunIcon />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <MoonIcon />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <MonitorIcon />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => toast.info("Help center coming soon")}>
            <HelpCircle />
            Help & Support
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toast.info("Documentation coming soon")}>
            <FileText />
            Documentation
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenShortcuts}>
            <KeyboardIcon />
            Shortcuts
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOutIcon />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
