import clsx from 'clsx'
import { useEffect, useRef, type ReactNode } from 'react'

export function Card({
  children,
  className,
  as: As = 'div',
  ...rest
}: { children: ReactNode; className?: string; as?: 'div' | 'section' } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <As
      className={clsx('rounded-card border border-line bg-surface', className)}
      {...rest}
    >
      {children}
    </As>
  )
}

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger'

export function Button({
  variant = 'subtle',
  className,
  children,
  loading,
  ...rest
}: {
  variant?: ButtonVariant
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-brand text-white active:bg-brand-dim disabled:bg-brand-dim/50 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]',
    subtle: 'bg-surface-2 text-txt border border-line active:bg-surface-3',
    ghost: 'text-txt-2 active:bg-surface-2',
    danger: 'bg-transparent text-bad border border-bad/40 active:bg-bad/10',
  }
  return (
    <button
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-medium',
        'transition-colors duration-150 disabled:opacity-50',
        styles[variant],
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden
    />
  )
}

/**
 * Bottom sheet. iOS-style: drags down to dismiss via the scrim, respects the
 * home indicator, and locks background scroll while open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  full = false,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  full?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Schließen"
      />
      <div
        ref={ref}
        className={clsx(
          'relative flex flex-col rounded-t-3xl border-t border-line-strong bg-surface',
          'animate-fade-up shadow-[0_-8px_40px_rgba(0,0,0,0.6)]',
          full ? 'h-[92dvh]' : 'max-h-[88dvh]',
        )}
      >
        <div className="grid shrink-0 place-items-center pt-2.5 pb-1">
          <div className="h-1 w-9 rounded-full bg-line-strong" />
        </div>
        {title && (
          <div className="shrink-0 px-5 pb-3 pt-1 text-[1.0625rem] font-semibold">{title}</div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-txt-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-snug text-txt-3">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-txt',
        'placeholder:text-txt-4 outline-none transition-colors',
        'focus:border-brand focus:ring-1 focus:ring-brand/40',
        className,
      )}
      {...rest}
    />
  )
}

export function Textarea({
  className,
  ref,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>
}) {
  return (
    <textarea
      ref={ref}
      className={clsx(
        'w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-txt',
        'placeholder:text-txt-4 outline-none transition-colors',
        'focus:border-brand focus:ring-1 focus:ring-brand/40',
        className,
      )}
      {...rest}
    />
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: ReactNode }>
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={clsx('flex gap-1 rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'min-h-9 flex-1 rounded-lg px-2 text-[0.8125rem] font-medium transition-colors',
            value === o.value ? 'bg-brand text-white' : 'text-txt-2 active:bg-surface-3',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Small pill used for data-provenance and confidence labels. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand'
  children: ReactNode
  className?: string
}) {
  const tones = {
    neutral: 'bg-surface-3 text-txt-3 border-line',
    ok: 'bg-ok/12 text-ok border-ok/25',
    warn: 'bg-warn/12 text-warn border-warn/25',
    bad: 'bg-bad/12 text-bad border-bad/25',
    brand: 'bg-brand/15 text-brand-bright border-brand/30',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-medium leading-tight',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="grid place-items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-txt-4">{icon}</div>}
      <p className="text-[0.9375rem] font-medium text-txt-2">{title}</p>
      {body && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-txt-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Standard screen scaffold: safe-area header plus a scrolling body. */
export function Screen({
  title,
  right,
  left,
  children,
  subtitle,
}: {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  left?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-3">
          {left}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[1.0625rem] font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="truncate text-xs text-txt-3">{subtitle}</p>}
          </div>
          {right}
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-scroll">{children}</main>
    </div>
  )
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      className={clsx(
        'grid size-10 shrink-0 place-items-center rounded-xl text-txt-2',
        'transition-colors active:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center justify-between gap-2">
      <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-txt-3">
        {children}
      </h2>
      {action}
    </div>
  )
}
