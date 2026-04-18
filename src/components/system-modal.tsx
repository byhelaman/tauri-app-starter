import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogBody,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { UsersTab } from "@/features/system/users-tab"
import { RolesTab } from "@/features/system/roles-tab"
import { AuditTab } from "@/features/system/audit-tab"
import { IntegrationsTab } from "@/features/system/integrations-tab"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import type { AuditEntry, PermissionDefinition, PermissionMatrix, RoleDefinition, SystemUser } from "@/features/system/types"

interface SystemModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface RpcUser {
    id: string
    email: string
    display_name: string | null
    role: string
    hierarchy_level: number
    created_at: string
    last_login_at: string | null
}

interface RpcRole {
    name: string
    description: string | null
    hierarchy_level: number
}

interface RpcPermission {
    name: string
    description: string | null
    min_role_level: number
}

interface RpcRolePermissionMatrixRow {
    role: string
    permission: string
}

interface RpcAuditEntry {
    id: number
    action: string
    description: string
    actor_email: string
    target_id: string | null
    metadata: Record<string, unknown>
    created_at: string
}


export function SystemModal({ open, onOpenChange }: SystemModalProps) {
    const { hasPermission, claims } = useAuth()
    const [users, setUsers] = useState<SystemUser[]>([])
    const [roles, setRoles] = useState<RoleDefinition[]>([])
    const [permissions, setPermissions] = useState<PermissionDefinition[]>([])
    const [matrix, setMatrix] = useState<PermissionMatrix>({})
    const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(false)

    const canManageUsers = hasPermission("users.manage")
    const canViewUsers = hasPermission("users.view") || canManageUsers || claims.hierarchyLevel >= 80
    const canManageRoles = hasPermission("system.manage") || claims.hierarchyLevel >= 100
    const canViewSystem = hasPermission("system.view") || canViewUsers || canManageRoles

    const fetchSystemData = useCallback(async () => {
        if (!supabase || !canViewSystem) return
        const client = supabase

        setLoading(true)
        try {
            const usersPromise = canViewUsers
                ? client.rpc("get_all_users")
                : Promise.resolve({ data: [] as RpcUser[], error: null })

            const [usersResult, rolesResult, permissionsResult, matrixResult, auditResult] = await Promise.allSettled([
                usersPromise,
                client.rpc("get_all_roles"),
                client.rpc("get_all_permissions"),
                client.rpc("get_role_permission_matrix"),
                client.rpc("get_audit_log", { p_limit: 100, p_offset: 0 }),
            ])

            // Unwrap settled results — report the first rejection but continue rendering available data
            if (usersResult.status === "rejected") throw usersResult.reason
            if (rolesResult.status === "rejected") throw rolesResult.reason
            if (permissionsResult.status === "rejected") throw permissionsResult.reason
            if (matrixResult.status === "rejected") throw matrixResult.reason
            if (auditResult.status === "rejected") throw auditResult.reason

            const usersRes = usersResult.value
            const rolesRes = rolesResult.value
            const permissionsRes = permissionsResult.value
            const matrixRes = matrixResult.value
            const auditRes = auditResult.value

            if (usersRes.error) throw usersRes.error
            if (rolesRes.error) throw rolesRes.error
            if (permissionsRes.error) throw permissionsRes.error
            if (matrixRes.error) throw matrixRes.error
            if (auditRes.error) throw auditRes.error

            const nextRoles: RoleDefinition[] = ((rolesRes.data ?? []) as RpcRole[])
                .map((role) => ({
                    name: role.name,
                    level: role.hierarchy_level,
                    description: role.description ?? "",
                    builtin: role.name === "owner" || role.name === "guest",
                }))
                .sort((a, b) => b.level - a.level)

            const nextPermissions: PermissionDefinition[] = ((permissionsRes.data ?? []) as RpcPermission[])
                .map((permission) => ({
                    name: permission.name,
                    description: permission.description ?? "",
                    minRoleLevel: permission.min_role_level,
                }))

            const permissionMatrix: PermissionMatrix = {}
            for (const role of nextRoles) {
                permissionMatrix[role.name] = Object.fromEntries(nextPermissions.map((p) => [p.name, false]))
            }

            const matrixRows = (matrixRes.data ?? []) as RpcRolePermissionMatrixRow[]
            for (const row of matrixRows) {
                if (permissionMatrix[row.role] && row.permission in permissionMatrix[row.role]) {
                    permissionMatrix[row.role][row.permission] = true
                }
            }

            const ownerRole = nextRoles.find((role) => role.level >= 100)
            if (ownerRole) {
                permissionMatrix[ownerRole.name] = Object.fromEntries(nextPermissions.map((p) => [p.name, true]))
            }

            const nextUsers: SystemUser[] = ((usersRes.data ?? []) as RpcUser[]).map((user) => ({
                id: user.id,
                displayName: user.display_name ?? user.email.split("@")[0],
                email: user.email,
                role: user.role,
                status: user.last_login_at ? "active" : "inactive",
                hierarchyLevel: user.hierarchy_level,
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at,
            }))

            const nextAudit: AuditEntry[] = ((auditRes.data ?? []) as RpcAuditEntry[]).map((e) => ({
                id: e.id,
                action: e.action as AuditEntry["action"],
                description: e.description,
                actorEmail: e.actor_email,
                targetId: e.target_id,
                metadata: e.metadata ?? {},
                createdAt: e.created_at,
            }))

            setRoles(nextRoles)
            setPermissions(nextPermissions)
            setMatrix(permissionMatrix)
            setUsers(nextUsers)
            setAuditEntries(nextAudit)
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not load system data"
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }, [canViewSystem, canViewUsers])

    useEffect(() => {
        if (!open) return
        void fetchSystemData()
    }, [open, fetchSystemData])

    useEffect(() => {
        if (!supabase || !open || !canViewSystem) return
        const client = supabase

        let refreshTimer: ReturnType<typeof setTimeout> | undefined
        const scheduleRefresh = () => {
            if (refreshTimer) clearTimeout(refreshTimer)
            refreshTimer = setTimeout(() => {
                void fetchSystemData()
            }, 250)
        }

        const channel = client
            .channel("system-modal-rbac-sync")
            .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "roles" }, scheduleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "permissions" }, scheduleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" }, scheduleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, scheduleRefresh)

        channel.subscribe((status) => {
            if (status === "CHANNEL_ERROR") {
                console.error("System modal realtime channel failed")
            }
        })

        return () => {
            if (refreshTimer) clearTimeout(refreshTimer)
            void client.removeChannel(channel)
        }
    }, [open, canViewSystem, fetchSystemData])

    async function updateUserRole(userId: string, role: string) {
        if (!supabase) return
        const original = users.find(u => u.id === userId)?.role
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
        const { error } = await supabase.rpc("update_user_role", { target_user_id: userId, new_role: role })
        if (error) {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: original ?? u.role } : u))
            toast.error(error.message)
            return
        }
        toast.success("User role updated")
    }

    async function updateUserDisplayName(userId: string, displayName: string) {
        if (!supabase) return
        const original = users.find(u => u.id === userId)?.displayName
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, displayName } : u))
        const { error } = await supabase.rpc("update_user_display_name", {
            target_user_id: userId,
            new_display_name: displayName,
        })
        if (error) {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, displayName: original ?? u.displayName } : u))
            toast.error(error.message)
            return
        }
        toast.success("User profile updated")
    }

    async function removeUser(userId: string) {
        if (!supabase) return
        const snapshot = users
        setUsers(prev => prev.filter(u => u.id !== userId))
        const { error } = await supabase.rpc("delete_user", { target_user_id: userId })
        if (error) {
            setUsers(snapshot)
            toast.error(error.message)
            return
        }
        toast.success("User removed")
    }

    async function inviteUser(name: string, email: string, role: string) {
        if (!supabase) throw new Error("Supabase is not configured")

        const { data, error } = await supabase.functions.invoke("admin-invite-user", {
            body: { email, displayName: name, role },
        })

        if (error) throw new Error(error.message)

        const response = (data ?? {}) as { success?: boolean; message?: string }
        if (!response.success) throw new Error(response.message ?? "Invite failed")
    }

    async function updateUserEmail(userId: string, newEmail: string) {
        if (!supabase) {
            throw new Error("Supabase is not configured")
        }

        const { data, error } = await supabase.functions.invoke("admin-update-user-email", {
            body: { targetUserId: userId, newEmail },
        })

        if (error) {
            throw new Error(error.message)
        }

        const response = (data ?? {}) as { success?: boolean; message?: string }
        if (!response.success) {
            throw new Error(response.message ?? "Email update failed")
        }

        toast.success("Email updated")
    }

    async function resetPasswordForUser(userId: string, newPassword: string) {
        if (!supabase) {
            throw new Error("Supabase is not configured")
        }

        const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
            body: {
                targetUserId: userId,
                newPassword,
            },
        })

        if (error) {
            throw new Error(error.message)
        }

        const response = (data ?? {}) as { success?: boolean; message?: string }
        if (!response.success) {
            throw new Error(response.message ?? "Password reset failed")
        }
    }

    async function duplicateRole(sourceName: string, newName: string) {
        if (!supabase) return
        const { error } = await supabase.rpc("duplicate_role", {
            p_source_role: sourceName,
            p_new_name: newName,
        })
        if (error) {
            toast.error(error.message)
            return
        }
        toast.success("Role duplicated")
    }

    async function addRole(role: RoleDefinition) {
        if (!supabase) return
        const { error } = await supabase.rpc("create_role", {
            role_name: role.name,
            role_description: role.description,
            role_level: role.level,
        })
        if (error) {
            toast.error(error.message)
            return
        }
        toast.success("Role created")
    }

    async function editRole(original: string, updated: Partial<RoleDefinition>) {
        if (!supabase) return
        const { error } = await supabase.rpc("update_role", {
            role_name: original,
            new_name: updated.name ?? null,
            new_description: updated.description ?? null,
            new_level: updated.level ?? null,
        })
        if (error) {
            toast.error(error.message)
            return
        }
        toast.success("Role updated")
    }

    async function removeRole(name: string) {
        if (!supabase) return
        const { data, error } = await supabase.rpc("delete_role", { role_name: name })
        if (error) {
            toast.error(error.message)
            return
        }

        const details = (data ?? {}) as { downgraded_users?: number; fallback_role?: string }
        if (typeof details.downgraded_users === "number" && details.downgraded_users > 0) {
            toast.success(`Role deleted. ${details.downgraded_users} users downgraded to ${details.fallback_role}.`)
        } else {
            toast.success("Role deleted")
        }
    }

    async function togglePermission(role: string, permission: string, enabled: boolean) {
        if (!supabase) return

        const rpc = enabled ? "assign_role_permission" : "remove_role_permission"
        const { error } = await supabase.rpc(rpc, { target_role: role, permission_name: permission })

        if (error) {
            toast.error(error.message)
            return
        }

        setMatrix((prev) => ({
            ...prev,
            [role]: { ...prev[role], [permission]: enabled },
        }))
        toast.success(enabled ? "Permission assigned" : "Permission removed")
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg!">
                <DialogHeader>
                    <DialogTitle>System</DialogTitle>
                    <DialogDescription>Manage users, roles, permissions and audit logs.</DialogDescription>
                </DialogHeader>

                {!canViewSystem ? (
                    <DialogBody className="text-sm text-muted-foreground">
                        You do not have permission to access this section.
                    </DialogBody>
                ) : (
                    <Tabs defaultValue={canViewUsers ? "users" : "roles"} className="flex flex-col min-h-0 flex-1">
                        <TabsList className="w-full">
                            {canViewUsers && <TabsTrigger value="users">Users</TabsTrigger>}
                            <TabsTrigger value="roles">Roles & Perms</TabsTrigger>
                            <TabsTrigger value="integrations">Integrations</TabsTrigger>
                            <TabsTrigger value="audit">Audit Log</TabsTrigger>
                        </TabsList>

                        <DialogBody className="mt-1 py-1">
                            {canViewUsers && (
                                <TabsContent value="users">
                                    <UsersTab
                                        users={users}
                                        roles={roles}
                                        actorLevel={claims.hierarchyLevel}
                                        onUpdateRole={updateUserRole}
                                        onUpdateDisplayName={updateUserDisplayName}
                                        onUpdateEmail={updateUserEmail}
                                        onRemoveUser={removeUser}
                                        onInviteUser={inviteUser}
                                        onResetPassword={resetPasswordForUser}
                                        canManageUsers={canManageUsers}
                                        loading={loading}
                                    />
                                </TabsContent>
                            )}

                            <TabsContent value="roles">
                                <RolesTab
                                    roles={roles}
                                    permissions={permissions}
                                    matrix={matrix}
                                    onTogglePermission={togglePermission}
                                    onAddRole={addRole}
                                    onDuplicateRole={duplicateRole}
                                    onEditRole={editRole}
                                    onRemoveRole={removeRole}
                                    canManageRoles={canManageRoles}
                                    loading={loading}
                                />
                            </TabsContent>

                            <TabsContent value="integrations">
                                <IntegrationsTab />
                            </TabsContent>

                            <TabsContent value="audit">
                                <AuditTab entries={auditEntries} />
                            </TabsContent>
                        </DialogBody>
                    </Tabs>
                )}

                <DialogFooter showCloseButton />
            </DialogContent>
        </Dialog>
    )
}
