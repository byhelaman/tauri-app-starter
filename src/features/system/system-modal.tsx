import { useSystemData } from "@/features/system/hooks/useSystemData"
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
import * as api from "@/features/system/api"

interface SystemModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SystemModal({ open, onOpenChange }: SystemModalProps) {
    const {
        data,
        isLoading,
        canViewUsers,
        canManageUsers,
        canManageRoles,
        canViewSystem,
        claims,
        actions
    } = useSystemData(open)

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
                                        users={data.users}
                                        roles={data.roles}
                                        actorLevel={claims.hierarchyLevel}
                                        onUpdateRole={actions.updateUserRole}
                                        onUpdateDisplayName={actions.updateUserDisplayName}
                                        onUpdateEmail={api.updateUserEmail}
                                        onRemoveUser={actions.removeUser}
                                        onInviteUser={api.inviteUser}
                                        onResetPassword={api.resetPasswordForUser}
                                        canManageUsers={canManageUsers}
                                        loading={isLoading}
                                    />
                                </TabsContent>
                            )}

                            <TabsContent value="roles">
                                <RolesTab
                                    roles={data.roles}
                                    permissions={data.permissions}
                                    matrix={data.matrix}
                                    onTogglePermission={actions.togglePermission}
                                    onAddRole={actions.addRole}
                                    onDuplicateRole={actions.duplicateRole}
                                    onEditRole={actions.editRole}
                                    onRemoveRole={actions.removeRole}
                                    canManageRoles={canManageRoles}
                                    loading={isLoading}
                                />
                            </TabsContent>
 
                            <TabsContent value="integrations">
                                <IntegrationsTab />
                            </TabsContent>
 
                            <TabsContent value="audit">
                                <AuditTab entries={data.auditEntries} />
                            </TabsContent>
                        </DialogBody>
                    </Tabs>
                )}

                <DialogFooter showCloseButton />
            </DialogContent>
        </Dialog>
    )
}
