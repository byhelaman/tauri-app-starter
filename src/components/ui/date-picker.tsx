import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, ChevronDownIcon } from "lucide-react"
import { DateRange, Matcher } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

export function DatePicker({
  date,
  setDate,
  disabled,
}: {
  date?: Date
  setDate?: (date?: Date) => void
  disabled?: Matcher | Matcher[]
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!date}
          className="w-40 justify-between text-left font-normal data-[empty=true]:text-muted-foreground"
        >
          {date ? format(date, "PPP") : <span>Pick a date</span>}
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          defaultMonth={date}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  )
}

export function DateRangePicker({
  date,
  setDate,
  disabled,
}: {
  date?: DateRange
  setDate?: (date?: DateRange) => void
  disabled?: Matcher | Matcher[]
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-empty={!date}
          className="w-[260px] justify-between text-left font-normal data-[empty=true]:text-muted-foreground"
        >
          {date?.from ? (
            date.to ? (
              <>
                {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
              </>
            ) : (
              format(date.from, "LLL dd, y")
            )
          ) : (
            <span>Select period</span>
          )}
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={date?.from}
          selected={date}
          onSelect={setDate}
          numberOfMonths={2}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  )
}

export function DatePickerInput({
  value,
  onChange,
  disabled,
}: {
  value?: string
  onChange?: (value: string) => void
  disabled?: Matcher | Matcher[]
}) {
  const [open, setOpen] = React.useState(false)
  const date = value ? new Date(value) : undefined
  const [month, setMonth] = React.useState<Date | undefined>(date)

  return (
    <InputGroup>
      <InputGroupInput
        type="text"
        value={value}
        placeholder="YYYY-MM-DD"
        onChange={(e) => {
          onChange?.(e.target.value)
          const d = new Date(e.target.value)
          if (!isNaN(d.getTime())) {
            setMonth(d)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setOpen(true)
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton
              variant="ghost"
              size="icon-xs"
              aria-label="Select date"
            >
              <CalendarIcon />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              selected={date}
              month={month}
              onMonthChange={setMonth}
              disabled={disabled}
              onSelect={(d) => {
                if (d) {
                  const offset = d.getTimezoneOffset()
                  d = new Date(d.getTime() - offset * 60 * 1000)
                  onChange?.(d.toISOString().split("T")[0])
                } else {
                  onChange?.("")
                }
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  )
}
