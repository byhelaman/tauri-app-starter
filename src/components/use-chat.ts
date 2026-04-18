import { useState, useRef, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

export interface Message {
    role: "user" | "assistant"
    content: string
    isError?: boolean
}

export function useChat(apiKey: string, model: string) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

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
    }, [input, loading, messages, apiKey, model])

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
        copyToClipboard, copyChat, handleRetry,
    }
}
