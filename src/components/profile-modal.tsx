import { useTheme } from "next-themes"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChangePasswordDialog } from "@/components/change-password-dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldDescription,
  FieldContent,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item"

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase()
}

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()

  async function handleDeleteAccount() {
    const { error } = await supabase!.rpc("delete_own_account")
    if (error) {
      toast.error(error.message)
      return
    }
    await signOut()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Manage your account settings.</DialogDescription>
        </DialogHeader>

        {/* Identity */}
        <Item>
          <ItemMedia>
            <Avatar className="size-10">
              <AvatarFallback>{getInitials(user?.email ?? "?")}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{user?.email?.split("@")[0]}</ItemTitle>
            <ItemDescription>{user?.email}</ItemDescription>
          </ItemContent>
          <Badge variant="secondary">Member</Badge>
        </Item>

        <Tabs defaultValue="general">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="mt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                <Input
                  id="display-name"
                  defaultValue={user?.email?.split("@")[0]}
                  placeholder="Your display name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  defaultValue={user?.email ?? ""}
                  disabled
                />
                <FieldDescription>
                  Contact support to change your email address.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="bio">Bio</FieldLabel>
                <Input
                  id="bio"
                  placeholder="Tell us a little about yourself"
                />
              </Field>
            </FieldGroup>
          </TabsContent>

          {/* Preferences */}
          <TabsContent value="preferences" className="mt-4">
            <FieldGroup>
              <Field>
                <FieldLabel>Theme</FieldLabel>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="auto-update">Auto-update</FieldLabel>
                  <FieldDescription>Download updates automatically.</FieldDescription>
                </FieldContent>
                <Switch id="auto-update" defaultChecked />
              </Field>
              <Separator />
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel>Restore defaults</FieldLabel>
                  <FieldDescription>Reset all preferences to their default values.</FieldDescription>
                </FieldContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">Restore</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore default settings?</AlertDialogTitle>
                      <AlertDialogDescription>
                        All preferences will be reset to their default values.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction>Restore defaults</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Field>
            </FieldGroup>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="mt-4">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="2fa">Two-factor authentication</FieldLabel>
                  <FieldDescription>
                    Add an extra layer of security to your account.
                  </FieldDescription>
                </FieldContent>
                <Switch id="2fa" />
              </Field>

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="sessions">Active sessions</FieldLabel>
                  <FieldDescription>
                    Automatically sign out from inactive sessions.
                  </FieldDescription>
                </FieldContent>
                <Switch id="sessions" defaultChecked />
              </Field>

              <Separator />

              <Field>
                <FieldLabel>Password</FieldLabel>
                <ChangePasswordDialog />
              </Field>

              <Separator />

              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-destructive">Danger zone</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your account and all associated data.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      Delete account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your account and all
                        associated data. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={handleDeleteAccount}>
                        Yes, delete my account
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </FieldGroup>
          </TabsContent>
        </Tabs>

        <DialogFooter showCloseButton>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
