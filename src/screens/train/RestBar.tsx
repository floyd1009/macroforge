import { useEffect, useRef } from 'react'
import { Timer, X } from 'lucide-react'
import { adjustRest, buzz, stopRest, useRest, type RestState } from './rest'
import { clock, useNow } from './util'

/**
 * Rest countdown, pinned above the tab bar on every training screen so it
 * stays visible while looking up an exercise or loading plates.
 */
export function RestBar() {
  const rest = useRest()
  // The ticking part mounts only while a rest is running, so an idle screen
  // is not re-rendering four times a second for nothing.
  return rest ? <Running rest={rest} /> : null
}

function Running({ rest }: { rest: RestState }) {
  const now = useNow(250)
  const left = rest.endsAt - now
  const over = left <= 0
  const buzzedFor = useRef<number | null>(null)

  useEffect(() => {
    if (!over) return
    if (buzzedFor.current !== rest.endsAt) {
      buzzedFor.current = rest.endsAt
      // Buzz only if it ended while watching. Reopening the app minutes
      // later should not vibrate for a rest that is long finished.
      if (left > -1500 && rest.sound) buzz()
    }
    // Leave "Rest over" up long enough to be seen, then get out of the way.
    if (left < -8000) stopRest()
  }, [over, left, rest.endsAt, rest.sound])

  const pct = over ? 1 : 1 - left / Math.max(1, rest.total)
  const pill =
    'grid h-9 min-w-11 place-items-center rounded-lg border border-line bg-surface-3 px-2 text-[0.8125rem] font-bold text-txt-2 active:bg-track'

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40"
      style={{ bottom: 'calc(var(--tabbar-h) + var(--sab))' }}
      role="timer"
      aria-live="off"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-md px-3 pb-2">
        <div className="overflow-hidden rounded-card border border-line-strong bg-surface-2 shadow-[0_-6px_24px_rgba(0,0,0,0.55)]">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Timer size={18} className={over ? 'shrink-0 text-ok' : 'shrink-0 text-txt-3'} />
            <div className="min-w-0 flex-1">
              <div
                className={
                  over
                    ? 'text-[1.0625rem] font-extrabold leading-none text-ok'
                    : 'numeric text-[1.375rem] font-extrabold leading-none tracking-[-0.02em]'
                }
              >
                {over ? 'Rest over' : clock(left + 999)}
              </div>
              <div className="mt-1 truncate text-[0.6875rem] font-semibold text-txt-3">
                {over ? 'Next set when you are ready' : (rest.label ?? 'Rest')}
              </div>
            </div>
            {!over && (
              <>
                <button className={pill} onClick={() => adjustRest(-15)} aria-label="15 seconds less">
                  −15
                </button>
                <button className={pill} onClick={() => adjustRest(15)} aria-label="15 seconds more">
                  +15
                </button>
              </>
            )}
            <button className={pill} onClick={stopRest} aria-label={over ? 'Dismiss' : 'Skip rest'}>
              {over ? <X size={16} /> : 'Skip'}
            </button>
          </div>
          <div className="h-1 bg-track">
            <div
              className="h-full transition-[width] duration-300 ease-linear"
              style={{ width: `${Math.min(100, pct * 100)}%`, background: over ? 'var(--color-ok)' : 'var(--color-kcal)' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
