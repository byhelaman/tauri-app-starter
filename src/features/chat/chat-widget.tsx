import { useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { MessageCircle, X, Settings, Send, ChevronLeft, Bot, Copy, Check, RefreshCw, Trash2, ClipboardCopy, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useChat } from "@/features/chat/use-chat"
import { ChatSettingsForm, DEFAULT_MODEL } from "@/features/chat/chat-settings-form"
import { apiKeyStorageKey, modelStorageKey } from "@/features/chat/chat-storage"
import { useAuth } from "@/contexts/auth-context"

type WidgetView = "chat" | "setup" | "settings"

export function ChatWidget() {
    const { user } = useAuth()
    const userId = user?.id ?? null
    const [open, setOpen] = useState(false)
    const [view, setView] = useState<WidgetView>("chat")
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
    const [chatCopied, setChatCopied] = useState(false)
    const [editingIdx, setEditingIdx] = useState<number | null>(null)
    const [editContent, setEditContent] = useState("")
    const editRef = useRef<HTMLTextAreaElement>(null)

    // Single source of truth: el padre remonta el widget con `key={userId}` al
    // cambiar de cuenta, así que useState inicializa fresco desde localStorage.
    const [apiKey, setApiKey] = useState(() =>
        userId ? (localStorage.getItem(apiKeyStorageKey(userId)) ?? "") : ""
    )
    const [model, setModel] = useState(() =>
        userId ? (localStorage.getItem(modelStorageKey(userId)) ?? DEFAULT_MODEL) : DEFAULT_MODEL
    )

    const {
        messages,
        input, setInput,
        loading, statusText, streamingIdx,
        messagesEndRef, inputRef,
        handleSend, handleKeyDown, handleEdit,
        copyToClipboard, copyChat, clearMessages, handleRetry,
    } = useChat(apiKey, model, userId)

    const lastUserMsgIdx = messages.map(m => m.role).lastIndexOf("user")

    // Focus al input al entrar en vista chat
    useEffect(() => {
        if (view === "chat" && open) {
            inputRef.current?.focus()
        }
    }, [view, open, inputRef])

    // Focus al textarea de edición al activar modo edición
    useEffect(() => {
        if (editingIdx !== null) {
            editRef.current?.focus()
        }
    }, [editingIdx])

    function handleOpen() {
        setView(apiKey ? "chat" : "setup")
        setOpen(true)
    }

    function handleSave(newApiKey: string, newModel: string) {
        setApiKey(newApiKey)
        setModel(newModel)
        if (userId) {
            localStorage.setItem(apiKeyStorageKey(userId), newApiKey)
            localStorage.setItem(modelStorageKey(userId), newModel)
        }
        setView("chat")
    }

    function handleReset() {
        if (userId) {
            localStorage.removeItem(apiKeyStorageKey(userId))
            localStorage.removeItem(modelStorageKey(userId))
        }
        setApiKey("")
        setModel(DEFAULT_MODEL)
        clearMessages()
        setView("setup")
    }

    function handleCopyMessage(text: string, idx: number) {
        copyToClipboard(text)
        setCopiedIdx(idx)
        setTimeout(() => setCopiedIdx(null), 1500)
    }

    function handleCopyChat() {
        copyChat()
        setChatCopied(true)
        setTimeout(() => setChatCopied(false), 1500)
    }

    function startEdit(idx: number, content: string) {
        setEditingIdx(idx)
        setEditContent(content)
    }

    function cancelEdit() {
        setEditingIdx(null)
        setEditContent("")
    }

    function confirmEdit() {
        if (editingIdx === null) return
        handleEdit(editingIdx, editContent)
        setEditingIdx(null)
        setEditContent("")
    }

    function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            confirmEdit()
        }
        if (e.key === "Escape") cancelEdit()
    }

    if (!open) {
        return (
            <Button
                className="fixed bottom-4 right-4 z-50"
                onClick={handleOpen}
                aria-label="Open AI chat"
            >
                <Bot />
                AI Chat
            </Button>
        )
    }

    return (
        <Card className="fixed bottom-4 right-4 z-50 w-96 h-[70vh] shadow-xl gap-0">
            <CardHeader className="flex flex-row items-center justify-between shrink-0 gap-0 space-y-0 pb-4">
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
                    <CardTitle>
                        <span>
                            {view === "settings" ? "Settings" : view === "setup" ? "Set up AI" : "AI Chat"}
                        </span>
                    </CardTitle>
                </div>
                <div className="flex items-center gap-1">
                    {view === "chat" && (
                        <>
                            {messages.length > 0 && (
                                <>
                                    <Button variant="ghost" size="icon" onClick={handleCopyChat} aria-label="Copy conversation">
                                        {chatCopied ? <Check data-icon /> : <ClipboardCopy data-icon />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={clearMessages} aria-label="Clear chat">
                                        <Trash2 data-icon />
                                    </Button>
                                </>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => setView("settings")} aria-label="Chat settings">
                                <Settings data-icon />
                            </Button>
                        </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close chat">
                        <X data-icon />
                    </Button>
                </div>
            </CardHeader>

            {/* Setup / Settings */}
            {(view === "setup" || view === "settings") && (
                <CardContent className="flex flex-col flex-1 min-h-0 p-4 gap-4 overflow-y-auto">
                    {view === "setup" && (
                        <p className="text-sm text-muted-foreground">
                            Enter your {" "}<a
                                href="https://vercel.com/ai-gateway"
                                target="_blank"
                                rel="noreferrer"
                                className="text-foreground underline underline-offset-4"
                            >
                                Vercel AI Gateway
                            </a>{" "} key to enable the chat.
                        </p>
                    )}
                    <ChatSettingsForm
                        key={view}
                        view={view}
                        currentApiKey={apiKey}
                        currentModel={model}
                        onSave={handleSave}
                        onReset={handleReset}
                    />
                </CardContent>
            )}

            {/* Chat */}
            {view === "chat" && (
                <>
                    <CardContent className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2 scrollbar">
                        {messages.length === 0 && (
                            <Empty className="border-none">
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <MessageCircle />
                                    </EmptyMedia>
                                    <EmptyTitle>No Messages Yet</EmptyTitle>
                                    <EmptyDescription>
                                        Ask questions about your data. The assistant queries the database in real time.
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        )}
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "group flex flex-col gap-0.5",
                                    msg.role === "user" ? "items-end" : "items-start"
                                )}
                            >
                                {/* Modo edición inline para mensajes del usuario */}
                                {msg.role === "user" && editingIdx === i ? (
                                    <div className="w-full max-w-[85%] flex flex-col gap-1.5">
                                        <Textarea
                                            ref={editRef}
                                            value={editContent}
                                            onChange={e => setEditContent(e.target.value)}
                                            onKeyDown={handleEditKeyDown}
                                            rows={Math.min(editContent.split("\n").length, 5)}
                                            className="text-sm resize-none min-h-0 py-1.5 scrollbar"
                                        />
                                        <div className="flex gap-1.5 justify-end">
                                            <Button size="xs" variant="outline" onClick={cancelEdit}>Cancel</Button>
                                            <Button size="xs" onClick={confirmEdit} disabled={!editContent.trim()}>Send</Button>
                                        </div>
                                    </div>
                                ) : msg.role === "user" ? (
                                    <div className="text-sm max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-lg px-3 py-1.5 bg-muted text-foreground">
                                        {msg.content}
                                    </div>
                                ) : (
                                    <div className="text-sm max-w-[85%] px-1 py-0.5 space-y-1">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                                                ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                                                ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                                code: ({ children, className }) => className
                                                    ? <code className="block overflow-x-auto rounded bg-muted px-3 py-2 text-xs font-mono whitespace-pre">{children}</code>
                                                    : <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{children}</code>,
                                                pre: ({ children }) => <>{children}</>,
                                                table: ({ children }) => (
                                                    <div className="overflow-x-auto my-1 scrollbar">
                                                        <table className="w-full border-collapse">{children}</table>
                                                    </div>
                                                ),
                                                th: ({ children }) => <th className="border border-border px-2 py-1 bg-muted font-medium text-left">{children}</th>,
                                                td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                        {/* Cursor de streaming mientras llegan tokens */}
                                        {msg.role === "assistant" && streamingIdx === i && (
                                            <span className="inline-block w-0.5 h-3.5 bg-current align-middle ml-0.5 animate-pulse" />
                                        )}
                                    </div>
                                )}

                                {/* Botones de acción — ocultos hasta hover */}
                                {editingIdx !== i && (
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            className="text-muted-foreground"
                                            onClick={() => handleCopyMessage(msg.content, i)}
                                            aria-label="Copy message"
                                        >
                                            {copiedIdx === i ? <Check /> : <Copy />}
                                        </Button>
                                        {msg.role === "user" && !loading && i === lastUserMsgIdx && (
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-muted-foreground"
                                                onClick={() => startEdit(i, msg.content)}
                                                aria-label="Edit message"
                                            >
                                                <Pencil />
                                            </Button>
                                        )}
                                        {msg.isError && i === messages.length - 1 && (
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-muted-foreground"
                                                onClick={handleRetry}
                                                aria-label="Retry"
                                            >
                                                <RefreshCw />
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Indicador de carga / estado de tool calls */}
                        {loading && (
                            <div className="self-start flex items-center gap-2 px-1 py-1">
                                <Spinner className="size-3 text-muted-foreground shrink-0" />
                                {statusText && (
                                    <span className="text-xs text-muted-foreground">{statusText}</span>
                                )}
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </CardContent>

                    <CardFooter className="shrink-0 p-3 border-none bg-transparent">
                        <InputGroup>
                            <InputGroupTextarea
                                ref={inputRef}
                                placeholder="Ask a question..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={Math.min(input.split("\n").length, 5)}
                                className="min-h-0 max-h-30 scrollbar"
                            />
                            <InputGroupAddon align="block-end">
                                <InputGroupButton
                                    variant="default"
                                    size="sm"
                                    className="ml-auto"
                                    onClick={() => void handleSend()}
                                    disabled={loading}
                                    aria-label="Send message"
                                >
                                    <Send />
                                    Send
                                </InputGroupButton>
                            </InputGroupAddon>
                        </InputGroup>
                    </CardFooter>
                </>
            )}
        </Card>
    )
}
