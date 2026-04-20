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
import type { SystemUser } from "./types"

const resetPasswordSchema = z.object({
    newPassword: z.string().min(8, "Must be at least 8 characters"),
})
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export interface ResetPasswordDialogProps {
    user: SystemUser | null
    onOpenChange: (open: boolean) => void
    onConfirm: (userId: string, newPassword: string) => Promise<void>
    busy?: boolean
}

export function ResetPasswordDialog({ user, onOpenChange, onConfirm, busy }: ResetPasswordDialogProps) {
    const { control, handleSubmit, reset } = useForm<ResetPasswordValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { newPassword: "" },
    })

    function handleClose(v: boolean) {
        onOpenChange(v)
        if (!v) reset()
    }

    async function onSubmit(values: ResetPasswordValues) {
        if (!user) return
        await onConfirm(user.id, values.newPassword)
        handleClose(false)
    }

    return (
        <Dialog open={!!user} onOpenChange={handleClose}>
            <DialogContent
                className="max-w-sm"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Reset password</DialogTitle>
                    <DialogDescription>
                        Set a new password for <span className="font-medium">{user?.email}</span>.
                    </DialogDescription>
                </DialogHeader>
                <form className="contents" onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup>
                        <Controller
                            name="newPassword"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>New password</FieldLabel>
                                    <Input {...field} type="password" aria-invalid={fieldState.invalid} disabled={busy} />
                                    <FieldError errors={[fieldState.error]} />
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter showCloseButton>
                        <Button type="submit" disabled={busy}>Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
