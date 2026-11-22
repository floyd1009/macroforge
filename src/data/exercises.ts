import type { Exercise, MuscleGroup } from '../lib/types'

/**
 * Common gym movements with German names.
 *
 * The open exercise datasets (free-exercise-db and friends) are English-only,
 * so this is a curated German list covering what actually gets trained rather
 * than an exhaustive catalogue. Users can add their own.
 *
 * Ids are derived from the English name, so an English name must never be
 * edited once shipped: doing so would orphan every set logged against it.
 * Add a new row instead.
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
  ['Kurzhantel-Schrägbankdrücken', 'Incline Dumbbell Press', 'chest', ['shoulders', 'triceps'], 'Dumbbell'],
  ['Negativ-Bankdrücken', 'Decline Bench Press', 'chest', ['triceps'], 'Barbell'],
  ['Brustpresse', 'Machine Chest Press', 'chest', ['triceps', 'shoulders'], 'Machine'],
  ['Schrägbank-Brustpresse', 'Incline Machine Press', 'chest', ['shoulders', 'triceps'], 'Machine'],
  ['Bankdrücken Multipresse', 'Smith Machine Bench Press', 'chest', ['triceps', 'shoulders'], 'Smith'],
  ['Schrägbankdrücken Multipresse', 'Smith Machine Incline Press', 'chest', ['shoulders', 'triceps'], 'Smith'],
  ['Kurzhantel-Fliegende', 'Dumbbell Fly', 'chest', [], 'Dumbbell'],
  ['Kabelzug-Fliegende tief nach hoch', 'Low-to-High Cable Fly', 'chest', ['shoulders'], 'Cable'],
  // Rücken
  ['Klimmzüge', 'Pull-up', 'back', ['biceps'], 'Bodyweight'],
  ['Latzug', 'Lat Pulldown', 'back', ['biceps'], 'Cable'],
  ['Langhantelrudern', 'Barbell Row', 'back', ['biceps', 'traps'], 'Barbell'],
  ['Kurzhantelrudern', 'Dumbbell Row', 'back', ['biceps'], 'Dumbbell'],
  ['Kabelrudern', 'Seated Cable Row', 'back', ['biceps'], 'Cable'],
  ['Kreuzheben', 'Deadlift', 'back', ['hamstrings', 'glutes', 'traps'], 'Barbell'],
  ['Rumänisches Kreuzheben', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back'], 'Barbell'],
  ['Face Pulls', 'Face Pull', 'shoulders', ['traps', 'back'], 'Cable'],
  ['Klimmzüge im Untergriff', 'Chin-up', 'back', ['biceps'], 'Bodyweight'],
  ['Latzug eng', 'Close-Grip Lat Pulldown', 'back', ['biceps'], 'Cable'],
  ['Latzug im Neutralgriff', 'Neutral-Grip Lat Pulldown', 'back', ['biceps'], 'Cable'],
  ['T-Bar-Rudern', 'T-Bar Row', 'back', ['biceps', 'traps'], 'Barbell'],
  ['Rudern mit Brustauflage', 'Chest-Supported Row', 'back', ['biceps', 'traps'], 'Machine'],
  ['Rudermaschine sitzend', 'Machine Row', 'back', ['biceps'], 'Machine'],
  ['Einarmiges Kabelrudern', 'Single-Arm Cable Row', 'back', ['biceps'], 'Cable'],
  ['Überzüge am Kabel', 'Straight-Arm Pulldown', 'back', [], 'Cable'],
  ['Umgekehrtes Rudern', 'Inverted Row', 'back', ['biceps'], 'Bodyweight'],
  ['Rack Pulls', 'Rack Pull', 'back', ['traps', 'glutes'], 'Barbell'],
  ['Rückenstrecker', 'Back Extension', 'back', ['glutes', 'hamstrings'], 'Bodyweight'],
  ['Klimmzugmaschine', 'Assisted Pull-up', 'back', ['biceps'], 'Machine'],
  // Schultern
  ['Schulterdrücken', 'Overhead Press', 'shoulders', ['triceps'], 'Barbell'],
  ['Kurzhantel-Schulterdrücken', 'Dumbbell Shoulder Press', 'shoulders', ['triceps'], 'Dumbbell'],
  ['Seitheben', 'Lateral Raise', 'shoulders', [], 'Dumbbell'],
  ['Reverse Flys', 'Reverse Fly', 'shoulders', ['back'], 'Dumbbell'],
  ['Nackenziehen', 'Shrug', 'traps', [], 'Dumbbell'],
  ['Schulterpresse', 'Machine Shoulder Press', 'shoulders', ['triceps'], 'Machine'],
  ['Arnold Press', 'Arnold Press', 'shoulders', ['triceps'], 'Dumbbell'],
  ['Seitheben am Kabel', 'Cable Lateral Raise', 'shoulders', [], 'Cable'],
  ['Seitheben an der Maschine', 'Machine Lateral Raise', 'shoulders', [], 'Machine'],
  ['Frontheben', 'Front Raise', 'shoulders', [], 'Dumbbell'],
  ['Reverse Butterfly', 'Reverse Pec Deck', 'shoulders', ['back', 'traps'], 'Machine'],
  ['Reverse Flys am Kabel', 'Cable Reverse Fly', 'shoulders', ['back'], 'Cable'],
  ['Aufrechtes Rudern', 'Upright Row', 'shoulders', ['traps'], 'Barbell'],
  ['Langhantel-Shrugs', 'Barbell Shrug', 'traps', ['forearms'], 'Barbell'],
  ['Schulterdrücken Multipresse', 'Smith Machine Shoulder Press', 'shoulders', ['triceps'], 'Smith'],
  // Arme
  ['Bizepscurls', 'Barbell Curl', 'biceps', ['forearms'], 'Barbell'],
  ['Kurzhantel-Curls', 'Dumbbell Curl', 'biceps', ['forearms'], 'Dumbbell'],
  ['Hammercurls', 'Hammer Curl', 'biceps', ['forearms'], 'Dumbbell'],
  ['Trizepsdrücken am Kabel', 'Triceps Pushdown', 'triceps', [], 'Cable'],
  ['Trizeps-Überkopfdrücken', 'Overhead Triceps Extension', 'triceps', [], 'Dumbbell'],
  ['Enges Bankdrücken', 'Close-Grip Bench Press', 'triceps', ['chest'], 'Barbell'],
  ['SZ-Curls', 'EZ-Bar Curl', 'biceps', ['forearms'], 'Barbell'],
  ['Schrägbank-Curls', 'Incline Dumbbell Curl', 'biceps', [], 'Dumbbell'],
  ['Scottcurls', 'Preacher Curl', 'biceps', [], 'Machine'],
  ['Bizepscurls am Kabel', 'Cable Curl', 'biceps', ['forearms'], 'Cable'],
  ['Bayesian Curls', 'Bayesian Cable Curl', 'biceps', [], 'Cable'],
  ['Konzentrationscurls', 'Concentration Curl', 'biceps', [], 'Dumbbell'],
  ['Reverse Curls', 'Reverse Curl', 'forearms', ['biceps'], 'Barbell'],
  ['Handgelenkcurls', 'Wrist Curl', 'forearms', [], 'Dumbbell'],
  ['Stirndrücken', 'Skull Crusher', 'triceps', [], 'Barbell'],
  ['Trizeps-Überkopfdrücken am Kabel', 'Overhead Cable Triceps Extension', 'triceps', [], 'Cable'],
  ['Trizepsdrücken mit Seil', 'Rope Pushdown', 'triceps', [], 'Cable'],
  ['Trizeps-Dips an der Bank', 'Bench Dip', 'triceps', ['chest', 'shoulders'], 'Bodyweight'],
  ['Trizepsmaschine', 'Machine Triceps Extension', 'triceps', [], 'Machine'],
  ['Kickbacks', 'Triceps Kickback', 'triceps', [], 'Dumbbell'],
  ['Enge Liegestütze', 'Diamond Push-up', 'triceps', ['chest'], 'Bodyweight'],
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
  ['Hackenschmidt-Kniebeuge', 'Hack Squat', 'quads', ['glutes'], 'Machine'],
  ['Kniebeugen Multipresse', 'Smith Machine Squat', 'quads', ['glutes'], 'Smith'],
  ['Goblet Squat', 'Goblet Squat', 'quads', ['glutes'], 'Dumbbell'],
  ['Pendel-Kniebeuge', 'Pendulum Squat', 'quads', ['glutes'], 'Machine'],
  ['Ausfallschritte im Gehen', 'Walking Lunge', 'quads', ['glutes', 'hamstrings'], 'Dumbbell'],
  ['Step-ups', 'Step-up', 'quads', ['glutes'], 'Dumbbell'],
  ['Sissy Squat', 'Sissy Squat', 'quads', [], 'Bodyweight'],
  ['Beinbeuger sitzend', 'Seated Leg Curl', 'hamstrings', [], 'Machine'],
  ['Beinbeuger liegend', 'Lying Leg Curl', 'hamstrings', [], 'Machine'],
  ['Kreuzheben mit gestreckten Beinen', 'Stiff-Leg Deadlift', 'hamstrings', ['glutes', 'back'], 'Barbell'],
  ['Kurzhantel-Kreuzheben rumänisch', 'Dumbbell Romanian Deadlift', 'hamstrings', ['glutes', 'back'], 'Dumbbell'],
  ['Good Mornings', 'Good Morning', 'hamstrings', ['glutes', 'back'], 'Barbell'],
  ['Nordic Curls', 'Nordic Curl', 'hamstrings', [], 'Bodyweight'],
  ['Sumo-Kreuzheben', 'Sumo Deadlift', 'glutes', ['hamstrings', 'quads', 'back'], 'Barbell'],
  ['Trap-Bar-Kreuzheben', 'Trap Bar Deadlift', 'quads', ['glutes', 'hamstrings', 'back'], 'Barbell'],
  ['Hip Thrust an der Maschine', 'Machine Hip Thrust', 'glutes', ['hamstrings'], 'Machine'],
  ['Glute Bridge', 'Glute Bridge', 'glutes', ['hamstrings'], 'Barbell'],
  ['Kickbacks am Kabel', 'Cable Kickback', 'glutes', [], 'Cable'],
  ['Abduktorenmaschine', 'Hip Abduction', 'glutes', [], 'Machine'],
  ['Adduktorenmaschine', 'Hip Adduction', 'quads', [], 'Machine'],
  ['Kabelzug durch die Beine', 'Cable Pull-Through', 'glutes', ['hamstrings'], 'Cable'],
  ['Wadenheben stehend', 'Standing Calf Raise', 'calves', [], 'Machine'],
  ['Wadenheben sitzend', 'Seated Calf Raise', 'calves', [], 'Machine'],
  ['Wadenheben an der Beinpresse', 'Leg Press Calf Raise', 'calves', [], 'Machine'],
  ['Einbeiniges Wadenheben', 'Single-Leg Calf Raise', 'calves', [], 'Bodyweight'],
  // Rumpf
  ['Plank', 'Plank', 'abs', [], 'Bodyweight'],
  ['Beinheben hängend', 'Hanging Leg Raise', 'abs', [], 'Bodyweight'],
  ['Crunches am Kabel', 'Cable Crunch', 'abs', [], 'Cable'],
  ['Ab Wheel', 'Ab Wheel Rollout', 'abs', [], 'Other'],
  ['Crunches', 'Crunch', 'abs', [], 'Bodyweight'],
  ['Bauchmaschine', 'Machine Crunch', 'abs', [], 'Machine'],
  ['Beinheben liegend', 'Lying Leg Raise', 'abs', [], 'Bodyweight'],
  ['Knieheben hängend', 'Hanging Knee Raise', 'abs', [], 'Bodyweight'],
  ['Russian Twist', 'Russian Twist', 'abs', [], 'Bodyweight'],
  ['Seitstütz', 'Side Plank', 'abs', [], 'Bodyweight'],
  ['Holzhacker am Kabel', 'Cable Woodchop', 'abs', ['shoulders'], 'Cable'],
  ['Pallof Press', 'Pallof Press', 'abs', [], 'Cable'],
  // Sonstiges
  ['Farmers Walk', "Farmer's Carry", 'forearms', ['traps', 'abs'], 'Dumbbell'],
  ['Kettlebell Swing', 'Kettlebell Swing', 'glutes', ['hamstrings', 'back'], 'Kettlebell'],
  ['Nackenstrecker', 'Neck Extension', 'neck', [], 'Other'],
  ['Nackenbeuger', 'Neck Flexion', 'neck', [], 'Other'],
  // Cardio
  ['Laufband', 'Treadmill', 'cardio', [], 'Cardio'],
  ['Rudergerät', 'Rowing Machine', 'cardio', [], 'Cardio'],
  ['Fahrrad', 'Stationary Bike', 'cardio', [], 'Cardio'],
  ['Crosstrainer', 'Elliptical', 'cardio', [], 'Cardio'],
  ['Stairmaster', 'Stair Climber', 'cardio', [], 'Cardio'],
]

/**
 * Load steps that differ from the equipment default (2.5 kg, or 2 kg per
 * dumbbell). Small isolation movements sit below 10 kg, where racks go up in
 * 1 kg steps and a 2 kg jump is more than a rep range is worth.
 */
