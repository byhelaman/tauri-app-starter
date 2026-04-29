import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Clock2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group"
import { DatePickerInput } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldError,
} from "@/components/ui/field"
import type { Order, Status } from "./columns"

const STATUSES: Status[] = ["pending", "processing", "shipped", "delivered", "cancelled"]
const CHANNELS = ["Online", "Retail", "Partner", "Phone"]
const PRIORITIES = ["Low", "Medium", "High"]
const REGIONS = ["North America", "Europe", "Asia Pacific", "LATAM", "EMEA"]
const PAYMENTS = ["Credit Card", "PayPal", "Bank Transfer", "Crypto"]

/** Devuelve la hora actual y la siguiente en punto (HH:00) */
function getDefaultTimes() {
  const h = new Date().getHours()
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    start_time: `${pad(h)}:00`,
    end_time:   `${pad((h + 1) % 24)}:00`,
  }
}

/** Genera código único que cumple CHECK (code ~ '^ORD-[A-Z0-9]{5,6}$') */
function generateOrderCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `ORD-${suffix}`
}

const orderSchema = z.object({
  customer:   z.string().min(1, "Customer name is required"),
  code:       z.string().optional(),
  product:    z.string().min(1, "Product name is required"),
  category:   z.string().min(1, "Category is required"),
  region:     z.string().min(1, "Region is required"),
  payment:    z.string().min(1, "Payment method is required"),
  quantity:   z.number().min(1, "Quantity must be at least 1"),
  status:     z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]),
  priority:   z.string().min(1, "Priority is required"),
  channel:    z.string().min(1, "Channel is required"),
  amount:     z.number().positive("Amount must be greater than 0"),
  date:       z.string().min(1, "Date is required"),
  start_time: z.string().min(1, "Start time is required"),
  end_time:   z.string().min(1, "End time is required"),
})

type OrderFormValues = z.infer<typeof orderSchema>

interface OrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (order: Partial<Order>) => void
}

const DEFAULT_VALUES: OrderFormValues = {
  status:     "pending",
  channel:    "Online",
  priority:   "Medium",
  region:     "North America",
  payment:    "Credit Card",
  date:       new Date().toISOString().split("T")[0],
  ...getDefaultTimes(),
  quantity:   1,
  amount:     1,
  customer:   "",
  code:       "",
  product:    "",
  category:   "",
}

export function OrderDialog({ open, onOpenChange, onSubmit }: OrderDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open) {
      reset({
        ...DEFAULT_VALUES,
        date: new Date().toISOString().split("T")[0],
        ...getDefaultTimes(),
      })
    }
  }, [open, reset])

  const onFormSubmit = (data: OrderFormValues) => {
    const code = data.code?.trim() || generateOrderCode()
    onSubmit({ ...data, code })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg"
      onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Add New Order</DialogTitle>
          <DialogDescription>
            Enter the details of the new order below.
          </DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={handleSubmit(onFormSubmit)}>
          <DialogBody className="mt-1 py-1">
            <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="date">Date</FieldLabel>
                  <Controller
                    name="date"
                    control={control}
                    render={({ field }) => (
                      <DatePickerInput
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <FieldError errors={[errors.date]} />
                </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="start_time">Start Time</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="start_time"
                      type="time"
                      {...register("start_time")}
                      className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    />
                    <InputGroupAddon>
                      <Clock2Icon className="text-muted-foreground" />
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldError errors={[errors.start_time]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="end_time">End Time</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="end_time"
                      type="time"
                      {...register("end_time")}
                      className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    />
                    <InputGroupAddon>
                      <Clock2Icon className="text-muted-foreground" />
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldError errors={[errors.end_time]} />
                </Field>
              </div>
                <Field>
                  <FieldLabel>Customer</FieldLabel>
                  <Input
                    {...register("customer")}
                    placeholder="Customer name"
                    aria-invalid={!!errors.customer}
                  />
                  <FieldError errors={[errors.customer]} />
                </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Code</FieldLabel>
                  <Input
                    {...register("code")}
                    className="font-mono"
                    placeholder="ORD-XXXXX"
                    aria-invalid={!!errors.code}
                  />
                  <FieldError errors={[errors.code]} />
                </Field>
              </div>

              <Field>
                <FieldLabel>Product</FieldLabel>
                <Input
                  {...register("product")}
                  placeholder="Product name"
                  aria-invalid={!!errors.product}
                />
                <FieldError errors={[errors.product]} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Category</FieldLabel>
                  <Input
                    {...register("category")}
                    placeholder="Category"
                    aria-invalid={!!errors.category}
                  />
                  <FieldError errors={[errors.category]} />
                </Field>
                <Field>
                  <FieldLabel>Quantity</FieldLabel>
                  <Input
                    type="number"
                    className="font-mono"
                    {...register("quantity", { valueAsNumber: true })}
                    aria-invalid={!!errors.quantity}
                  />
                  <FieldError errors={[errors.quantity]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger className="capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.status]} />
                </Field>
                <Field>
                  <FieldLabel>Priority</FieldLabel>
                  <Controller
                    name="priority"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.priority]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Channel</FieldLabel>
                  <Controller
                    name="channel"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {CHANNELS.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.channel]} />
                </Field>
                <Field>
                  <FieldLabel>Amount</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    className="font-mono"
                    {...register("amount", { valueAsNumber: true })}
                    aria-invalid={!!errors.amount}
                  />
                  <FieldError errors={[errors.amount]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Region</FieldLabel>
                  <Controller
                    name="region"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {REGIONS.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.region]} />
                </Field>
                <Field>
                  <FieldLabel>Payment</FieldLabel>
                  <Controller
                    name="payment"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {PAYMENTS.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.payment]} />
                </Field>
              </div>
            </FieldGroup>
          </DialogBody>
          <DialogFooter showCloseButton>
            <Button type="submit">
              Create Order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
