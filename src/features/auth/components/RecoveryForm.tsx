import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { supabase } from "@/lib/supabase"
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

const COOLDOWN_SECONDS = 60

export function RecoveryForm({
  onSignIn,
  ...props
}: React.ComponentProps<typeof Card> & { onSignIn?: () => void }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [cooldown, setCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const step1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { email: "", code: "" },
  })

  const step2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { password: "" },
  })

  const emailValue = step1.watch("email")

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS)
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.resetPasswordForEmail(emailValue)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Code sent! Check your email.")
    startCooldown()
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
      <CardContent>
        {step === 1 && (
          <form id="recovery-step1-form" onSubmit={step1.handleSubmit(onStep1Submit)}>
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
                          disabled={cooldown > 0 || !emailValue}
                        >
                          {cooldown > 0 ? `Resend in ${cooldown}s` : "Send code"}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

            </FieldGroup>
          </form>
        )}

        {step === 2 && (
          <form id="recovery-step2-form" onSubmit={step2.handleSubmit(onStep2Submit)}>
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
          </form>
        )}
      </CardContent>
      <CardFooter>
        {step === 1 && (
          <Button type="submit" form="recovery-step1-form" disabled={step1.formState.isSubmitting} className="w-full">
            {step1.formState.isSubmitting ? "Verifying..." : "Continue"}
          </Button>
        )}
        {step === 2 && (
          <Button type="submit" form="recovery-step2-form" disabled={step2.formState.isSubmitting} className="w-full">
            {step2.formState.isSubmitting ? "Resetting..." : "Reset password"}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
