import { useMemo, useRef, useState } from "react"
import type { Row, Table } from "@tanstack/react-table"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Field,
    FieldContent,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "@/components/ui/field"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupTextarea,
} from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import type { Scope } from "./table-formats"
import { getScopeRows } from "./table-formats"
import {
    BULK_COPY_DEFAULT_TEMPLATE,
    bulkCopySettingsKey,
    csvEscape,
    parseBulkCopyTemplate,
    readBulkCopySettings,
    type BulkCopyFormat,
    type BulkCopySettings,
    type BulkCopyToken,
} from "./bulk-copy"

type Token = BulkCopyToken

interface BulkCopyDialogProps<TData> {
    table: Table<TData>
    tableId: string
    scope: Scope
    open: boolean
    onOpenChange: (open: boolean) => void
}

function renderRow<TData>(tokens: Token[], row: Row<TData>): string {
    const record = row.original as Record<string, unknown>
    let out = ""

    for (const token of tokens) {
        if (token.type === "text") {
            out += token.value
            continue
        }
        if (!token.valid) {
            out += `{${token.name}}`
            continue
        }
        const value = record[token.name]
        out += value == null ? "" : String(value)
    }

    return out
}

function getCopyFieldIds<TData>(table: Table<TData>): string[] {
    return table
        .getAllColumns()
        .filter((column) => typeof column.accessorFn !== "undefined" && column.id !== "select" && column.id !== "actions")
        .map((column) => column.id)
}

function buildText<TData>(
    rows: Row<TData>[],
    format: BulkCopyFormat,
    fields: string[],
    headers: boolean,
    parsed: Token[],
): string {
    if (rows.length === 0) return ""

    if (format === "custom") {
        return rows.map((row) => renderRow(parsed, row)).join("\n")
    }

    if (fields.length === 0) return ""

    if (format === "json") {
        const records = rows.map((row) => {
            const original = row.original as Record<string, unknown>
            return Object.fromEntries(fields.map((field) => [field, original[field]]))
        })
        return JSON.stringify(records, null, 2)
    }

    const separator = format === "csv" ? "," : format === "tsv" ? "\t" : " - "
    const lines = rows.map((row) => {
        const original = row.original as Record<string, unknown>
        return fields.map((field) => {
            const value = original[field]
            const text = value == null ? "" : String(value)
            if (format === "csv") return csvEscape(text)
            if (format === "tsv") return text.replace(/\t/g, " ")
            return text
        }).join(separator)
    })

    if ((format === "csv" || format === "tsv") && headers) {
        const headerLine = format === "csv"
            ? fields.map(csvEscape).join(",")
            : fields.join("\t")
        return [headerLine, ...lines].join("\n")
    }

    return lines.join("\n")
}

function parseFormat(value: string | undefined): BulkCopyFormat {
    return value === "lines" || value === "csv" || value === "tsv" || value === "json" || value === "custom"
        ? value
        : "lines"
}

