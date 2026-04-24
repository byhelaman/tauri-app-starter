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
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value)
  const [activeItem, setActiveItem] = React.useState("")

  React.useEffect(() => {
    setInputValue(value)
  }, [value])

  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return options
    const lowerValue = inputValue.toLowerCase()
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(lowerValue) || opt.value.toLowerCase().includes(lowerValue)
    )
  }, [inputValue, options])

  // Cuando no es restrictivo, mostrar el valor tecleado como opción seleccionable
  // si no coincide exactamente con una opción existente
  const isCustom = !restrictive && inputValue.trim() !== "" && !options.some(
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
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!open) {
        e.preventDefault()
        setOpen(true)
      }
      // Dejar que cmdk maneje la navegación del dropdown
      return
    }

    if (e.key === "Enter" && open) {
      // Dejar que cmdk maneje Enter → onSelect del CommandItem activo
      return
    }

    onKeyDown?.(e)
  }

  return (
    <CommandPrimitive shouldFilter={false} value={activeItem} onValueChange={setActiveItem}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className={cn("relative w-full", wrapperClassName)}>
            <CommandPrimitive.Input
              asChild
              value={inputValue}
              onValueChange={setInputValue}
            >
              <Input
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
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
          className="p-0 w-36"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
        <CommandList>
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
