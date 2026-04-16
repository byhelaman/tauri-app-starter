import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useRateLimit } from "@/hooks/use-rate-limit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldError,
  FieldDescription,
} from "@/components/ui/field"

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 30

const schema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(8, "Must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type FormValues = z.infer<typeof schema>

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false)
  const { attempts, isLocked, lockoutRemaining, recordFailure } = useRateLimit({
    maxAttempts: MAX_ATTEMPTS,
    lockoutSeconds: LOCKOUT_SECONDS,
    storageKey: "rl:change-password",
  })

  const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  function handleClose(v: boolean) {
    setOpen(v)
    if (!v) reset()
  }

  async function onSubmit(data: FormValues) {
    if (isLocked) return

    if (!supabase) return

    const { data: valid, error: rpcError } = await supabase.rpc("verify_user_password", {
      p_password: data.currentPassword,
    })

    if (rpcError || !valid) {
      recordFailure()
      const newAttempts = attempts + 1
      if (newAttempts >= MAX_ATTEMPTS) {
        toast.error(`Too many failed attempts. Try again in ${LOCKOUT_SECONDS} seconds.`)
      } else {
        const remaining = MAX_ATTEMPTS - newAttempts
        toast.error(
          remaining <= 2
            ? `Incorrect password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            : "Current password is incorrect."
        )
      }
      return
    }

    const { error } = await supabase.auth.updateUser({ password: data.newPassword })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("Password updated successfully")
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">Change password</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one.
          </DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="currentPassword"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                  <Input {...field} id="current-password" type="password" aria-invalid={fieldState.invalid} disabled={isLocked} />
                  {isLocked
                    ? <FieldDescription className="text-destructive">Locked — try again in {lockoutRemaining}s</FieldDescription>
                    : <FieldError errors={[fieldState.error]} />
                  }
                </Field>
              )}
            />
            <Controller
              name="newPassword"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input {...field} id="new-password" type="password" aria-invalid={fieldState.invalid} disabled={isLocked} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="confirmPassword"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
                  <Input {...field} id="confirm-password" type="password" aria-invalid={fieldState.invalid} disabled={isLocked} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isSubmitting || isLocked}>
              {isLocked ? `Locked (${lockoutRemaining}s)` : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
