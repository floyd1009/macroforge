import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import ExerciseDetail from './train/ExerciseDetail'
import ExerciseLibrary from './train/ExerciseLibrary'
import Home from './train/Home'
import ProgramEditor from './train/ProgramEditor'
import Programs from './train/Programs'
import { RestBar } from './train/RestBar'
import Session from './train/Session'
import WorkoutScreen from './train/Workout'
import { syncSeedExercises } from './train/store'

/**
 * Everything under /train. The app shell hands the whole subtree here, so
 * training can add screens without touching the top-level router.
 */
export default function Train() {
  useEffect(() => {
    // Deliver new movements and cues to installs that were seeded by an
    // earlier release. Cheap and idempotent.
    void syncSeedExercises().catch((e) => console.warn('Exercise sync failed:', e))
  }, [])

  return (
    <>
      <Routes>
        <Route index element={<Home />} />
        <Route path="workout" element={<WorkoutScreen />} />
        <Route path="session/:id" element={<Session />} />
        <Route path="programs" element={<Programs />} />
        <Route path="programs/:id" element={<ProgramEditor />} />
        <Route path="exercises" element={<ExerciseLibrary />} />
        <Route path="exercise/:id" element={<ExerciseDetail />} />
      </Routes>
      <RestBar />
    </>
  )
}
