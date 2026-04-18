import { useState, useEffect, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { MessageCircle, X, Settings, Send, ChevronLeft, Bot, Copy, Check, RefreshCw, Trash2, ClipboardCopy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyMedia, EmptyDescription } from "@/components/ui/empty"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useChat } from "@/components/use-chat"
import { ChatSettingsForm, DEFAULT_MODEL } from "@/components/chat-settings-form"

const STORAGE_KEY_API_KEY = "ai_api_key"
const STORAGE_KEY_MODEL = "ai_model"

type WidgetView = "chat" | "setup" | "settings"

export function ChatWidget() {
    const [open, setOpen] = useState(false)
    const [view, setView] = useState<WidgetView>("chat")
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
    const [chatCopied, setChatCopied] = useState(false)

    const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY_API_KEY) ?? "")
    const [model, setModel] = useState(() => localStorage.getItem(STORAGE_KEY_MODEL) ?? DEFAULT_MODEL)

    const {
        messages, setMessages,
        input, setInput,
        loading,
        messagesEndRef, inputRef,
        handleSend, handleKeyDown,
        copyToClipboard, copyChat, clearMessages, handleRetry,
    } = useChat(apiKey, model)

    // Focus al input al entrar en vista chat
    useEffect(() => {
        if (view === "chat" && open) {
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [view, open, inputRef])

    function handleOpen() {
        setView(apiKey ? "chat" : "setup")
        setOpen(true)
    }

    function handleSave(newApiKey: string, newModel: string) {
        setApiKey(newApiKey)
        setModel(newModel)
        localStorage.setItem(STORAGE_KEY_API_KEY, newApiKey)
        localStorage.setItem(STORAGE_KEY_MODEL, newModel)
        setView("chat")
    }

    function handleReset() {
        localStorage.removeItem(STORAGE_KEY_API_KEY)
        localStorage.removeItem(STORAGE_KEY_MODEL)
        setApiKey("")
        setModel(DEFAULT_MODEL)
        setMessages([])
        setView("setup")
    }

    const handleCopyMessage = useCallback((text: string, idx: number) => {
        copyToClipboard(text)
        setCopiedIdx(idx)
        setTimeout(() => setCopiedIdx(null), 1500)
    }, [copyToClipboard])

    function handleCopyChat() {
        copyChat()
        setChatCopied(true)
        setTimeout(() => setChatCopied(false), 1500)
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
        <Card className="fixed bottom-4 right-4 z-50 w-85 h-125 shadow-xl gap-0 py-0">
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
                            Enter your Vercel AI Gateway API key to enable the chat.
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
                                    "group flex flex-col gap-0.5",
                                    msg.role === "user" ? "items-end" : "items-start"
                                )}
                            >
                                {msg.role === "user" ? (
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
                                    </div>
                                )}
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        className="text-muted-foreground"
                                        onClick={() => handleCopyMessage(msg.content, i)}
                                        aria-label="Copy message"
                                    >
                                        {copiedIdx === i ? <Check className="size-3" /> : <Copy className="size-3" />}
                                    </Button>
                                    {msg.isError && i === messages.length - 1 && (
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            className="text-muted-foreground"
                                            onClick={handleRetry}
                                            aria-label="Retry"
                                        >
                                            <RefreshCw className="size-3" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="self-start bg-muted rounded-lg px-3 py-2">
                                <Spinner className="text-muted-foreground" />
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
