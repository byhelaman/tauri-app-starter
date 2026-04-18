import { useState, useRef, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

export interface Message {
    role: "user" | "assistant"
    content: string
    isError?: boolean
}

const STORAGE_KEY_HISTORY = "ai_chat_history"
const MAX_HISTORY = 100

function loadHistory(): Message[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY)
        if (!raw) return []
        return JSON.parse(raw) as Message[]
    } catch {
        return []
    }
}

function saveHistory(messages: Message[]) {
    try {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(messages.slice(-MAX_HISTORY)))
    } catch {
        // silencioso — localStorage puede estar lleno
    }
}

export function useChat(apiKey: string, model: string) {
    const [messages, setMessagesRaw] = useState<Message[]>(loadHistory)
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Persiste el historial cada vez que cambian los mensajes
    useEffect(() => {
        saveHistory(messages)
    }, [messages])

    // Wrapper que persiste y actualiza a la vez
    const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
        setMessagesRaw(prev => {
            const next = typeof updater === "function" ? updater(prev) : updater
            saveHistory(next)
            return next
        })
    }, [])

    // Scroll automático al último mensaje
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, loading])

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
                {
                    role: "assistant",
                    content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                    isError: true,
                },
            ])
        } finally {
            setLoading(false)
        }
    }, [input, loading, messages, apiKey, model, setMessages])

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
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
        loading,
        messagesEndRef, inputRef,
        handleSend, handleKeyDown,
        copyToClipboard, copyChat, clearMessages, handleRetry,
    }
}
