import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldError,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { RoleDefinition, SystemUser } from "./types"

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
})
type InviteValues = z.infer<typeof inviteSchema>

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

// ─── Invite User Dialog ──────────────────────────────────────────────────────

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInviteUser: (name: string, email: string) => void
}

function InviteUserDialog({ open, onOpenChange, onInviteUser }: InviteUserDialogProps) {
  const { control, handleSubmit, reset } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "" },
  })

  function handleClose(v: boolean) {
    onOpenChange(v)
    if (!v) reset()
  }

  function onSubmit(values: InviteValues) {
    onInviteUser(values.name, values.email)
    toast.success(`Invitation sent to ${values.email}`)
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Invite user
          </DialogTitle>
          <DialogDescription>Send an invitation to a new team member.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Full name</FieldLabel>
                  <Input {...field} placeholder="John Smith" aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="email"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Email</FieldLabel>
                  <Input {...field} type="email" placeholder="john@company.com" aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter showCloseButton className="mt-4">
            <Button type="submit">Send invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── View Profile Dialog ─────────────────────────────────────────────────────

const updateEmailSchema = z.object({
  email: z.string().email("Invalid email"),
})
type UpdateEmailValues = z.infer<typeof updateEmailSchema>

interface ViewProfileDialogProps {
  user: SystemUser | null
  onOpenChange: (open: boolean) => void
  onUpdateEmail: (userId: number, email: string) => void
}

function ViewProfileDialog({ user, onOpenChange, onUpdateEmail }: ViewProfileDialogProps) {
  const { control, handleSubmit, reset } = useForm<UpdateEmailValues>({
    resolver: zodResolver(updateEmailSchema),
    values: user ? { email: user.email } : { email: "" },
  })

  function handleClose(v: boolean) {
    onOpenChange(v)
    if (!v) reset()
  }

  function onSubmit(values: UpdateEmailValues) {
    if (!user) return
    onUpdateEmail(user.id, values.email)
  }

  return (
    <Dialog open={!!user} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>User details and account information.</DialogDescription>
        </DialogHeader>
        {user && (
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel>Avatar</FieldLabel>
                <div className="flex items-center gap-4">
                  <Avatar className="size-18">
                    <AvatarFallback className="text-lg">{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => toast.info("Photo upload coming soon")}>Upload photo</Button>
                  </div>
                </div>
              </Field>
              <Field>
                <FieldLabel>Full name</FieldLabel>
                <Input value={user.name} disabled />
              </Field>
              <Controller
                name="email"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Email</FieldLabel>
                    <Input {...field} type="email" aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <div className="flex gap-3">
                <Field className="flex-1">
                  <FieldLabel>Role</FieldLabel>
                  <Input value={user.role} disabled />
                </Field>
                <Field className="w-32">
                  <FieldLabel>Status</FieldLabel>
                  <Input value={user.status} disabled />
                </Field>
              </div>
            </FieldGroup>
            <DialogFooter showCloseButton className="mt-4">
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Reset Password Dialog ───────────────────────────────────────────────────

interface ResetPasswordDialogProps {
  user: SystemUser | null
  onOpenChange: (open: boolean) => void
}

function ResetPasswordDialog({ user, onOpenChange }: ResetPasswordDialogProps) {
  const { control, handleSubmit, reset } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  })

  function handleClose(v: boolean) {
    onOpenChange(v)
    if (!v) reset()
  }

  function onSubmit(_values: ResetPasswordValues) {
    toast.success(`Password reset for ${user?.name}`)
    handleClose(false)
  }

  return (
    <Dialog open={!!user} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <span className="font-medium">{user?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="newPassword"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>New password</FieldLabel>
                  <Input {...field} type="password" aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="confirmPassword"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Confirm password</FieldLabel>
                  <Input {...field} type="password" aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter showCloseButton className="mt-4">
            <Button type="submit">Update password</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Remove User AlertDialog ─────────────────────────────────────────────────

interface RemoveUserAlertProps {
  user: SystemUser | null
  onOpenChange: (open: boolean) => void
  onConfirm: (userId: number) => void
}

function RemoveUserAlert({ user, onOpenChange, onConfirm }: RemoveUserAlertProps) {
  return (
    <AlertDialog open={!!user} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove user?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium">{user?.name}</span> will be removed from the workspace. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => user && onConfirm(user.id)}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

interface UsersTabProps {
  users: SystemUser[]
  roles: RoleDefinition[]
  onUpdateRole: (userId: number, role: string) => void
  onUpdateEmail: (userId: number, email: string) => void
  onRemoveUser: (userId: number) => void
  onInviteUser: (name: string, email: string) => void
}

export function UsersTab({ users, roles, onUpdateRole, onUpdateEmail, onRemoveUser, onInviteUser }: UsersTabProps) {
  const [search, setSearch] = useState("")
  const [showInvite, setShowInvite] = useState(false)
  const [profileUser, setProfileUser] = useState<SystemUser | null>(null)
  const [resetUser, setResetUser] = useState<SystemUser | null>(null)
  const [removeUser, setRemoveUser] = useState<SystemUser | null>(null)

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-3">
      <InviteUserDialog open={showInvite} onOpenChange={setShowInvite} onInviteUser={onInviteUser} />
      <ViewProfileDialog user={profileUser} onOpenChange={(open) => { if (!open) setProfileUser(null) }} onUpdateEmail={onUpdateEmail} />
      <ResetPasswordDialog user={resetUser} onOpenChange={(open) => { if (!open) setResetUser(null) }} />
      <RemoveUserAlert
        user={removeUser}
        onOpenChange={(open) => { if (!open) setRemoveUser(null) }}
        onConfirm={(id) => { onRemoveUser(id); setRemoveUser(null) }}
      />

      <div className="flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search users..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">{filtered.length} results</InputGroupAddon>
          )}
        </InputGroup>
        <Button variant="outline" size="sm" onClick={() => setShowInvite(true)}>
          Invite user
        </Button>
      </div>

      <div className="rounded-lg border divide-y text-sm">
        {filtered.map((user) => (
          <div key={user.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground truncate">{user.email}</p>
            </div>
            <Badge
              variant={user.status === "active" ? "outline" : "secondary"}
              className="shrink-0"
            >
              {user.status}
            </Badge>
            <Select value={user.role} onValueChange={(v) => onUpdateRole(user.id, v)}>
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roles.map((r) => (
                    <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs">
                  <MoreHorizontalIcon data-icon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setProfileUser(user)}>View profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setResetUser(user)}>Reset password</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onClick={() => setRemoveUser(user)}>
                    Remove user
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No users found.</p>
        )}
      </div>
    </div>
  )
}
