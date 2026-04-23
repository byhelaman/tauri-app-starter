import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Plus } from "lucide-react"
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

const orderSchema = z.object({
  customer: z.string().min(1, "Customer name is required"),
  code: z.string().optional(),
  product: z.string().min(1, "Product name is required"),
  category: z.string().min(1, "Category is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]),
  priority: z.string().min(1, "Priority is required"),
  channel: z.string().min(1, "Channel is required"),
  amount: z.number().min(0, "Amount must be at least 0"),
  date: z.string(),
  time: z.string(),
})

type OrderFormValues = z.infer<typeof orderSchema>

interface OrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (order: Partial<Order>) => void
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
    defaultValues: {
      status: "pending",
      channel: "Online",
      priority: "Medium",
      date: new Date().toISOString().split("T")[0],
      time: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
      quantity: 1,
      amount: 0,
    },
  })

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      reset({
        status: "pending",
        channel: "Online",
        priority: "Medium",
        date: new Date().toISOString().split("T")[0],
        time: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
        quantity: 1,
        amount: 0,
      })
    }
  }, [open, reset])

  const onFormSubmit = (data: OrderFormValues) => {
    // Generate a random code if not present
    const code = data.code || `ORD-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
    
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
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Customer</FieldLabel>
                  <Input
                    {...register("customer")}
                    placeholder="Customer name"
                    aria-invalid={!!errors.customer}
                  />
                  <FieldError errors={[errors.customer]} />
                </Field>
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
            </FieldGroup>
          </DialogBody>
          <DialogFooter showCloseButton>
            <Button type="submit">
              <Plus data-icon="inline-start" />
              Create Order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
