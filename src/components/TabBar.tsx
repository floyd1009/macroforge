import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, Dumbbell, Home, Plus, Settings as Cog } from 'lucide-react'
import clsx from 'clsx'

const tabs = [
  { to: '/', icon: Home, label: 'Heute', end: true },
  { to: '/trends', icon: BarChart3, label: 'Verlauf' },
  { to: null, icon: Plus, label: 'Hinzufügen' },
  { to: '/train', icon: Dumbbell, label: 'Training' },
  { to: '/settings', icon: Cog, label: 'Mehr' },
] as const

export function TabBar() {
  const navigate = useNavigate()

  return (
    <nav
      className={clsx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-line',
        // A translucent bar reads as native on iOS, but only where the blur is
        // actually supported; otherwise fall back to a solid surface.
        'bg-bg/85 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-bg',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex h-[4.25rem] w-full max-w-md items-stretch">
        {tabs.map((t) =>
          t.to === null ? (
            <li key="add" className="flex flex-1 items-center justify-center">
              <button
                onClick={() => navigate('/add')}
                aria-label="Essen hinzufügen"
                className={clsx(
                  'grid size-13 place-items-center rounded-2xl bg-brand text-white',
                  'shadow-[0_6px_20px_-6px_var(--color-brand)] transition-transform active:scale-92',
                )}
              >
                <Plus size={26} strokeWidth={2.5} />
              </button>
            </li>
          ) : (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                end={'end' in t ? t.end : false}
                className={({ isActive }) =>
                  clsx(
                    'flex h-full flex-col items-center justify-center gap-1 pt-1 transition-colors',
                    isActive ? 'text-brand-bright' : 'text-txt-4 active:text-txt-2',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <t.icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                    <span className="text-[0.625rem] font-medium tracking-tight">{t.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
