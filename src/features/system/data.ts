import type { LucideIcon } from "lucide-react"
import {
  KeyRoundIcon,
  LockIcon,
  PenIcon,
  ShieldIcon,
  ShieldPlusIcon,
  ShieldXIcon,
  TrashIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react"
import type { AuditAction } from "./types"

export const AUDIT_ACTION_META: Record<AuditAction, { icon: LucideIcon }> = {
  role_change: { icon: ShieldIcon },
  user_created: { icon: UserPlusIcon },
  user_removed: { icon: UserMinusIcon },
  account_deleted: { icon: TrashIcon },
  display_name_change: { icon: PenIcon },
  permission_update: { icon: KeyRoundIcon },
  role_created: { icon: ShieldPlusIcon },
  role_updated: { icon: ShieldIcon },
  role_deleted: { icon: ShieldXIcon },
  password_reset: { icon: LockIcon },
}
