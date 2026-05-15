import * as React from "react"
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Command as CommandPrimitive } from "cmdk"
import {
  autocompleteReducer,
  createAutocompleteState,
  filterAutocompleteOptions,
  isCustomAutocompleteValue,
} from "./autocomplete-model"

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
  const [state, dispatch] = React.useReducer(
    autocompleteReducer,
    value,
    createAutocompleteState
  )
  const { open, inputValue, activeItem, interactionMode } = state

  React.useEffect(() => {
    dispatch({ type: "syncValue", value })
  }, [value])

  const filteredOptions = React.useMemo(() => {
    return filterAutocompleteOptions(options, inputValue, filterClientSide)
  }, [inputValue, options, filterClientSide])

  // Cuando no es restrictivo y es client-side, mostrar el valor tecleado como opción seleccionable
  // si no coincide exactamente con una opción existente.
  // En modo server-side no se muestra: las sugerencias vienen del servidor.
  const isCustom = isCustomAutocompleteValue({
    filterClientSide,
    restrictive,
    inputValue,
    options,
  })

  const handleSelect = (selectedValue: string) => {
    dispatch({ type: "select", value: selectedValue })
    onChange?.(selectedValue)
  }

  const handleBlur = () => {
    dispatch({ type: "close" })
    if (restrictive) {
      dispatch({ type: "setInputValue", value })
      onBlur?.()
    } else {
      onBlur?.(inputValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      dispatch({ type: "close" })
      return
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!open) {
        e.preventDefault()
        dispatch({ type: "setOpen", open: true })
      }
      
      if (interactionMode !== "keyboard" && e.key === "ArrowDown") {
        e.preventDefault()
        const firstValue = isCustom ? inputValue.trim() : filteredOptions[0]?.value
        if (firstValue) dispatch({ type: "setActiveItem", value: firstValue })
      }
      
      dispatch({ type: "setInteractionMode", mode: "keyboard" })
      return
    }

    if (e.key === "Tab" && open && !filterClientSide && interactionMode === "keyboard" && activeItem) {
      e.preventDefault()
      dispatch({ type: "setInputValue", value: activeItem })
      onInputValueChange?.(activeItem)
      dispatch({ type: "close" })
      return
    }

    if (e.key === "Enter") {
      // 1. Si no hay navegación ACTIVA POR TECLADO, el Enter va para el Input maestro, NO para sugerencias.
      if (interactionMode !== "keyboard") {
        e.preventDefault() // Detiene TODA acción interna de cmdk (onSelect)
        dispatch({ type: "close" })
        onKeyDown?.(e) // Avisa al padre (ej. Tabla/Celda) para que tome el valor limpio actual
        return
      }

      // 2. Si hay interactuado con el teclado, confirmamos la sugerencia ACTIVA.
      if (open && activeItem) {
        e.preventDefault()
        handleSelect(activeItem)
        dispatch({ type: "setInteractionMode", mode: "none" })
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
      onValueChange={(nextValue) => dispatch({ type: "setActiveItem", value: nextValue })}
    >
      <Popover open={effectiveOpen} onOpenChange={(nextOpen) => dispatch({ type: "setOpen", open: nextOpen })}>
        <PopoverTrigger asChild>
          <div className={cn("relative w-full", wrapperClassName)}>
            <CommandPrimitive.Input
              asChild
              value={inputValue}
              onValueChange={(nextValue) => dispatch({ type: "setInputValue", value: nextValue })}
            >
              <Input
                value={inputValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  dispatch({ type: "setInputValue", value: e.target.value })
                  onInputValueChange?.(e.target.value)
                  dispatch({ type: "setInteractionMode", mode: "none" })
                  if (!open) dispatch({ type: "setOpen", open: true })
                }}
                onBlur={handleBlur}
                onFocus={(e) => {
                  if (!open) dispatch({ type: "setOpen", open: true })
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
          onPointerMove={() => dispatch({ type: "setInteractionMode", mode: "mouse" })}
          onPointerLeave={() => dispatch({ type: "setInteractionMode", mode: "none" })}
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
