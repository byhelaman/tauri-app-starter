import { Button } from "@/components/ui/button"
import { TOGGLE_THEMES, type ToggleThemeKey } from "./toggle-action-themes"

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
