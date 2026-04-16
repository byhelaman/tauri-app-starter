import { useState, useEffect } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { VideoIcon, MailIcon, KeyIcon, PuzzleIcon, CheckCircle2Icon, SettingsIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/components/ui/item"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"

// Este es solo un mock para la UI, luego se conectará a Supabase para leer el estado real de conexión
const AVAILABLE_INTEGRATIONS = [
  {
    id: "microsoft",
    name: "Microsoft 365",
    description: "Sync calendars and emails.",
    icon: MailIcon,
    connected: false,
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Automate meeting creation.",
    icon: VideoIcon,
    connected: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Handle payments and subs.",
    icon: KeyIcon,
    connected: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send channel notifications.",
    icon: PuzzleIcon,
    connected: false,
  },
  // {
  //   id: "gmail",
  //   name: "Gmail",
  //   description: "Sync emails and contacts.",
  //   icon: MailIcon,
  //   connected: false,
  // },
]

const configSchema = z.object({
  apiKey: z.string().min(1, "API Key is required"),
})

type ConfigValues = z.infer<typeof configSchema>

export function IntegrationsTab() {
  const [integrations, setIntegrations] = useState(AVAILABLE_INTEGRATIONS)
  const [configIntegrationId, setConfigIntegrationId] = useState<string | null>(null)

  const form = useForm<ConfigValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      apiKey: "",
    },
  })

  useEffect(() => {
    if (configIntegrationId) {
      form.reset({ apiKey: "" })
    }
  }, [configIntegrationId, form])

  const handleConnect = (id: string) => {
    // Aquí iría la lógica real de OAuth (ej: redirigir a Microsoft/Zoom)
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i))
    )
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="text-sm text-muted-foreground p-2">
        <p>Connect third-party applications to extend functionality.</p>
      </div>

      <ItemGroup>
        {integrations.map((integration) => {
          const Icon = integration.icon
          return (
            <Item key={integration.id}>
              <ItemMedia variant="icon">
                <Icon />
              </ItemMedia>
              <ItemContent>
                <div className="flex items-center gap-2">
                  <ItemTitle>{integration.name}</ItemTitle>
                  {integration.connected && (
                    <CheckCircle2Icon className="size-4 text-emerald-500" />
                  )}
                </div>
                <ItemDescription>{integration.description}</ItemDescription>
              </ItemContent>
              <ItemActions>
                {integration.connected && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfigIntegrationId(integration.id)}
                  >
                    <SettingsIcon className="size-4 text-muted-foreground" />
                  </Button>
                )}
                <Button
                  variant={integration.connected ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleConnect(integration.id)}
                >
                  {integration.connected ? "Disconnect" : "Connect"}
                </Button>
              </ItemActions>
            </Item>
          )
        })}
      </ItemGroup>

      <Dialog
        open={!!configIntegrationId}
        onOpenChange={(open) => !open && setConfigIntegrationId(null)}
      >
        <DialogContent>
          <DialogHeader>
              <DialogTitle>Configure Integration</DialogTitle>
              <DialogDescription>
                {integrations.find((i) => i.id === configIntegrationId)?.description}
              </DialogDescription>
            </DialogHeader>
          <form
            className="contents"
            onSubmit={form.handleSubmit((data) => {
              toast.success("Settings saved (mock) " + data.apiKey)
              setConfigIntegrationId(null)
            })}
          >
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="apiKey"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="api-key">API Key</FieldLabel>
                      <InputGroup>
                        <InputGroupInput 
                          {...field}
                          id="api-key"
                          placeholder="sk_test_..." 
                          aria-invalid={fieldState.invalid}
                        />
                      </InputGroup>
                      <FieldDescription>
                        Found in your developer console.
                      </FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                
                <Field>
                  <FieldLabel htmlFor="webhook-url">Webhook URL</FieldLabel>
                  <InputGroup>
                    <InputGroupInput 
                      id="webhook-url"
                      defaultValue="https://your-app.com/api/webhooks" 
                      readOnly 
                    />
                  </InputGroup>
                  <FieldDescription>
                    Paste into the provider's webhook settings.
                  </FieldDescription>
                </Field>
              </FieldGroup>

            <DialogFooter showCloseButton>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
