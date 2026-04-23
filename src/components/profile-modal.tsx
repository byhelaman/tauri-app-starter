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
import { useProfile } from "@/hooks/use-profile"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"

function ProfileSkeleton() {
  return (
    <FieldGroup>
      <Field>
        <div className="flex items-center gap-4">
          <Skeleton className="size-18 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </Field>
      {[1, 2, 3].map((i) => (
        <Field key={i}>
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-10 w-full" />
        </Field>
      ))}
    </FieldGroup>
  )
}

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user, claims, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { profile, isLoading, actions } = useProfile()

  const [displayName, setDisplayName] = useState("")
  const [activeTab, setActiveTab] = useState("general")
  const [language, setLanguage] = useState(() => localStorage.getItem("app-language") || "en")

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name)
    }
  }, [profile])

  const userRole = claims.userRole
  const isDirty = profile?.display_name !== displayName && displayName.trim() !== ""

  function handleSave() {
    actions.updateDisplayName(displayName)
  }

  function handleRestoreDefaults() {
    setTheme("system")
    setLanguage("en")
    localStorage.setItem("app-language", "en")
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <DialogBody className="mt-1 py-1">
            {isLoading ? (
              <ProfileSkeleton />
            ) : (
              <>
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
                      <FieldDescription>This is how others will see you in the app.</FieldDescription>
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
                        disabled
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
                      <FieldDescription>Theme changes are applied immediately.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>Language</FieldLabel>
                      <Select 
                        value={language} 
                        onValueChange={(v) => {
                          setLanguage(v)
                          localStorage.setItem("app-language", v)
                          toast.success("Language preference saved locally")
                        }}
                      >
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
                    <Field orientation="horizontal" className="items-center!">
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
                    <Field orientation="horizontal" className="items-center!">
                      <FieldContent>
                        <FieldLabel htmlFor="2fa">Two-factor authentication</FieldLabel>
                        <FieldDescription>
                      Add an extra layer of security to your account.
                        </FieldDescription>
                      </FieldContent>
                      <Switch id="2fa" disabled />
                    </Field>

                    <Field orientation="horizontal" className="items-center!">
                      <FieldContent>
                        <FieldLabel htmlFor="sessions">Active sessions</FieldLabel>
                        <FieldDescription>
                          Automatically sign out from inactive sessions.
                        </FieldDescription>
                      </FieldContent>
                      <Switch id="sessions" disabled />
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
                        Permanently delete your account.
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
              </>
            )}
          </DialogBody>
        </Tabs>

        <DialogFooter showCloseButton>
          {activeTab === "general" && (
            <Button 
              onClick={handleSave} 
              disabled={!isDirty || actions.isUpdating}
            >
              {actions.isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
