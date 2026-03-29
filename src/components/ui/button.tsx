import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent-amber)] px-3 py-2 text-[var(--bg-base)] hover:brightness-110',
        ghost:
          'bg-transparent px-3 py-2 text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]',
        outline:
          'border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text-primary)] hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]',
      },
      size: {
        default: 'h-9',
        icon: 'h-9 w-9 rounded-full',
        sm: 'h-8 px-2.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
