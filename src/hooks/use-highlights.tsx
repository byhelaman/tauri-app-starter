import { useState } from "react"
import { Button } from "@/components/ui/button"

// 1. Define reusable color themes
const THEMES = {
  green: {
    buttonActive: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 hover:text-green-600 dark:hover:text-green-400 border-green-400 dark:border-green-500 border-dashed transition-colors",
    rowActive: "shadow-[inset_2px_0_0_0_#4ade80] bg-green-500/5 hover:bg-green-500/10 transition-colors"
  },
  red: {
    buttonActive: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 border-red-400 dark:border-red-500 border-dashed transition-colors",
    rowActive: "shadow-[inset_2px_0_0_0_#f87171] bg-red-500/5 hover:bg-red-500/10 transition-colors"
  },
  blue: {
    buttonActive: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400 border-blue-400 dark:border-blue-500 border-dashed transition-colors",
    rowActive: "shadow-[inset_2px_0_0_0_#60a5fa] bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
  },
  amber: {
    buttonActive: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 hover:text-amber-600 dark:hover:text-amber-400 border-amber-400 dark:border-amber-500 border-dashed transition-colors",
    rowActive: "shadow-[inset_2px_0_0_0_#fbbf24] bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
  }
} as const

type ThemeKey = keyof typeof THEMES

export type HighlightConfig<TData> = {
  id: string
  label: string
  icon?: React.ElementType
  theme: ThemeKey
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
    <>
      {configs.map((config) => {
        const isActive = activeIds.has(config.id)
        const Icon = config.icon
        return (
          <Button 
            key={config.id}
            variant="outline" 
            onClick={() => toggle(config.id)}
            className={isActive ? THEMES[config.theme].buttonActive : "border-dashed"}
          > 
            {Icon && <Icon />}
            {config.label}
          </Button>
        )
      })}
    </>
  )

  const rowClassName = (row: TData) => {
    // Configs are evaluated in order, first match wins
    for (const config of configs) {
      if (activeIds.has(config.id) && config.condition(row)) {
        return THEMES[config.theme].rowActive
      }
    }
    return undefined
  }

  return { toolbarActions, rowClassName }
}
