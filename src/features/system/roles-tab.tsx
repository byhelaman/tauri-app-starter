import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ChevronRightIcon, MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react"
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
import {
    Field,
    FieldLabel,
    FieldGroup,
    FieldError,
    FieldDescription,
    FieldContent,
} from "@/components/ui/field"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { PermissionDefinition, PermissionMatrix, RoleDefinition } from "./types"

const roleFormSchema = z.object({
    name: z
        .string()
        .min(1, "Required")
        .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers and underscores"),
    level: z.coerce
        .number({ invalid_type_error: "Must be a number" })
        .int()
        .min(0, "Min 0")
        .max(99, "Max 99"),
    description: z.string(),
})

type RoleFormValues = z.infer<typeof roleFormSchema>

const editRoleSchema = roleFormSchema.extend({
    name: z.string().min(1, "Required"),
    level: z.coerce.number({ invalid_type_error: "Must be a number" }).int().min(0).max(100),
})

type EditRoleValues = z.infer<typeof editRoleSchema>

interface NewRoleDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (values: RoleFormValues) => Promise<void>
    disabled?: boolean
}

function NewRoleDialog({ open, onOpenChange, onSubmit, disabled }: NewRoleDialogProps) {
    const { control, handleSubmit, reset } = useForm<RoleFormValues>({
        resolver: zodResolver(roleFormSchema),
        defaultValues: { name: "", level: "" as unknown as number, description: "" },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>New role</DialogTitle>
                    <DialogDescription>Define a name, level, and description for the new role.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup>
                        <div className="flex gap-3">
                            <Controller
                                name="name"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field className="flex-1" data-invalid={fieldState.invalid}>
                                        <FieldLabel>Name</FieldLabel>
                                        <Input {...field} placeholder="e.g. moderator" aria-invalid={fieldState.invalid} disabled={disabled} />
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />
                            <Controller
                                name="level"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field className="w-24" data-invalid={fieldState.invalid}>
                                        <FieldLabel>Level</FieldLabel>
                                        <Input {...field} type="number" placeholder="0–99" aria-invalid={fieldState.invalid} disabled={disabled} />
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />
                        </div>
                        <Controller
                            name="description"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Description</FieldLabel>
                                    <Input {...field} placeholder="Optional" aria-invalid={fieldState.invalid} disabled={disabled} />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter showCloseButton className="mt-4">
                        <Button type="submit" disabled={disabled}>Add role</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

interface EditRoleDialogProps {
    role: RoleDefinition | null
    onOpenChange: (open: boolean) => void
    onSubmit: (original: string, values: EditRoleValues) => Promise<void>
    disabled?: boolean
}

function EditRoleDialog({ role, onOpenChange, onSubmit, disabled }: EditRoleDialogProps) {
    const { control, handleSubmit, reset } = useForm<EditRoleValues>({
        resolver: zodResolver(editRoleSchema),
        values: role
            ? { name: role.name, level: role.level, description: role.description }
            : { name: "", level: 0, description: "" },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    return (
        <Dialog open={!!role} onOpenChange={handleClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Edit role</DialogTitle>
                    <DialogDescription>
                        {role?.builtin
                            ? "For built-in roles, only the description can be updated."
                            : "Update the name, level, or description of this role."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit((values) => role ? onSubmit(role.name, values) : Promise.resolve())}>
                    <FieldGroup>
                        <div className="flex gap-3">
                            <Controller
                                name="name"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field className="flex-1" data-invalid={fieldState.invalid}>
                                        <FieldLabel>Name</FieldLabel>
                                        <Input {...field} disabled={role?.builtin || disabled} aria-invalid={fieldState.invalid} />
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />
                            <Controller
                                name="level"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field className="w-24" data-invalid={fieldState.invalid}>
                                        <FieldLabel>Level</FieldLabel>
                                        <Input {...field} type="number" disabled={role?.builtin || disabled} aria-invalid={fieldState.invalid} />
                                        <FieldError errors={[fieldState.error]} />
                                    </Field>
                                )}
                            />
                        </div>
                        <Controller
                            name="description"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Description</FieldLabel>
                                    <Input {...field} placeholder="Optional" aria-invalid={fieldState.invalid} disabled={disabled} />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter showCloseButton className="mt-4">
                        <Button type="submit" disabled={disabled}>Save changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

interface RolesTabProps {
    roles: RoleDefinition[]
    permissions: PermissionDefinition[]
    matrix: PermissionMatrix
    onTogglePermission: (role: string, permission: string, enabled: boolean) => Promise<void>
    onAddRole: (role: RoleDefinition) => Promise<void>
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

    const filtered = roles.filter(
        (r) =>
            r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.description.toLowerCase().includes(search.toLowerCase())
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

        const duplicate: RoleDefinition = {
            name: duplicateName,
            level: role.level,
            description: role.description,
            builtin: false,
        }

        setBusy(true)
        try {
            await onAddRole(duplicate)
            for (const permission of permissions) {
                if (matrix[role.name]?.[permission.name]) {
                    await onTogglePermission(duplicate.name, permission.name, true)
                }
            }
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
                    <PlusIcon data-icon="inline-start" />
                    New role
                </Button>
            </div>

            <div className="divide-y text-sm">
                {filtered.map((role) => (
                    <Collapsible
                        key={role.name}
                        open={openRole === role.name}
                        onOpenChange={(open) => setOpenRole(open ? role.name : null)}
                    >
                        <ContextMenu>
                            <ContextMenuTrigger asChild>
                                <CollapsibleTrigger asChild>
                                    <div className={cn(
                                        "flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors select-none",
                                        openRole === role.name && "bg-muted/40"
                                    )}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <ChevronRightIcon className={cn(
                                                "size-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                                                openRole === role.name && "rotate-90"
                                            )} />
                                            <div className="min-w-0">
                                                <p className="font-medium">{role.name}</p>
                                                <p className="mt-0.5 text-sm text-muted-foreground truncate">{role.description || "—"}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <Badge variant="outline">Level {role.level}</Badge>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon-xs" onClick={(e) => e.stopPropagation()}>
                                                        <MoreHorizontalIcon data-icon />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuGroup>
                                                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(role.name)}>
                                                            Copy name
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditTarget(role) }} disabled={!canManageRoles || busy}>
                                                            Edit role
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => void handleDuplicateRole(role)} disabled={!canManageRoles || busy}>
                                                            Duplicate role
                                                        </DropdownMenuItem>
                                                    </DropdownMenuGroup>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuGroup>
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            disabled={role.builtin || !canManageRoles || busy}
                                                            onClick={() => setRemoveTarget(role)}
                                                        >
                                                            Remove role
                                                        </DropdownMenuItem>
                                                    </DropdownMenuGroup>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </CollapsibleTrigger>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                                <ContextMenuItem onSelect={() => navigator.clipboard.writeText(role.name)}>
                                    Copy name
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={() => setEditTarget(role)} disabled={!canManageRoles || busy}>Edit role</ContextMenuItem>
                                <ContextMenuItem onSelect={() => void handleDuplicateRole(role)} disabled={!canManageRoles || busy}>Duplicate role</ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    variant="destructive"
                                    disabled={role.builtin || !canManageRoles || busy}
                                    onSelect={() => setRemoveTarget(role)}
                                >
                                    Remove role
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>

                        <CollapsibleContent>
                            <div className="border-t bg-muted/20 px-4 py-3 flex flex-col gap-3">
                                <p className="text-sm text-muted-foreground">Permissions</p>
                                <div className="grid grid-cols-2 gap-4 pb-2">
                                    {permissions.map((permission) => {
                                        const isLocked = role.name === "owner"
                                        const checked = isLocked ? true : (matrix[role.name]?.[permission.name] ?? false)
                                        return (
                                            <Field key={permission.name} orientation="horizontal">
                                                <Checkbox
                                                    checked={checked}
                                                    disabled={isLocked || !canManageRoles || busy}
                                                    onCheckedChange={() => void togglePermission(role.name, permission.name)}
                                                />
                                                <FieldContent>
                                                    <FieldLabel className="text-sm">{permission.name}</FieldLabel>
                                                    <FieldDescription>{permission.description || "No description"}</FieldDescription>
                                                </FieldContent>
                                            </Field>
                                        )
                                    })}
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                ))}
                {filtered.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No roles found.</p>
                )}
            </div>
        </div>
    )
}
