import * as React from 'react'
import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-lg border border-[#E5E3DB] bg-white px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#8A8A8A] focus:border-[#1A4331] focus:outline-none focus:ring-1 focus:ring-[#1A4331] transition-all disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
