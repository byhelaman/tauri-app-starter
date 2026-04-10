import { useEffect, useState } from "react"
import { getVersion, getTauriVersion } from "@tauri-apps/api/app"
import { useUpdaterContext } from "@/components/updater-context"
import { STORAGE_KEY_URL, STORAGE_KEY_ANON } from "@/lib/supabase"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldContent,
  FieldGroup,
} from "@/components/ui/field"
import { Separator } from "./ui/separator"
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

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function SettingRow({
  id,
  label,
  description,
  defaultChecked = false,
}: {
  id: string
  label: string
  description?: string
  defaultChecked?: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked)
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={setChecked} />
    </Field>
  )
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { checkForUpdates, isChecking, simulateUpdate } = useUpdaterContext()
  const [appVersion, setAppVersion] = useState("")
  const [tauriVersion, setTauriVersion] = useState("")

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => { })
    getTauriVersion().then(setTauriVersion).catch(() => { })
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md!">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your preferences.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex flex-col min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="application">Application</TabsTrigger>
          </TabsList>

          <DialogBody className="mt-1 p-1">
            <TabsContent value="general">
              <FieldGroup>
                <SettingRow
                  id="launch-at-login"
                  label="Launch at login"
                  description="Start the app automatically when you sign in to Windows"
                />
                <SettingRow
                  id="start-minimized"
                  label="Start minimized"
                  description="Launch in the background without showing the window"
                />
                <SettingRow
                  id="close-to-tray"
                  label="Close to system tray"
                  description="Keep the app running in the background when closed"
                  defaultChecked
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="notifications">
              <FieldGroup>
                <SettingRow
                  id="email-notif"
                  label="Email notifications"
                  description="Receive updates via email"
                  defaultChecked
                />
                <SettingRow
                  id="push-notif"
                  label="Push notifications"
                  description="Notify me about activity"
                />
                <SettingRow
                  id="digest"
                  label="Weekly digest"
                  description="Summary of activity every Monday"
                  defaultChecked
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="privacy">
              <FieldGroup>
                <SettingRow
                  id="online-status"
                  label="Show online status"
                  description="Let others see when you're active"
                  defaultChecked
                />
                <SettingRow
                  id="analytics"
                  label="Usage analytics"
                  description="Help improve the app with anonymous data"
                  defaultChecked
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="application">
              <div className="flex flex-col gap-4">
                <FieldGroup>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>Auto-update</FieldLabel>
                      <FieldDescription>Download and install updates automatically</FieldDescription>
                    </FieldContent>
                    <Switch id="auto-update" defaultChecked />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>Check for updates</FieldLabel>
                      <FieldDescription>Look for a newer version right now</FieldDescription>
                    </FieldContent>
                    <Button variant="outline" size="sm" onClick={checkForUpdates} disabled={isChecking}>
                      {isChecking ? "Checking..." : "Check"}
                    </Button>
                  </Field>
                </FieldGroup>

                <Button variant="outline" className="w-full text-muted-foreground" onClick={simulateUpdate}>
                  [Demo] Simulate update
                </Button>

                <FieldGroup>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>Reset to defaults</FieldLabel>
                      <FieldDescription>Clears all local data and restores preferences to their defaults</FieldDescription>
                    </FieldContent>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">Reset</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will clear all local data and restore all preferences to their defaults. The app will reload.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => {
                            const supabaseUrl = localStorage.getItem(STORAGE_KEY_URL)
                            const supabaseAnon = localStorage.getItem(STORAGE_KEY_ANON)
                            localStorage.clear()
                            if (supabaseUrl) localStorage.setItem(STORAGE_KEY_URL, supabaseUrl)
                            if (supabaseAnon) localStorage.setItem(STORAGE_KEY_ANON, supabaseAnon)
                            window.location.reload()
                          }}>
                            Reset
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </Field>
                </FieldGroup>

                <Separator />

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">About</p>
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {appVersion && <span>Version v{appVersion}</span>}
                      {tauriVersion && <span>Tauri v{tauriVersion}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">Legal</p>
                    <div className="flex flex-col gap-1">
                      {[
                        { label: "License Terms", href: "#" },
                        { label: "Privacy Statement", href: "#" },
                        { label: "Terms of Service", href: "#" },
                      ].map(({ label, href }) => (
                        <a key={label} href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
                          {label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">© 2026 Your Company. All rights reserved.</p>
              </div>
            </TabsContent>
          </DialogBody>
        </Tabs>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
