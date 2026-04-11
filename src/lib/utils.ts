import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

/**
 * Get display initials from a name or email.
 * - "Sara Chen" → "SC"
 * - "alex@company.com" → "AL"
 */
export function getInitials(value: string): string {
  const parts = value.split(/[\s@]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return value.slice(0, 2).toUpperCase()
}
