/**
 * Prompts and response schemas for the two AI paths.
 *
 * One rule dominates both: **the model never returns calories or macros.**
 * It returns *what it saw* — food names, portions and preparation — and the
 * app resolves those against real composition data. A model that invents
 * "312 kcal" is unauditable and unfixable; a model that says "ca. 150 g
 * Hähnchenbrust, gebraten" can be checked, corrected, and re-resolved against
 * a database entry the user can see.
 */

export const PHOTO_SYSTEM = `Du bist ein Ernährungsassistent, der Essensfotos analysiert. Du arbeitest für einen Nutzer in Deutschland.

DEINE AUFGABE: Beschreibe präzise, WAS auf dem Foto ist und WIE VIEL davon. Du berechnest KEINE Kalorien oder Makronährstoffe — das macht die App anhand einer Nährwertdatenbank.

REGELN:
1. Zerlege das Gericht in einzelne Zutaten. "Hähnchen mit Reis und Brokkoli" sind DREI Einträge, nicht einer.
2. Schätze die Portion je Zutat. Nutze bevorzugt ein Haushaltsmaß (Scheibe, EL, TL, Stück, Handvoll, Becher, Portion) oder, wenn das nicht passt, eine Masse in Gramm.
3. Nenne den Zubereitungszustand: roh, gekocht/gebraten, oder wie gekauft. Das verändert das Gewicht erheblich.
4. UNSICHTBARE ZUTATEN sind der größte Fehlerquelle. Öl, Butter, Zucker, Sahne und Saucen sind kalorienreich und auf einem Foto oft nicht zu sehen. Wenn du vermutest, dass welche verwendet wurden, führe sie als eigenen Eintrag mit "assumed": true auf und stelle dazu eine kurze Rückfrage.
5. Sei ehrlich über Unsicherheit. Wenn du eine Portion nicht einschätzen kannst, sage das über eine niedrige confidence — rate nicht selbstbewusst.
6. Deutsche Lebensmittelnamen. Marken nur, wenn sie klar erkennbar sind.
7. Wenn auf dem Foto kein Essen ist, gib eine leere Liste zurück und erkläre es in "note".

GRÖSSENHINWEISE: Ein Standardteller hat 26–28 cm Durchmesser, eine Gabel 19–20 cm, eine Dose 330 ml ist 11,5 cm hoch. Nutze solche Referenzen, wenn sie im Bild sind, und sage in "anchors", welche du verwendet hast.`

export const PHOTO_TOOL = {
  name: 'log_meal',
  description: 'Trage die auf dem Foto erkannten Lebensmittel mit geschätzten Portionen ein.',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Jede erkannte Zutat einzeln.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Deutscher Lebensmittelname, z. B. "Hähnchenbrustfilet".' },
            brand: { type: 'string', description: 'Nur wenn die Marke im Bild klar lesbar ist.' },
            quantity: { type: 'number', description: 'Menge in der Einheit von "measure".' },
            measure: {
              type: 'string',
              description:
                'Haushaltsmaß (Scheibe, EL, TL, Stück, Handvoll, Becher, Glas, Portion, Dose) ODER "g" bzw. "ml".',
            },
            state: {
              type: 'string',
              enum: ['raw', 'cooked', 'as_sold'],
              description: 'Zustand beim Wiegen: roh, zubereitet, oder wie gekauft.',
            },
            assumed: {
              type: 'boolean',
              description: 'true, wenn die Zutat nicht sichtbar ist, sondern vermutet wird (Öl, Zucker, Butter).',
            },
            confidence: { type: 'number', description: 'Von 0 bis 1, wie sicher du bei dieser Portion bist.' },
          },
          required: ['name', 'quantity', 'measure', 'state', 'confidence'],
        },
      },
      dish: { type: 'string', description: 'Name des Gerichts insgesamt, z. B. "Hähnchenpfanne mit Reis".' },
      anchors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bildreferenzen, die du zur Größenschätzung genutzt hast (Teller, Gabel, Hand, Dose).',
      },
      questions: {
        type: 'array',
        description:
          'Höchstens 3 kurze Rückfragen zu unsichtbaren Zutaten, die die Schätzung am stärksten verbessern würden.',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'Die Frage auf Deutsch, kurz.' },
            affects: { type: 'string', description: 'Auf welchen Eintrag sie sich bezieht.' },
            options: { type: 'array', items: { type: 'string' }, description: '2–4 Antwortmöglichkeiten.' },
          },
          required: ['question', 'options'],
        },
      },
      overallConfidence: { type: 'number', description: '0 bis 1 für die Gesamtschätzung.' },
      note: { type: 'string', description: 'Kurzer Hinweis an den Nutzer, falls nötig.' },
    },
    required: ['items', 'overallConfidence'],
  },
} as const