const INCREMENT: Record<string, number> = {
  'Lateral Raise': 1,
  'Front Raise': 1,
  'Reverse Fly': 1,
  'Triceps Kickback': 1,
  'Wrist Curl': 1,
  'Concentration Curl': 1,
  'Leg Press': 5,
  'Hack Squat': 5,
  'Leg Press Calf Raise': 5,
  'Machine Hip Thrust': 5,
}

/**
 * Two or three cues per main lift: what to set up, and the one fault that
 * most often costs the rep. Deliberately short. A cue is a reminder for
 * someone who has been shown the lift, not a substitute for being shown.
 */
const CUES: Record<string, string[]> = {
  'Bench Press': [
    'Shoulder blades pulled back and down, feet planted, slight arch.',
    'Lower to the mid-chest with forearms vertical, elbows about 45 to 70 degrees from the torso.',
    'Touch the chest every rep. A shortened rep is a different, easier lift.',
  ],
  'Incline Bench Press': [
    'Bench at roughly 30 degrees. Steeper turns it into a shoulder press.',
    'Lower to the upper chest, just under the collarbones.',
  ],
  'Dumbbell Bench Press': [
    'Lower until the dumbbells are level with the chest for a full stretch.',
    'Press up and slightly in. The dumbbells do not need to touch.',
  ],
  'Incline Dumbbell Press': [
    'Bench at roughly 30 degrees, shoulder blades pinned.',
    'Take the stretch at the bottom. That is where dumbbells beat the bar.',
  ],
  'Back Squat': [
    'Brace before you descend. Hold the breath until past the sticking point.',
    'Knees track over the toes. Travelling forward is fine.',
    'Hip crease below the top of the knee, unless mobility or pain says otherwise.',
  ],
  'Front Squat': [
    'Elbows high the whole way, bar resting on the shoulders, not held by the hands.',
    'Stay upright. If the elbows drop, the bar goes with them.',
  ],
  Deadlift: [
    'Bar over mid-foot, shins to the bar, then take the slack out before it leaves the floor.',
    'Push the floor away. Back angle stays fixed until the bar passes the knees.',
    'Keep the bar against the legs. Distance from the body is extra moment arm on the spine.',
  ],
  'Romanian Deadlift': [
    'Soft knees, hips travel back. The bar slides down the thighs.',
    'Stop when the hips stop moving back. Going lower is just spinal flexion.',
  ],
  'Overhead Press': [
    'Squeeze glutes and brace so the lower back does not arch to finish the rep.',
    'Bar travels in a straight line. Move the head out of the way, then back under.',
  ],
  'Pull-up': [
    'Start from a dead hang with shoulders active.',
    'Drive the elbows down toward the hips. Chin over the bar without craning the neck.',
  ],
  'Chin-up': ['Dead hang to chin over the bar.', 'Underhand grip shifts work toward the biceps.'],
  'Lat Pulldown': [
    'Slight lean back, chest up, pull to the upper chest.',
    'Control the way up to a full stretch. Do not let the stack yank you.',
  ],
  'Barbell Row': [
    'Hinge to roughly 45 degrees or lower and hold that angle.',
    'Pull to the lower ribs. If the torso rises to finish the rep, the load is too heavy.',
  ],
  'Dumbbell Row': [
    'Support with the free hand, back flat.',
    'Pull the elbow toward the hip and let the shoulder blade move through a full stretch.',
  ],
  'Seated Cable Row': [
    'Torso stays near upright. Rocking back and forth is momentum, not back work.',
    'Let the shoulder blades spread at the front and squeeze them at the back.',
  ],
  'Hip Thrust': [
    'Upper back on the bench, shins vertical at the top.',
    'Finish with the hips fully extended, ribs down, chin tucked.',
  ],
  'Leg Press': [
    'Feet placed so the knees can bend deep without the hips rolling off the pad.',
    'Lower under control to full depth. Do not lock the knees out hard.',
  ],
  'Bulgarian Split Squat': [
    'Most of the load on the front leg. The back foot only balances.',
    'Descend straight down until the back knee is just off the floor.',
  ],
  'Lateral Raise': [
    'Lead with the elbows, slight forward lean, raise to about shoulder height.',
    'If you have to swing, the dumbbell is too heavy.',
  ],
  'Leg Curl': ['Hips stay down on the pad.', 'Control the return to a full stretch.'],
  'Leg Extension': ['Pause briefly at full extension.', 'Lower under control, do not drop the stack.'],
  'Triceps Pushdown': ['Elbows fixed at the sides.', 'Lock out fully, then let the forearms come all the way up.'],
  'Barbell Curl': ['Elbows stay by the ribs.', 'No hip swing. Lower all the way to straight arms.'],
  Dips: [
    'Slight forward lean for chest, upright for triceps.',
    'Descend until the shoulders are a little below the elbows, if the shoulders tolerate it.',
  ],
  'Hack Squat': ['Back and hips flat on the pad.', 'Go as deep as the machine and your ankles allow.'],
  'Face Pull': ['Pull toward the forehead with elbows high.', 'Finish with the hands apart and beside the ears.'],
}

