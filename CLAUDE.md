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
| F | ferdig | `d2419f9` | Spøkelsesbil i øving: beste gyldige runde i `localStorage` (`gp_ghost_<BANE>_<MODUS>`), spilles av i hvitt med 36 % synlighet, Δ-tid i HUD-en, slås av/på med `G` | `test_ghost.js` (76/76) |
| G | pågår | — | Sluttest og rapport: AI-sim mot «før»-tallene fra A1, tidssteg på 60/120/144 Hz, skjermbilder og rapport per steg | — |
| H | pågår | — | Spillerens svingfysikk i REALISTISK: `PHYS_SCRUB` mot `cornerCap`, `severity` i stedet for `smoothCurv`, ULTRA `baseMax` 7,55→8,30 | `test_spiller_sving.js` |

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

**Avvik verdt å vite i steg H:** utgangspunktet var at ULTRA/REALISTISK var for
lett — 20,52 s på MONTE SPIRA mot 21,4 s for «full toppfart hele runden».
Regnestykket var riktig, men 21,4 s er ikke et gulv: det er regnet av
KJØRELINJAS lengde, og en bil som bare kutter svingene kjører 2–4,6 % kortere
og holder seg innenfor banegrensene. Tiden var altså aldri over toppfarten.

Den EKTE feilen testen fant: `physSafe` senket aldri farten. `overRatio` gikk
bare til `turnPenalty` og `gripPenalty`, aldri til `MAX`. Med gassen i bånn,
aldri brems, ingen boost og alene på banen kom bilen rundt ARDENNE 3,0 %
raskere enn den teoretiske tiden — med Shift+Space 6,0 % — og uten ETT
banegrensebrudd. Taket fantes på papiret og kostet ingenting.

To feller i selve rettelsen, begge funnet ved måling:
1. Et skrubb mot `physSafe` straffer boost og rett-modus på RETTSTREKKA, fordi
   `physSafe` bygges på `PLAYER_MAX` og ikke vet om 2026-reglene. Toppfarten
   med Shift+Space falt fra 7,62 til 7,05, altså nesten hele steg D. Taket må
   regnes av et `cornerCap` som har multiplikatorene i seg.
2. `cornerCap` kan ikke bygges på `MAX` heller, for AI-ens `MAX` kommer fra
   `aiSpd`, som ALT er redusert for svingen — det trakk fra for samme sving to
   ganger. Grunnlaget er derfor `c.straightPace` (lagret i AI-grenen).
Etter rettelsen er AI-tempoet uendret (MONTE SPIRA/ULTRA 26,57 mot 26,50 før),
mens spillerens runde med gassen i bånn gikk fra 3,0 % RASKERE til 1,7 %
TREGERE enn teoretisk — altså koster svingen nå mer enn kuttet sparer.

**Tre måltene retninger som ble FORKASTET** (alle traff samme vegg: AI-en
klarer ikke å HOLDE en raskere linje, den renner bare vidt):
- `curveK` 4,0→2,0 ga 24,7 s, men hjelper ikke under 2,0 — `hairpinScale` er
  alt klemt til 1 av `Math.min(1,4/curveK)`, så `hairpinExtra` står urørt.
- `hairpinExtra` ×6→×3 ga 23,6 s men 6,35 brudd per bil (×1,5: 8,55, og 14,25
  på DISCESA).
- `buildRaceLine` som strammet snor (relaksasjon i korridoren) ga en 6,8–8,4 %
  kortere linje, men NULL tempo (24,35 s, det samme `baseMax` alene gir) og
  10,55 brudd — og den ødela MIDDELS og CASUAL også. MERK samtidig at den gamle
  linja ikke er en kjørelinje: å skru GAIN opp gjør den LENGRE (34→8735 px,
  60→8765, 90→8802 på MONTE SPIRA).
Rettstrekkfart (`baseMax`) var den eneste knappen som ga tempo uten å ofre
hvitstripedisiplinen.

Verifisert med full matrise (`ai_baseline_after_H.json` mot `..._after_G.json`):
alle 26 CASUAL-rader er BIT-IDENTISKE, altså er endringen beviselig bare i
REALISTISK. Verste spredning i REALISTISK er 0,8528 (ALPEN/ULTRA), under én
runde. Brudd ligger på ≤0,8 overalt unntatt SERPENTINA/REALISTISK/ULTRA på 6,65
(6,525 før — det er den gamle, kjente saken, ikke en ny).

**Åpent punkt funnet underveis:** ESSE/CASUAL/ULTRA har spredning 0,9857 — så
vidt under én runde, og helt uendret fra før, så den er ikke forårsaket av dette
steget. Den banen var ikke med i de fem som ble målt da `posFactor` ble strammet,
og er den neste som bør ses på om spredningstaket skal holdes med margin.

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
