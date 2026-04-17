import { useState } from "react"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { useRateLimit } from "@/hooks/use-rate-limit"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

const step1Schema = z.object({
  email: z.string().email("Enter a valid email"),
  code: z.string().length(6, "Enter the 6-digit code"),
})

const step2Schema = z.object({
  password: z.string().min(8, "Must be at least 8 characters long"),
})

type Step1Values = z.infer<typeof step1Schema>
type Step2Values = z.infer<typeof step2Schema>


export function RecoveryForm({
  onSignIn,
  ...props
}: React.ComponentProps<typeof Card> & { onSignIn?: () => void }) {
  const navigate = useNavigate()
  const { isLocked, lockoutRemaining, recordFailure } = useRateLimit({
    maxAttempts: 1,
    lockoutSeconds: 60,
    storageKey: "rl:send-recovery-code",
  })
  const [step, setStep] = useState<1 | 2>(1)

  const step1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { email: "", code: "" },
  })

  const step2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { password: "" },
  })

  const emailValue = step1.watch("email")

  const handleSendCode = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.resetPasswordForEmail(emailValue)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Code sent! Check your email.")
    recordFailure()
  }

  const onStep1Submit = async (data: Step1Values) => {
    if (!supabase) return
    const { error } = await supabase.auth.verifyOtp({
      email: data.email,
      token: data.code,
      type: "recovery",
    })
    if (error) {
      toast.error(error.message)
      return
    }
    setStep(2)
  }

  const onStep2Submit = async (data: Step2Values) => {
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      toast.error(error.message)
      return
    }
    navigate("/", { replace: true })
  }

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          {step === 1
            ? "Enter your email and the code we'll send you."
            : "Choose a new password for your account."}
        </CardDescription>
        <CardAction>
          {step === 1
            ? <Button variant="link" onClick={onSignIn}>Sign In</Button>
            : <Button variant="link" onClick={() => setStep(1)}>Back</Button>}
        </CardAction>
      </CardHeader>
      <form className="contents" onSubmit={step === 1 ? step1.handleSubmit(onStep1Submit) : step2.handleSubmit(onStep2Submit)}>
        <CardContent>
          {step === 1 && (
            <FieldGroup>
              <Controller
                name="email"
                control={step1.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="recovery-email">Email</FieldLabel>
                    <Input
                      {...field}
                      id="recovery-email"
                      type="email"
                      placeholder="m@example.com"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                name="code"
                control={step1.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="recovery-code">Verification Code</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        id="recovery-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        aria-invalid={fieldState.invalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          variant="link"
                          onClick={handleSendCode}
                          disabled={isLocked || !emailValue}
                        >
                          {isLocked ? `Resend in ${lockoutRemaining}s` : "Send code"}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

            </FieldGroup>
          )}

          {step === 2 && (
            <FieldGroup>
              <Controller
                name="password"
                control={step2.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                    <Input
                      {...field}
                      id="new-password"
                      type="password"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </FieldGroup>
          )}
        </CardContent>
        <CardFooter>
          {step === 1 && (
            <Button type="submit" disabled={step1.formState.isSubmitting} className="w-full">
              {step1.formState.isSubmitting ? "Verifying..." : "Continue"}
            </Button>
          )}
          {step === 2 && (
            <Button type="submit" disabled={step2.formState.isSubmitting} className="w-full">
              {step2.formState.isSubmitting ? "Resetting..." : "Reset password"}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
