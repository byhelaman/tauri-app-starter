import { Button } from "@/components/ui/button"

export const TOGGLE_THEMES = {
  green: {
    buttonActive: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 hover:text-green-600 dark:hover:text-green-400 border-green-400 dark:border-green-500 border-dashed transition-colors",
    rowActive: "[--highlight-bg:color-mix(in_srgb,var(--color-green-500)_5%,var(--table-bg,var(--background)))] [--highlight-accent:var(--color-green-500)] shadow-[inset_2px_0_0_0_var(--color-green-500)] bg-green-500/5 transition-colors",
  },
  red: {
    buttonActive: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 border-red-400 dark:border-red-500 border-dashed transition-colors",
    rowActive: "[--highlight-bg:color-mix(in_srgb,var(--color-red-500)_5%,var(--table-bg,var(--background)))] [--highlight-accent:var(--color-red-500)] shadow-[inset_2px_0_0_0_var(--color-red-500)] bg-red-500/5 transition-colors",
  },
  blue: {
    buttonActive: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400 border-blue-400 dark:border-blue-500 border-dashed transition-colors",
    rowActive: "[--highlight-bg:color-mix(in_srgb,var(--color-blue-500)_5%,var(--table-bg,var(--background)))] [--highlight-accent:var(--color-blue-500)] shadow-[inset_2px_0_0_0_var(--color-blue-500)] bg-blue-500/5 transition-colors",
  },
  amber: {
    buttonActive: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 hover:text-amber-600 dark:hover:text-amber-400 border-amber-400 dark:border-amber-500 border-dashed transition-colors",
    rowActive: "[--highlight-bg:color-mix(in_srgb,var(--color-amber-500)_5%,var(--table-bg,var(--background)))] [--highlight-accent:var(--color-amber-500)] shadow-[inset_2px_0_0_0_var(--color-amber-500)] bg-amber-500/5 transition-colors",
  },
} as const

export type ToggleThemeKey = keyof typeof TOGGLE_THEMES

export interface ToggleActionItem {
  id: string
  label: string
  icon?: React.ElementType
  theme: ToggleThemeKey
  active: boolean
  onToggle: () => void
}

interface ToggleActionButtonsProps {
  items: ToggleActionItem[]
}

export function ToggleActionButtons({ items }: ToggleActionButtonsProps) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Button
            key={item.id}
            variant="outline"
            onClick={item.onToggle}
            className={item.active ? TOGGLE_THEMES[item.theme].buttonActive : "border-dashed"}
          >
            {Icon && <Icon />}
            {item.label}
          </Button>
        )
      })}
    </>
  )
}
