import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Field, FieldLabel, FieldGroup, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { RoleDefinition } from "../types"

const editRoleSchema = z.object({
    name: z.string().min(1, "Required"),
    level: z.coerce.number({ invalid_type_error: "Must be a number" }).int().min(0).max(100),
    description: z.string(),
})

export type EditRoleValues = z.infer<typeof editRoleSchema>

interface EditRoleDialogProps {
    role: RoleDefinition | null
    onOpenChange: (open: boolean) => void
    onSubmit: (original: string, values: EditRoleValues) => Promise<void>
    disabled?: boolean
}

export function EditRoleDialog({ role, onOpenChange, onSubmit, disabled }: EditRoleDialogProps) {
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
            <DialogContent
                className="max-w-sm"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Edit role</DialogTitle>
                    <DialogDescription>
                        {role?.builtin
                            ? "For built-in roles, only the description can be updated."
                            : "Update the name, level, or description of this role."}
                    </DialogDescription>
                </DialogHeader>
                <form className="contents" onSubmit={handleSubmit((values) => role ? onSubmit(role.name, values) : Promise.resolve())}>
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
                    <DialogFooter showCloseButton>
                        <Button type="submit" disabled={disabled}>Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
