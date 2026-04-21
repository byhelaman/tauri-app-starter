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

export function joinSearchValues(values: readonly unknown[]): string {
  return values
    .map((value) => (value == null ? "" : String(value).toLocaleLowerCase().trim()))
    .filter(Boolean)
    .join(" ")
}

export function normalizeSearchGroups(query: string): string[][] {
  return query
    .toLocaleLowerCase()
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/).filter(Boolean))
    .filter((group) => group.length > 0)
}

export function matchesSearchGroups(haystack: string, groups: readonly (readonly string[])[]): boolean {
  if (groups.length === 0) return true
  return groups.some((group) => group.every((token) => haystack.includes(token)))
}

export function filterByMultiSearch<T>(
  items: readonly T[],
  query: string,
  pickSearchValues: (item: T) => readonly unknown[],
): T[] {
  const groups = normalizeSearchGroups(query)
  if (groups.length === 0) return [...items]

  return items.filter((item) => matchesSearchGroups(joinSearchValues(pickSearchValues(item)), groups))
}
