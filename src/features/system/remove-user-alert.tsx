import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { SystemUser } from "./types"

export interface RemoveUserAlertProps {
    user: SystemUser | null
    onOpenChange: (open: boolean) => void
    onConfirm: (userId: string) => Promise<void>
    busy?: boolean
}

export function RemoveUserAlert({ user, onOpenChange, onConfirm, busy }: RemoveUserAlertProps) {
    return (
        <AlertDialog open={!!user} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove user?</AlertDialogTitle>
                    <AlertDialogDescription>
                        <span className="font-medium">{user?.displayName || user?.email}</span> will be removed from the workspace. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        onClick={() => user ? void onConfirm(user.id) : undefined}
                        disabled={busy}
                    >
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
