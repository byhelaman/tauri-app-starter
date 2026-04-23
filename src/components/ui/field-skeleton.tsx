import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

interface FieldSkeletonProps {
    className?: string
    orientation?: "vertical" | "horizontal"
    hasDescription?: boolean
}

export function FieldSkeleton({
    className,
    orientation = "vertical",
    hasDescription = true,
}: FieldSkeletonProps) {
    if (orientation === "horizontal") {
        return (
            <div className={cn("flex items-center justify-between gap-4 py-1", className)}>
                <div className="flex flex-col gap-1 flex-1">
                    <Skeleton className="h-5 w-32" />
                    {hasDescription && <Skeleton className="h-5 w-60" />}
                </div>
                <Skeleton className="h-6 w-12 rounded-xl shrink-0" />
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-2 py-1", className)}>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-full rounded-lg" />
            {hasDescription && <Skeleton className="h-5 w-3/4" />}
        </div>
    )
}

interface FormSkeletonProps {
    rows?: number
    className?: string
    orientation?: "vertical" | "horizontal"
    hasDescription?: boolean
}

export function FormSkeleton({ rows = 3, className, orientation = "vertical", hasDescription = true }: FormSkeletonProps) {
    return (
        <div className={cn("flex flex-col gap-5", className)}>
            {Array.from({ length: rows }).map((_, i) => (
                <FieldSkeleton key={i} orientation={orientation} hasDescription={hasDescription} />
            ))}
        </div>
    )
}
