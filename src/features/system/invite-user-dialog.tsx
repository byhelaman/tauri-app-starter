import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { Field, FieldLabel, FieldGroup, FieldError } from "@/components/ui/field"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import type { RoleDefinition } from "./types"

const inviteSchema = z.object({
    name: z.string().min(1, "Required"),
    email: z.string().email("Invalid email"),
    role: z.string().min(1, "Required"),
})
type InviteValues = z.infer<typeof inviteSchema>

export interface InviteUserDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onInviteUser: (name: string, email: string, role: string) => Promise<void>
    roles: RoleDefinition[]
    canManageUsers: boolean
    busy?: boolean
}

export function InviteUserDialog({ open, onOpenChange, onInviteUser, roles, canManageUsers, busy }: InviteUserDialogProps) {
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
            <DialogContent
                className="max-w-sm"
                onInteractOutside={(event) => event.preventDefault()}
            >
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
