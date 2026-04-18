import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"

interface AvatarFieldProps {
    initials: string
    disabled?: boolean
}

export function AvatarField({ initials, disabled }: AvatarFieldProps) {
    return (
        <Field>
            <FieldLabel>Avatar</FieldLabel>
            <div className="flex items-center gap-4">
                <Avatar className="size-18">
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => toast.info("Photo upload coming soon")}
                        disabled={disabled}
                    >
                        Upload photo
                    </Button>
                    <FieldDescription>JPG, PNG or GIF. Max 2 MB.</FieldDescription>
                </div>
            </div>
        </Field>
    )
}
