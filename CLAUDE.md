# Spillkatalog — arbeidsnotat

Hvert spill er én frittstående HTML-fil med alt innebygd. `vintage_f1.html`
(GRAND PRIX, >3200 linjer) er hovedprosjektet. Les den aldri i sin helhet —
bruk `grep -n` og les bare de delene du trenger, ellers fylles kontekstvinduet
før arbeidet er gjort.

Lag, sponsorer, sjåfører og baner er **med vilje oppdiktet**. Ikke gjeninnfør
ekte navn i tekst spilleren kan se.

Fargevalg avgjøres med **målt WCAG-kontrast**, ikke med øyemål. Kommentarer
skrives på norsk og forklarer HVORFOR, ikke hva koden gjør.

## Kjøring av tester

Det finnes **ingen `node`** på denne maskinen. Testene kjøres med
JavaScriptCore via macOS-verktøyet `osascript`:

    cd ~/spillkatalog
    osascript -l JavaScript test_boost.js

De fleste testene tar `--html /tmp/annen.html` for å måle en annen fil enn
dagens, og `test_ai_sim.js` tar `--out fasit.json`. Skriv resultater til fil
og rapporter bare sammendrag og tall videre.

## «Før»-tallene for AI-simuleringen

Målingen er dyr (~12 min per kjøring) og er allerede gjort. **Ikke mål på
nytt** — bruk filene:

- `ai_baseline_before.json` — før GRAND PRIX del 3 steg A
- `ai_baseline_after_A.json` — etter steg A

Sammenlign dem med:

    osascript -l JavaScript test_ai_compare.js ai_baseline_before.json ai_baseline_after_A.json

## Fremdrift

### GRAND PRIX del 3 (`vintage_f1.html`)

| Steg | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| A | ferdig | `f926553` | Svakere gummistrikk + AI-simulering som måler felteffekten | `test_ai_sim.js`, `test_ai_compare.js` |
| B | ferdig | `17cb43d` | Banegrenser etter F1-regelen, straffetid og slettede runder | `test_track_limits.js` |
| C | ferdig | `6f4c9d6` | Tidsgap til bilen foran og bak i HUD-en | `test_gap.js` |
| D | ferdig | `709d20a` | 2026-reglene — rett-modus, boost og overtake | `test_boost.js` |
| E–G | **ikke definert** | — | Planen lå bare i en økt som ble tømt, og er ikke gjenfunnet | — |

Tidligere deler: `5a4f417` fast tidssteg (akkumulator) i spill-loopen,
`ce0e0b9` lazy banebakgrunn + nedskalering over 16M px.

### ASTEROIDER (`asteroids.html`)

| Steg | Status | Commit | Innhold |
|---|---|---|---|
| A | ferdig | `743a0a8` | Fast tidssteg med akkumulator |
| B | ferdig | `5299f6d` | `e.code` i stedet for `e.key`, så taster ikke henger |
| C | ferdig | `f65fc68` | Kollisjon mot steinenes faktiske form |
| D | ferdig | `2583e8a` | Lesbar tekst (målt kontrast) + topp 10 med initialer |

`test_asteroids_topp10.js` dekker steg D med 12 scenarioer (lagring som
kaster, ugyldig JSON, feil versjon, ødelagte rader, initial-skjermen med ekte
tastetrykk inkl. Æ/Ø/Å, kontrast, tekststørrelser). Alle passerer per
2026-10-20. Initial-skjermen er det ENE stedet som med vilje leser `e.key` og
ikke `e.code` — for at Æ/Ø/Å skal kunne skrives.
