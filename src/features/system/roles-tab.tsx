import { useDeferredValue, useMemo, useState } from "react"
import { PlusIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group"
import { filterByMultiSearch } from "@/lib/utils"
import type { PermissionDefinition, PermissionMatrix, RoleDefinition } from "./types"
import { NewRoleDialog, type RoleFormValues } from "./components/NewRoleDialog"
import { EditRoleDialog, type EditRoleValues } from "./components/EditRoleDialog"
import { RoleItem } from "./components/RoleItem"

interface RolesTabProps {
    roles: RoleDefinition[]
    permissions: PermissionDefinition[]
    matrix: PermissionMatrix
    onTogglePermission: (role: string, permission: string, enabled: boolean) => Promise<void>
    onAddRole: (role: RoleDefinition) => Promise<void>
    onDuplicateRole: (sourceName: string, newName: string) => Promise<void>
    onEditRole: (original: string, updated: Partial<RoleDefinition>) => Promise<void>
    onRemoveRole: (name: string) => Promise<void>
    canManageRoles: boolean
    loading?: boolean
}

export function RolesTab({
    roles,
    permissions,
    matrix,
    onTogglePermission,
    onAddRole,
    onDuplicateRole,
    onEditRole,
    onRemoveRole,
    canManageRoles,
    loading,
}: RolesTabProps) {
    const [openRole, setOpenRole] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [showNew, setShowNew] = useState(false)
    const [editTarget, setEditTarget] = useState<RoleDefinition | null>(null)
    const [removeTarget, setRemoveTarget] = useState<RoleDefinition | null>(null)
    const [busy, setBusy] = useState(false)

    const deferredSearch = useDeferredValue(search)

    const filtered = useMemo(
        () => filterByMultiSearch(roles, deferredSearch, (r) => [r.name, r.description, r.level]),
        [roles, deferredSearch],
    )

    async function togglePermission(role: string, permission: string) {
        const enabled = !(matrix[role]?.[permission] ?? false)
        setBusy(true)
        try {
            await onTogglePermission(role, permission, enabled)
        } finally {
            setBusy(false)
        }
    }

    async function handleAddRole(values: RoleFormValues) {
        const newRole: RoleDefinition = {
            name: values.name,
            level: values.level,
            description: values.description,
            builtin: false,
        }
        setBusy(true)
        try {
            await onAddRole(newRole)
            setShowNew(false)
        } finally {
            setBusy(false)
        }
    }

    async function handleDuplicateRole(role: RoleDefinition) {
        const baseName = role.name.replace(/_copy(\d*)$/, "")
        const existingNames = new Set(roles.map((r) => r.name))
        let duplicateName = `${baseName}_copy`
        let copyIndex = 2

        while (existingNames.has(duplicateName)) {
            duplicateName = `${baseName}_copy${copyIndex}`
            copyIndex += 1
        }

        setBusy(true)
        try {
            await onDuplicateRole(role.name, duplicateName)
        } finally {
            setBusy(false)
        }
    }

    async function handleEditRole(originalName: string, values: EditRoleValues) {
        const updated: Partial<RoleDefinition> = { description: values.description }
        if (!editTarget?.builtin) {
            updated.name = values.name
            updated.level = values.level
        }
        setBusy(true)
        try {
            await onEditRole(originalName, updated)
            setEditTarget(null)
        } finally {
            setBusy(false)
        }
    }

    async function handleRemoveRole(name: string) {
        setBusy(true)
        try {
            await onRemoveRole(name)
            setRemoveTarget(null)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <NewRoleDialog open={showNew} onOpenChange={setShowNew} onSubmit={handleAddRole} disabled={busy || !canManageRoles} />
            <EditRoleDialog role={editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }} onSubmit={handleEditRole} disabled={busy || !canManageRoles} />
            <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove role?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The role <span className="font-medium">{removeTarget?.name}</span> will be deleted. Assigned users will be downgraded automatically to the nearest lower role.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => removeTarget ? void handleRemoveRole(removeTarget.name) : undefined}
                            disabled={busy || !canManageRoles}
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex gap-2">
                <InputGroup className="flex-1">
                    <InputGroupAddon>
                        <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                        placeholder="Search roles..."
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                    />
                    {search && (
                        <InputGroupAddon align="inline-end">{filtered.length} results</InputGroupAddon>
                    )}
                </InputGroup>
                <Button variant="outline" size="sm" onClick={() => setShowNew(true)} disabled={busy || !canManageRoles || loading}>
                    <PlusIcon />
                    New role
                </Button>
            </div>

            <div className="divide-y text-sm">
                {filtered.map((role) => (
                    <RoleItem
                        key={role.name}
                        role={role}
                        isOpen={openRole === role.name}
                        onOpenChange={(open) => setOpenRole(open ? role.name : null)}
                        permissions={permissions}
                        matrix={matrix}
                        onTogglePermission={togglePermission}
                        onEdit={setEditTarget}
                        onDuplicate={handleDuplicateRole}
                        onRemove={setRemoveTarget}
                        canManageRoles={canManageRoles}
                        busy={busy}
                    />
                ))}
                {filtered.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No roles found.</p>
                )}
            </div>
        </div>
    )
}
