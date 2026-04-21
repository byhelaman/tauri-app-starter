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
import * as api from "@/features/system/api"

interface SystemModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
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

    const loadSystemData = useCallback(async () => {
        if (!canViewSystem) return

        setLoading(true)
        try {
            const data = await api.fetchSystemData(canViewUsers)
            setRoles(data.roles)
            setPermissions(data.permissions)
            setMatrix(data.matrix)
            setUsers(data.users)
            setAuditEntries(data.auditEntries)
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not load system data"
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }, [canViewSystem, canViewUsers])

    useEffect(() => {
        if (!open) return
        void loadSystemData()
    }, [open, loadSystemData])

    useEffect(() => {
        if (!supabase || !open || !canViewSystem) return
        const client = supabase

        let refreshTimer: ReturnType<typeof setTimeout> | undefined
        const scheduleRefresh = () => {
            if (refreshTimer) clearTimeout(refreshTimer)
            refreshTimer = setTimeout(() => {
                void loadSystemData()
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
    }, [open, canViewSystem, loadSystemData])

    async function updateUserRole(userId: string, role: string) {
        const original = users.find(u => u.id === userId)?.role
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
        const result = await api.updateUserRole(userId, role)
        if (result.error) {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: original ?? u.role } : u))
        }
    }

    async function updateUserDisplayName(userId: string, displayName: string) {
        const original = users.find(u => u.id === userId)?.displayName
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, displayName } : u))
        const result = await api.updateUserDisplayName(userId, displayName)
        if (result.error) {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, displayName: original ?? u.displayName } : u))
        }
    }

    async function removeUser(userId: string) {
        const snapshot = users
        setUsers(prev => prev.filter(u => u.id !== userId))
        const result = await api.removeUser(userId)
        if (result.error) {
            setUsers(snapshot)
        }
    }

    async function handleTogglePermission(role: string, permission: string, enabled: boolean) {
        await api.togglePermission(role, permission, enabled)
        setMatrix((prev) => ({
            ...prev,
            [role]: { ...prev[role], [permission]: enabled },
        }))
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
                                        onUpdateEmail={api.updateUserEmail}
                                        onRemoveUser={removeUser}
                                        onInviteUser={api.inviteUser}
                                        onResetPassword={api.resetPasswordForUser}
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
                                    onTogglePermission={handleTogglePermission}
                                    onAddRole={api.addRole}
                                    onDuplicateRole={api.duplicateRole}
                                    onEditRole={api.editRole}
                                    onRemoveRole={api.removeRole}
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
