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

const signupSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Must be at least 8 characters long"),
  code: z.string().length(6, "Enter the 6-digit code"),
})

type SignupValues = z.infer<typeof signupSchema>

export function SignupForm({
  onSignIn,
  ...props
}: React.ComponentProps<typeof Card> & { onSignIn?: () => void }) {
  const navigate = useNavigate()
  const { isLocked, lockoutRemaining, recordFailure } = useRateLimit({
    maxAttempts: 5,
    lockoutSeconds: 60,
    storageKey: "rl:send-code",
  })

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", code: "" },
  })

  const emailValue = form.watch("email")
  const passwordValue = form.watch("password")

  const handleSendCode = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signUp({
      email: emailValue,
      password: passwordValue,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Code sent! Check your email.")
    recordFailure()
  }

  const onSubmit = async (data: SignupValues) => {
    if (!supabase) return
    const { error } = await supabase.auth.verifyOtp({
      email: data.email,
      token: data.code,
      type: "signup",
    })
    if (error) {
      toast.error(error.message)
      return
    }
    navigate("/", { replace: true })
  }

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Get started</CardTitle>
        <CardDescription>Create a new account</CardDescription>
        <CardAction>
          <Button variant="link" onClick={onSignIn}>Sign In</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form id="signup-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="signup-email"
                    type="email"
                    placeholder="m@example.com"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                  <Input
                    {...field}
                    id="signup-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              name="code"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="signup-code">Verification Code</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="signup-code"
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
                        disabled={isLocked || !emailValue || passwordValue.length < 8}
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
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form="signup-form" disabled={form.formState.isSubmitting}
          className="w-full">
          {form.formState.isSubmitting ? "Creating account..." : "Create account"}
        </Button>
      </CardFooter>
    </Card>
  )
}
