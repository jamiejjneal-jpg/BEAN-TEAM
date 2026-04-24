import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[#E8F0EC] text-[#1A4331]',
        secondary: 'bg-[#F2F0EB] text-[#5C5C5C]',
        destructive: 'bg-red-100 text-red-800',
        success: 'bg-emerald-100 text-emerald-800',
        warning: 'bg-amber-100 text-amber-800',
        info: 'bg-blue-100 text-blue-800',
        outline: 'border border-[#E5E3DB] text-[#5C5C5C]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
