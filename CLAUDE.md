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
| E | ferdig | `3e2b859` | Avkjølingsrunde: biler i mål kjører videre på 55 % fart, uten kollisjon, 60 % gjennomsiktige, toner ut etter en halv runde | `test_cooldown.js` (24/24) |
| F | ferdig | `TODO` | Spøkelsesbil i øving: beste gyldige runde i `localStorage` (`gp_ghost_<BANE>_<MODUS>`), spilles av i hvitt med 36 % synlighet, Δ-tid i HUD-en, slås av/på med `G` | `test_ghost.js` (76/76) |
| G | ikke startet | — | Sluttest og rapport: AI-sim mot «før»-tallene fra A1, tidssteg på 60/120/144 Hz, skjermbilder og rapport per steg | — |

Tidligere deler: `5a4f417` fast tidssteg (akkumulator) i spill-loopen,
`ce0e0b9` lazy banebakgrunn + nedskalering over 16M px.

**Avvik verdt å vite i steg E:** `drawCar()` setter `globalAlpha` med absolutte
verdier flere steder, så gjennomsiktighet kan ikke settes med én `save()` på
toppen av funksjonen — den blir overskrevet. Løsningen er faktoren `A`, som
alle alpha-verdiene ganges med, og en nullstilling til 1 på slutten (uten den
blir alle biler som tegnes ETTER den utonede gjennomsiktige også). En bil på
avkjølingsrunde er dessuten tatt ut av `checkTrackLimits()`: straffetid går inn
i `finalTimeSec()`, så uten sperra kunne en bil som alt var i mål falt på
resultatlista for noe den gjorde på utrullingen.

**Avvik verdt å vite i steg F:** planen sa 35 % synlighet, men målingen sier noe
annet — hvitt på 35 % blandet med asfalten (`#33333e`) gir `#7a7a82`, altså
2,94:1 og UNDER 3:1-kravet for en bil mot banedekket. 36 % gir `#7c7c83` og
3,03:1. Spøkelset er derfor 0,36, og flat ren hvitt: flertonede hvitfarger
(`#e2e8f0`, `#cbd5e1`) stryker på samme måling. Panelteksten kunne heller ikke
arve ledertavlas toner — `#475569` måler 2,49:1 og `#64748b` 3,97:1 mot panelets
bakgrunn `#0f1115`, begge under 4,5:1. Tonene ligger nå i `GHOST_TXT` /
`GHOST_TXT_DIM`, og testen leser dem derfra, slik at en dimmere farge ikke kan
snike seg inn uten å bli målt.

To rekkefølger i `startPractice()` er kritiske: `ghostSpr=makeCarSprite(...)` må
stå ETTER `buildCarSprites()` (den kaller `freeCarSprites()`, som krymper alle
sprites til 0×0), og `nyGhostRunde()` må stå ETTER `raceTime=0` (den setter
tidspunktet for neste opptakspunkt ut fra `raceTime`, så med forrige løps klokke
blir det ikke tatt opp noe i det hele tatt). `tickGhost()` står sist i
bil-løkka, etter målpasseringen, slik at punktet på rundeskiftet havner som
punkt 0 i den nye runden og ikke som siste punkt i den forrige.

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
