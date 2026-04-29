import { useState, useRef, useEffect, useCallback } from "react"
import { supabase, getSupabaseConfig } from "@/lib/supabase"
import { processSSEStream } from "./sse-utils"

export interface Message {
    id: string
    role: "user" | "assistant"
    content: string
    isError?: boolean
}

const STORAGE_KEY_HISTORY = "ai_chat_history"
const MAX_HISTORY = 100
const MAX_CONTEXT_MESSAGES = 20 // Límite de mensajes enviados al servidor para evitar payloads grandes

export function chatHistoryKey(userId: string): string {
    return `${STORAGE_KEY_HISTORY}:${userId}`
}

function loadHistory(userId: string | null): Message[] {
    if (!userId) return []
    try {
        const raw = localStorage.getItem(chatHistoryKey(userId))
        return raw ? (JSON.parse(raw) as Message[]) : []
    } catch {
        return []
    }
}

function saveHistory(userId: string | null, messages: Message[]) {
    if (!userId) return
    try {
        localStorage.setItem(chatHistoryKey(userId), JSON.stringify(messages.slice(-MAX_HISTORY)))
    } catch {
        // silencioso — localStorage puede estar lleno
    }
}


export function useChat(apiKey: string, model: string, userId: string | null) {
    const [messages, setMessages] = useState<Message[]>(() => loadHistory(userId))
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const [statusText, setStatusText] = useState("")
    const [streamingIdx, setStreamingIdx] = useState<number | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const abortRef = useRef<AbortController | null>(null)

    // Recargar historial cuando cambia el usuario (login/logout/cambio de cuenta)
    useEffect(() => {
        setMessages(loadHistory(userId))
    }, [userId])

    // Cancelar request en curso al desmontar — AbortController + chequeo de identidad bastan
    useEffect(() => {
        return () => {
            abortRef.current?.abort()
        }
    }, [])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, loading, statusText])

    // Lógica central de envío — compartida entre handleSend y handleEdit
    const sendMessage = useCallback(async (content: string, history: Message[]) => {
        if (!supabase) return

        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        const userMessage: Message = { id: crypto.randomUUID(), role: "user", content }
        const updatedMessages = [...history, userMessage]
        const streamingMsgIdx = updatedMessages.length

        setMessages(updatedMessages)
        setLoading(true)
        setStatusText("")
        setStreamingIdx(null)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error("Not authenticated")

            const { url, anonKey } = getSupabaseConfig()

            const response = await fetch(`${url}/functions/v1/ai-chat`, {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                    "apikey": anonKey,
                },
                body: JSON.stringify({
                    messages: updatedMessages.slice(-MAX_CONTEXT_MESSAGES).map(m => ({ role: m.role, content: m.content })),
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
            let assistantAdded = false

            await processSSEStream(
                reader,
                (event) => {
                    if (event.type === "status") {
                        setStatusText(event.text)
                    } else if (event.type === "token") {
                        if (!assistantAdded) {
                            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "" }])
                            setStreamingIdx(streamingMsgIdx)
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
                        setStreamingIdx(null)
                        setMessages(prev => { saveHistory(userId, prev); return prev })
                        setLoading(false)
                        setStatusText("")
                    } else if (event.type === "error") {
                        const errMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: `Error: ${event.text}`, isError: true }
                        setStreamingIdx(null)
                        setMessages(prev => {
                            const next = assistantAdded ? [...prev.slice(0, -1), errMsg] : [...prev, errMsg]
                            saveHistory(userId, next)
                            return next
                        })
                        setLoading(false)
                        setStatusText("")
                    }
                },
                () => abortRef.current !== controller
            )

            if (!assistantAdded) {
                setMessages(prev => {
                    const next = [...prev, { id: crypto.randomUUID(), role: "assistant" as const, content: "No response", isError: true }]
                    saveHistory(userId, next)
                    return next
                })
            }

        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return
            if (abortRef.current !== controller) return
            setMessages(prev => {
                const next = [...prev, {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                    isError: true,
                }]
                saveHistory(userId, next)
                return next
            })
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null
                setLoading(false)
                setStatusText("")
                setStreamingIdx(null)
            }
        }
    }, [apiKey, model, userId])

    const handleSend = useCallback(async () => {
        if (!input.trim() || loading) return
        const content = input.trim()
        setInput("")
        await sendMessage(content, messages)
    }, [input, loading, messages, sendMessage])

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
    }

    function handleEdit(idx: number, newContent: string) {
        if (!newContent.trim() || loading) return
        void sendMessage(newContent.trim(), messages.slice(0, idx))
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
        saveHistory(userId, [])
    }

    function handleRetry() {
        // Encontrar el índice del último mensaje del usuario
        const lastUserIdx = messages.map(m => m.role).lastIndexOf("user")
        if (lastUserIdx === -1) return
        const content = messages[lastUserIdx].content
        // Eliminar desde el último mensaje de usuario en adelante (usuario + respuesta de error)
        setMessages(prev => prev.slice(0, lastUserIdx))
        setInput(content)
    }

    return {
        messages,
        input, setInput,
        loading, statusText, streamingIdx,
        messagesEndRef, inputRef,
        handleSend, handleKeyDown, handleEdit,
        copyToClipboard, copyChat, clearMessages, handleRetry,
    }
}
