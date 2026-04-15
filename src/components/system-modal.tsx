import { useState } from "react"
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
import { DEMO_USERS, INITIAL_ROLES, INITIAL_PERMISSION_MATRIX } from "@/mocks/system"
import type { PermissionMatrix, RoleDefinition, SystemUser } from "@/features/system/types"

interface SystemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SystemModal({ open, onOpenChange }: SystemModalProps) {
  const [users, setUsers] = useState<SystemUser[]>(DEMO_USERS)
  const [roles, setRoles] = useState<RoleDefinition[]>(INITIAL_ROLES)
  const [matrix, setMatrix] = useState<PermissionMatrix>(INITIAL_PERMISSION_MATRIX)

  function updateUserRole(userId: number, role: string) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
  }

  function updateUserEmail(userId: number, email: string) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, email } : u)))
  }

  function removeUser(userId: number) {
    setUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  function inviteUser(name: string, email: string) {
    const newId = Math.max(0, ...users.map((u) => u.id)) + 1
    setUsers((prev) => [...prev, { id: newId, name, email, role: "guest", status: "active" as const }])
  }

  function addRole(role: RoleDefinition) {
    setRoles((prev) => [...prev, role].sort((a, b) => b.level - a.level))
  }

  function editRole(originalName: string, updated: Partial<import("@/features/system/types").RoleDefinition>) {
    setRoles((prev) => prev.map((r) =>
      r.name === originalName ? { ...r, ...updated } : r
    ).sort((a, b) => b.level - a.level))
    if (updated.name && updated.name !== originalName) {
      setMatrix((prev) => {
        const next = { ...prev, [updated.name!]: prev[originalName] }
        delete next[originalName]
        return next
      })
      setUsers((prev) => prev.map((u) =>
        u.role === originalName ? { ...u, role: updated.name! } : u
      ))
    }
  }

  function removeRole(name: string) {
    setRoles((prev) => prev.filter((r) => r.name !== name))
    setMatrix((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg!">
        <DialogHeader>
          <DialogTitle>System</DialogTitle>
          <DialogDescription>Manage users, roles, permissions and audit logs.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="users" className="flex flex-col min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles & Perms</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          <DialogBody className="mt-1 p-1">
            <TabsContent value="users">
              <UsersTab users={users} roles={roles} onUpdateRole={updateUserRole} onUpdateEmail={updateUserEmail} onRemoveUser={removeUser} onInviteUser={inviteUser} />
            </TabsContent>

            <TabsContent value="roles">
              <RolesTab
                roles={roles}
                matrix={matrix}
                onMatrixChange={setMatrix}
                onAddRole={addRole}
                onEditRole={editRole}
                onRemoveRole={removeRole}
              />
            </TabsContent>

            <TabsContent value="audit">
              <AuditTab />
            </TabsContent>
          </DialogBody>
        </Tabs>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
