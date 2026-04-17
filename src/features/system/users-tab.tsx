import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { getInitials } from "@/lib/utils"
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { RoleDefinition, SystemUser } from "./types"

const updateProfileSchema = z.object({
    displayName: z.string().min(1, "Required"),
})
type UpdateProfileValues = z.infer<typeof updateProfileSchema>

const inviteSchema = z.object({
    name: z.string().min(1, "Required"),
    email: z.string().email("Invalid email"),
    role: z.string().min(1, "Required"),
})
type InviteValues = z.infer<typeof inviteSchema>

const resetPasswordSchema = z.object({
    newPassword: z.string().min(8, "Must be at least 8 characters"),
})
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

interface InviteUserDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onInviteUser: (name: string, email: string, role: string) => Promise<void>
    roles: RoleDefinition[]
    canManageUsers: boolean
    busy?: boolean
}

function InviteUserDialog({ open, onOpenChange, onInviteUser, roles, canManageUsers, busy }: InviteUserDialogProps) {
    const { control, handleSubmit, reset } = useForm<InviteValues>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { name: "", email: "", role: "guest" },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    async function onSubmit(values: InviteValues) {
        await onInviteUser(values.name, values.email, values.role)
        handleClose(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Invite user</DialogTitle>
                    <DialogDescription>Create the account and send an onboarding email.</DialogDescription>
                </DialogHeader>
                <form className="contents" onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup>
                        <Controller
                            name="name"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Display name</FieldLabel>
                                    <Input {...field} placeholder="John Smith" aria-invalid={fieldState.invalid} disabled={!canManageUsers || busy} />
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
                                    <Input {...field} type="email" placeholder="john@company.com" aria-invalid={fieldState.invalid} disabled={!canManageUsers || busy} />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                        <Controller
                            name="role"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Role</FieldLabel>
                                    <Select value={field.value} onValueChange={field.onChange} disabled={!canManageUsers || busy}>
                                        <SelectTrigger aria-invalid={fieldState.invalid}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                {roles.map((role) => (
                                                    <SelectItem key={role.name} value={role.name}>{role.name}</SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter showCloseButton>
                        <Button type="submit" disabled={!canManageUsers || busy}>Send invite</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

interface ViewProfileDialogProps {
    user: SystemUser | null
    onOpenChange: (open: boolean) => void
    onUpdateDisplayName: (userId: string, displayName: string) => Promise<void>
    canManageUsers: boolean
    busy?: boolean
}

function ViewProfileDialog({ user, onOpenChange, onUpdateDisplayName, canManageUsers, busy }: ViewProfileDialogProps) {
    const { control, handleSubmit, reset } = useForm<UpdateProfileValues>({
        resolver: zodResolver(updateProfileSchema),
        values: user ? { displayName: user.displayName } : { displayName: "" },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    async function onSubmit(values: UpdateProfileValues) {
        if (!user) return
        await onUpdateDisplayName(user.id, values.displayName)
    }

    return (
        <Dialog open={!!user} onOpenChange={handleClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Profile</DialogTitle>
                    <DialogDescription>User details and account information.</DialogDescription>
                </DialogHeader>
                {user && (
                    <form className="contents" onSubmit={handleSubmit(onSubmit)}>
                        <FieldGroup>
                            <Field>
                                <FieldLabel>Avatar</FieldLabel>
                                <div className="flex items-center gap-4">
                                    <Avatar className="size-18">
                                        <AvatarFallback className="text-lg">{getInitials(user.displayName || user.email)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            type="button"
                                            onClick={() => toast.info("Photo upload coming soon")}
                                            disabled={!canManageUsers || busy}
                                        >
                                            Upload photo
                                        </Button>
                                    </div>
                                </div>
                            </Field>
                            <Controller
                                name="displayName"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Display name</FieldLabel>
                                        <Input {...field} aria-invalid={fieldState.invalid} disabled={!canManageUsers || busy} />
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />
                            <Field>
                                <FieldLabel>Email</FieldLabel>
                                <Input value={user.email} disabled />
                            </Field>
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
                            <Button type="submit" disabled={!canManageUsers || busy}>Save</Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}

interface RemoveUserAlertProps {
    user: SystemUser | null
    onOpenChange: (open: boolean) => void
    onConfirm: (userId: string) => Promise<void>
    busy?: boolean
}

function RemoveUserAlert({ user, onOpenChange, onConfirm, busy }: RemoveUserAlertProps) {
    return (
        <AlertDialog open={!!user} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove user?</AlertDialogTitle>
                    <AlertDialogDescription>
                        <span className="font-medium">{user?.displayName || user?.email}</span> will be removed from the workspace. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        onClick={() => user ? void onConfirm(user.id) : undefined}
                        disabled={busy}
                    >
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

interface ResetPasswordAlertProps {
    user: SystemUser | null
    onOpenChange: (open: boolean) => void
    onConfirm: (userId: string, newPassword: string) => Promise<void>
    busy?: boolean
}

function ResetPasswordAlert({ user, onOpenChange, onConfirm, busy }: ResetPasswordAlertProps) {
    const { control, handleSubmit, reset } = useForm<ResetPasswordValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { newPassword: "" },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    async function onSubmit(values: ResetPasswordValues) {
        if (!user) return
        await onConfirm(user.id, values.newPassword)
        handleClose(false)
    }

    return (
        <Dialog open={!!user} onOpenChange={handleClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Reset password</DialogTitle>
                    <DialogDescription>
                        Set a new password for <span className="font-medium">{user?.email}</span>.
                    </DialogDescription>
                </DialogHeader>
                <form className="contents" onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup>
                        <Controller
                            name="newPassword"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>New password</FieldLabel>
                                    <Input {...field} type="password" aria-invalid={fieldState.invalid} disabled={busy} />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter showCloseButton>
                        <Button type="submit" disabled={busy}>Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

interface UsersTabProps {
    users: SystemUser[]
    roles: RoleDefinition[]
    onUpdateRole: (userId: string, role: string) => Promise<void>
    onUpdateDisplayName: (userId: string, displayName: string) => Promise<void>
    onRemoveUser: (userId: string) => Promise<void>
    onInviteUser: (name: string, email: string, role: string) => Promise<void>
    onResetPassword: (userId: string, newPassword: string) => Promise<void>
    canManageUsers: boolean
    loading?: boolean
}

export function UsersTab({ users, roles, onUpdateRole, onUpdateDisplayName, onRemoveUser, onInviteUser, onResetPassword, canManageUsers, loading }: UsersTabProps) {
    const [search, setSearch] = useState("")
    const [showInvite, setShowInvite] = useState(false)
    const [profileUser, setProfileUser] = useState<SystemUser | null>(null)
    const [resetPasswordUser, setResetPasswordUser] = useState<SystemUser | null>(null)
    const [removeUser, setRemoveUser] = useState<SystemUser | null>(null)
    const [inviteBusy, setInviteBusy] = useState(false)
    const [roleBusy, setRoleBusy] = useState(false)
    const [profileBusy, setProfileBusy] = useState(false)
    const [resetBusy, setResetBusy] = useState(false)
    const [removeBusy, setRemoveBusy] = useState(false)

    const filtered = users.filter(
        (u) =>
            u.displayName.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
    )

    async function handleRoleChange(userId: string, role: string) {
        setRoleBusy(true)
        try {
            await onUpdateRole(userId, role)
        } finally {
            setRoleBusy(false)
        }
    }

    async function handleUpdateDisplayName(userId: string, displayName: string) {
        setProfileBusy(true)
        try {
            await onUpdateDisplayName(userId, displayName)
            setProfileUser(null)
        } finally {
            setProfileBusy(false)
        }
    }

    async function handleRemoveUser(userId: string) {
        setRemoveBusy(true)
        try {
            await onRemoveUser(userId)
            setRemoveUser(null)
        } finally {
            setRemoveBusy(false)
        }
    }

    async function handleInviteUser(name: string, email: string, role: string) {
        setInviteBusy(true)
        try {
            await onInviteUser(name, email, role)
            toast.success(`Invitation sent to ${email}`)
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not invite user"
            toast.error(message)
        } finally {
            setInviteBusy(false)
        }
    }

    async function handleResetPassword(userId: string, newPassword: string) {
        setResetBusy(true)
        try {
            await onResetPassword(userId, newPassword)
            toast.success("Password reset applied")
            setResetPasswordUser(null)
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not reset password"
            toast.error(message)
        } finally {
            setResetBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <InviteUserDialog
                open={showInvite}
                onOpenChange={setShowInvite}
                onInviteUser={handleInviteUser}
                roles={roles}
                canManageUsers={canManageUsers}
                busy={inviteBusy}
            />
            <ViewProfileDialog user={profileUser} onOpenChange={(open) => { if (!open) setProfileUser(null) }} onUpdateDisplayName={handleUpdateDisplayName} canManageUsers={canManageUsers} busy={profileBusy} />
            <ResetPasswordAlert
                user={resetPasswordUser}
                onOpenChange={(open) => { if (!open) setResetPasswordUser(null) }}
                onConfirm={handleResetPassword}
                busy={resetBusy}
            />
            <RemoveUserAlert
                user={removeUser}
                onOpenChange={(open) => { if (!open) setRemoveUser(null) }}
                onConfirm={handleRemoveUser}
                busy={removeBusy}
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
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInvite(true)}
                    disabled={!canManageUsers || inviteBusy}
                >
                    Invite user
                </Button>
            </div>

            <div className="divide-y text-sm">
                {filtered.map((user) => (
                    <ContextMenu key={user.id}>
                        <ContextMenuTrigger asChild>
                            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{user.displayName || "—"}</p>
                                    <p className="mt-0.5 text-sm text-muted-foreground truncate">{user.email}</p>
                                </div>
                                <Badge
                                    variant={user.status === "active" ? "outline" : "secondary"}
                                    className="shrink-0"
                                >
                                    {user.status}
                                </Badge>
                                <Select value={user.role} onValueChange={(v) => void handleRoleChange(user.id, v)} disabled={!canManageUsers || roleBusy || loading}>
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
                                        <DropdownMenuGroup>
                                            <DropdownMenuItem onClick={() => setProfileUser(user)}>View profile</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setResetPasswordUser(user)} disabled={!canManageUsers || resetBusy}>Reset password</DropdownMenuItem>
                                        </DropdownMenuGroup>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuGroup>
                                            <DropdownMenuItem variant="destructive" onClick={() => setRemoveUser(user)} disabled={!canManageUsers || removeBusy}>
                                                Remove user
                                            </DropdownMenuItem>
                                        </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                            <ContextMenuItem onSelect={() => setProfileUser(user)}>View profile</ContextMenuItem>
                            <ContextMenuItem onSelect={() => setResetPasswordUser(user)} disabled={!canManageUsers || resetBusy}>Reset password</ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem variant="destructive" onSelect={() => setRemoveUser(user)} disabled={!canManageUsers || removeBusy}>
                                Remove user
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                ))}
                {filtered.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No users found.</p>
                )}
            </div>
        </div>
    )
}
