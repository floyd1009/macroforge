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
  ['Bankdrücken', 'Bench Press', 'chest', ['triceps', 'shoulders'], 'Langhantel'],
  ['Schrägbankdrücken', 'Incline Bench Press', 'chest', ['shoulders', 'triceps'], 'Langhantel'],
  ['Kurzhantel-Bankdrücken', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders'], 'Kurzhantel'],
  ['Butterfly', 'Pec Deck', 'chest', [], 'Maschine'],
  ['Kabelzug-Fliegende', 'Cable Fly', 'chest', [], 'Kabelzug'],
  ['Liegestütze', 'Push-up', 'chest', ['triceps', 'shoulders'], 'Körpergewicht'],
  ['Dips', 'Dips', 'chest', ['triceps', 'shoulders'], 'Körpergewicht'],
  // Rücken
  ['Klimmzüge', 'Pull-up', 'back', ['biceps'], 'Körpergewicht'],
  ['Latzug', 'Lat Pulldown', 'back', ['biceps'], 'Kabelzug'],
  ['Langhantelrudern', 'Barbell Row', 'back', ['biceps', 'traps'], 'Langhantel'],
  ['Kurzhantelrudern', 'Dumbbell Row', 'back', ['biceps'], 'Kurzhantel'],
  ['Kabelrudern', 'Seated Cable Row', 'back', ['biceps'], 'Kabelzug'],
  ['Kreuzheben', 'Deadlift', 'back', ['hamstrings', 'glutes', 'traps'], 'Langhantel'],
  ['Rumänisches Kreuzheben', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back'], 'Langhantel'],
  ['Face Pulls', 'Face Pull', 'shoulders', ['traps', 'back'], 'Kabelzug'],
  // Schultern
  ['Schulterdrücken', 'Overhead Press', 'shoulders', ['triceps'], 'Langhantel'],
  ['Kurzhantel-Schulterdrücken', 'Dumbbell Shoulder Press', 'shoulders', ['triceps'], 'Kurzhantel'],
  ['Seitheben', 'Lateral Raise', 'shoulders', [], 'Kurzhantel'],
  ['Reverse Flys', 'Reverse Fly', 'shoulders', ['back'], 'Kurzhantel'],
  ['Nackenziehen', 'Shrug', 'traps', [], 'Kurzhantel'],
  // Arme
  ['Bizepscurls', 'Barbell Curl', 'biceps', ['forearms'], 'Langhantel'],
  ['Kurzhantel-Curls', 'Dumbbell Curl', 'biceps', ['forearms'], 'Kurzhantel'],
  ['Hammercurls', 'Hammer Curl', 'biceps', ['forearms'], 'Kurzhantel'],
  ['Trizepsdrücken am Kabel', 'Triceps Pushdown', 'triceps', [], 'Kabelzug'],
  ['Trizeps-Überkopfdrücken', 'Overhead Triceps Extension', 'triceps', [], 'Kurzhantel'],
  ['Enges Bankdrücken', 'Close-Grip Bench Press', 'triceps', ['chest'], 'Langhantel'],
  // Beine
  ['Kniebeugen', 'Back Squat', 'quads', ['glutes', 'hamstrings'], 'Langhantel'],
  ['Frontkniebeugen', 'Front Squat', 'quads', ['glutes'], 'Langhantel'],
  ['Beinpresse', 'Leg Press', 'quads', ['glutes'], 'Maschine'],
  ['Ausfallschritte', 'Lunge', 'quads', ['glutes', 'hamstrings'], 'Kurzhantel'],
  ['Bulgarische Kniebeuge', 'Bulgarian Split Squat', 'quads', ['glutes'], 'Kurzhantel'],
  ['Beinstrecker', 'Leg Extension', 'quads', [], 'Maschine'],
  ['Beinbeuger', 'Leg Curl', 'hamstrings', [], 'Maschine'],
  ['Hip Thrust', 'Hip Thrust', 'glutes', ['hamstrings'], 'Langhantel'],
  ['Wadenheben', 'Calf Raise', 'calves', [], 'Maschine'],
  // Rumpf
  ['Plank', 'Plank', 'abs', [], 'Körpergewicht'],
  ['Beinheben hängend', 'Hanging Leg Raise', 'abs', [], 'Körpergewicht'],
  ['Crunches am Kabel', 'Cable Crunch', 'abs', [], 'Kabelzug'],
  ['Ab Wheel', 'Ab Wheel Rollout', 'abs', [], 'Sonstiges'],
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
  chest: 'Brust',
  back: 'Rücken',
  shoulders: 'Schultern',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  quads: 'Quadrizeps',
  hamstrings: 'Beinbizeps',
  glutes: 'Gesäß',
  calves: 'Waden',
  abs: 'Bauch',
  forearms: 'Unterarme',
  traps: 'Nacken',
  neck: 'Hals',
  cardio: 'Cardio',
}