export function BulkCopyDialog<TData>({ table, tableId, scope, open, onOpenChange }: BulkCopyDialogProps<TData>) {
    // Solo se lee una vez por tableId — los inicializadores lazy de useState lo consumen una sola vez
    const savedSettings = useMemo(() => readBulkCopySettings(tableId), [tableId])
    const [format, setFormat] = useState<BulkCopyFormat>(() => parseFormat(savedSettings?.format))
    const [headers, setHeaders] = useState<boolean>(() => savedSettings?.headers ?? true)
    const [template, setTemplate] = useState<string>(() => savedSettings?.template ?? BULK_COPY_DEFAULT_TEMPLATE)
    const [fields, setFields] = useState<string[]>(() => savedSettings?.fields ?? getCopyFieldIds(table).slice(0, 1))
    const templateRef = useRef<HTMLTextAreaElement>(null)

    // Al cerrar el dialog (sin guardar o tras guardar), se descarta el estado
    // no persistido restaurando los ajustes guardados en localStorage.
    // Esto ocurre en el handler de evento, no en un efecto.
    function handleOpenChange(next: boolean) {
        if (!next) {
            const saved = readBulkCopySettings(tableId)
            setFormat(parseFormat(saved?.format))
            setHeaders(saved?.headers ?? true)
            setTemplate(saved?.template ?? BULK_COPY_DEFAULT_TEMPLATE)
            setFields(saved?.fields ?? getCopyFieldIds(table).slice(0, 1))
        }
        onOpenChange(next)
    }

    function resetToDefaults() {
        setFormat("lines")
        setHeaders(true)
        setTemplate(BULK_COPY_DEFAULT_TEMPLATE)
        setFields(getCopyFieldIds(table).slice(0, 1))
    }

    const rows = getScopeRows(table, scope)
    const fieldOptions = useMemo(() => getCopyFieldIds(table), [table])
    const selectedFields = useMemo(
        () => fields.filter((field) => fieldOptions.includes(field)),
        [fields, fieldOptions],
    )

    const parsed = useMemo(() => parseBulkCopyTemplate(template, new Set(fieldOptions)), [template, fieldOptions])
    const invalidFields = useMemo(
        () => Array.from(new Set(parsed.flatMap((token) => token.type === "field" && !token.valid ? [token.name] : []))),
        [parsed],
    )

    const disableHeaders = format === "lines" || format === "json" || format === "custom"
    const previewText = buildText(rows.slice(0, 2), format, selectedFields, headers, parsed)

    function insertToken(token: string) {
        const element = templateRef.current
        if (!element) {
            setTemplate((previous) => previous + token)
            return
        }

        const start = element.selectionStart ?? template.length
        const end = element.selectionEnd ?? template.length
        const next = template.slice(0, start) + token + template.slice(end)
        setTemplate(next)

        requestAnimationFrame(() => {
            element.focus()
            const cursor = start + token.length
            element.setSelectionRange(cursor, cursor)
        })
    }

    function saveSettings() {
        try {
            const payload: BulkCopySettings = {
                format,
                headers,
                template,
                fields: selectedFields,
            }
            localStorage.setItem(bulkCopySettingsKey(tableId), JSON.stringify(payload))
            toast.success("Bulk copy settings saved")
            handleOpenChange(false)
        } catch {
            toast.error("Could not save settings")
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Bulk Copy</DialogTitle>
                    <DialogDescription>
                        Configure how rows are formatted when copied.
                    </DialogDescription>
                </DialogHeader>

                <DialogBody className="py-1">
                    <FieldSet className="min-w-0">
                        <Field>
                            <FieldLabel>Format</FieldLabel>
                            <Select value={format} onValueChange={(value) => setFormat(value as BulkCopyFormat)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="lines">One per line</SelectItem>
                                        <SelectItem value="csv">CSV</SelectItem>
                                        <SelectItem value="tsv">TSV</SelectItem>
                                        <SelectItem value="json">JSON</SelectItem>
                                        <SelectItem value="custom">Custom template</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>

                        {format === "custom" ? (
                            <>
                                <Field className="min-w-0">
                                    <FieldLabel htmlFor="bulk-copy-template">Template</FieldLabel>
                                    <InputGroup>
                                        <InputGroupTextarea
                                            id="bulk-copy-template"
                                            ref={templateRef}
                                            value={template}
                                            onChange={(e) => setTemplate(e.target.value)}
                                            className="max-h-30 scrollbar"
                                            spellCheck={false}
                                            placeholder="{code} - {customer}"
                                        />
                                        <InputGroupAddon align="block-end" className="flex-wrap gap-1">
                                            {fieldOptions.map((field) => (
                                                <InputGroupButton
                                                    key={field}
                                                    variant="outline"
                                                    className="border-dashed font-normal"
                                                    onClick={() => insertToken(`{${field}}`)}
                                                >
                                                    {field}
                                                </InputGroupButton>
                                            ))}
                                            <InputGroupButton
                                                variant="outline"
                                                className="border-dashed font-normal"
                                                onClick={() => insertToken("\\n")}
                                            >
                                                {"\\n"}
                                            </InputGroupButton>
                                            <InputGroupButton
                                                variant="outline"
                                                className="border-dashed font-normal"
                                                onClick={() => insertToken("\\t")}
                                            >
                                                {"\\t"}
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    </InputGroup>
                                    {invalidFields.length > 0 && (
                                        <FieldError>
                                            Unknown: {invalidFields.map((field) => `{${field}}`).join(", ")}
                                        </FieldError>
                                    )}
                                </Field>

                            </>
                        ) : (
                            <>
                                <Field orientation="horizontal">
                                    <Checkbox
                                        id="bulk-copy-headers"
                                        checked={headers}
                                        disabled={disableHeaders}
                                        onCheckedChange={(value) => setHeaders(!!value)}
                                    />
                                    <FieldContent>
                                        <FieldLabel htmlFor="bulk-copy-headers">Include headers</FieldLabel>
                                    </FieldContent>
                                </Field>

                                <FieldSet>
                                    <FieldLegend variant="label">Fields</FieldLegend>
                                    <FieldGroup className="grid grid-cols-2 gap-1.5">
                                        {fieldOptions.map((field) => (
                                            <Field key={field} orientation="horizontal">
                                                <Checkbox
                                                    id={`bulk-copy-field-${field}`}
                                                    checked={selectedFields.includes(field)}
                                                    onCheckedChange={(value) => {
                                                        setFields((previous) => {
                                                            if (value && !previous.includes(field)) return [...previous, field]
                                                            return previous.filter((item) => item !== field)
                                                        })
                                                    }}
                                                />
                                                <FieldContent>
                                                    <FieldLabel htmlFor={`bulk-copy-field-${field}`} className="capitalize">
                                                        {field}
                                                    </FieldLabel>
                                                </FieldContent>
                                            </Field>
                                        ))}
                                    </FieldGroup>
                                </FieldSet>
                            </>
                        )}

                        <Field>
                            <FieldLabel>Preview</FieldLabel>
                            <Textarea
                                readOnly
                                value={previewText.trim() ? previewText : "-"}
                                aria-label="Preview"
                                className="min-h-0 max-h-25 resize-none text-sm text-muted-foreground scrollbar font-mono py-1.5"
                            />
                        </Field>
                    </FieldSet>
                </DialogBody>

                <DialogFooter>
                    <Button variant="outline" onClick={resetToDefaults} className="mr-auto">
                        Reset
                    </Button>
                    <Button onClick={saveSettings}>
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
