import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { saveSupabaseConfig, getSupabaseConfig } from "@/lib/supabase"
import { SetupInfoCard } from "@/features/auth/components/SetupInfoCard"
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
const setupSchema = z.object({
  url: z
    .string()
    .url("Enter a valid URL")
    .startsWith("https://", "URL must start with https://"),
  anonKey: z.string().min(20, "Enter a valid anon key"),
})

type SetupValues = z.infer<typeof setupSchema>

export function SetupPage() {
  const [showInfo, setShowInfo] = useState(false)
  const saved = getSupabaseConfig()

  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      url: saved.url || "",
      anonKey: saved.anonKey || "",
    },
  })

  const onSubmit = (values: SetupValues) => {
    saveSupabaseConfig(values.url, values.anonKey)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {showInfo ? (
          <SetupInfoCard onBack={() => setShowInfo(false)} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Setup required</CardTitle>
              <CardDescription>
                Enter your Supabase project credentials to get started
              </CardDescription>
              <CardAction>
                <Button variant="link" onClick={() => setShowInfo(true)}>
                  How to setup?
                </Button>
              </CardAction>
            </CardHeader>
            <form className="contents" onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent>
                <FieldGroup>
                  <Controller
                    name="url"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="supabase-url">Project URL</FieldLabel>
                        <Input
                          {...field}
                          id="supabase-url"
                          type="url"
                          placeholder="https://your-project.supabase.co"
                          aria-invalid={fieldState.invalid}
                          aria-describedby={fieldState.error ? "supabase-url-error" : undefined}
                        />
                        <FieldError id="supabase-url-error" errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                  <Controller
                    name="anonKey"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="supabase-anon-key">Anon key</FieldLabel>
                        <Input
                          {...field}
                          id="supabase-anon-key"
                          type="password"
                          aria-invalid={fieldState.invalid}
                          aria-describedby={fieldState.error ? "supabase-anon-key-error supabase-anon-key-desc" : "supabase-anon-key-desc"}
                        />
                        <FieldDescription id="supabase-anon-key-desc">
                          Found in Project Settings → API Keys
                        </FieldDescription>
                        <FieldError id="supabase-anon-key-error" errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                </FieldGroup>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                className="w-full"
              >
                Save and continue
              </Button>
            </CardFooter>
          </form>
        </Card>
        )}
      </div>
    </div>
  )
}
