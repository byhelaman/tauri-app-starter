import { useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { FileSpreadsheet, FileText, Trash2, UploadCloud } from "lucide-react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/utils"

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const
const ACCEPTED_MIME_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILES = 10

function hasAcceptedExtension(name: string) {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function isAcceptedFile(file: File) {
  return hasAcceptedExtension(file.name) || ACCEPTED_MIME_TYPES.includes(file.type)
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

const schema = z.object({
  files: z
    .array(z.instanceof(File))
    .min(1, "Add at least one file to import.")
    .max(MAX_FILES, `Up to ${MAX_FILES} files can be imported at once.`),
})

type FormValues = z.infer<typeof schema>

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const { control, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { files: [] },
    mode: "onChange",
  })

  function handleClose(next: boolean) {
    if (!next) reset({ files: [] })
    onOpenChange(next)
  }

  function mergeFiles(current: File[], incoming: FileList | File[]): File[] {
    const seen = new Set(current.map(fileKey))
    const next = [...current]
    const rejectedType: string[] = []
    const rejectedSize: string[] = []
    let availableSlots = MAX_FILES - current.length
    let exceededLimit = false

    for (const file of Array.from(incoming)) {
      if (!isAcceptedFile(file)) {
        rejectedType.push(file.name)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        rejectedSize.push(file.name)
        continue
      }
      const key = fileKey(file)
      if (seen.has(key)) continue
      if (availableSlots <= 0) {
        exceededLimit = true
        continue
      }
      seen.add(key)
      next.push(file)
      availableSlots -= 1
    }

    if (rejectedType.length > 0) {
      toast.error("Unsupported file type", { description: rejectedType.join(", ") })
    }
    if (rejectedSize.length > 0) {
      toast.error("File too large (max 10 MB)", { description: rejectedSize.join(", ") })
    }
    if (exceededLimit) {
      toast.error(`Only ${MAX_FILES} files can be imported at once.`)
    }

    return next
  }

  const onSubmit = handleSubmit((values) => {
    toast.success(`${values.files.length} file${values.files.length === 1 ? "" : "s"} ready to import`)
    handleClose(false)
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import orders</DialogTitle>
          <DialogDescription>
            Drag and drop CSV or Excel files, or click to browse. Up to {MAX_FILES} files, 10 MB each.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="contents">
          <DialogBody>
            <Controller
              name="files"
              control={control}
              render={({ field }) => (
                <Field>
                  <div className="p-1">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => inputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          inputRef.current?.click()
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragging(true)
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragging(false)
                        if (e.dataTransfer.files.length > 0) {
                          field.onChange(mergeFiles(field.value, e.dataTransfer.files))
                        }
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center transition-all cursor-pointer outline-none",
                        "hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        dragging && "border-primary bg-primary/5"
                      )}
                    >
                      <UploadCloud className="size-6 text-muted-foreground" />
                      <div className="text-sm">
                        <span className="font-medium">Click to browse</span>
                        <span className="text-muted-foreground"> or drop files here</span>
                      </div>
                      <p className="text-xs text-muted-foreground">CSV, XLSX, XLS · up to 10 MB each</p>
                    </div>
                  </div>

                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={[...ACCEPTED_EXTENSIONS, ...ACCEPTED_MIME_TYPES].join(",")}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        field.onChange(mergeFiles(field.value, e.target.files))
                      }
                      e.target.value = ""
                    }}
                  />

                  {field.value.length > 0 && (
                    <ItemGroup className="gap-1.5 mt-3 max-h-64 overflow-y-auto p-1 scrollbar">
                      {field.value.map((file) => {
                        const invalid = !isAcceptedFile(file) || file.size > MAX_FILE_SIZE
                        const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.name)
                        return (
                          <Item
                            key={fileKey(file)}
                            variant="outline"
                            size="sm"
                            data-invalid={invalid || undefined}
                          >
                            <ItemMedia variant="icon">
                              {isSpreadsheet ? <FileSpreadsheet /> : <FileText />}
                            </ItemMedia>
                            <ItemContent>
                              <ItemTitle className="w-full truncate block">{file.name}</ItemTitle>
                              <ItemDescription>
                                {formatSize(file.size)}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                aria-label={`Remove ${file.name}`}
                                onClick={() =>
                                  field.onChange(field.value.filter((f) => fileKey(f) !== fileKey(file)))
                                }
                              >
                                <Trash2 data-icon />
                              </Button>
                            </ItemActions>
                          </Item>
                        )
                      })}
                    </ItemGroup>
                  )}

                </Field>
              )}
            />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Close
            </Button>
            <Button type="submit" disabled={!formState.isValid}>
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
