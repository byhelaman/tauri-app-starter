import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { getInitials } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { AvatarField } from "@/components/avatar-field"
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
  DialogBody,
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

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user, claims, signOut } = useAuth()
  const { theme, setTheme } = useTheme()

  const [displayName, setDisplayName] = useState(() => user?.email?.split("@")[0] ?? "")
  const [bio, setBio] = useState("")
  const [language, setLanguage] = useState("en")
  const [twoFactor, setTwoFactor] = useState(false)
  const [activeSessions, setActiveSessions] = useState(false)
  const [saving, setSaving] = useState(false)

  const userRole = claims.userRole

  useEffect(() => {
    if (!open || !supabase) return

    void (async () => {
      const { data, error } = await supabase.rpc("get_my_profile")
      if (error) return

      const profile = data as { display_name?: string | null } | null
      setDisplayName(profile?.display_name ?? user?.email?.split("@")[0] ?? "")
    })()
  }, [open, user?.email])

  async function handleSave() {
    if (!supabase) {
      toast.error("Supabase is not configured")
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.rpc("update_my_display_name", {
        new_display_name: displayName.trim(),
      })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success("Profile updated")
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  function handleRestoreDefaults() {
    setTheme("system")
    setLanguage("en")
    toast.success("Preferences restored to defaults")
  }

  async function handleDeleteAccount() {
    if (!supabase) return
    const { error } = await supabase.rpc("delete_own_account")
    if (error) {
      toast.error(error.message)
      return
    }
    await signOut()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Manage your account settings.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex flex-col min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <DialogBody className="mt-1 py-1">

            {/* General */}
            <TabsContent value="general">
              <FieldGroup>

                <AvatarField initials={getInitials(displayName || user?.email || "?")} />

                <Field>
                  <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
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
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us a little about yourself"
                  />
                </Field>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>Role</FieldLabel>
                    <FieldDescription className="capitalize">{userRole}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </TabsContent>

            {/* Preferences */}
            <TabsContent value="preferences">
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
                <Field>
                  <FieldLabel>Language</FieldLabel>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Separator />
                <Field orientation="horizontal">
                  <FieldContent>
                      <FieldLabel>Reset preferences</FieldLabel>
                    <FieldDescription>Reset preferences to their default values.</FieldDescription>
                  </FieldContent>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">Reset</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset profile preferences?</AlertDialogTitle>
                        <AlertDialogDescription>
                          All preferences will be reset to their default values.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRestoreDefaults}>Reset</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Field>
              </FieldGroup>
            </TabsContent>

            {/* Security */}
            <TabsContent value="security">
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="2fa">Two-factor authentication</FieldLabel>
                    <FieldDescription>
                      Add an extra layer of security to your account.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="2fa"
                    checked={twoFactor}
                    onCheckedChange={(v) => {
                      setTwoFactor(v)
                      toast.success(v ? "Two-factor authentication enabled" : "Two-factor authentication disabled")
                    }}
                  />
                </Field>

                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="sessions">Active sessions</FieldLabel>
                    <FieldDescription>
                      Automatically sign out from inactive sessions.
                    </FieldDescription>
                  </FieldContent>
                  <Switch id="sessions" checked={activeSessions} onCheckedChange={setActiveSessions} />
                </Field>

                <Separator />

                <Field>
                  <FieldLabel>Password</FieldLabel>
                  <ChangePasswordDialog />
                </Field>

                <Separator />

                <Field>
                  <FieldLabel className="text-destructive">Danger zone</FieldLabel>
                  <FieldDescription>
                    Permanently delete your account and all associated data.
                  </FieldDescription>
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
                </Field>
              </FieldGroup>
            </TabsContent>
          </DialogBody>
        </Tabs>

        <DialogFooter showCloseButton>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
