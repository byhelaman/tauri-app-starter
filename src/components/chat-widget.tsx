import { useState, useRef, useEffect, useCallback } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { MessageCircle, X, Settings, Send, ChevronLeft, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Empty, EmptyMedia, EmptyDescription } from "@/components/ui/empty"
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
import {
    Card,
    CardHeader,
    CardContent,
    CardFooter,
} from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const STORAGE_KEY_API_KEY = "ai_api_key"
const STORAGE_KEY_MODEL = "ai_model"
const DEFAULT_MODEL = "google/gemini-2.5-flash"
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

interface Message {
    role: "user" | "assistant"
    content: string
}

type WidgetView = "chat" | "setup" | "settings"

// Agrupa los modelos por proveedor para renderizar SelectGroups
function groupByProvider(models: GatewayModel[]): Record<string, GatewayModel[]> {
    return models.reduce<Record<string, GatewayModel[]>>((acc, m) => {
        (acc[m.provider] ??= []).push(m)
        return acc
    }, {})
}

export function ChatWidget() {
    const [open, setOpen] = useState(false)
    const [view, setView] = useState<WidgetView>("chat")
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)

    // Estado persistente — cargado de localStorage
    const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY_API_KEY) ?? "")
    const [model, setModel] = useState(() => localStorage.getItem(STORAGE_KEY_MODEL) ?? DEFAULT_MODEL)

    // Catálogo de modelos obtenido del gateway
    const [availableModels, setAvailableModels] = useState<GatewayModel[]>([])
    const [modelsLoading, setModelsLoading] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const { control, handleSubmit, register, reset, setError, watch, formState: { errors } } = useForm<SettingsValues>({
        resolver: zodResolver(settingsSchema),
        defaultValues: { apiKey: "", model: DEFAULT_MODEL },
    })
    const watchedKey = watch("apiKey")

    // Obtiene los modelos disponibles del gateway con la API key dada
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
        if (apiKey) void loadModels(apiKey)
    }, [apiKey, loadModels])

    // Recargar modelos cuando el usuario escribe una nueva key (debounced)
    useEffect(() => {
        if ((view === "setup" || view === "settings") && watchedKey.trim().length > 10) {
            const t = setTimeout(() => void loadModels(watchedKey), 700)
            return () => clearTimeout(t)
        }
    }, [watchedKey, view, loadModels])

    // Al abrir: ir a setup si no hay API key, de lo contrario al chat
    useEffect(() => {
        if (!open) return
        if (!apiKey) {
            reset({ apiKey: "", model: DEFAULT_MODEL })
            setView("setup")
        } else {
            setView("chat")
        }
    }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll automático al último mensaje
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, loading])

    // Focus al input al entrar en vista chat
    useEffect(() => {
        if (view === "chat" && open) {
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [view, open])

    function openSettings() {
        reset({ apiKey: "", model })
        setView("settings")
    }

    function onSubmit(values: SettingsValues) {
        const trimmedKey = values.apiKey.trim()
        // En setup la key es obligatoria; en settings vacío = conservar la key actual
        if (view === "setup" && !trimmedKey) {
            setError("apiKey", { message: "API key is required" })
            return
        }
        const key = trimmedKey || apiKey
        setApiKey(key)
        setModel(values.model)
        localStorage.setItem(STORAGE_KEY_API_KEY, key)
        localStorage.setItem(STORAGE_KEY_MODEL, values.model)
        setView("chat")
    }

    function handleReset() {
        localStorage.removeItem(STORAGE_KEY_API_KEY)
        localStorage.removeItem(STORAGE_KEY_MODEL)
        setApiKey("")
        setModel(DEFAULT_MODEL)
        setMessages([])
        setAvailableModels([])
        reset({ apiKey: "", model: DEFAULT_MODEL })
        setView("setup")
    }

    const handleSend = useCallback(async () => {
        if (!input.trim() || loading || !supabase) return

        const userMessage: Message = { role: "user", content: input.trim() }
        const updatedMessages = [...messages, userMessage]
        setMessages(updatedMessages)
        setInput("")
        setLoading(true)

        try {
            const { data, error } = await supabase.functions.invoke("ai-chat", {
                body: { messages: updatedMessages, apiKey, model },
            })

            if (error) throw new Error(error.message)

            const responseText = (data as { message?: string })?.message ?? "No response"
            setMessages(prev => [...prev, { role: "assistant", content: responseText }])
        } catch (err) {
            setMessages(prev => [
                ...prev,
                { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
            ])
        } finally {
            setLoading(false)
        }
    }, [input, loading, messages, apiKey, model])

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
    }

    // Select de modelo compartido entre setup y settings
    const modelGroups = groupByProvider(availableModels)
    const modelSelect = (
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
    )

    if (!open) {
        return (
            <Button
                className="fixed bottom-4 right-4 z-50"
                onClick={() => setOpen(true)}
                aria-label="Open AI chat"
            >
                <Bot />
                AI Chat
            </Button>
        )
    }

    return (
        <Card className="fixed bottom-4 right-4 z-50 w-80 h-120 shadow-xl gap-0 py-0 bg-popover">
            <CardHeader className="flex flex-row items-center justify-between p-2 shrink-0 gap-0 space-y-0">
                <div className="flex items-center gap-2">
                    {view !== "chat" && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setView(apiKey ? "chat" : "setup")}
                            aria-label="Back"
                        >
                            <ChevronLeft data-icon />
                        </Button>
                    )}
                    <span className={cn("text-sm font-medium", view === "chat" && "pl-2")}>
                        {view === "settings" ? "Settings" : view === "setup" ? "Set up AI" : "AI Chat"}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {view === "chat" && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={openSettings}
                            aria-label="Chat settings"
                        >
                            <Settings data-icon />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setOpen(false)}
                        aria-label="Close chat"
                    >
                        <X data-icon />
                    </Button>
                </div>
            </CardHeader>

            {/* Setup / Settings */}
            {(view === "setup" || view === "settings") && (
                <CardContent className="flex flex-col flex-1 min-h-0 p-4 gap-4 overflow-y-auto">
                    {view === "setup" && (
                        <p className="text-sm text-muted-foreground">
                            Enter your Vercel AI Gateway API key to enable the chat.
                        </p>
                    )}
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
                                {modelSelect}
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
                                            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    </form>
                </CardContent>
            )}

            {/* Chat */}
            {view === "chat" && (
                <>
                    <CardContent className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2 scrollbar">
                        {messages.length === 0 && (
                            <Empty className="border-none">
                                <EmptyMedia variant="icon">
                                    <MessageCircle />
                                </EmptyMedia>
                                <EmptyDescription>
                                    Ask questions about your data. The assistant queries the database in real time.
                                </EmptyDescription>
                            </Empty>
                        )}
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap wrap-break-word",
                                    msg.role === "user"
                                        ? "self-end bg-primary text-primary-foreground"
                                        : "self-start bg-muted text-foreground"
                                )}
                            >
                                {msg.content}
                            </div>
                        ))}
                        {loading && (
                            <div className="self-start bg-muted rounded-lg px-3 py-2">
                                <Spinner className="text-muted-foreground" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </CardContent>

                    <CardFooter className="shrink-0 p-3 gap-2">
                        <Input
                            ref={inputRef}
                            placeholder="Ask a question..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={loading}
                            className="flex-1"
                        />
                        <Button
                            size="icon"
                            className="shrink-0"
                            onClick={() => void handleSend()}
                            disabled={!input.trim() || loading}
                            aria-label="Send message"
                        >
                            <Send data-icon />
                        </Button>
                    </CardFooter>
                </>
            )}
        </Card>
    )
}
