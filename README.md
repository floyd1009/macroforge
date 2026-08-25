# MacroForge

Offline-first macro and training tracker: English interface, German supermarkets.
No account, no server, no subscription — everything lives on your phone.

Installs to the iPhone home screen as a web app. Free to run and MIT-licensed.

---

## What it does

- **Macro tracking** against adaptive targets that are measured, not guessed —
  the app derives your real energy expenditure from what you logged and how
  your weight actually moved, and tells you how much of that number is data
  versus formula.
- **The German national food database, offline.** All 7,140 foods of the
  Bundeslebensmittelschlüssel 4.0 (Max Rubner-Institut, CC BY 4.0) ship with
  the app — 300 kB gzipped, imported into IndexedDB on first launch. That
  covers the generic foods Open Food Facts is worst at, because nobody scans a
  potato, and it includes raw *and* cooked variants of most whole foods.
- **German retail products** from Open Food Facts: ALDI, Lidl, REWE, EDEKA, dm,
  Kaufland, PENNY and Netto private labels, tagged with the chain they belong
  to. Search is bilingual — "Haferflocken" and "rolled oats" find the same row.
- **Barcode scanning** with a manual-entry fallback.
- **Photo logging** — describes what is on the plate and resolves it against
  real composition data, with an honest error band.
- **Voice logging** via iOS keyboard dictation, parsing household measures in
  English *or* German — "two slices of Vollkornbrot", "a tbsp of oil",
  "anderthalb Brötchen" all resolve to grams against a hand-curated table.
- **Training log** with e1RM estimates and weekly hard-set volume per muscle
  group.

## What it deliberately does not do

- **Claim photo estimates are accurate.** They are not, and no app's are.
  Photo estimation runs around ±25 % on calories even with the best current
  models, because fat is 9 kcal/g and optically invisible — a tablespoon of
  oil is ~119 kcal and cannot be seen. Every estimate is shown as a range with
  its provenance.
- **Treat a barcode as ground truth.** EU labelling law permits ±20 % tolerance
  on macros in the 10–40 g/100 g band, and label energy is *calculated*, not
  measured. Scanned entries carry a ±15 % band.
- **Use red for data.** Red is the brand colour and the universal error colour;
  putting it in macro bars would make the app read as judgemental and destroy
  its error vocabulary. Macro colours are blue/violet/amber, and palette
  contrast is pinned by tests so it cannot regress below WCAG AA.

## Accuracy work most trackers skip

- **EU vs US carbohydrates.** EU labels state *available* carbs with fibre
  listed separately; USDA states *total* carbs including fibre. Mixing them is
  a silent per-food error equal to the fibre content. Every food records its
  convention and is normalised to the EU one.
- **Raw vs cooked.** Logging 150 g of *cooked* chicken against a *raw* database
  entry under-counts protein by about 28 %. Foods carry yield factors and the
  portion picker lets you say which state you weighed.
- **Energy reconciliation.** Stated calories are checked against the LMIV
  Annex XIV factors (4/4/9 plus fibre 2, polyols 2.4, alcohol 7). Products whose
  numbers cannot be true — macros exceeding 100 g per 100 g, energy above
  900 kcal/100 g — are rejected rather than logged.
- **Trend weight, not scale weight.** Targets follow an exponentially smoothed
  trend so a salty dinner does not move your calories.

## Running it

```bash
npm install
npm run dev
```

```bash
npm run test
```

## Putting it on your iPhone

1. Push this repo to GitHub and enable **Settings → Pages → Source: GitHub
   Actions**. The included workflow builds and deploys on every push to `main`.
2. Open the resulting `https://<user>.github.io/<repo>/` URL **in Safari**.
3. Share → **Add to Home Screen** → Add.

Installing is not cosmetic. Safari's tracking prevention deletes all
script-writable storage after seven days without interaction, and home-screen
web apps are the documented exemption — an uninstalled app can lose your entire
diary. The app says so on its settings screen.

## AI features (optional)

Photo and voice logging need your own Anthropic API key, entered under
Settings → AI. There is no server in this project, so the key stays on your
device and goes only to `api.anthropic.com`. Set a spend limit on the key.

Roughly 1–2 cents per photo, under 0.1 cents per dictation. Search, barcode
scanning and manual logging work with no key at all.

## Rebuilding the food database

`src/data/bls/bls.json` is generated from the published BLS 4.0 spreadsheet:

```bash
python3 scripts/build-bls.py path/to/BLS_4_0_Data_2025_EN.xlsx
```

The 14 MB source file is not committed; download it from the DOI below. The
script asserts the column layout, so a future BLS release fails loudly rather
than silently mis-parsing a nutrient column.

## Licence

MIT for the code.

Nutrition data:
- Bundeslebensmittelschlüssel 4.0 — Max Rubner-Institut (2025), **CC BY 4.0**.
  DOI [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0).
  MRI states the data may be used freely, including for app and software
  development.
- Open Food Facts — **ODbL**.

Not medical advice.
