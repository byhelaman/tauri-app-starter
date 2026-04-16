import type { LucideIcon } from "lucide-react"
import { KeyRoundIcon, LogInIcon, ShieldIcon, UserMinusIcon, UserPlusIcon } from "lucide-react"
import type { AuditAction } from "./types"

export const AUDIT_ACTION_META: Record<AuditAction, { icon: LucideIcon }> = {
  role_change: { icon: ShieldIcon },
  login: { icon: LogInIcon },
  permission_update: { icon: KeyRoundIcon },
  user_created: { icon: UserPlusIcon },
  user_removed: { icon: UserMinusIcon },
}
