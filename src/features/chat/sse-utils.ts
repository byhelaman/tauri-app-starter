export type SSEEvent =
    | { type: "status"; text: string }
    | { type: "token"; text: string }
    | { type: "done" }
    | { type: "error"; text: string }

export async function processSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onEvent: (event: SSEEvent) => void,
    shouldAbort: () => boolean
) {
    const decoder = new TextDecoder()
    let buf = ""

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (shouldAbort()) return

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            let event: SSEEvent
            try {
                event = JSON.parse(line.slice(6))
            } catch {
                continue
            }

            if (shouldAbort()) return
            onEvent(event)
        }
    }
}
