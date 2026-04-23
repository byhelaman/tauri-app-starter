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

export type RoleFormValues = z.infer<typeof roleFormSchema>

interface NewRoleDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (values: RoleFormValues) => Promise<void>
    disabled?: boolean
}

export function NewRoleDialog({ open, onOpenChange, onSubmit, disabled }: NewRoleDialogProps) {
    const { control, handleSubmit, reset } = useForm<RoleFormValues>({
        resolver: zodResolver(roleFormSchema),
        defaultValues: { name: "", level: "" as unknown as number, description: "" },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    const onFormSubmit = async (values: RoleFormValues) => {
        await onSubmit(values)
        reset()
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent
                className="max-w-sm"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>New role</DialogTitle>
                    <DialogDescription>Define a name, level, and description for the new role.</DialogDescription>
                </DialogHeader>
                <form className="contents" onSubmit={handleSubmit(onFormSubmit)}>
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
                    <DialogFooter showCloseButton>
                        <Button type="submit" disabled={disabled}>Add role</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
