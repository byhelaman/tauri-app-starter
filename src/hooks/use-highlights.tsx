import { useState } from "react"
import {
  TOGGLE_THEMES,
  ToggleActionButtons,
  type ToggleThemeKey,
} from "@/components/toggle-action-buttons"

export type HighlightConfig<TData> = {
  id: string
  label: string
  icon?: React.ElementType
  theme: ToggleThemeKey
  condition: (row: TData) => boolean
}

// 2. The core, fully generic Hook
export function useHighlights<TData>(configs: HighlightConfig<TData>[]) {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toolbarActions = (
    <ToggleActionButtons
      items={configs.map((config) => ({
        id: config.id,
        label: config.label,
        icon: config.icon,
        theme: config.theme,
        active: activeIds.has(config.id),
        onToggle: () => toggle(config.id),
      }))}
    />
  )

  const rowClassName = (row: TData) => {
    // Configs are evaluated in order, first match wins
    for (const config of configs) {
      if (activeIds.has(config.id) && config.condition(row)) {
        return TOGGLE_THEMES[config.theme].rowActive
      }
    }
    return undefined
  }

  return { toolbarActions, rowClassName }
}
