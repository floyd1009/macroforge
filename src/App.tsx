import { Suspense, lazy, useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { Spinner } from './components/ui'
import { requestPersistence } from './lib/db'
import { seedIfEmpty } from './data/seed'
import { importBls } from './data/bls'
import { Onboarding, needsOnboarding } from './screens/Onboarding'

const Today = lazy(() => import('./screens/Today'))
const AddFood = lazy(() => import('./screens/AddFood'))
const Scan = lazy(() => import('./screens/Scan'))
const PhotoLog = lazy(() => import('./screens/PhotoLog'))
const VoiceLog = lazy(() => import('./screens/VoiceLog'))
const Recipes = lazy(() => import('./screens/Recipes'))
const Trends = lazy(() => import('./screens/Trends'))
const Train = lazy(() => import('./screens/Train'))
const SettingsScreen = lazy(() => import('./screens/Settings'))

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center text-txt-3">
      <Spinner className="size-6" />
    </div>
  )
}

export default function App() {
  const [onboarding, setOnboarding] = useState(needsOnboarding)

  useEffect(() => {
    // Ask iOS not to evict the database, and load the staples immediately so
    // the app is usable on first paint.
    void requestPersistence()
    void seedIfEmpty().then(() => {
      // The national database is ~300 kB and 7,140 rows. Import it after the
      // app is interactive, and when the browser says it has spare time, so a
      // first launch never stalls behind it.
      const start = () =>
        void importBls().catch((e) => {
          // Not fatal — the app works on staples plus Open Food Facts, and
          // Settings offers a manual retry. But it must not fail silently.
          console.warn('BLS import failed:', e)
        })
      if ('requestIdleCallback' in window) {
        ;(window as unknown as { requestIdleCallback: (cb: () => void, o?: object) => void })
          .requestIdleCallback(start, { timeout: 4000 })
      } else {
        setTimeout(start, 1500)
      }
    })
  }, [])

  if (onboarding) return <Onboarding onDone={() => setOnboarding(false)} />

  return (
    // HashRouter, not BrowserRouter: GitHub Pages serves static files with no
    // SPA rewrite, so a deep link like /trends would 404 on a hard refresh.
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/add" element={<AddFood />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/photo" element={<PhotoLog />} />
          <Route path="/voice" element={<VoiceLog />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/recipes/:id" element={<Recipes />} />
          <Route path="/trends" element={<Trends />} />
          {/* Train owns everything under /train and routes it internally. */}
          <Route path="/train/*" element={<Train />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </Suspense>
      <TabBar />
    </HashRouter>
  )
}
