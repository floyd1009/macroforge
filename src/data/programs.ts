import type { Program, RoutineDay } from '../lib/types'
import { exerciseId } from './exercises'

/**
 * Bundled starting programs.
 *
 * What these encode, and what they do not:
 *  - Measured: weekly hard sets per muscle and proximity to failure are the
 *    variables with the best evidence for muscle growth. Each template lands
 *    most muscles at roughly 8 to 16 direct sets a week, split over at least
 *    two sessions.
 *  - Convention: the splits themselves (full body, upper/lower, push/pull/
 *    legs). They are ways to schedule the same weekly work around how many
 *    days someone can train. None is superior once weekly sets are equal.
 *  - Assumed: the exercise choices. They are common, loadable movements that
 *    most gyms have. Swap freely; progression follows the exercise you do.
 *
 * Rep ranges are wide on purpose so double progression has room to work.
 */

/** [exercise (English seed name), sets, repMin, repMax, RIR, rest seconds] */
type Slot = [name: string, sets: number, repMin: number, repMax: number, rir: number, restSec: number]

export interface ProgramTemplate {
  id: string
  name: string
  summary: string
  /** Who it suits, in one line. */
  suits: string
  days: Array<{ name: string; slots: Slot[] }>
}

// Rest follows the size of the lift: heavy compounds need the phosphocreatine
// system to recover (most of it within ~3 minutes), isolation work does not
// tax it as hard. These are defaults, editable per exercise.
const HEAVY = 180
const COMPOUND = 150
const MODERATE = 120
const ISO = 75

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: 'tpl:minimal-2',
    name: 'Minimal, 2 days',
    summary: 'Two full-body sessions. The least training that still covers everything twice a week.',
    suits: 'Busy weeks, or returning after time off',
    days: [
      {
        name: 'Full Body A',
        slots: [
          ['Back Squat', 3, 5, 8, 2, HEAVY],
          ['Bench Press', 3, 6, 10, 2, COMPOUND],
          ['Lat Pulldown', 3, 8, 12, 2, MODERATE],
          ['Romanian Deadlift', 2, 8, 12, 2, COMPOUND],
          ['Lateral Raise', 2, 12, 20, 1, ISO],
        ],
      },
      {
        name: 'Full Body B',
        slots: [
          ['Leg Press', 3, 8, 12, 2, COMPOUND],
          ['Incline Dumbbell Press', 3, 8, 12, 2, MODERATE],
          ['Seated Cable Row', 3, 8, 12, 2, MODERATE],
          ['Leg Curl', 2, 10, 15, 1, ISO],
          ['Dumbbell Curl', 2, 10, 15, 1, ISO],
          ['Triceps Pushdown', 2, 10, 15, 1, ISO],
        ],
      },
    ],
  },
  {
    id: 'tpl:full-body-3',
    name: 'Full Body, 3 days',
    summary: 'Three different full-body sessions, rotating. Every muscle is trained three times a week.',
    suits: 'First year of training, or three fixed days',
    days: [
      {
        name: 'Full Body A',
        slots: [
          ['Back Squat', 3, 5, 8, 2, HEAVY],
          ['Bench Press', 3, 6, 10, 2, COMPOUND],
          ['Lat Pulldown', 3, 8, 12, 2, MODERATE],
          ['Romanian Deadlift', 2, 8, 12, 2, COMPOUND],
          ['Lateral Raise', 3, 12, 20, 1, ISO],
          ['Triceps Pushdown', 2, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Full Body B',
        slots: [
          ['Deadlift', 3, 4, 6, 2, HEAVY],
          ['Overhead Press', 3, 6, 10, 2, COMPOUND],
          ['Seated Cable Row', 3, 8, 12, 2, MODERATE],
          ['Leg Press', 3, 10, 15, 2, COMPOUND],
          ['Dumbbell Curl', 3, 10, 15, 1, ISO],
          ['Cable Crunch', 3, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Full Body C',
        slots: [
          ['Bulgarian Split Squat', 3, 8, 12, 2, MODERATE],
          ['Incline Dumbbell Press', 3, 8, 12, 2, MODERATE],
          ['Pull-up', 3, 5, 10, 2, COMPOUND],
          ['Leg Curl', 3, 10, 15, 1, ISO],
          ['Face Pull', 3, 12, 20, 1, ISO],
          ['Calf Raise', 3, 8, 12, 1, ISO],
        ],
      },
    ],
  },
  {
    id: 'tpl:upper-lower-4',
    name: 'Upper / Lower, 4 days',
    summary: 'Two upper and two lower sessions. One pair leans heavy, the other leans higher-rep.',
    suits: 'Four days a week, any level',
    days: [
      {
        name: 'Upper A',
        slots: [
          ['Bench Press', 4, 5, 8, 2, HEAVY],
          ['Barbell Row', 4, 6, 10, 2, COMPOUND],
          ['Overhead Press', 3, 6, 10, 2, COMPOUND],
          ['Lat Pulldown', 3, 8, 12, 2, MODERATE],
          ['Barbell Curl', 3, 8, 12, 1, ISO],
          ['Skull Crusher', 3, 8, 12, 1, ISO],
        ],
      },
      {
        name: 'Lower A',
        slots: [
          ['Back Squat', 4, 5, 8, 2, HEAVY],
          ['Romanian Deadlift', 3, 6, 10, 2, COMPOUND],
          ['Leg Press', 3, 10, 15, 2, COMPOUND],
          ['Leg Curl', 3, 10, 15, 1, ISO],
          ['Standing Calf Raise', 4, 8, 12, 1, ISO],
          ['Hanging Leg Raise', 3, 8, 15, 1, ISO],
        ],
      },
      {
        name: 'Upper B',
        slots: [
          ['Incline Dumbbell Press', 3, 8, 12, 2, MODERATE],
          ['Pull-up', 3, 6, 10, 2, COMPOUND],
          ['Machine Chest Press', 3, 10, 15, 1, MODERATE],
          ['Seated Cable Row', 3, 10, 15, 1, MODERATE],
          ['Lateral Raise', 4, 12, 20, 1, ISO],
          ['Hammer Curl', 3, 10, 15, 1, ISO],
          ['Rope Pushdown', 3, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Lower B',
        slots: [
          ['Deadlift', 3, 4, 6, 2, HEAVY],
          ['Bulgarian Split Squat', 3, 8, 12, 2, MODERATE],
          ['Leg Extension', 3, 10, 15, 1, ISO],
          ['Seated Leg Curl', 3, 10, 15, 1, ISO],
          ['Hip Thrust', 3, 8, 12, 2, MODERATE],
          ['Seated Calf Raise', 3, 10, 15, 1, ISO],
        ],
      },
    ],
  },
  {
    id: 'tpl:ul-ppl-5',
    name: 'Upper Lower + Push Pull Legs, 5 days',
    summary: 'An upper/lower pair early in the week, then push, pull and legs. Each muscle is hit twice.',
    suits: 'Five days a week, a year or more of training',
    days: [
      {
        name: 'Upper',
        slots: [
          ['Bench Press', 4, 5, 8, 2, HEAVY],
          ['Barbell Row', 4, 6, 10, 2, COMPOUND],
          ['Dumbbell Shoulder Press', 3, 8, 12, 2, MODERATE],
          ['Lat Pulldown', 3, 8, 12, 2, MODERATE],
          ['EZ-Bar Curl', 2, 8, 12, 1, ISO],
          ['Triceps Pushdown', 2, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Lower',
        slots: [
          ['Back Squat', 4, 5, 8, 2, HEAVY],
          ['Romanian Deadlift', 3, 6, 10, 2, COMPOUND],
          ['Leg Extension', 3, 10, 15, 1, ISO],
          ['Leg Curl', 3, 10, 15, 1, ISO],
          ['Standing Calf Raise', 3, 8, 12, 1, ISO],
        ],
      },
      {
        name: 'Push',
        slots: [
          ['Incline Dumbbell Press', 3, 8, 12, 2, MODERATE],
          ['Machine Shoulder Press', 3, 8, 12, 2, MODERATE],
          ['Cable Fly', 3, 12, 20, 1, ISO],
          ['Lateral Raise', 4, 12, 20, 1, ISO],
          ['Overhead Cable Triceps Extension', 3, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Pull',
        slots: [
          ['Pull-up', 3, 6, 10, 2, COMPOUND],
          ['Chest-Supported Row', 3, 8, 12, 2, MODERATE],
          ['Straight-Arm Pulldown', 3, 12, 15, 1, ISO],
          ['Reverse Pec Deck', 3, 12, 20, 1, ISO],
          ['Incline Dumbbell Curl', 3, 10, 15, 1, ISO],
          ['Hammer Curl', 2, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Legs',
        slots: [
          ['Hack Squat', 3, 8, 12, 2, COMPOUND],
          ['Hip Thrust', 3, 8, 12, 2, MODERATE],
          ['Walking Lunge', 3, 10, 15, 2, MODERATE],
          ['Seated Leg Curl', 3, 10, 15, 1, ISO],
          ['Seated Calf Raise', 3, 10, 15, 1, ISO],
          ['Cable Crunch', 3, 10, 15, 1, ISO],
        ],
      },
    ],
  },
  {
    id: 'tpl:ppl-6',
    name: 'Push Pull Legs, 6 days',
    summary: 'Push, pull and legs, run twice a week with a different exercise selection each time.',
    suits: 'Six days a week, good recovery, experience with the lifts',
    days: [
      {
        name: 'Push A',
        slots: [
          ['Bench Press', 4, 5, 8, 2, HEAVY],
          ['Dumbbell Shoulder Press', 3, 8, 12, 2, MODERATE],
          ['Incline Dumbbell Press', 3, 8, 12, 2, MODERATE],
          ['Lateral Raise', 3, 12, 20, 1, ISO],
          ['Triceps Pushdown', 3, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Pull A',
        slots: [
          ['Barbell Row', 4, 6, 10, 2, COMPOUND],
          ['Lat Pulldown', 3, 8, 12, 2, MODERATE],
          ['Face Pull', 3, 12, 20, 1, ISO],
          ['Barbell Curl', 3, 8, 12, 1, ISO],
          ['Hammer Curl', 2, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Legs A',
        slots: [
          ['Back Squat', 4, 5, 8, 2, HEAVY],
          ['Romanian Deadlift', 3, 6, 10, 2, COMPOUND],
          ['Leg Press', 3, 10, 15, 2, COMPOUND],
          ['Leg Curl', 3, 10, 15, 1, ISO],
          ['Standing Calf Raise', 4, 8, 12, 1, ISO],
        ],
      },
      {
        name: 'Push B',
        slots: [
          ['Overhead Press', 4, 5, 8, 2, HEAVY],
          ['Incline Bench Press', 3, 6, 10, 2, COMPOUND],
          ['Pec Deck', 3, 12, 20, 1, ISO],
          ['Cable Lateral Raise', 3, 12, 20, 1, ISO],
          ['Overhead Cable Triceps Extension', 3, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Pull B',
        slots: [
          ['Pull-up', 4, 5, 10, 2, COMPOUND],
          ['Seated Cable Row', 3, 8, 12, 2, MODERATE],
          ['Straight-Arm Pulldown', 3, 12, 15, 1, ISO],
          ['Reverse Pec Deck', 3, 12, 20, 1, ISO],
          ['Incline Dumbbell Curl', 3, 10, 15, 1, ISO],
        ],
      },
      {
        name: 'Legs B',
        slots: [
          ['Deadlift', 3, 4, 6, 2, HEAVY],
          ['Bulgarian Split Squat', 3, 8, 12, 2, MODERATE],
          ['Leg Extension', 3, 10, 15, 1, ISO],
          ['Seated Leg Curl', 3, 10, 15, 1, ISO],
          ['Seated Calf Raise', 3, 10, 15, 1, ISO],
          ['Hanging Leg Raise', 3, 8, 15, 1, ISO],
        ],
      },
    ],
  },
]

/** Direct working sets a template prescribes per week, for the library card. */
export function templateWeeklySets(t: ProgramTemplate): number {
  return t.days.reduce((sum, d) => sum + d.slots.reduce((s, x) => s + x[1], 0), 0)
}

/**
 * A user-owned copy of a template. Copying, rather than referencing, is what
 * lets someone edit their program without the next app release overwriting it.
 */
export function programFromTemplate(t: ProgramTemplate, newId: () => string, now: number): Program {
  const days: RoutineDay[] = t.days.map((d) => ({
    id: newId(),
    name: d.name,
    exercises: d.slots.map(([name, sets, repMin, repMax, rir, restSec]) => ({
      id: newId(),
      exerciseId: exerciseId(name),
      sets,
      repMin,
      repMax,
      rir,
      restSec,
    })),
  }))
  return {
    id: newId(),
    name: t.name,
    description: t.summary,
    days,
    templateId: t.id,
    active: 0,
    nextDayIndex: 0,
    createdAt: now,
    updatedAt: now,
  }
}
