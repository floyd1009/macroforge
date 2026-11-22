# MacroForge

Offline-first macro and training tracker: English interface, German supermarkets.
No account, no server, no subscription — everything lives on your phone.

Installs to the iPhone home screen as a web app. Free to run and MIT-licensed.

---

## What it does

**Nutrition**

- **Adaptive expenditure, measured not guessed.** Calories out are derived
  from what you logged and how your trend weight moved (intake minus the change
  in stored energy at 7,700 kcal/kg), blended with a formula until about three
  weeks of data exist. The app shows what share of the number is measured.
- **Weekly check-in.** Targets are frozen between check-ins and change only
  when you accept a new set. The check-in is adherence-neutral: next week's
  target comes from measured expenditure, never from how close you were to
  last week's target, and a week with too little data holds the estimate
  rather than updating it from noise.
- **Goal setup.** Lose, maintain or gain at a rate expressed as a share of
  body weight per week, with an optional goal weight and a projected end date
  at both the planned and the measured pace.
- **Macro program.** Coached or manual targets; balanced, low-fat, low-carb or
  keto split; four protein levels; a calorie floor; and optional higher-calorie
  weekdays that leave the weekly total unchanged.
- **Fast logging.** Search, barcode, quick add (calories and macros only),
  custom foods from a label, recipes built from ingredients, favourites, and
  one-tap copy of a meal or a whole day. Every path logs to the day you are
  looking at.
- **The German national food database, offline.** All 7,140 foods of the
  Bundeslebensmittelschlüssel 4.0 (Max Rubner-Institut, CC BY 4.0) ship with
  the app — 300 kB gzipped, imported into IndexedDB on first launch. That
  covers the generic foods Open Food Facts is worst at, because nobody scans a
  potato, and it includes raw *and* cooked variants of most whole foods.
- **German retail products** from Open Food Facts: ALDI, Lidl, REWE, EDEKA, dm,
  Kaufland, PENNY and Netto private labels, tagged with the chain they belong
  to. Search is bilingual — "Haferflocken" and "rolled oats" find the same row.
- **Photo logging** — describes what is on the plate and resolves it against
  real composition data, with an honest error band.
- **Voice logging** via iOS keyboard dictation, parsing household measures in
  English *or* German — "two slices of Vollkornbrot", "a tbsp of oil",
  "anderthalb Brötchen" all resolve to grams against a hand-curated table.
- **Trends.** Scale weight against trend weight, expenditure over time, intake
  and macro averages, check-in history, tape measurements and progress photos.

**Training**

- **Programs.** Bundled templates (full body, upper/lower, push-pull-legs and
  hybrids) or your own, edited day by day: exercises, sets, rep range, target
  reps in reserve and rest.
- **Guided sessions.** Each set is prefilled with what you did last time and
  what to aim for now. Tap to complete, and the rest timer starts on its own.
- **Automatic progression.** Double progression: reach the top of the rep range
  on every working set and the load goes up one step; otherwise aim for one
  more rep. It is a programming convention, not a law — the rule is stated in
  the app and you can always override the suggestion.
- **Analysis.** Estimated 1RM over time and records per exercise, weekly hard
  sets per muscle group against volume landmarks, full session history, and a
  plate calculator.

## What it deliberately does not do

- **Claim photo estimates are accurate.** They are not, and no app's are.
  Photo estimation runs around ±25 % on calories even with the best current
  models, because fat is 9 kcal/g and optically invisible — a tablespoon of
  oil is ~119 kcal and cannot be seen. Every estimate is shown as a range with
  its provenance.
- **Treat a barcode as ground truth.** EU labelling law permits ±20 % tolerance
  on macros in the 10–40 g/100 g band, and label energy is *calculated*, not
  measured. Scanned entries carry a ±15 % band.
- **Use the brand colour for data.** The accent is a muted gold and stays on
  buttons and labels. Macro colours are blue, violet and amber, and red means
  only one thing, an error. Palette contrast is pinned by tests so it cannot
  regress below WCAG AA.

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

## Deploying

The app is a static site: `npm run build` produces `dist/`, and any static host
can serve it. Nothing runs on a server.

**GitHub Pages (free, already wired up)**

Every push to `main` runs `.github/workflows/deploy.yml`, which tests, builds
and force-pushes `dist/` to the `gh-pages` branch. GitHub Pages serves that
branch at `https://<user>.github.io/<repo>/`.

On a fresh fork, check **Settings → Pages**: the source should read "Deploy
from a branch", branch `gh-pages`, folder `/ (root)`. GitHub sets this itself
the first time the branch appears.

**Your own domain (optional)**

Buy any domain, add it under **Settings → Pages → Custom domain**, and point a
`CNAME` record for `www` (or `ALIAS`/`A` records for the apex) at
`<user>.github.io`. Then add a repository variable `BASE_PATH` with the value
`/` (**Settings → Secrets and variables → Actions → Variables**), because the
site is now served from the root rather than `/<repo>/`, and re-run the deploy.
HTTPS is issued automatically.
A real HTTPS origin is required either way: the camera, the service worker and
persistent storage are all unavailable on plain HTTP.

**Any other static host**

```bash
npm run build
```

Upload `dist/`. Set `BASE_PATH` first if the site is not served from `/`.

## Putting it on your iPhone

1. Open the deployed URL **in Safari**.
2. Share → **Add to Home Screen** → Add.

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