export const exerciseId = (en: string): string => `ex:${en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

export function buildSeedExercises(): Exercise[] {
  return E.map(([de, en, primary, secondary, equipment]) => ({
    id: exerciseId(en),
    name: en,
    nameDe: de,
    primary,
    secondary,
    equipment,
    // For these the weight field means load *added* to the lifter's body.
    bodyweight: equipment === 'Bodyweight',
    ...(CUES[en] ? { cues: CUES[en] } : {}),
    ...(INCREMENT[en] != null ? { incrementKg: INCREMENT[en] } : {}),
    useCount: 0,
  }))
}

/**
 * Fields of a seed exercise that a newer release may improve.
 *
 * First-run seeding only inserts rows that are missing, so a device that
 * already has "Bench Press" would never receive cues added later. This
 * returns the patch to apply to an existing row, or `null` when it is
 * already current. Usage counters and anything the user changed are left
 * alone: only reference data is refreshed.
 */
export function seedExercisePatch(existing: Exercise, seed: Exercise): Partial<Exercise> | null {
  const patch: Partial<Exercise> = {}
  if (JSON.stringify(existing.cues ?? null) !== JSON.stringify(seed.cues ?? null)) patch.cues = seed.cues
  if ((existing.incrementKg ?? null) !== (seed.incrementKg ?? null)) patch.incrementKg = seed.incrementKg
  if (!!existing.bodyweight !== !!seed.bodyweight) patch.bodyweight = seed.bodyweight
  return Object.keys(patch).length ? patch : null
}

export const EQUIPMENT = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Smith',
  'Bodyweight',
  'Kettlebell',
  'Other',
  'Cardio',
] as const

export const MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'forearms',
  'traps',
  'neck',
  'cardio',
]

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