export const VOICE_SYSTEM = `Du wandelst gesprochene oder getippte deutsche Beschreibungen von Mahlzeiten in strukturierte Einträge um.

DEINE AUFGABE: Zerlege den Text in einzelne Lebensmittel mit Menge, Maßeinheit und Zustand. Du berechnest KEINE Kalorien und KEINE Gramm-Werte für Haushaltsmaße — die App löst Haushaltsmaße gegen eine eigene Tabelle auf.

REGELN:
1. Gib bei "measure" das genannte Haushaltsmaß wörtlich zurück (Scheibe, EL, TL, Stück, Becher, Glas, Handvoll, Portion, Dose, Packung) — ODER "g"/"ml", wenn der Nutzer eine Masse genannt hat.
2. Rechne NIEMALS selbst ein Haushaltsmaß in Gramm um. "zwei Scheiben Brot" ist quantity 2, measure "Scheibe" — nicht 90 g.
3. Deutsche Dezimalkommas beibehalten: "1,5 Liter" ist quantity 1.5, measure "ml", also 1500 ml. Rechne Liter in ml und Kilogramm in g um.
4. Sprachliche Brüche auflösen: "ein halbes Hähnchen" = 0.5, "anderthalb Brötchen" = 1.5, "ein Viertel Pizza" = 0.25.
5. Zusammengesetzte Substantive NICHT trennen: "Hähnchenbrustfilet" ist EIN Lebensmittel, nicht "Hähnchen" + "Brust" + "Filet".
6. Zubereitung erfassen: "gebratene Hähnchenbrust" ist state "cooked", "Hähnchenbrust roh" ist "raw", ein verpacktes Produkt ist "as_sold".
7. Wenn keine Menge genannt wird, nimm eine übliche Portion an und setze confidence niedrig.
8. Mahlzeit erkennen, falls genannt ("zum Frühstück" → breakfast).`

export const VOICE_TOOL = {
  name: 'parse_meal_text',
  description: 'Zerlege den deutschen Text in einzelne Lebensmitteleinträge.',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Lebensmittelname auf Deutsch, zusammengesetzte Wörter erhalten.' },
            brand: { type: 'string' },
            quantity: { type: 'number' },
            measure: {
              type: 'string',
              description: 'Das genannte Haushaltsmaß wörtlich, oder "g"/"ml" bei einer Masse.',
            },
            state: { type: 'string', enum: ['raw', 'cooked', 'as_sold'] },
            confidence: { type: 'number' },
          },
          required: ['name', 'quantity', 'measure', 'state', 'confidence'],
        },
      },
      meal: {
        type: 'string',
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'Nur setzen, wenn im Text genannt.',
      },
      note: { type: 'string' },
    },
    required: ['items'],
  },
} as const

/** Shape returned by the photo tool. */
export interface AiFoodItem {
  name: string
  brand?: string
  quantity: number
  measure: string
  state: 'raw' | 'cooked' | 'as_sold'
  assumed?: boolean
  confidence: number
}

export interface PhotoResult {
  items: AiFoodItem[]
  dish?: string
  anchors?: string[]
  questions?: Array<{ question: string; affects?: string; options: string[] }>
  overallConfidence: number
  note?: string
}

export interface VoiceResult {
  items: AiFoodItem[]
  meal?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  note?: string
}
