import * as React from "react"
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Command as CommandPrimitive } from "cmdk"

export interface AutocompleteProps {
  value?: string
  onChange?: (value: string) => void
  options: { label: string; value: string }[]
  placeholder?: string
  emptyMessage?: string
  restrictive?: boolean
  className?: string
  disabled?: boolean
  autoFocus?: boolean
  onBlur?: (value?: string) => void
  onFocus?: React.FocusEventHandler<HTMLInputElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  wrapperClassName?: string
  /** Callback invocado en cada cambio del texto del input (útil para server-side search). */
  onInputValueChange?: (value: string) => void
  /** Si es false, no filtra las opciones localmente (el servidor ya las filtra). Default: true. */
  filterClientSide?: boolean
}

export function Autocomplete({
  value = "",
  onChange,
  options,
  placeholder,
  emptyMessage = "No results found.",
  restrictive = false,
  className,
  disabled = false,
  autoFocus = false,
  onBlur,
  onFocus,
  onKeyDown,
  wrapperClassName,
  onInputValueChange,
  filterClientSide = true,
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value)
  const [activeItem, setActiveItem] = React.useState("")
  // Modos: "none" (default), "keyboard" (usó flechas), "mouse" (usó scroll/cursor)
  const [interactionMode, setInteractionMode] = React.useState<"none" | "keyboard" | "mouse">("none")
  const interactionModeRef = React.useRef<"none" | "keyboard" | "mouse">("none")

  const setMode = React.useCallback((mode: "none" | "keyboard" | "mouse") => {
    interactionModeRef.current = mode
    setInteractionMode(mode)
  }, [])

  React.useEffect(() => {
    setInputValue(value)
  }, [value])

  const filteredOptions = React.useMemo(() => {
    if (!filterClientSide) return options
    if (!inputValue) return options
    const lowerValue = inputValue.toLowerCase()
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(lowerValue) || opt.value.toLowerCase().includes(lowerValue)
    )
  }, [inputValue, options, filterClientSide])

  // Cuando no es restrictivo y es client-side, mostrar el valor tecleado como opción seleccionable
  // si no coincide exactamente con una opción existente.
  // En modo server-side no se muestra: las sugerencias vienen del servidor.
  const isCustom = filterClientSide && !restrictive && inputValue.trim() !== "" && !options.some(
    (opt) => opt.value.toLowerCase() === inputValue.trim().toLowerCase()
  )

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue)
    onChange?.(selectedValue)
    setOpen(false)
  }

  const handleBlur = () => {
    if (restrictive) {
      setInputValue(value)
      onBlur?.()
    } else {
      onBlur?.(inputValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
      setMode("none")
      return
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!open) {
        e.preventDefault()
        setOpen(true)
      }
      
      if (interactionModeRef.current !== "keyboard" && e.key === "ArrowDown") {
        e.preventDefault()
        const firstValue = isCustom ? inputValue.trim() : filteredOptions[0]?.value
        if (firstValue) setActiveItem(firstValue)
      }
      
      setMode("keyboard")
      return
    }

    if (e.key === "Tab" && open && !filterClientSide && interactionMode === "keyboard" && activeItem) {
      e.preventDefault()
      setInputValue(activeItem)
      onInputValueChange?.(activeItem)
      setOpen(false)
      setMode("none")
      return
    }

    if (e.key === "Enter") {
      // 1. Si no hay navegación ACTIVA POR TECLADO, el Enter va para el Input maestro, NO para sugerencias.
      if (interactionMode !== "keyboard") {
        e.preventDefault() // Detiene TODA acción interna de cmdk (onSelect)
        setOpen(false)
        setMode("none")
        onKeyDown?.(e) // Avisa al padre (ej. Tabla/Celda) para que tome el valor limpio actual
        return
      }

      // 2. Si hay interactuado con el teclado, confirmamos la sugerencia ACTIVA.
      if (open && activeItem) {
        e.preventDefault()
        handleSelect(activeItem)
        setMode("none")
        return
      }
    }

    onKeyDown?.(e)
  }

  // En modo server-side, no mostrar el popover si no hay opciones
  const hasVisibleOptions = filteredOptions.length > 0 || isCustom
  const effectiveOpen = !filterClientSide ? (open && hasVisibleOptions) : open

  return (
    <CommandPrimitive
      shouldFilter={false}
      value={interactionMode === "none" ? "__none__" : activeItem}
      onValueChange={setActiveItem}
    >
      <Popover open={effectiveOpen} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className={cn("relative w-full", wrapperClassName)}>
            <CommandPrimitive.Input
              asChild
              value={inputValue}
              onValueChange={setInputValue}
            >
              <Input
                value={inputValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  onInputValueChange?.(e.target.value)
                  setMode("none")
                  if (!open) setOpen(true)
                }}
                onBlur={handleBlur}
                onFocus={(e) => {
                  if (!open) setOpen(true)
                  onFocus?.(e)
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                autoFocus={autoFocus}
              />
            </CommandPrimitive.Input>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-(--radix-popover-trigger-width) min-w-36"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
        <CommandList
          className={interactionMode === "none" ? "[&_[cmdk-item][data-selected=true]]:bg-transparent [&_[cmdk-item][data-selected=true]]:text-inherit" : ""}
          onPointerMove={() => setMode("mouse")}
          onPointerLeave={() => setMode("none")}
        >
            {filteredOptions.length === 0 && !isCustom ? (
              <CommandEmpty className="py-2">{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                {isCustom && (
                  <CommandItem
                    key="__free_value__"
                    value={inputValue.trim()}
                    onSelect={() => handleSelect(inputValue.trim())}
                    className="py-1 pl-1.5 rounded-md [&_svg]:hidden"
                  >
                    <span className="truncate">{inputValue.trim()}</span>
                  </CommandItem>
                )}
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="py-1 pl-1.5 rounded-md"
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </PopoverContent>
      </Popover>
    </CommandPrimitive>
  )
}
