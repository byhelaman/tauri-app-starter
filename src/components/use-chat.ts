import { useState, useRef, useEffect, useCallback } from "react"
import { supabase, getSupabaseConfig } from "@/lib/supabase"

export interface Message {
    role: "user" | "assistant"
    content: string
    isError?: boolean
    isStreaming?: boolean
}

const STORAGE_KEY_HISTORY = "ai_chat_history"
const MAX_HISTORY = 100

function loadHistory(): Message[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY)
        if (!raw) return []
        // Limpiar flags de streaming de sesiones interrumpidas
        return (JSON.parse(raw) as Message[]).map(m => ({ ...m, isStreaming: undefined }))
    } catch {
        return []
    }
}

function saveHistory(messages: Message[]) {
    try {
        localStorage.setItem(
            STORAGE_KEY_HISTORY,
            JSON.stringify(messages.filter(m => !m.isStreaming).slice(-MAX_HISTORY))
        )
    } catch {
        // silencioso — localStorage puede estar lleno
    }
}

type SSEEvent =
    | { type: "status"; text: string }
    | { type: "token"; text: string }
    | { type: "done" }
    | { type: "error"; text: string }

export function useChat(apiKey: string, model: string) {
    const [messages, setMessages] = useState<Message[]>(loadHistory)
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const [statusText, setStatusText] = useState("")
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Scroll automático al último mensaje
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, loading, statusText])

    // handleSend acepta overrides para implementar edición sin duplicar lógica
    const handleSend = useCallback(async (overrideInput?: string, overrideHistory?: Message[]) => {
        const content = (overrideInput ?? input).trim()
        const history = overrideHistory ?? messages
        if (!content || loading || !supabase) return

        const userMessage: Message = { role: "user", content }
        const updatedMessages = [...history, userMessage]
        setMessages(updatedMessages)
        if (overrideInput === undefined) setInput("")
        setLoading(true)
        setStatusText("")

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error("Not authenticated")

            const { url, anonKey } = getSupabaseConfig()

            const response = await fetch(`${url}/functions/v1/ai-chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                    "apikey": anonKey,
                },
                body: JSON.stringify({
                    messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
                    apiKey,
                    model,
                }),
            })

            if (!response.ok) {
                const errData = await response.json() as { message?: string }
                throw new Error(errData.message ?? `HTTP ${response.status}`)
            }

            if (!response.body) throw new Error("No response body")

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buf = ""
            let assistantAdded = false

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buf += decoder.decode(value, { stream: true })
                const lines = buf.split("\n")
                buf = lines.pop() ?? ""

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue
                    let event: SSEEvent
                    try { event = JSON.parse(line.slice(6)) } catch { continue }

                    if (event.type === "status") {
                        setStatusText(event.text)

                    } else if (event.type === "token") {
                        if (!assistantAdded) {
                            setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }])
                            assistantAdded = true
                            setLoading(false)
                            setStatusText("")
                        }
                        setMessages(prev => {
                            const next = [...prev]
                            const last = next[next.length - 1]
                            next[next.length - 1] = { ...last, content: last.content + event.text }
                            return next
                        })

                    } else if (event.type === "done") {
                        setMessages(prev => {
                            const next = [...prev]
                            if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], isStreaming: undefined }
                            saveHistory(next)
                            return next
                        })
                        setLoading(false)
                        setStatusText("")

                    } else if (event.type === "error") {
                        const errMsg: Message = {
                            role: "assistant",
                            content: `Error: ${event.text}`,
                            isError: true,
                        }
                        setMessages(prev => {
                            const next = assistantAdded
                                ? [...prev.slice(0, -1), errMsg]
                                : [...prev, errMsg]
                            saveHistory(next)
                            return next
                        })
                        setLoading(false)
                        setStatusText("")
                    }
                }
            }

            if (!assistantAdded) {
                setMessages(prev => {
                    const next = [...prev, { role: "assistant" as const, content: "No response", isError: true }]
                    saveHistory(next)
                    return next
                })
            }

        } catch (err) {
            setMessages(prev => {
                const next = [...prev, {
                    role: "assistant" as const,
                    content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                    isError: true,
                }]
                saveHistory(next)
                return next
            })
        } finally {
            setLoading(false)
            setStatusText("")
        }
    }, [input, loading, messages, apiKey, model])

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
    }

    // Editar un mensaje de usuario: trunca el historial desde idx y reenvía
    function handleEdit(idx: number, newContent: string) {
        if (!newContent.trim()) return
        const truncated = messages.slice(0, idx)
        void handleSend(newContent.trim(), truncated)
    }

    function copyToClipboard(text: string) {
        void navigator.clipboard.writeText(text)
    }

    function copyChat() {
        const text = messages
            .map(m => `${m.role === "user" ? "You" : "Assistant"}: ${m.content}`)
            .join("\n\n")
        void navigator.clipboard.writeText(text)
    }

    function clearMessages() {
        setMessages([])
        saveHistory([])
    }

    function handleRetry() {
        // Elimina el último error y restaura el input con el último mensaje del usuario
        const lastUserMsg = [...messages].reverse().find(m => m.role === "user")
        if (!lastUserMsg) return
        setMessages(prev => prev.slice(0, -1))
        setInput(lastUserMsg.content)
    }

    return {
        messages, setMessages,
        input, setInput,
        loading, statusText,
        messagesEndRef, inputRef,
        handleSend, handleKeyDown, handleEdit,
        copyToClipboard, copyChat, clearMessages, handleRetry,
    }
}
