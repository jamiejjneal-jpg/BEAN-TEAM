import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4331] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#1A4331] text-white hover:bg-[#265C45] shadow-sm',
        destructive: 'bg-[#E06D53] text-white hover:bg-[#C95A41] shadow-sm',
        outline: 'border border-[#E5E3DB] bg-white hover:bg-[#F2F0EB] text-[#1A1A1A]',
        secondary: 'bg-[#F2F0EB] text-[#1A1A1A] hover:bg-[#E5E3DB]',
        ghost: 'hover:bg-[#F2F0EB] text-[#1A1A1A]',
        link: 'text-[#1A4331] underline-offset-4 hover:underline',
        accent: 'bg-[#E06D53] text-white hover:bg-[#C95A41] shadow-sm',
      },
      size: {
        default: 'h-10 px-6 py-2.5',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-lg px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
