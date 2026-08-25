import type { Exercise, MuscleGroup } from '../lib/types'

/**
 * Common gym movements with German names.
 *
 * The open exercise datasets (free-exercise-db and friends) are English-only,
 * so this is a curated German list covering what actually gets trained rather
 * than an exhaustive catalogue. Users can add their own.
 */
type Spec = [de: string, en: string, primary: MuscleGroup, secondary: MuscleGroup[], equipment?: string]

const E: Spec[] = [
  // Brust
  ['Bankdrücken', 'Bench Press', 'chest', ['triceps', 'shoulders'], 'Barbell'],
  ['Schrägbankdrücken', 'Incline Bench Press', 'chest', ['shoulders', 'triceps'], 'Barbell'],
  ['Kurzhantel-Bankdrücken', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders'], 'Dumbbell'],
  ['Butterfly', 'Pec Deck', 'chest', [], 'Machine'],
  ['Kabelzug-Fliegende', 'Cable Fly', 'chest', [], 'Cable'],
  ['Liegestütze', 'Push-up', 'chest', ['triceps', 'shoulders'], 'Bodyweight'],
  ['Dips', 'Dips', 'chest', ['triceps', 'shoulders'], 'Bodyweight'],
  // Rücken
  ['Klimmzüge', 'Pull-up', 'back', ['biceps'], 'Bodyweight'],
  ['Latzug', 'Lat Pulldown', 'back', ['biceps'], 'Cable'],
  ['Langhantelrudern', 'Barbell Row', 'back', ['biceps', 'traps'], 'Barbell'],
  ['Kurzhantelrudern', 'Dumbbell Row', 'back', ['biceps'], 'Dumbbell'],
  ['Kabelrudern', 'Seated Cable Row', 'back', ['biceps'], 'Cable'],
  ['Kreuzheben', 'Deadlift', 'back', ['hamstrings', 'glutes', 'traps'], 'Barbell'],
  ['Rumänisches Kreuzheben', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back'], 'Barbell'],
  ['Face Pulls', 'Face Pull', 'shoulders', ['traps', 'back'], 'Cable'],
  // Schultern
  ['Schulterdrücken', 'Overhead Press', 'shoulders', ['triceps'], 'Barbell'],
  ['Kurzhantel-Schulterdrücken', 'Dumbbell Shoulder Press', 'shoulders', ['triceps'], 'Dumbbell'],
  ['Seitheben', 'Lateral Raise', 'shoulders', [], 'Dumbbell'],
  ['Reverse Flys', 'Reverse Fly', 'shoulders', ['back'], 'Dumbbell'],
  ['Nackenziehen', 'Shrug', 'traps', [], 'Dumbbell'],
  // Arme
  ['Bizepscurls', 'Barbell Curl', 'biceps', ['forearms'], 'Barbell'],
  ['Kurzhantel-Curls', 'Dumbbell Curl', 'biceps', ['forearms'], 'Dumbbell'],
  ['Hammercurls', 'Hammer Curl', 'biceps', ['forearms'], 'Dumbbell'],
  ['Trizepsdrücken am Kabel', 'Triceps Pushdown', 'triceps', [], 'Cable'],
  ['Trizeps-Überkopfdrücken', 'Overhead Triceps Extension', 'triceps', [], 'Dumbbell'],
  ['Enges Bankdrücken', 'Close-Grip Bench Press', 'triceps', ['chest'], 'Barbell'],
  // Beine
  ['Kniebeugen', 'Back Squat', 'quads', ['glutes', 'hamstrings'], 'Barbell'],
  ['Frontkniebeugen', 'Front Squat', 'quads', ['glutes'], 'Barbell'],
  ['Beinpresse', 'Leg Press', 'quads', ['glutes'], 'Machine'],
  ['Ausfallschritte', 'Lunge', 'quads', ['glutes', 'hamstrings'], 'Dumbbell'],
  ['Bulgarische Kniebeuge', 'Bulgarian Split Squat', 'quads', ['glutes'], 'Dumbbell'],
  ['Beinstrecker', 'Leg Extension', 'quads', [], 'Machine'],
  ['Beinbeuger', 'Leg Curl', 'hamstrings', [], 'Machine'],
  ['Hip Thrust', 'Hip Thrust', 'glutes', ['hamstrings'], 'Barbell'],
  ['Wadenheben', 'Calf Raise', 'calves', [], 'Machine'],
  // Rumpf
  ['Plank', 'Plank', 'abs', [], 'Bodyweight'],
  ['Beinheben hängend', 'Hanging Leg Raise', 'abs', [], 'Bodyweight'],
  ['Crunches am Kabel', 'Cable Crunch', 'abs', [], 'Cable'],
  ['Ab Wheel', 'Ab Wheel Rollout', 'abs', [], 'Other'],
  // Cardio
  ['Laufband', 'Treadmill', 'cardio', [], 'Cardio'],
  ['Rudergerät', 'Rowing Machine', 'cardio', [], 'Cardio'],
  ['Fahrrad', 'Stationary Bike', 'cardio', [], 'Cardio'],
]

const BODYWEIGHT = new Set(['Klimmzüge', 'Liegestütze', 'Dips', 'Plank', 'Beinheben hängend'])

export function buildSeedExercises(): Exercise[] {
  return E.map(([de, en, primary, secondary, equipment]) => ({
    id: `ex:${en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: en,
    nameDe: de,
    primary,
    secondary,
    equipment,
    bodyweight: BODYWEIGHT.has(de),
    useCount: 0,
  }))
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
  forearms: 'Forearms',
  traps: 'Traps',
  neck: 'Neck',
  cardio: 'Cardio',
}
