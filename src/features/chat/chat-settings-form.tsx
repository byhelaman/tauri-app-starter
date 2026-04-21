import { useState, useEffect, useCallback } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Field,
    FieldLabel,
    FieldDescription,
    FieldError,
    FieldGroup,
} from "@/components/ui/field"

export const DEFAULT_MODEL = "google/gemini-2.5-flash"
const MODELS_ENDPOINT = "https://ai-gateway.vercel.sh/v1/models"

// Patrones que identifican modelos que NO son de chat generativo
const NON_CHAT_PATTERNS = ["embedding", "tts-", "whisper", "dall-e", "safeguard", "-instruct", "/image"]

const settingsSchema = z.object({
    apiKey: z.string(),
    model: z.string().min(1, "Select a model"),
})

type SettingsValues = z.infer<typeof settingsSchema>

interface GatewayModel {
    provider: string
    id: string
    name: string
}

// Agrupa los modelos por proveedor para renderizar SelectGroups
function groupByProvider(models: GatewayModel[]): Record<string, GatewayModel[]> {
    return models.reduce<Record<string, GatewayModel[]>>((acc, m) => {
        (acc[m.provider] ??= []).push(m)
        return acc
    }, {})
}

interface ChatSettingsFormProps {
    view: "setup" | "settings"
    currentApiKey: string
    currentModel: string
    onSave: (apiKey: string, model: string) => void
    onReset: () => void
}

export function ChatSettingsForm({ view, currentApiKey, currentModel, onSave, onReset }: ChatSettingsFormProps) {
    const [availableModels, setAvailableModels] = useState<GatewayModel[]>([])
    const [modelsLoading, setModelsLoading] = useState(false)

    const { control, handleSubmit, register, setError, watch, formState: { errors } } = useForm<SettingsValues>({
        resolver: zodResolver(settingsSchema),
        defaultValues: { apiKey: "", model: currentModel },
    })
    const watchedKey = watch("apiKey")

    const loadModels = useCallback(async (key: string) => {
        if (!key.trim()) return
        setModelsLoading(true)
        try {
            const res = await fetch(MODELS_ENDPOINT, {
                headers: { Authorization: `Bearer ${key}` },
            })
            if (!res.ok) return
            const json = await res.json() as { data?: Array<{ id: string }> }
            const models = (json.data ?? [])
                .filter(m => !NON_CHAT_PATTERNS.some(p => m.id.includes(p)))
                .map(m => {
                    const slash = m.id.indexOf("/")
                    return {
                        id: m.id,
                        provider: slash >= 0 ? m.id.slice(0, slash) : "other",
                        name: slash >= 0 ? m.id.slice(slash + 1) : m.id,
                    }
                })
                .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))
            setAvailableModels(models)
        } catch {
            // silencioso — el modelo guardado sigue siendo válido
        } finally {
            setModelsLoading(false)
        }
    }, [])

    // Cargar modelos al montar si ya hay una key guardada
    useEffect(() => {
        if (currentApiKey) void loadModels(currentApiKey)
    }, [currentApiKey, loadModels])

    // Recargar modelos cuando el usuario escribe una nueva key (debounced)
    useEffect(() => {
        if (watchedKey.trim().length > 10) {
            const t = setTimeout(() => void loadModels(watchedKey), 700)
            return () => clearTimeout(t)
        }
    }, [watchedKey, loadModels])

    function onSubmit(values: SettingsValues) {
        const trimmedKey = values.apiKey.trim()
        // En setup la key es obligatoria; en settings vacío = conservar la key actual
        if (view === "setup" && !trimmedKey) {
            setError("apiKey", { message: "API key is required" })
            return
        }
        onSave(trimmedKey || currentApiKey, values.model)
    }

    const modelGroups = groupByProvider(availableModels)

    return (
        <form className="contents" onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
                <Field data-invalid={!!errors.apiKey}>
                    <FieldLabel>API Key</FieldLabel>
                    <Input
                        {...register("apiKey")}
                        type="password"
                        placeholder="vck_..."
                        autoFocus
                    />
                    <FieldDescription>
                        {view === "setup"
                            ? "Stored locally on this device only."
                            : "Leave blank to keep your current key."}
                    </FieldDescription>
                    <FieldError errors={[errors.apiKey]} />
                </Field>
                <Field data-invalid={!!errors.model}>
                    <FieldLabel>Model</FieldLabel>
                    <Controller
                        name="model"
                        control={control}
                        render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange} disabled={modelsLoading}>
                                <SelectTrigger>
                                    {modelsLoading
                                        ? <span className="flex items-center gap-1.5 text-muted-foreground"><Spinner className="size-3" />Loading...</span>
                                        : <SelectValue placeholder="Select a model" />
                                    }
                                </SelectTrigger>
                                <SelectContent>
                                    {availableModels.length === 0 && !modelsLoading && (
                                        <SelectGroup>
                                            <SelectItem value={field.value}>{field.value}</SelectItem>
                                        </SelectGroup>
                                    )}
                                    {Object.entries(modelGroups).map(([provider, items]) => (
                                        <SelectGroup key={provider}>
                                            <SelectLabel>{provider}</SelectLabel>
                                            {items.map(m => (
                                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                            ))}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    />
                    <FieldError errors={[errors.model]} />
                </Field>
            </FieldGroup>
            <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                    {view === "setup" ? "Get Started" : "Save Changes"}
                </Button>
                {view === "settings" && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button type="button" variant="outline" className="w-fit">
                                Reset
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Reset configuration?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will remove your API key and chat history from this device.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={onReset}>Reset</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
        </form>
    )
}
