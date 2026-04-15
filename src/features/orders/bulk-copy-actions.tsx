import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Copy, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { Order } from "./columns"

type CopyFormat = "lines" | "csv" | "tsv" | "json" | "custom"

const FIELDS: readonly (keyof Order)[] = [
  "code", "date", "customer", "product", "category",
  "status", "channel", "quantity", "amount",
] as const

const FIELD_SET = new Set<string>(FIELDS as readonly string[])

type Token =
  | { type: "text"; value: string }
  | { type: "field"; name: keyof Order; valid: true }
  | { type: "field"; name: string; valid: false }

function parseTemplate(template: string): Token[] {
  const tokens: Token[] = []
  const re = /\{([a-zA-Z_][\w]*)\}|\\n|\\t|\\\\|\\\{|\\\}|[^\\{]+|\\|\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    const raw = m[0]
    if (m[1] !== undefined) {
      const name = m[1]
      if (FIELD_SET.has(name)) {
        tokens.push({ type: "field", name: name as keyof Order, valid: true })
      } else {
        tokens.push({ type: "field", name, valid: false })
      }
    } else if (raw === "\\n") pushText(tokens, "\n")
    else if (raw === "\\t") pushText(tokens, "\t")
    else if (raw === "\\\\") pushText(tokens, "\\")
    else if (raw === "\\{") pushText(tokens, "{")
    else if (raw === "\\}") pushText(tokens, "}")
    else pushText(tokens, raw)
  }
  return tokens
}

function pushText(tokens: Token[], value: string) {
  const last = tokens[tokens.length - 1]
  if (last && last.type === "text") last.value += value
  else tokens.push({ type: "text", value })
}

function renderRow(tokens: Token[], row: Order): string {
  let out = ""
  for (const t of tokens) {
    if (t.type === "text") out += t.value
    else if (t.valid) out += String(row[t.name] ?? "")
    else out += `{${t.name}}`
  }
  return out
}

const DEFAULT_TEMPLATE = "{code} · {customer} — {amount}"

interface BulkCopyContextValue {
  selected: Order[]
  fields: (keyof Order)[]
  setFields: React.Dispatch<React.SetStateAction<(keyof Order)[]>>
  format: CopyFormat
  setFormat: React.Dispatch<React.SetStateAction<CopyFormat>>
  headers: boolean
  setHeaders: React.Dispatch<React.SetStateAction<boolean>>
  template: string
  setTemplate: React.Dispatch<React.SetStateAction<string>>
  canCopy: boolean
  buildText: (rows: Order[]) => string
  copy: () => void
  parsed: Token[]
  invalidFields: string[]
}

const BulkCopyContext = createContext<BulkCopyContextValue | null>(null)

function useBulkCopy() {
  const ctx = useContext(BulkCopyContext)
  if (!ctx) throw new Error("useBulkCopy must be used inside <BulkCopyProvider>")
  return ctx
}

interface BulkCopyProviderProps {
  selected: Order[]
  children: ReactNode
}

export function BulkCopyProvider({ selected, children }: BulkCopyProviderProps) {
  const [fields, setFields] = useState<(keyof Order)[]>(["code"])
  const [format, setFormat] = useState<CopyFormat>("lines")
  const [headers, setHeaders] = useState(true)
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)

  const parsed = useMemo(() => parseTemplate(template), [template])
  const invalidFields = useMemo(
    () => Array.from(new Set(
      parsed.flatMap((t) => t.type === "field" && !t.valid ? [t.name] : [])
    )),
    [parsed]
  )

  const value = useMemo<BulkCopyContextValue>(() => {
    const buildText = (rows: Order[]): string => {
      if (rows.length === 0) return ""
      if (format === "custom") return rows.map((r) => renderRow(parsed, r)).join("\n")
      if (fields.length === 0) return ""
      if (format === "json") {
        return JSON.stringify(
          rows.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]]))),
          null, 2
        )
      }
      const sep = format === "csv" ? "," : format === "tsv" ? "\t" : " · "
      const lines = rows.map((r) => fields.map((f) => String(r[f])).join(sep))
      return headers && (format === "csv" || format === "tsv")
        ? [fields.join(sep), ...lines].join("\n")
        : lines.join("\n")
    }

    const canCopy =
      selected.length > 0 &&
      (format === "custom" ? template.trim().length > 0 : fields.length > 0)

    const copy = () => {
      if (!canCopy) return
      navigator.clipboard.writeText(buildText(selected))
      toast.success(`${selected.length} orders copied`)
    }

    return {
      selected, fields, setFields, format, setFormat, headers, setHeaders,
      template, setTemplate, canCopy, buildText, copy, parsed, invalidFields,
    }
  }, [selected, fields, format, headers, template, parsed, invalidFields])

  return <BulkCopyContext.Provider value={value}>{children}</BulkCopyContext.Provider>
}

