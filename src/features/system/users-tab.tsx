import { useDeferredValue, useMemo, useState } from "react"
import { toast } from "sonner"
import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { ViewProfileDialog } from "./user-profile-dialog"
import { InviteUserDialog } from "./invite-user-dialog"
import { RemoveUserAlert } from "./remove-user-alert"
import { ResetPasswordDialog } from "./reset-password-dialog"

interface UsersTabProps {
    users: SystemUser[]
    roles: RoleDefinition[]
    actorLevel: number
    onUpdateRole: (userId: string, role: string) => Promise<void>
    onUpdateDisplayName: (userId: string, displayName: string) => Promise<void>
    onUpdateEmail: (userId: string, email: string) => Promise<void>
    onRemoveUser: (userId: string) => Promise<void>
    onInviteUser: (name: string, email: string, role: string) => Promise<void>
    onResetPassword: (userId: string, newPassword: string) => Promise<void>
    canManageUsers: boolean
    loading?: boolean
}

export function UsersTab({ users, roles, actorLevel, onUpdateRole, onUpdateDisplayName, onUpdateEmail, onRemoveUser, onInviteUser, onResetPassword, canManageUsers, loading }: UsersTabProps) {
    const [search, setSearch] = useState("")
    const [showInvite, setShowInvite] = useState(false)
    const [profileUser, setProfileUser] = useState<SystemUser | null>(null)
    const [resetPasswordUser, setResetPasswordUser] = useState<SystemUser | null>(null)
    const [removeUser, setRemoveUser] = useState<SystemUser | null>(null)
    const [inviteBusy, setInviteBusy] = useState(false)
    const [roleBusy, setRoleBusy] = useState(false)
    const [resetBusy, setResetBusy] = useState(false)
    const [removeBusy, setRemoveBusy] = useState(false)

    const assignableRoles = roles.filter(r => r.level < actorLevel)

    // Deriva el usuario del diálogo desde el array vivo para reflejar cambios optimistas.
    const profileUserLive = profileUser ? (users.find(u => u.id === profileUser.id) ?? null) : null

    const deferredSearch = useDeferredValue(search)

    const filtered = useMemo(() => users.filter(
        (u) =>
            u.displayName.toLowerCase().includes(deferredSearch.toLowerCase()) ||
            u.email.toLowerCase().includes(deferredSearch.toLowerCase())
    ), [users, deferredSearch])

    async function handleRoleChange(userId: string, role: string) {
        setRoleBusy(true)
        try {
            await onUpdateRole(userId, role)
        } finally {
            setRoleBusy(false)
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
                roles={assignableRoles}
                canManageUsers={canManageUsers}
                busy={inviteBusy}
            />
            <ViewProfileDialog
                user={profileUserLive}
                roles={roles}
                actorLevel={actorLevel}
                onOpenChange={(open) => { if (!open) setProfileUser(null) }}
                onUpdateDisplayName={onUpdateDisplayName}
                onUpdateEmail={onUpdateEmail}
                onUpdateRole={onUpdateRole}
                canManageUsers={canManageUsers}
            />
            <ResetPasswordDialog
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
                                                <SelectItem key={r.name} value={r.name} disabled={r.level >= actorLevel}>{r.name}</SelectItem>
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
                                            <DropdownMenuItem onClick={() => setRemoveUser(user)} disabled={!canManageUsers || removeBusy}>
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
                            <ContextMenuItem onSelect={() => setRemoveUser(user)} disabled={!canManageUsers || removeBusy}>
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
