import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary:
    'border-0 text-gold-ink bg-[linear-gradient(180deg,var(--gold-1),var(--gold-2)_60%,var(--gold-3))] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-2px_0_rgba(0,0,0,0.16),0_14px_34px_-14px_rgba(232,194,122,0.7)] hover:brightness-105',
  secondary: 'border border-line-2 text-text hover:border-white/30 hover:bg-white/[0.04]',
  ghost: 'border-0 text-text-2 hover:bg-white/[0.03] hover:text-text',
  danger: 'border border-loss text-loss hover:bg-loss/10',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs max-md:min-h-11',
  md: 'min-h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-sm tracking-[0.06em]',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  )
}
