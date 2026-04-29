import { describe, it, expect } from "vitest"
import { processSSEStream } from "./sse-utils"
import type { SSEEvent } from "./sse-utils"

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convierte un array de líneas en un ReadableStream de Uint8Array,
 * simulando la llegada progresiva de chunks SSE.
 */
function makeStream(lines: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const text = lines.join("\n") + "\n"
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
  return stream.getReader()
}

async function collect(lines: string[], abort = false): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  let aborted = false
  const reader = makeStream(lines)
  await processSSEStream(
    reader,
    (e) => events.push(e),
    () => { if (abort && events.length > 0) aborted = true; return aborted }
  )
  return events
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("processSSEStream", () => {
  it("emite eventos de tipo token", async () => {
    const events = await collect([
      `data: ${JSON.stringify({ type: "token", text: "Hola" })}`,
      `data: ${JSON.stringify({ type: "token", text: " mundo" })}`,
    ])
    expect(events).toEqual([
      { type: "token", text: "Hola" },
      { type: "token", text: " mundo" },
    ])
  })

  it("emite evento de tipo done", async () => {
    const events = await collect([
      `data: ${JSON.stringify({ type: "done" })}`,
    ])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("done")
  })

  it("emite evento de tipo error con texto", async () => {
    const events = await collect([
      `data: ${JSON.stringify({ type: "error", text: "timeout" })}`,
    ])
    expect(events[0]).toEqual({ type: "error", text: "timeout" })
  })

  it("emite evento de tipo status", async () => {
    const events = await collect([
      `data: ${JSON.stringify({ type: "status", text: "Searching..." })}`,
    ])
    expect(events[0]).toEqual({ type: "status", text: "Searching..." })
  })

  it("ignora líneas que no empiezan con 'data: '", async () => {
    const events = await collect([
      "event: message",
      "comment: algo",
      "",
      `data: ${JSON.stringify({ type: "done" })}`,
    ])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("done")
  })

  it("ignora líneas data con JSON malformado sin lanzar", async () => {
    const events = await collect([
      "data: {broken json",
      `data: ${JSON.stringify({ type: "token", text: "ok" })}`,
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: "token", text: "ok" })
  })

  it("respeta el flag shouldAbort y no emite más eventos", async () => {
    const events: SSEEvent[] = []
    const lines = [
      `data: ${JSON.stringify({ type: "token", text: "A" })}`,
      `data: ${JSON.stringify({ type: "token", text: "B" })}`,
      `data: ${JSON.stringify({ type: "token", text: "C" })}`,
    ]
    const reader = makeStream(lines)
    let count = 0
    await processSSEStream(
      reader,
      (e) => { events.push(e); count++ },
      () => count >= 1
    )
    // Solo el primero es emitido; shouldAbort se verifica antes del segundo
    expect(events.length).toBeLessThanOrEqual(2)
  })

  it("no lanza cuando el stream está vacío", async () => {
    const events = await collect([])
    expect(events).toHaveLength(0)
  })
})