export function BulkCopyButton() {
  const { canCopy, copy } = useBulkCopy()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copy"
      disabled={!canCopy}
      onClick={copy}
    >
      <Copy />
    </Button>
  )
}

export function BulkCopySettings() {
  const {
    selected, fields, setFields, format, setFormat, headers, setHeaders,
    template, setTemplate, buildText, invalidFields,
  } = useBulkCopy()
  const templateRef = useRef<HTMLTextAreaElement>(null)

  const insertToken = (token: string) => {
    const el = templateRef.current
    if (!el) {
      setTemplate((prev) => prev + token)
      return
    }
    const start = el.selectionStart ?? template.length
    const end = el.selectionEnd ?? template.length
    const next = template.slice(0, start) + token + template.slice(end)
    setTemplate(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  const previewText = buildText(selected.slice(0, 2))
  const disableHeaders = format === "lines" || format === "json" || format === "custom"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Copy settings">
          <Settings2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80">
        <FieldSet className="min-w-0">
          <Field>
            <FieldLabel>Format</FieldLabel>
            <Select value={format} onValueChange={(v) => setFormat(v as CopyFormat)}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="lines">One per line</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="tsv">TSV (.tsv)</SelectItem>
                  <SelectItem value="json">JSON (.json)</SelectItem>
                  <SelectItem value="custom">Custom template</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {format === "custom" ? (
            <>
              <Field className="min-w-0">
                <FieldLabel htmlFor="copy-template">Template</FieldLabel>
                <Textarea
                  id="copy-template"
                  ref={templateRef}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="min-h-20 max-h-32 font-mono text-xs resize-none scrollbar"
                  spellCheck={false}
                  placeholder="{code} · {customer}"
                />
                {invalidFields.length > 0 && (
                  <FieldError>
                    Unknown: {invalidFields.map((n) => `{${n}}`).join(", ")}
                  </FieldError>
                )}
              </Field>
              <Field className="min-w-0">
                <FieldLabel>Insert</FieldLabel>
                <div className="flex flex-wrap gap-1">
                  {FIELDS.map((f) => (
                    <Button
                      key={f}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-1.5 font-mono text-xs"
                      onClick={() => insertToken(`{${f}}`)}
                    >
                      {f}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-1.5 font-mono text-xs"
                    onClick={() => insertToken("\\n")}
                  >
                    \n
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-1.5 font-mono text-xs"
                    onClick={() => insertToken("\\t")}
                  >
                    \t
                  </Button>
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field orientation="horizontal">
                <Checkbox
                  id="copy-headers"
                  checked={headers}
                  disabled={disableHeaders}
                  onCheckedChange={(v) => setHeaders(!!v)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="copy-headers">Include headers</FieldLabel>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>Fields</FieldLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {FIELDS.map((f) => (
                    <Field key={f} orientation="horizontal">
                      <Checkbox
                        id={`copy-field-${f}`}
                        checked={fields.includes(f)}
                        onCheckedChange={(v) =>
                          setFields((prev) => v ? [...prev, f] : prev.filter((x) => x !== f))
                        }
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`copy-field-${f}`} className="capitalize">{f}</FieldLabel>
                      </FieldContent>
                    </Field>
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field className="min-w-0">
            <FieldLabel>Preview</FieldLabel>
            <pre className="block max-w-full max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs text-muted-foreground whitespace-pre scrollbar">
              {previewText || "—"}
              {selected.length > 2 && previewText ? `\n…` : ""}
            </pre>
          </Field>
        </FieldSet>
      </PopoverContent>
    </Popover>
  )
}
