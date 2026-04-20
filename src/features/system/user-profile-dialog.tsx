import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { getInitials } from "@/lib/utils"
import { AvatarField } from "@/components/avatar-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    FieldDescription,
    FieldError,
} from "@/components/ui/field"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import type { RoleDefinition, SystemUser } from "./types"

const editDisplayNameSchema = z.object({
    displayName: z.string().min(1, "Required"),
})
type EditDisplayNameValues = z.infer<typeof editDisplayNameSchema>

const editEmailSchema = z.object({
    email: z.string().email("Invalid email"),
})
type EditEmailValues = z.infer<typeof editEmailSchema>

// --- EditDisplayNameDialog ---

interface EditDisplayNameDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    currentName: string
    onSave: (userId: string, displayName: string) => Promise<void>
}

function EditDisplayNameDialog({ open, onOpenChange, userId, currentName, onSave }: EditDisplayNameDialogProps) {
    const { control, handleSubmit, reset, formState } = useForm<EditDisplayNameValues>({
        resolver: zodResolver(editDisplayNameSchema),
        values: { displayName: currentName },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    async function onSubmit(values: EditDisplayNameValues) {
        try {
            await onSave(userId, values.displayName)
            handleClose(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not update name")
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent
                className="max-w-sm"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Edit display name</DialogTitle>
                    <DialogDescription>This name is shown across the workspace.</DialogDescription>
                </DialogHeader>
                <form className="contents" onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup>
                        <Controller
                            name="displayName"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Display name</FieldLabel>
                                    <Input {...field} aria-invalid={fieldState.invalid} disabled={formState.isSubmitting} />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter showCloseButton>
                        <Button type="submit" disabled={formState.isSubmitting}>Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// --- EditEmailDialog ---

interface EditEmailDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    currentEmail: string
    onSave: (userId: string, email: string) => Promise<void>
}

function EditEmailDialog({ open, onOpenChange, userId, currentEmail, onSave }: EditEmailDialogProps) {
    const { control, handleSubmit, reset, formState } = useForm<EditEmailValues>({
        resolver: zodResolver(editEmailSchema),
        values: { email: currentEmail },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    async function onSubmit(values: EditEmailValues) {
        try {
            await onSave(userId, values.email)
            handleClose(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not update email")
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent
                className="max-w-sm"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Edit email</DialogTitle>
                    <DialogDescription>The user will need to verify their new email address.</DialogDescription>
                </DialogHeader>
                <form className="contents" onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup>
                        <Controller
                            name="email"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Email</FieldLabel>
                                    <Input {...field} type="email" aria-invalid={fieldState.invalid} disabled={formState.isSubmitting} />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter showCloseButton>
                        <Button type="submit" disabled={formState.isSubmitting}>Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// --- ViewProfileDialog ---

export interface ViewProfileDialogProps {
    user: SystemUser | null
    roles: RoleDefinition[]
    actorLevel: number
    onOpenChange: (open: boolean) => void
    onUpdateDisplayName: (userId: string, displayName: string) => Promise<void>
    onUpdateEmail: (userId: string, email: string) => Promise<void>
    onUpdateRole: (userId: string, role: string) => Promise<void>
    canManageUsers: boolean
}

export function ViewProfileDialog({ user, roles, actorLevel, onOpenChange, onUpdateDisplayName, onUpdateEmail, onUpdateRole, canManageUsers }: ViewProfileDialogProps) {
    const [editName, setEditName] = useState(false)
    const [editEmail, setEditEmail] = useState(false)
    const [roleSaving, setRoleSaving] = useState(false)

    const isPending = user?.lastLoginAt === null

    async function handleRoleChange(role: string) {
        if (!user) return
        setRoleSaving(true)
        try {
            await onUpdateRole(user.id, role)
        } finally {
            setRoleSaving(false)
        }
    }

    return (
        <>
            {user && (
                <>
                    <EditDisplayNameDialog
                        open={editName}
                        onOpenChange={setEditName}
                        userId={user.id}
                        currentName={user.displayName}
                        onSave={onUpdateDisplayName}
                    />
                    <EditEmailDialog
                        open={editEmail}
                        onOpenChange={setEditEmail}
                        userId={user.id}
                        currentEmail={user.email}
                        onSave={onUpdateEmail}
                    />
                </>
            )}
            <Dialog open={!!user} onOpenChange={onOpenChange}>
                <DialogContent
                    className="max-w-sm"
                    onInteractOutside={(event) => event.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle>Profile</DialogTitle>
                        <DialogDescription>User details and account information.</DialogDescription>
                    </DialogHeader>
                    {user && (
                        <FieldGroup>
                            <AvatarField
                                initials={getInitials(user.displayName || user.email)}
                                disabled={!canManageUsers}
                            />
                            <Field>
                                <FieldLabel>Display name</FieldLabel>
                                <div className="flex items-center gap-2">
                                    <Input value={user.displayName} disabled className="flex-1" />
                                    {canManageUsers && (
                                        <Button variant="outline" size="sm" onClick={() => setEditName(true)}>
                                            Edit
                                        </Button>
                                    )}
                                </div>
                            </Field>
                            <Field>
                                <FieldLabel>Email</FieldLabel>
                                <div className="flex items-center gap-2">
                                    <Input value={user.email} disabled className="flex-1" />
                                    {canManageUsers && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditEmail(true)}
                                            disabled={isPending}
                                            title={isPending ? "Cannot change email while invitation is pending" : undefined}
                                        >
                                            Edit
                                        </Button>
                                    )}
                                </div>
                                {isPending && (
                                    <FieldDescription>Invitation pending — email cannot be changed until accepted.</FieldDescription>
                                )}
                            </Field>
                            <div className="flex gap-3">
                                <Field className="flex-1">
                                    <FieldLabel>Role</FieldLabel>
                                    <Select
                                        value={user.role}
                                        onValueChange={(role) => void handleRoleChange(role)}
                                        disabled={!canManageUsers || roleSaving}
                                    >
                                        <SelectTrigger>
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
                                </Field>
                                <Field className="w-32">
                                    <FieldLabel>Status</FieldLabel>
                                    <Input value={user.status} disabled />
                                </Field>
                            </div>
                            <Field>
                                <FieldLabel>Last login</FieldLabel>
                                <p className="text-sm text-muted-foreground">
                                    {user.lastLoginAt
                                        ? new Date(user.lastLoginAt).toLocaleString()
                                        : "Never"}
                                </p>
                            </Field>
                        </FieldGroup>
                    )}
                    <DialogFooter showCloseButton className="mt-4" />
                </DialogContent>
            </Dialog>
        </>
    )
}
