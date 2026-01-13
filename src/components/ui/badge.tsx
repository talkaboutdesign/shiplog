import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        // Base variants
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",

        // Category variants (for digest categories)
        feature:
          "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
        bugfix:
          "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
        refactor:
          "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
        docs:
          "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
        chore:
          "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
        security:
          "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",

        // Perspective variants (for digest perspectives)
        ui:
          "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
        performance:
          "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",

        // Risk level variants
        "risk-low":
          "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
        "risk-medium":
          "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
        "risk-high":
          "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",

        // Surface type variants
        component:
          "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
        service:
          "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
        utility:
          "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
        hook:
          "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
        type:
          "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
        config:
          "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
        other:
          "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",

        // Status variants
        processing:
          "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
