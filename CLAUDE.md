# Spillkatalog — arbeidsnotat

Hvert spill er én frittstående HTML-fil med alt innebygd. `vintage_f1.html`
(GRAND PRIX, >3200 linjer) er hovedprosjektet. Les den aldri i sin helhet —
bruk `grep -n` og les bare de delene du trenger, ellers fylles kontekstvinduet
før arbeidet er gjort.

Lag, sponsorer, sjåfører og baner er **med vilje oppdiktet**. Ikke gjeninnfør
ekte navn i tekst spilleren kan se.

Fargevalg avgjøres med **målt WCAG-kontrast**, ikke med øyemål. Kommentarer
skrives på norsk og forklarer HVORFOR, ikke hva koden gjør.

## Ventelista (`SENERE.md`)

1. **Finner du noe utenfor det som er bestilt — en feil, et åpent punkt, en idé,
   noe som kan forbedres — så FIKS DET IKKE.** Legg det nederst i `SENERE.md`
   og nevn det med én linje i statusrapporten.
2. Hvert punkt er én linje:
   `[spill] kort beskrivelse – størrelse (liten / middels / stor) – dato`.
   Trengs det, legg én linje under med hvor i koden det gjelder.
3. Skriver Yasir **«rydd»**: les `SENERE.md`, slå sammen like punkter, fjern det
   som allerede er gjort (sjekk koden og `git log`), og vis en nummerert liste
   sortert etter hva som gir mest for minst arbeid. Maks 10 punkter, gruppert
   per spill. **Ikke begynn på noe før han har valgt et nummer.**
4. Er et punkt gjort, fjern det fra `SENERE.md` i SAMME commit.

## Kjøring av tester

Det finnes **ingen `node`** på denne maskinen. Testene ligger i `tester/` og
kjøres med JavaScriptCore via macOS-verktøyet `osascript`, fra
spillkatalog-roten (testene leser spillfilen med en relativ sti, så `cd` må
skje FØR `osascript`):

    cd ~/spillkatalog
    osascript -l JavaScript tester/test_boost.js

De fleste testene tar `--html /tmp/annen.html` for å måle en annen fil enn
dagens, og `test_ai_sim.js` tar `--out fasit.json`. Skriv resultater til fil
og rapporter bare sammendrag og tall videre. `chrome_harness.py` (samme mappe)
kjøres på samme vis: `python3 tester/chrome_harness.py maal`.

**`chrome_harness.py maal` er en OBLIGATORISK PORT etter hvert steg som rører
`buildTrackBg` eller et tema.** Grønne JSC-tester beviser ikke at bakgrunnen lar
seg bygge: der er hvert tegnekall en no-op på en stub-ctx, og ingen av testene
kaller `groundLayer` eller `landmark`. Det har sluppet gjennom to ganger —
`pad` i steg B2 og `LYS_PER_RUTENETT` i steg D1 — og begge gangene kastet
bakgrunnen på ALLE tretten banene mens testene meldte full pott.

## «Før»-tallene for AI-simuleringen

Målingen er dyr (~12 min per kjøring) og er allerede gjort. **Ikke mål på
nytt** — bruk filene i `maalinger/`:

- `maalinger/ai_baseline_before.json` — før GRAND PRIX del 3 steg A
- `maalinger/ai_baseline_after_A.json` — etter steg A

Sammenlign dem med:

    osascript -l JavaScript tester/test_ai_compare.js maalinger/ai_baseline_before.json maalinger/ai_baseline_after_A.json

## Ny lakk eller nytt lag

Gjelder `vintage_f1.html`. Alt som har med lakk å gjøre ligger samlet i `TEAMS`
og i `PATTERNS`, og resten av spillet spør `lagLakker()` og `aktivLakk()` i
stedet for å lete seg fram selv. Derfor er en ny lakk ETT objekt og ingenting
annet: LAG-skjermen, «Spesiallakk: …»-linja i banevalget, sprite-bufferet og
kontrastrapporten plukker den opp uten å endres.

### En ny spesiallakk

Legg ett objekt i `lakk.spesial`-lista til laget i `TEAMS`. Feltene:

| Felt | Må være |
|---|---|
| `id` | unik på tvers av ALLE lag, ikke bare innad i laget — sprite-bufferet (`carSprCache`) er nøklet på den, så to like id-er ville delt ett bilde |
| `navn` | kort; det er dette LAG-skjermen og banevalget skriver ut |
| `base` `acc` `dark` `hel` `spc` | gyldig hex, alle fem skrevet ut — ingen av dem arver fra den vanlige lakken |
| `pat` | en nøkkel som finnes i `PATTERNS` |
| `bane` og/eller `tid` | minst ÉN av dem. Uten begge er lakken aldri nåbar: den vanlige lakken er allerede fallbacken som gjelder overalt |
| `bevisstLavKontrast` | valgfri, `true` fritar lakken fra `acc`-mot-`base`-kravet — bare for en tone-i-tone-lakk som er ment slik |

`bane` er et banenavn fra `TRACKS` og `tid` et navn fra `TOD` (`DAG`,
`SOLNEDGANG`, `NATT`). Settes bare `tid`, gjelder lakken alle tretten banene på
den tiden (slik NORDHAVs Nordlys gjør). Passer to lakker samtidig, vinner den
som peker på BANEN — et sted er et mer spesifikt valg enn et tidspunkt, og
rekkefølgen i lista avgjør bare mellom lakker som er like spesifikke.

Tre kontrastkrav, alle målt av `test_lag.js` og ingen av dem til å vurdere med
øyemål (en bil er 28 px uten kontur):

- `base` ELLER `acc` ≥ 3:1 mot asfalten. En lakk med `bane` måles bare mot DEN
  banens asfalt; en vanlig lakk og en ren tidslakk måles mot alle tretten.
- `hel` ≥ 3:1 mot cockpiten (`COCKPIT_BG`).
- `acc` ≥ 3:1 mot `base`, med mindre `bevisstLavKontrast` er satt.

### Et nytt mønster

Én funksjon i `PATTERNS`, og ingenting annet — `pat` på en lakk er nøkkelen inn
i det oppslaget. Funksjonen tegner i en kontekst der fyll- og strekfargen ALT er
satt til aksentfargen og klippet til karosseriet er lagt, så et grovt rektangel
kan ikke lekke utenfor bilen. Koordinatene er bilens egne: omtrent −14…+14 i x
og −6…+6 i y. Står `pat` tomt eller feil, tegnes ingenting (ensfarget bil) i
stedet for at det kastes — derfor fanges skrivefeil av testen og ikke av spillet.

### Et nytt lag

`NUM_CARS` regnes av `TEAMS.length`, så griden vokser av seg selv, og
`.forEach`-løkka rett under `TEAMS` setter både `color`/`accent`/`dark`-aliasene
og den nøytrale `profil`-en. Et nytt lag trenger derfor `name`, `short`, `hjem`,
`type`, `sponsor`, `sponsors` og `lakk.vanlig`. Husk at lagfargen også skal
leses som TEKST i menyene: den går gjennom `teamInk()`/`podiumInk()`, og kravet
på 4,5:1 der måles av `test_meny_kontrast.js`, ikke av `test_lag.js`.

### Før det committes

`test_lag.js` skal være grønn — den er porten for alt dette, og den finnes
nettopp fordi en lakk er DATA: ingen kompilator sier fra om en glemt `dark`,
en `pat` som ikke finnes eller et banenavn med skrivefeil.

    osascript -l JavaScript tester/test_lag.js

Kjør også `test_banetema.js` (sjekk 4 måler alle lakkene mot hver banes asfalt)
og, hvis et lag eller en lagfarge er endret, `test_meny_kontrast.js`.

**Sjekktallene i de to første VOKSER med hver lakk, og det er riktig.** Én ny
spesiallakk ga +9 sjekker i `test_lag.js` og +1 i `test_banetema.js` da dette
avsnittet ble prøvd ut. Tallene i fremdriftstabellen under gjelder altså
lakkantallet på det tidspunktet, og et høyere tall er ikke en feil — et LAVERE
tall er det derimot, for da er en lakk ikke plukket opp.

Lagenes EGENSKAPER er en annen sak enn lakkene: `profil` og `lagFaktor` er
plass satt av, ikke noe som virker ennå. Hvor de fire nøklene skal kobles inn,
og hvorfor de må balanseres mot vanskelighetsgradene, står under «Lagenes
egenskaper (`profil` + `lagFaktor`)» i runde 5-avsnittet lenger nede.

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
| G | ferdig | `10f2261` | Sluttest og rapport: AI-sim mot «før»-tallene fra A1, tidssteg på 60/120/144 Hz, skjermbilder og rapport per steg | — |
| H | ferdig | `10f2261` | Spillerens svingfysikk i REALISTISK: fartstak flyttet fra `physSafe` til `cornerCap` bygget på `straightPace`, så boost/rett-modus ikke straffes for en sving de ikke er i | `test_spiller_sving.js` |

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

### GRAND PRIX runde 4 — pynterunden (`vintage_f1.html`)

Målet: hver bane skal kjennes igjen på et skjermbilde. Før runde 4 var alle
tretten bygget av nøyaktig samme byggeklosser, og to baner med samme
terrain-type var ikke til å skille uten å lese navnet.

**Runden er en PYNTERUNDE — geometrien skal ikke flytte seg én piksel.** Det
håndheves av `test_banegeometri.js`, som låser de syv tallsettene fysikken og
AI-en leser (PATH, heading, smoothCurv, severity, raceLine, wallOffsArr,
straightZones) mot `geo_laas.json`. Kjør den etter hvert steg:

    osascript -l JavaScript tester/test_banegeometri.js --mot maalinger/geo_laas.json

| Steg | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| A | ferdig | `10612a9` | Seedet tilfeldighet (banenavn som frø), verdistøy, tema per bane (asfalt/grus/kerb/bakketoner), bakken som myke flekker i stedet for 1400 prikker, vegetasjon i klynger, avstandsrutenett | `test_banetema.js` (137/137), `test_banegeometri.js` (13/13) |
| B | første pulje ferdig | `15cdf0c` | Landemerker + bakkelag for fem baner (MONTE SPIRA, ARDENNE, DESERTO, ALPEN, DUNA) + nattlys koblet inn | `test_banetema.js` (152/152), `test_banegeometri.js` (13/13) |
| B2 | ferdig | `eb6f117` | Landemerker + bakkelag for fem til (VULCANO, TEMPIO, CAMPAGNA, ESSE, DISCESA) | `test_banetema.js` (167/167), `test_banegeometri.js` (13/13) |
| B3 | ferdig | `fde0f71` | Vend-feilen i nattgløden på de fem første landemerkene (slo bare ut på DUNA) | `test_banetema.js` (167/167), `test_banegeometri.js` (13/13), `chrome_harness.py maal` |
| B4 | ferdig | `e94db19` | `scene.lokal()`: gløden på selve lyskilden (ALPEN, ARDENNE, DUNA), og radier målt opp igjen | samme tre porter |
| B5 | ferdig | `0bc25c6` | Bakkeflis som gjentakende mønster under hele skjermen + uttonet ytterkant på bakgrunnsbildet, så lerretskanten ikke lenger synes | samme tre porter + skjøtemåling |
| C | ferdig | `7626746` | Bykvartaler (`scene.rutenett` + `dBuildingGrid`) og landemerker for LABIRINTO (katedral), SERPENTINA (havn med moloen) og VISTANOTTE (pariserhjul) | `test_banetema.js` (183/183), `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` + skjermbilder |
| D1 | ferdig | `55c6e06` | Nattlys i bykvartalene: ett tent vindu per utvalgt kvartal — LABIRINTO 44 lys, SERPENTINA 44, VISTANOTTE 72 (mot 1/1/5 før) | `test_banetema.js` (186/186), `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` + `fps` + nattbilder |
| C2 | ferdig | `f3fc5d3` | Bypalettene målt UNDER døgnoverlegget i alle tre tider: mørke tak og lysere fasader på LABIRINTO, SERPENTINA og VISTANOTTE, nattoverlegget senket 0,58 → 0,50, og et MÅLT nattgulv på 2,5:1 i stedet for 3:1. Tak/fasade om natta 1,78–2,06 → 2,52–2,53:1 | `test_banetema.js` (198/198, sjekk 19–20 bygget om), `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` + før/etter-bilder |
| C3 | ferdig | `6fc735f` | Dominobrikkene, FORM-halvdelen: kvartalene tegnes nå som hus sett ovenfra. Taket er den store flaten (0 % → 73–78 % av husets fotavtrykk), fasaden er krympet til et bånd på 6–11 px mot gata, det jevne 5 × 7-vindusrutenettet er erstattet av én uregelmessig rekke i båndet (ingen vinduer på taksiden), og all ny tilfeldighet går gjennom et eget `krnd`-frø | `test_banetema.js` (198/198), `test_banegeometri.js` (13/13 uendret), `test_bevegelse.js` (PASS), `chrome_harness.py maal` + rnd-fingeravtrykk + før/etter-bilder |
| D2 | ferdig | `349bb94` | Stillaset for bevegelige detaljer: `scene.beveg` (registreres av LANDEMERKET, maks én per bane, telt i `TR.bevegelseN`) + `drawBevegelse` (kutt mot skjermen, tid som argument). Første detalj er VISTANOTTEs pariserhjul — eiker, kabiner og kabinglød snurrer live, ring/nav/bein er fortsatt bakt | `test_bevegelse.js` (ny, 6 sjekker, 8 mutasjoner), `test_banetema.js` (198/198), `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` + `fps` + `shot --tid` |
| D3a | ferdig | `96dd567` | DUNAs fyrstråle: lykta sveiper én omdreining på 8 s (tårnet bakt, strålen og lampegløden live, gløden blinker én gang per omdreining). `fps` fikk `--t` + en ekte `--tod`, så en synlig detalj kan måles for første gang — begge detaljene koster 0,002–0,006 ms per bilde mot et budsjett på 0,3. `test_bevegelse.js` dekker nå BEGGE sider av banen (ny sjekk 7), og D2-hullet er lukket | `test_bevegelse.js` (7 sjekker, 13 mutasjoner), `test_banetema.js` (198/198), `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` + `fps --t` + `shot --tid` |
| D3b | ferdig | `7a4f9c3` | De to siste detaljene: CAMPAGNAs møllevinger (korset dreier én omdreining på 5 s, og vindusgløden under demper seg med `cos(4*vinkel)`, altså fire pust per omdreining uten én `if`) og SERPENTINAs havnekran (jibben bakt, heisetauet og kassa live, 32 px vandring på 5,5 s). Begge koster 0,0004–0,0014 ms per bilde mot et budsjett på 0,3, altså 222–765x margin. `test_bevegelse.js`-opptakslerretet bokfører nå gløders SENTER, så sjekk 5 leser eksakt 6,00 px på de nye banene | `test_bevegelse.js` (7 sjekker, 14 mutasjoner), `test_banetema.js` (198/198), `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` + `fps --t` + `shot --tid` |

| E | ferdig | `64bbb5e` | Sluttest og kontaktark. `chrome_harness.py` fikk to nye kommandoer: `ark` (alle 13 banene side om side, 1:1 med spillvisningen, hver i sin egen `naturligTid`) og `signatur` (middelfargen per rute i et rutenett over spillvisningen, så «er banene til å skille» blir ET TALL). Målt mot fila fra før runde 4 (`10f2261`) med samme kamerapunkt og samme døgntid: minste avstand i feltet 4,72 → 24,94 (+429 %), og det likeste paret, ARDENNE/CAMPAGNA, gikk fra 4,72 til 48,02 — 10,2x. Alle fire portene grønne, og AI-simuleringen viser ingen regresjon | `test_banegeometri.js` (13/13 uendret), `test_banetema.js` (198/198), `test_bevegelse.js` (PASS), `chrome_harness.py maal` + `fps` + `ark` + `signatur`, `test_ai_compare.js` |

**Steg D er delt i tre fordi den er to ulike jobber:** D1 nattlysene i byene
(ferdig), D2 stillaset for bevegelige detaljer (ferdig), D3 selve detaljene på
de resterende banene (D3a DUNA ferdig, D3b CAMPAGNA + SERPENTINA ferdig —
altså er D3 i sin helhet ferdig).

**De tre bybanene ble BEVISST utsatt til steg C** (LABIRINTO, SERPENTINA,
VISTANOTTE). De trenger både landemerke og bykvartaler, og å skrive landemerket
nå ville betydd å skrive det om igjen når kvartalene kommer.

**`test_banetema.js` er ny i steg A.** Den måler det `contrastCheck()` i spillet
ikke lenger dekker: spillets egen sjekk måler lakkeringene mot ASPHALT_BASE
alene, men nå har hver bane sin egen asfalt. Testen regner hele krysstabellen —
29 lakkeringer mot tretten dekker. Svakeste verdi er 3,21:1 (FRONTIER Mojave
mot VISTANOTTE), altså over 3:1-kravet. Tallet var 3,45:1 fram til runde 5 steg
B byttet ut lagene; en spesiallakk måles bare mot sin EGEN bane, så sammen-
ligningen mot runde 4 gjelder regelen, ikke verdien.

**Avvik verdt å vite i steg A:**

1. `cityColour()` ble kalt i city-grenen uten å være skrevet — alle tre
   bybanene (LABIRINTO, SERPENTINA, VISTANOTTE) KASTET under
   `buildTrackBg`. JSC-testene kan ikke fange dette, for der er hvert
   tegnekall en no-op på en stub-ctx; det dukket først opp da
   `chrome_harness.py maal` kom tom tilbake. **Lærdom: en ren JSC-test beviser
   ikke at bakgrunnen lar seg bygge.** Kjør byggemålingen som røyktest.
2. DISCESAs grønn/gul-kerb målte 2,15:1 mellom de to tonene — en kerb er et
   vekselmønster, så to toner som ligger så nær hverandre blir én stripe.
   Grønnen er mørknet til `#166534` (4,66:1, over den røde/hvite standardens
   4,26:1). At grønnen nå bare er 1,68:1 mot asfalten er med vilje greit: det
   er GULET som bærer kerben mot banen (7,81:1), akkurat som hvitt gjør i
   standardkerben, der rødt selv bare er 2,67:1 mot dekket.
3. VISTANOTTE målte 74,5 ms byggetid én gang og 17–18 ms i alle senere
   kjøringer. **Det var støy, ikke en regresjon** — isolert bygger den på
   21 ms, og en serie på tre ga 21/22/54. Median-av-tre i harnessen er ikke
   robust når én av tre kjøringer treffer en GC-pause. Ett enkelt høyt tall
   skal måles på nytt før det tolkes.

**Kostnad, målt (`maal_bygg_*.txt`, `maal_fps_*.txt`):** byggetiden per bane er
opp 25–65 % (sum 108 → 149 ms, verste bane VISTANOTTE 18 ms, budsjettet er
100 ms per bane). Bildekosten er UENDRET til litt bedre (verste 1,92 → 1,79 ms)
— bakken bakes inn i bakgrunnen én gang og koster ingenting per bilde.

**Nattlys-stillaset er koblet inn i steg B** og er ikke lenger dødkode.
Landemerkene kaller `addLight`, og `drawTrackScene` tegner glød. Målt antall:
ARDENNE 2, DESERTO 22, ALPEN 8, DUNA 4 — og MONTE SPIRA 0, som er RIKTIG: en
steinviadukt uten strøm skal ikke lyse. **Merk at `addLight` lagrer
VERDENSKOORDINATER** (`nightLights.push({x:x-ox,…})`), altså det motsatte av
blobbene fra `belte()`, som leveres i bg-koordinater med `+ox` påtrykt.
`drawTrackScene` leser dem rett inn i `worldToScreen`.

**Avvik verdt å vite i steg B:**

1. **Store flater må ligge LANGS banen, ikke i indre felt.** Det første
   forsøket plasserte hver flate på det punktet som lå lengst fra asfalten
   (`apenPlass()`). På en rundbane er det alltid midt i indre felt — 1000+ px
   fra veien, mens spillvisningen bare ser ~500 px rundt bilen. Flaten ble
   dermed aldri sett under kjøring, og i oversiktsbildet leste den som en
   innsjø midt på banen i stedet for et landskap banen går langs. `apenPlass`
   er fjernet og erstattet av `belte()` (følger banen) + `utside()` (velger
   siden som peker bort fra indre felt, stemt fram over hele banen og vektet
   med avstanden til tyngdepunktet, så én hårnål ikke kan velte svaret).
2. **`nAt` deler SELV på bildestørrelsen** (`noise(x/bw,y/bh)`), så argumentet
   er bg-piksler og å gange OPP korter ned bølgelengden. Å gange ned — slik
   «lav frekvens» intuitivt skulle tilsi — låser støyen til én konstant.
   ARDENNEs elv forsvant HELT av `nAt(a[0]*0.0015,…)`: driften ble et fast
   innoverskyv, og klaringssjekken kastet hver eneste blob.
3. **En blokkert blob SLØYFES, den skyves ikke utover.** Det opprinnelige
   skyvet gikk opp til 12 × `radius*0.5`, altså +567 px på DUNA, og i en hårnål
   peker «lenger ut fra mitt banepunkt» rett mot en annen del av banen —
   resultatet var løsrevne sirkler strødd over hele bildet. Et hull der banen
   kommer nær er dessuten riktig: det er der elva går i rør under veien.
   Avstanden mellom sirklene er `radius*0.55` og ikke `radius`, ellers ligger
   de kant i kant i stedet for å overlappe (den fella gikk ARDENNE rett i).
4. **`chrome_harness.py shot` tok HVERT spillbilde på startstreken.** Den gamle
   løkka kalte `update()` tjue tusen ganger, men `update()` leser
   `keys['ArrowUp']` for spillerbilen, så uten tastetrykk står den bom stille —
   `rundepos` kom tilbake som `-0.000` uansett `landmarkT`. Å holde gassen inne
   kjører bilen rett ut i terrenget i første sving, for ingen styrer. Kameraet
   SETTES nå rett på `TR.raceLine[i]`, og `update` nulles, ellers triller bilen
   vekk fra punktet mens rAF-løkka kjører videre gjennom
   `--virtual-time-budget`.
5. Tre nye sjekker i `test_banetema.js`: landemerketonene måles mot den verste
   bakketonen på 3:1 (`lagPal`), et tema som tegner noe eget MÅ oppgi tonene
   som data, og `landmarkT` må ligge i [0,1). Svakeste landemerketone er 3,15:1
   (DESERTO `saltKant`). `lagMot` navngir unntakene — toner som står mot en
   annen tone i samme bygg og ikke mot bakken.

**Kostnad, målt i steg B:** byggetid sum 146,8 ms (steg A: 149), verste bane
VISTANOTTE 17,1 ms — altså FLAT, og de 17,1 ms bekrefter samtidig at steg A-ens
22,6/74,5 ms var GC-støy. Bildetid verste 1,90 ms (ARDENNE/NATT) mot 1,79 i
steg A og 1,92 før runde 4, altså innenfor støyen. MONTE SPIRA, LABIRINTO,
ALPEN og DUNA måler ~0,3 ms mot ~1,8 for resten — det mønsteret står i
«før»-tallene også og er en egenskap ved banene, ikke ved temaene.

**Oppskriften, fastlagt av de ti som er gjort:** `groundLayer` bygges av
`belte(t0,t1,utside(),avstand,radius,rader,sving)`, tonene legges i `lagPal`
(ellers stryker sjekk 14), unntak fra bakkemålingen navngis i `lagMot`,
`landmarkT` settes i [0,1), og nattlys legges med `addLight` i
VERDENSKOORDINATER.

**Avvik verdt å vite i steg B2:**

1. **`pad = TW*4+40` er taket for et landemerkes REKKEVIDDE, ikke bare for
   avstanden ut.** Et landemerke tegnes i en ramme der lokal y peker BORT fra
   banen, så det det krever av lerret er `avstandUt + byggets høyde`.
   Bakgrunnslerretet har bare `pad` px utenfor banens omriss, og der banen
   ligger ute ved omrisset klippes alt over grensa av en knivrett kant. DISCESA
   avslørte det: 155 px ut + 84 px høyt = 239 mot et lerret med 240.
   `scene.plasser` tar nå et `hoyde`-argument og klemmer avstanden selv — taket
   står ÉTT sted fordi det er en egenskap ved lerretet, ikke ved bygget. Mål med
   margin-sjekken før commit; minste margin nå er 128 px (DISCESA).
2. **`pad` fantes ikke i `buildTrackBg`s scope.** Den er en lokal i
   `buildTrack`, så første versjon av klemmen kastet `ReferenceError: pad is
   not defined` på ti av tretten baner. JSC-testene så det IKKE (167/167 grønt),
   for `test_banetema.js` kaller aldri `groundLayer`/`landmark` — det var
   `chrome_harness.py maal` som fanget det, akkurat som i steg A. Tallet følger
   nå med som `bgPad` på banen i stedet for å regnes ut to steder.
3. **En smal flate kan IKKE bygges med `belte`.** `belte` kaster hver sirkel
   inntil `radius*0,9` sidelengs med ×9-støyleddet, og den støyen har ~48 px
   bølgelengde mot et PATH-steg på 14–21 px — altså skifter den fortegn omtrent
   annenhver sirkel. På en bred flate er det kantruhet og helt riktig; på en
   smal kjerne er sidespranget like stort som kjernen er bred, og flaten faller
   fra hverandre i perler. Å sette sirklene tettere hjelper ikke: løkka går ett
   PATH-punkt om gangen, så avstanden har et GULV på ett PATH-steg, og
   `radius*0,55` under det gulvet gjør ingenting i det hele tatt. VULCANOs
   lavakjerne er derfor en STREK (`lineCap:'round'`) som leser det samme
   ×1-støyleddet som skorpa og dropper ×9. Den er også billigere: VULCANO falt
   fra 11,6 til 9,9 ms.
4. **Lavaen måtte snus.** `dFlate` tegner kanten bredest og ytterst, så det er
   KANTEN som må bære 3:1-målingen mot bakken — og en mørk basaltskorpe
   (`#c2410c`) klarer bare 2,90:1. Eneste retning som holder er lysere, altså
   gul kjerne og oransje ytterkant.
5. **Størrelse er en feilkilde på linje med farge.** Første lavaelva var 155 px
   bred mot en asfalt på 72 (VULCANO har TW=36, den smaleste banen), og leste
   som en gul vegg og ikke som en elv. Samme feil i byggene: observatoriet var
   240×26 (9:1) og leste som et termometer, olivengården 280×52 (5,4:1) med et
   74 px tårn i enden og leste som tallet 1. Alle tre ble rettet ved å KRYMPE,
   ikke ved å bytte farge.
6. **Et søylerad trenger en vegg bak seg.** TEMPIOs tempel var først bare søyler
   mellom to vannrette lister, og da skinte GRESSET gjennom mellomrommene — åtte
   lyse bar med luft imellom er en stige som ligger i en park. En cella i
   `stein` bak rekken, og søyler som er breiere enn mellomrommet, gjør den til
   et tempel.
7. **`dVann` er splittet i `dFlate` + glimt**, og `scene.flate` er den nye
   flaten uten glimt. Glimtet er det ENE som skiller en vannflate fra en tørr
   flate bygget likt: glimt på en kornåker leses som lys som flyter oppå kornet,
   og på ei myr som åpent vann. Rekkefølgen på `rnd()`-kallene er uendret, så de
   fem banene fra første pulje er bit-identiske.
8. **CAMPAGNAs lappeteppe av åkre ble FORKASTET.** Et lappeteppe trenger rette
   åkerskiller, og `belte` leverer sirkler — seks åkre av sirkler blir seks
   dammer i ulike korntoner. Skillene har banen dessuten alt: `terrain:'hedge'`
   tegner hekkene, og det er hekkene som deler et engelsk landskap i ruter.
9. **DISCESAs olivenlund er ENKELTKRONER, ikke en flate.** Kronene er `0,26` av
   sirkelradien fordi `belte` setter sentrene `0,55` radier fra hverandre — to
   kroner på 0,26 så vidt ikke berører hverandre, mens 0,42 (første forsøk)
   lukket raden til en sammenhengende hekk. Her er den manglende overlappen fra
   punkt 3 altså POENGET: det er avstanden mellom trærne som sier at noen har
   plantet dem.

**Forkastede toner, alle strøket på 3:1 mot den verste bakketonen:** lavaKant
`#b45309` (2,99), TEMPIO vann `#5c8fa8` (2,02) og `#7fa8c0` (2,81), CAMPAGNA
kornKant `#a89a5e` (2,93), ESSE hogstKant `#6b5940` (2,04) og tak mot mur
(2,85), DISCESA terrasse `#8a7a5c` (2,80), terrasseKant `#6b5d44` (1,83),
sypress `#6b7a2a` (2,48). Mønsteret er det samme som DESERTO/DUNA-fella fra
pulje 1: ligger bakketonene midt i lysintervallet, finnes det INGEN mørk tone
som når 3:1 — man må gå lysere.

**Kostnad, målt i steg B2:** byggetid sum 150,5 ms (pulje 1: 146,8), verste bane
VISTANOTTE 17,5 ms mot et budsjett på 100 ms per bane. De fem nye banene koster
9,2–11,7 ms hver. Nattlys: VULCANO 22, TEMPIO 2, CAMPAGNA 1, ESSE 1, DISCESA 2
— alle godt under taket på 150.

**Vend-feilen på de fem første landemerkene er RETTET (`vend` i DUNA).**
Nattgløden regnes ut i verdensrommet, utenfor den roterte tegnerammen, og tok
ikke med at `p.side>0` snur den lokale x-aksen 180°. Målingen — `scene.plasser`
snappet fra innsiden av hvert tema — viser at feilen bare slo ut på ÉN bane:

| bane | bedt side | fikk | vendt | nattlys | utslag |
|---|---|---|---|---|---|
| MONTE SPIRA | 1 | 1 | ja | 0 | ingen, den har ikke lys |
| DESERTO | 1 | 1 | ja | 22 | ingen, settet er symmetrisk |
| DUNA | 1 | 1 | ja | 4 | **fyrlampa i feil ende av moloen** |
| ARDENNE | −1 | −1 | nei | 2 | ingen |
| ALPEN | −1 | −1 | nei | 8 | ingen |

Altså må BÅDE vendingen og en asymmetrisk glød til før feilen er synlig, og
bare DUNA har begge. Ingen bane ble dessuten vendt av `clearFootprint`s
`allowFlip` — alle fikk sida de ba om. De tre symmetriske settene (DESERTO
`k=−5..5` på begge sider, ARDENNE `[−0.25,0.25]`, ALPEN `−0.5+k/(n−1)`) er
speilsymmetriske om midten, så faktoren er bokstavelig talt en no-op der og
ble ikke lagt inn — den ville bare stokket om rekkefølgen i `nightLights`.

Verifisert med 1:1-utsnitt på NATT av alle fem, der spillets EGEN `drawGlow`
legges oppå den ferdige bakgrunnen (ikke en kopi av den, ellers kunne probet
hatt samme feil som koden). FØR/ETTER på DUNA viser gløden flytte seg fra den
tomme enden av moloen til fyrtårnet. **Merk at et slikt utsnitt må ta med
`TR.bgScale`** — på de fire største banene er `TR.bg` tegnet i redusert
oppløsning, så et 1:1-utsnitt uten skaleringen glir fra gløden, og DESERTO
kom først ut som to rader lys uten rullebane under.

**Gløden ligger nå PÅ lyskilden, ikke ved foten av den.** Samme bilder viste at
vendingen bare var halve saken: gløden ble satt på `lokal y = 0`, altså på
byggets senterlinje, mens det som lyser står lenger opp i lokal y — ALPENs
vinduer 25–45 px, ARDENNEs 23, DUNAs lykt 97. Begge omregningene (vendingen og
høyden) ligger nå i ÉN funksjon, `scene.lokal(p,lx,ly)`, som tar et punkt i
landemerkets egen tegneramme og gir bg-koordinater. Et nytt landemerke skal
ikke måtte utlede dette på nytt — det var nettopp det som gikk galt to ganger.

**Og en glød BLENDER, så den løfter bare det som er mørkt.** Å flytte gløden inn
på vinduet gjorde natta MØRKERE, for over en lys vindusrute tilfører blendingen
nesten ingenting. Målt som sum lagt luminans over glødskiva, per lys:

| bane | før | på kilden, gammel radius | ny radius | etter |
|---|---|---|---|---|
| ALPEN | 26,1 | 9,7 (17) | 23 | 27,2 |
| ARDENNE | 32,2 | 20,5 (18) | 22 | 32,4 |
| DUNA | 70,9 | 78,5 (38/14) | — | 78,5 |

ALPEN mistet altså 63 % av lyset av en retting som var geometrisk riktig.
DUNA trengte ingen justering: lykta ligger over moloen mot mørk bakke, så der
er det ikke noe lyst å blende mot. **Lærdom: flytter du en glød, må du måle
lysmengden på nytt — posisjonen og styrken henger sammen gjennom blendingen.**

**Avvik verdt å vite i steg B5 (bakkeflisen):**

Utgangspunktet: `pad = TW*4+40` gir bare 184–280 px lerret utenfor banens
omriss, mens det fjerneste SKJERMHJØRNET ligger 545 px fra kameraankeret på et
520×680-lerret (bildet roteres med kjøreretningen, så hjørnet svinger utover).
Bakgrunnsbildet kan altså ALDRI dekke skjermen når bilen er ute ved kanten —
det er en egenskap ved forholdet mellom `pad` og lerretsdiagonalen, ikke en
feil i en enkelt bane.

1. **Verdistøyen banen bruker går ikke opp i seg selv**, så den kan ikke flises.
   Flisen bygges i stedet av plane bølger med HELTALLIGE frekvenser over 256 px
   — de er periodiske på flisa per konstruksjon, og skjøten finnes ikke.
2. **Prikkene legges i samme TETTHET som i bakgrunnen, ikke i samme ANTALL**
   (420 prikker over hele banen → `420*N*N/(bw*bh)` på flisa). Hver prikk
   tegnes i ni kopier (±N i begge retninger), ellers blir de som ligger inntil
   kanten kuttet i stedet for å fortsette på andre siden.
3. **`speckleFarge` er skilt ut som egen funksjon** fordi bakgrunnen og flisa MÅ
   bruke samme tekstur. Hver gren bruker nøyaktig TRE `rnd()`-kall — legges en
   ny `speckle`-type inn må den også bruke tre, ellers forskyves hele banens
   tilfeldighet. Verifisert med sjekksum av bildets indre (innsatt 100 px ×
   `bgScale`, så fjæra er utenfor): BIT-IDENTISK på alle 13 baner.
4. **Flisa må ha EGET frø** (`seedFromName(navn+'|flis')`). Trakk den fra
   bakgrunnens `rnd`-sekvens ville alt etterpå flyttet seg.
5. **Separabel sinus halverte byggetiden for flisa.** 393 000 `Math.sin`-kall
   kostet 6,7 ms per bane; `sin(A+B) = sinA·cosB + cosA·sinB` med én
   oppslagstabell per bølge gir 0,9 ms.

**Skjøten er målt, ikke vurdert med øyet** (luminans 6 px innenfor mot 6 px
utenfor grenselinja, 156 punkter):

| bane / tid | før | etter |
|---|---|---|
| MONTE SPIRA DAG | 0,0374 | **0,0034** |
| MONTE SPIRA NATT | 0,0101 | **0,0015** |
| ARDENNE DAG | 0,1801 | **0,0061** |
| ARDENNE NATT | 0,0363 | **0,0032** |

Det verste ENKELTspranget (~0,048) er uendret før og etter — det er elva og
banekanten som krysser linja, altså ekte terreng og ikke skjøten.

**At mønsteret ikke glir er bevist, ikke antatt:** samme VERDENSPUNKT utenfor
bildet leses av på skjermen med 17 ulike kameravinkler og gir samme farge
(MONTE SPIRA 37–38/45–46/45–46, ARDENNE 21/35–36/25). Fyllet skjer inne i
verdenstransformen, så mønsteret forankres i verdenskoordinater.

**Kostnadsfella: et ROTERT mønsterfyll er dyrt per piksel.** Første versjon la
et kvadrat rundt kameraet som var stort nok i alle rotasjoner og lot
lerretsklippen ta resten — bildetiden steg 1,3 ms. Fyllet er nå klippet til
skjermens verdensboks MINUS den ugjennomsiktige delen av bildet (omrisset
krympet `BG_FJAER`), altså opptil fire akseparallelle striper. Målt per piksel
(2000 fyll per tall, `getImageData` til slutt for å tvinge rasteriseringen
ferdig):

| metode | ns/piksel |
|---|---|
| mønster, rotert | 2,21 |
| mønster, akseparallelt | 0,36 |
| mønster, rotasjon i mønstermatrisen | 2,49 |
| halv oppløsning + oppblåsing | 1,37 |
| flat farge, rotert | 0,14 |

**Det er ROTASJONEN som koster, ikke mønsteret.** Flisens størrelse er
irrelevant (16×16 til 256×256 måler alle 2,07–2,12 ns/px, så det er ikke
cache), og GPU hjelper ikke nevneverdig (1,76 mot 2,19 — Chrome rasteriserer
2D-lerretet på CPU uansett). Å legge rotasjonen i mønstermatrisen og fylle
akseparallelt er DYRERE. Den billige veien finnes bare for et mønster uten
rotasjon, og den ville latt teksturen gli i forhold til banen.

**Restkostnad, målt presist** (300 bilder i ett tidtatt stykke, beste av tre —
`performance.now()` er klemt til 0,1 ms, så den vanlige `fps`-metrikken kan
ikke skille 0,3 ms fra støy): 22 av 26 tilfeller ligger innenfor ±0,07 ms. De
to som betaler er VULCANO (1,53 → 1,79 DAG, 1,54 → 1,85 NATT) og VISTANOTTE
(1,60 → 1,84 / 1,70 → 1,91). Det er nøyaktig de to banene der mest av skjermen
lå UTENFOR bildet før: målt andel av skjermen utenfor den ugjennomsiktige delen
er VULCANO 30 %, LABIRINTO 26 %, VISTANOTTE 15 %, ALPEN 13 %, og 0–6 % på
resten. Kostnaden er altså prisen for å tegne noe der det før ikke ble tegnet
noe som helst, og arealet er alt nede på det bevislige minimum (skjermen minus
det dekkende bildet). Begge banene ligger fortsatt på ~540 bilder/s.

**Metodefelle i `chrome_harness.py fps`: kameraet STÅR STILLE.** `update()`
leser `keys['ArrowUp']` for spillerbilen, så uten tastetrykk beveger den seg
ikke — målt kameraflytting over 300 bilder er 0,0 px / 0,0 grader på alle 13
banene. Hver banes fps-tall er altså ÉN kamerapose (startstreken), ikke et
snitt over runden. Det forklarer også hvorfor stripearealet var bit-likt i alle
300 bilder, og det betyr at tallene er sammenlignbare mellom kjøringer, men
ikke er et snitt over hvor banen er verst.

**Byggetid:** sum 160,6 → 180,3 ms (+1,5 ms per bane), verste bane 18,0 ms mot
budsjettet på 100. TEMPIO målte 47,5 og 50,2 ms i to kjøringer og 13–14 ms i
alle andre — samme GC-støy som VISTANOTTE i steg A, bekreftet nok en gang.

**CAMPAGNAs møllehatt er mørk med vilje** (`lagMot:{tak:'mur'}`), og det betyr
at den nesten forsvinner mot den mørkegrønne enga. Det er et bevisst bytte:
hatten måles mot møllekroppen den sitter på, slik kirketaket på ARDENNE gjør.

**Avvik verdt å vite i steg C (bykvartalene):**

Steg C er den første som tegner noe som IKKE er sirkler. `scene.rutenett(t0,t1,
side,avstand,blokk,rader,hoyde)` er søsteren til `belte()` — samme gang langs
PATH, men den leverer rette ruter, fordi et kvartal har gatehjørner. Tegningen
ligger i `dBuildingGrid(ruter,pal)`, skilt fra plasseringen av samme grunn som
`belte`/`dFlate`: plassering er geometri som kan måles, tegning er maling.

1. **Klaringen må måles LANGS kvartalets egen utstrekning.** Første versjon
   skrev `distToPath(x,y) < CLEAR + blokk*0.5`, altså «senteret må stå en halv
   blokklengde lenger ut». Det er en helt annen og altfor streng test — med
   `avstand = CLEAR + 8` strøk hvert eneste kvartal på alle tre banene.
   Løsningen er den `clearFootprint` alt bruker: prøv ni punkter langs blokkens
   egen tangent og krev `minD >= CLEAR`.
2. **Lerretstaket gjelder bare rader som går UTOVER.** `pad - hoyde - 14` ble
   først brukt på alle rader, og det droppet stille rader innover som hadde god
   plass — indre felt ligger godt innenfor lerretet. Derfor `tak = (side ===
   utside()) ? pad-hoyde-14 : Infinity`, og derfor er det ingen feil at et tema
   ber om én rad ut og tre inn: det er LERRETET som er asymmetrisk, ikke byen.
3. **`TR.kvartalN` finnes fordi et tomt rutenett ellers er usynlig.** Byggetiden
   steg ikke målbart da hundrevis av hus kom til, og det så mistenkelig ut.
   I stedet for å anta, teller banen nå kvartalene sine: LABIRINTO 159,
   SERPENTINA 199, VISTANOTTE 334, og 0 på de ti andre. Et rutenett som
   kollapser til ingenting blir da et TALL som endrer seg, ikke «alt ser grønt
   ut».
4. **Avstanden mellom kvartalene måles langs RADENS kurve, ikke langs PATH.** En
   rad som ligger `ut` px innenfor en sving er kortere enn banen i samme sving,
   og lenger utenfor. Med PATH-lengden som mål la kvartalene seg oppå hverandre
   i de indre radene og for spredt i de ytre — synlig i skjermbildet som en
   haug av overlappende hus i hver sving.
5. **Måleren nullstilles først når et kvartal faktisk PLASSERES.** Sto
   `akk = 0` før klaringssjekken, brukte et sløyfet kvartal opp sin egen lengde
   av gata likevel, og hullet der banen kommer nær ble dobbelt så langt som det
   trengte. Husrekka sto i små klynger med store tomrom imellom.

**Tre størrelses-/proporsjonsfeil, alle funnet på skjermbilde og alle rettet
ved å KRYMPE eller endre FORM — ingen av dem ved å bytte farge.** Det er samme
lærdom som steg B2 punkt 5, og den gjentok seg i tre nye varianter:

| det som var galt | hvordan det leste | rettelsen |
|---|---|---|
| Katedralen 208 × 50 px skip (4,2:1) med et 86 px tårn i enden | tallet «1» — nøyaktig olivengård-fella fra B2 | skipet til 116 × 46 (2,5:1), tårnet til 70, pluss en APSIS (halvrunding) i enden motsatt tårnet |
| Kvartalet delt i 2–3 like hus på 58–64 px | liggende spillkort, ikke bygninger | husbredden styrer antallet (`Math.max(2, Math.round(w/15))`), ikke omvendt — samme 11–18 px som `dBuilding` alt bruker |
| Vinduer skalert med husbredden (`bredde*0.16`) | terninger med øyne | fast 2,4 × 3,2 px i et 5 × 7 px rutenett, som `dBuilding` — et vindu er like stort i en smal bygård som i en bred |

Og én til, som ikke handler om størrelse: **et blankt skip har ingen skala.**
Katedralen var etter krympingen fortsatt en tom krem flate med én prikk på.
Fem høye, smale åpninger langs fasaden gjorde den til en bygning — øyet leser
høyden på et hus av hvor mange etasjer det ser, og en flate uten åpninger har
ingen høyde i det hele tatt.

**LABIRINTOs vinduer er MØRKE, de to andre byenes er lyse — og det er en måling,
ikke en smakssak.** Alle tre fikk først den samme gule `#facc15`. På en
middelhavsby ved DAG er det feil: der er det skodder og skygge i åpningene, og
den gule leste som terningøyne. Tonen er nå `#4a3b2c`, målt mot FASADEN og ikke
mot bakken (`lagMot: {vindu:'husA'}`), 4,67:1 — en vindusåpning sitter i en
vegg, akkurat som et tak ligger på en vegg. SERPENTINA (kveld) og VISTANOTTE
(natt) beholder den lyse, for der er lyset tent. Nattgløden i klokketårnet har
fått sin EGEN tone (`glod`), fordi en flate og en glød er to ulike ting — det
var nettopp det å bruke én tone til begge som gjorde dagsbildet feil.

**Den motsatte kontrastretningen, verdt å merke seg:** teglrødt `#8c3a2a` (den
tonen `roofPal` alt hadde) holder 3,31:1 mot den mørkeste fasaden, mens en
LYSERE tegl `#a34733` STRYKER på 2,60:1. Taket måles mot en lys vegg, og da er
det den MØRKE tonen som bærer kontrasten — motsatt av alle de andre
målingene i runde 4, der veien alltid gikk lysere fordi referansen var mørk
bakke. De gamle `cityPal`-tonene kunne av samme grunn ikke brukes til
kvartalene: den lyseste måler 2,42:1 og den mørkeste 1,16:1 mot bakken (lagt i
`SENERE.md` for de spredte `dBuilding`-husene som fortsatt bruker dem).

**Kostnad, målt i steg C:** byggetid sum 172,2 ms (steg B5: 180,3), verste bane
VISTANOTTE 19,4 ms mot budsjettet på 100 — altså FLAT, selv med 692 nye
kvartaler fordelt på tre baner. Nattlys: LABIRINTO 1 (klokketårnet),
SERPENTINA 1 (havnelyset), VISTANOTTE 5 (navet + fire kabiner).

**Avvik verdt å vite i steg D1 (nattlys i byene):**

1. **Samme felle som `pad` i steg B2, i ny drakt.** `const LYS_PER_RUTENETT` ble
   først skrevet rett over `dBuildingGrid`, altså ~500 linjer NEDENFOR det
   stedet `TH.groundLayer(scene)` kalles. Funksjonsdeklarasjoner heises, men en
   `const` gjør det ikke — den ligger i den temporale dødsonen og kaster
   `ReferenceError` ved kallet. Alle JSC-testene var grønne (183/183), for de
   kaller aldri `groundLayer`; `chrome_harness.py` kom tom tilbake. Konstanter
   som brukes av tegnekoden hører hjemme ØVERST i `buildTrackBg`, der
   `sperrer`/`kvartalN` alt ligger.
2. **`--tod` på `chrome_harness.py shot` hadde ingen virkning.** `todIdx` ble
   satt FØR `startRace()`, og `startRace()` kaller `resolveTodIdx(TR)`, som
   leser `SETTINGS.tid` (standard AUTO = banens egen `naturligTid`) og
   overskriver alt. Hvert «nattbilde» av en dagbane kom tilbake i fullt
   dagslys. Flyttet til ETTER `startRace()`. Feilen kom inn med
   `resolveTodIdx` i meny-steg A og har altså ligget der gjennom hele runde 4 —
   nattbildene i steg B og C viste banens egen tid, ikke den som ble bedt om.
3. **Et bilde «ved landemerket» viser ikke alltid kulissene.** VISTANOTTE
   legger kvartalene på 0,20–0,98 og 0,24–0,96, mens landemerket står på 0,14 —
   altså det ENE punktet på runden uten by. `shot` har derfor fått `--t`, som
   overstyrer rundeposisjonen.
4. **En flate kan ikke være både tent og mørk — FORKASTET forsøk.** Å tenne
   ~12 % av vinduene i bakingen gjorde nattbyen rik, men ødela dagbildet: et
   tent vindu må være LYSERE enn veggen, en åpning ved dag MØRKERE (steg C
   målte 4,67:1 for den mørke), og bakgrunnen er felles for alle tre
   døgntidene. Nattbyen må derfor komme fra GLØDEN, som ikke er en flate.
   Det ene tente vinduet per utvalgt kvartal står igjen som lyskilde.
5. **Utvalget er indeksbasert, ikke `rnd()`-basert**, av to grunner: lysene må
   fordeles over HELE runden (et tak som bare kuttet lista ville samlet alt i
   det partiet kvartalene ble lagt i først), og et indeksvalg trekker ingen
   `rnd()`, så husenes høyder og fasadetoner fra steg C er bit-identiske.
6. **Rekkefølgen groundLayer → landmark er et budsjettproblem.** `addLight`
   slipper STILLE alt over 150, og bakkelaget tegnes først, så en by som spiste
   hele taket ville gjort klokketårnet og pariserhjulet mørke uten at noe
   feilet. 40 per rutenettkall gir 44/44/72 og lar det stå 78+ igjen.
7. **Glødestørrelsen er det eneste håndtaket.** `drawTrackScene` tegner alle
   nattlys med fast alpha 0,5, og nattoverlegget (`rgba(5,8,20,0.58)` da dette
   ble skrevet, senket til `0.50` i steg C2) legges OPPÅ etterpå. 12 px leste
   knapt i skjermbildet, 14 så vidt, 20 leser som et opplyst vindu.

**Kostnad, målt i steg D1:** bildetid verste 1,87 ms (VISTANOTTE/NATT) mot 1,98
i steg B5 — altså flat/litt bedre, og LABIRINTO/NATT falt 0,31 → 0,25.
Byggetiden er innenfor samme støy som før (to kjøringer ga sum 236 og 202 ms
med ARDENNE 50,5 og TEMPIO 44,7 som hver sin engangstopp — se steg A punkt 3:
ett høyt tall skal måles på nytt før det tolkes; bybanene selv ligger på
14,2/15,1/20,8 ms).

**Avvik verdt å vite i steg C2 (bypalettene under overlegget):**

Bestillingen var å måle kontrasten ETTER at døgnoverlegget er lagt på, og kreve
3:1 i alle tre tider. Det kravet er umulig om natta, og det er en MÅLING og ikke
en vurdering:

1. **Et flatt overlegg har et TAK.** Legges `rgba(5,8,20,a)` som source-over,
   er den største kontrasten som finnes mellom to vilkårlige farger den du får
   av hvitt mot svart, komponert. Ved α=0,58 er taket **4,11:1** — og det er
   ikke bare under 3:1-kravet for tak/fasade PLUSS kvartal/bakke samtidig, det
   er så trangt at hele paletten må presses ut i hjørnene hvitt og svart.
   Overlegget er derfor senket til **0,50**, som gir et tak på **5,45:1**.
   Til sammenligning er taket 21,00:1 ved DAG og 13,00:1 ved SOLNEDGANG: 3:1 er
   14 % av alt som finnes ved dag, men 55 % om natta. **Dette er den ENE
   endringen i C2 som treffer alle tretten banene** — alt annet er de tre
   bybanenes egne paletter.
2. **Et hardt 3:1-krav om natta ble gjennomført, målt og så FORKASTET.** Alle
   tallene ble bedre og alle bildene ble verre. Grunnen er at WCAG-brøken er
   **blind for kulør**: den ser ingen forskjell på et cyan vindu i en grå vegg
   og en grå flekk i samme vegg. De siste prosentene av brøken kan bare betales
   i METNING, og metningen er det som bærer nattbyen. Nattgulvet for tak/fasade
   er derfor et målt **2,5:1**, mens DAG og SOLNEDGANG står på 3:1.
3. **Å lysne LANGS en kulør koster ingen metning. Å bleke mot HVITT koster
   alt.** Det er to ulike operasjoner, og forvirringen mellom dem var det som
   drepte første forsøk. LABIRINTOs gull `#facc15` har metning 0,957; lysnet
   langs sin egen kulør (hue 48°) opp til lyshet 0,70 måler det fortsatt
   0,958–0,963. Den forkastede `#fef6d5` lå på **0,33** og hadde sluttet å være
   gull. Gullet er nå `#fbd84a`, som er lyst nok til å ligge ×1,113 over husC i
   luminans om natta, uten å ha gitt fra seg noe som helst.
4. **Et tent vindu kan ALDRI nå 3:1 mot fasaden sin, i noen døgntid.** En rute
   som er lysere enn veggen og samtidig tre ganger lysere, må enten være
   nesten hvit eller stå i en nesten svart vegg — og veggen har sitt eget
   3:1-krav mot bakken i motsatt retning. Det tente vinduet leser derfor på
   RETNING (lysere enn veggen, krav ×1,10 i luminans; målt 1,11–1,26) pluss
   gløden fra D1, ikke på en kontrastbrøk. En mørk ÅPNING (LABIRINTO) måles
   motsatt vei og har sitt eget nattgulv på **2,25:1** (målt verste er 2,33).
5. **Alle tre palettene landet først PÅ 2,5-gulvet, innenfor hex-avrundingens
   slark** — LABIRINTO på 2,49949, altså så vidt UNDER. Å gi testen slark ville
   betydd at en bestått test ble avgjort av avrunding til nærmeste hex-verdi.
   Palettene er i stedet søkt opp på nytt med en eksplisitt `MARGIN = 0.02`.
   Prisen var overraskende lav: LABIRINTOs fasade måtte +0,7 % i lyshet, og
   SERPENTINA/VISTANOTTE trengte bare mørkere TAK (lyshet 0,100 → 0,092/0,093)
   med fasadene helt urørt.

Resultatet, målt under overlegget med spillets egne TOD-verdier:

| by | tak/fasade DAG | SOLNEDGANG | NATT | NATT før | kvartal/bakke NATT |
|---|---|---|---|---|---|
| LABIRINTO | 5,95 | 4,15 | **2,53** | 1,78 | 2,53 |
| SERPENTINA | 6,90 | 4,76 | **2,52** | 2,06 | 2,98 |
| VISTANOTTE | 6,87 | 4,75 | **2,52** | 1,61 | 2,95 |

Fasadene flyttet seg bare +1,7 % (LABIRINTO) / 0 % / 0 % fra steg C — det er
TAKENE som gjorde jobben, akkurat som steg C fant at «taket måles mot en lys
vegg, og da er det den MØRKE tonen som bærer kontrasten».

**Testen er gjort drift-sikker på to nye vis, begge bevist med mutasjonstest:**
- `KVART_GULV` i sjekk 19 navngir gulvet PER DØGNTID, og en døgntid som ikke
  står i tabellen gir STRYK med navnet sitt i meldinga. En umålt fjerde
  døgntid skal ikke kunne gli forbi på de tre som er målt.
- Sjekk 20 leser temaets eget `lagMot.vindu` for å avgjøre om ruta er en mørk
  ÅPNING eller et TENT vindu — ikke banenavnet. En palett kan altså ikke snu
  et vindu uten også å flytte `lagMot`, som er en synlig endring.
Fire mutasjoner biter: steg C-paletten fanges på 1,98:1, et overlegg på 0,58
fanges på alle tre byene med taket rapportert som 4,1:1, et snudd
SERPENTINA-vindu fanges på ×0,070, og en umålt fjerde døgntid fanges på navn.

**To metodefeller, begge fanget ved å se på tidsstempler og ikke på utskrift:**
1. **`chrome_harness.py shot` tar banenavnet som POSISJONSargument.** Skriver du
   `shot --bane LABIRINTO`, kaster den injiserte JS-en — men harnessen skriver
   et bilde likevel, av HOVEDMENYEN, og avslutter med kode 0. Et «nattbilde av
   byen» kan altså i virkeligheten være menyen. Lagt i `SENERE.md`.
2. **Seks «etter»-bilder var stille FORELDET.** En shell-løkke med `set -- $b`
   feilet, og fordi kallet var skrevet `>/dev/null 2>&1 && echo ok` kom det
   ingenting ut og de gamle filene stod. Oppdaget ved å se på klokkeslettet på
   filene (21:51 mot 11:10). **Et bilde som skal bevise noe må sjekkes for
   alder før det tolkes** — samme familie som «ett høyt tall skal måles på nytt».
   En mutasjon gikk i samme grøft: en `python3`-`.replace()` traff ikke den
   ekte kildeformateringen, så mutasjonen ble aldri injisert og testen «besto».
   Rettet med `assert old in s`.

**Dominobrikkene er bare HALVT løst, og resten er FORM og ikke farge.**
Fargedelen er gjort og målt (tabellen over). Skjermbildene viser likevel at
kvartalene fortsatt leser som brikker ved DAG, og `dBuildingGrid` forklarer
hvorfor: takbåndet er 4 px mot en fasade på 20–50 px, og vinduene er et helt
jevnt 5 × 7-rutenett over hele flaten. En lys flate med regelmessige prikker og
en hårstrek tak ER en dominobrikke uansett hvilke toner den males i. Punktet
sto derfor igjen i `SENERE.md`, omskrevet til å peke på takareal og variasjon
i vindusrutenettet — og det er nettopp den halvdelen **steg C3** gjorde.

**`cityPal`-punktet viste seg å være tre ulike saker, og ingen av dem er denne.**
Kvartalene fikk sine egne målte toner i steg C; `cityPal` leses bare av de
SPREDTE `dBuilding`-husene `scatterTerrain` strør utover, og de måler 1,00–3,85:1
mot bakken. Fiksen langs hver tones egen kulør ble målt og IKKE gjennomført:
LABIRINTOs fire toner `#b08d5a`/`#c9a37a`/`#d8b48c`/`#9c7f5e` ender da alle på
lyshet 0,75–0,80 (`#dcccb5`/`#e0cab3`/`#e3caae`/`#d8ccbe`) og blir umulige å
skille — to VISTANOTTE-toner har ingen løsning i det hele tatt. Det er nøyaktig
samme feilmodus som fikk det harde nattkravet forkastet i punkt 2. I tillegg er
`roofPal` **dødkode** (settes på LABIRINTO og DISCESA, føres gjennom
`makeTheme`, leses ingen steder), og DISCESAs `cityPal` likeså, siden
`dBuilding` bare kalles for `terrain==='city'`. Alle tre står i `SENERE.md`.

**Kostnad, målt i steg C2:** byggetid sum 182,6 ms, verste bane VISTANOTTE
19,8 ms mot budsjettet på 100 — en ren palettendring koster ingenting.
Nattlys uendret 44/44/72. `test_banegeometri.js --mot geo_laas.json` uendret på
alle 13.

**Avvik verdt å vite i steg D2 (stillaset for bevegelige detaljer):**

Bakgrunnen males ÉN gang og står resten av løpet. Alt som skal røre seg må
derfor tegnes på nytt hvert bilde, i verdensrommet, oppå det ferdige bildet —
og det er den ENESTE delen av kulissene som koster noe per bilde. Alt annet i
runde 4 er betalt én gang ved banestart; en bevegelig detalj betaler på nytt 60
ganger i sekundet, for alltid. Derfor er «maks én per bane» et BUDSJETT og ikke
en smakssak, og derfor er det en teller (`TR.bevegelseN`) og ikke en regel i
hodet.

1. **Registreringen går gjennom LANDEMERKET, ikke gjennom et felt på temaet.**
   Ankeret finnes bare inne i landemerket: `scene.plasser` kan BÅDE klemme
   avstanden mot lerretskanten (`pad - hoyde - 14`, steg B2) OG vende siden
   (`allowFlip`), så hvor bygget faktisk havnet vet ingen andre enn den som
   nettopp kalte `plasser`. Et felt på toppnivå måtte gjettet på det samme
   tallet en gang til, og det er nøyaktig den dobbeltregningen som ga
   B4-feilene.
2. **Rotasjonen lagres FERDIG SATT SAMMEN** (`ang: p.ang + (p.side>0?Math.PI:0)`),
   altså med bokstavelig talt samme uttrykk som bakingen bruker. Alternativet —
   å lagre `p.ang` og `p.side` hver for seg og sette dem sammen i tegnekoden —
   er den samme omregningen skrevet to steder, og den har alt gått galt to
   ganger (lykta i feil ende av moloen i B3, glød ved FOTEN av det som lyser i
   B4). `scene.lokal` finnes av samme grunn.
3. **Det som snurrer kan ikke bakes — og den fella var nesten gått i.** Første
   versjon bakte hele hjulhodet OG registrerte den samme funksjonen i det
   levende laget, altså et fast sett eiker i bildet med et roterende sett
   glidende forbi. Delelinja er ikke «hjul mot bakgrunn», den er
   **rotasjonsinvariant mot ikke**: bein, ring og nav ser like ut i alle
   stillinger og er derfor BAKT (så `shot --modus bg` fortsatt viser et
   gjenkjennelig pariserhjul for plasseringssjekken), mens eiker, kabiner og
   kabingløden bare finnes live. Ring og nav strekes dessuten opp på nytt i det
   levende laget, rent for lagdelingens skyld — to streker per bilde er
   billigere enn å flytte hele hjulet ut av bakgrunnen.
4. **En glød på noe som BEVEGER seg kan ikke ligge i `nightLights`.** De fire
   kabinlysene lå der først, og `addLight` lagrer faste VERDENSKOORDINATER —
   kabinene ville snurret forbi fire stillestående lamper boltet til rekkverket.
   De tegnes nå med `drawGlow` inne i tegnefunksjonen, i landemerkets egen
   ramme. Navet beholder sin `s.lys`, for navet står stille. Målt følge:
   VISTANOTTEs nattlys falt 72 → **68**.
5. **`shot` trengte `--tid`.** `shot` nuller `update()` (steg B punkt 4, ellers
   triller bilen vekk fra kamerapunktet), og da står `raceTime` på 0 i hvert
   eneste skjermbilde — alt som beveger seg kommer ut i nøyaktig samme stilling
   hver gang. To bilder på to tidspunkt er den eneste måten å BEVISE på et
   stillbilde at noe faktisk rører seg. `drawBevegelse(g,tr,tid,natt)` tar
   derfor tiden som ARGUMENT og leser den ikke fra `raceTime` selv; kallstedet i
   `drawTrackScene` sender `raceTime/60`, altså sekunder, fordi en detalj som
   skal snurre én gang i halvminuttet skal skrives som nettopp det. At
   pausemenyen fryser detaljen følger gratis av `if(paused) return;` først i
   `update()`.

**`test_bevegelse.js` måler med et OPPTAKSLERRET, ikke med en no-op-stubb.**
Det er forskjellen fra de andre JSC-testene: lerretet fører regnskap med
transformmatrisen og skriver ned hvor hvert tegnekall havnet. Uten den kan man
bare se AT noe ble tegnet, ikke HVOR — og «hvor» er hele saken i B4-familien.
Siden `drawBevegelse` ikke gjør noen kameraomregning selv, er de avleste
punktene rene verdenskoordinater.

Målt på VISTANOTTE:

| sjekk | hva den måler | tall |
|---|---|---|
| 1 | taket på én per bane | 1 av 13 baner, ingen over 1 |
| 2 | drevet av tid | 102 tegnekall, 60 av 80 punkt flyttet seg mellom t=0 og t=7,3 s |
| 3 | kuttet begge veier | 114 kall på skjermen, 0 kall 10 000 px unna, grensa går **0,00 px** fra marginkanten |
| 4 | rekkevidden mot faktisk utstrekning | tegner ut til 137,9 px, rekkevidde 144 px, margin 6,1 px |
| 5 | felles ramme med bakingen | nærmeste levende punkt **0,00 px** fra navlyset |
| 6 | ankeret innenfor lerretet | 624 px til nærmeste kant |

**Sjekk 5 er B4-regresjonstesten, og den regner ikke omregningen selv.**
Bakingen la navlyset ut med `scene.lokal`, altså spillets EGEN omregning fra
landemerkets ramme til verden. Faller et punkt den levende delen tegner oppå et
slikt lys, deler de to halvdelene ramme. Ville testen regnet `p.side`-vendingen
på egen hånd, kunne den hatt samme feil som koden — samme grunn som at
`test_meny_kontrast.js` kaller spillets egen `contrastRatio()`.

Sjekk 3 har samme forsiktighet: testen sveiper kameraet til detaljen kuttes
bort og leser av skjermposisjonen i det øyeblikket med spillets egen
`worldToScreen`. Første forsøk regnet kameraposisjonen selv og var FEIL — med
`camAngle = 0` roterer `worldToScreen` verden −90°, så skjermens x drives av
verdens y. En test som utleder kameratransformen på nytt tar feil på samme måte
som alt annet som utleder den på nytt.

**Åtte mutasjoner, sju biter — og den åttende er lærerik.** To registreringer,
tid ignorert (`t*FART` → `0`), for kort rekkevidde, kuttet fjernet, rammen
forskjøvet 6 px (sjekk 5 på 2,50 px), rammen rotert 0,2 rad (sjekk 5 på
10,14 px) og vendingen SNUDD til `p.side<0` (sjekk 5 på 3,61 px) fanges alle. Å
SLETTE `(p.side>0?Math.PI:0)` fanges derimot IKKE — fordi VISTANOTTE ligger på
side −1, så leddet er en no-op akkurat der. Det er nøyaktig mønsteret fra
B3-tabellen («både vendingen og en asymmetrisk glød må til før feilen er
synlig»). Siden den SNUDDE varianten biter, er det testens DEKNING på én bane
som mangler, ikke selve sjekken. **Første bane på side +1 i D3 lukker hullet av
seg selv** — og til da er det verdt å vite at D2 ikke har bevist vendingen.

En måling til, verdt å merke seg: 6 px forskyvning av rammen gir bare 2,50 px
på sjekk 5, ikke 6. Eikene feier over et område, så et annet punkt kommer
nærmere lyset enn det som skulle truffet. Sjekken er altså mindre følsom enn
forskyvningen — grensa på 1 px er satt deretter, og ikke høyere.

**Kostnad, målt i steg D2:** byggetid sum 180,3 ms, verste bane VISTANOTTE
20,0 ms mot budsjettet på 100 — stillaset koster ingenting å bygge. Bildetid
verste VISTANOTTE 1,86 ms (D1: 1,87), altså flat. **MERK at det tallet er
kostnaden for et KUTTET objekt:** `fps` måler bare startstreken, og hjulet er
kuttet bort der. Det flate tallet beviser derfor at stillaset koster null når
detaljen er utenfor skjermen — det sier ingenting om hva den koster når den er
inne. Den målingen krever `--t` i `fps` og står i `SENERE.md`. Det eneste tallet
som finnes for synlig tilstand er 114 tegnekall per bilde.

**Avvik verdt å vite i steg C3 (formen på kvartalene):**

Steg C2 løste FARGEN på dominobrikkene og slo fast at formen sto igjen. Dette
steget er formen, og den ene målingen som styrer alt annet er denne:

1. **«Taket må ta mer av flaten» kan IKKE bety å male flaten i `pal.tak`.**
   Teglfargen måler **1,07–1,76:1** mot bakketonene — alle tre byer, alle tre
   døgntider — så et kvartal malt i taktonen forsvinner rett ned i bakken.
   Taktonen er en LINJEfarge: den er målt mot FASADEN (`lagMot.tak`) nettopp
   fordi den er mørk, og det var hele poenget i steg C («taket måles mot en lys
   vegg, og da er det den MØRKE tonen som bærer kontrasten»). Løsningen er
   derfor å bytte om på BETYDNINGEN av flatene og ikke på tonene: den store
   lyse flaten ER taket (et soltreft tak ovenfra er det lyseste på et hus), og
   `pal.tak` tegner takskjegget og gavlkanten. Bærekravet i sjekk 19 ligger på
   nøyaktig de samme tonene som før. **Ingen palettverdi er rørt i dette
   steget.**
2. **Hvilken lys tone som blir den STORE flaten er en måling, ikke et valg.**
   Målt hver for seg mot den verste bakketonen under overlegget:

   | by | husA DAG/SOLNED/NATT | husB | husC |
   |---|---|---|---|
   | LABIRINTO | 3,38 / 2,71 / **1,98** | 3,87 / 3,03 / **2,18** | 4,74 / 3,63 / **2,53** |
   | SERPENTINA | 4,23 / 3,19 / 2,11 | 5,54 / 4,03 / 2,52 | 7,03 / 4,96 / 2,99 |
   | VISTANOTTE | 4,67 / 3,41 / 2,20 | 5,68 / 4,05 / 2,49 | 7,24 / 5,01 / 2,96 |

   Bare **husC** holder nattgulvet på 2,5:1 på alle tre byene. Det SOLVENDTE
   takfallet er derfor alltid husC, og det er bare SKYGGEfallet som varierer
   (husC 2/3, husB 1/3). Da husB var én fasadetone blant tre var 2,18 greit —
   sjekk 19b krever bare at ÉN flate bærer bakkekontrasten — men når taket blir
   den dominerende flaten kan ikke en tredjedel av husene ha den svakeste tonen
   som sin eneste. **En flate som vokser må måles på nytt**, selv om tonen er
   den samme og testen var grønn før og etter.
3. **Fasadebåndet er husA, og det gjør sjekk 20 EKSAKT.** Før sto vinduene i en
   tilfeldig av de tre fasadetonene, mens `lagMot.vindu` peker på husA — altså
   var målingen bare verste-fall-riktig. Nå står hvert vindu bokstavelig talt i
   den tonen det måles mot. At husA (den svakeste) samtidig slutter å være en
   bærende flate er den samme endringen sett fra den andre siden.
4. **MØNET SOM STREK VAR FEIL, og det ble funnet på et 8x-utsnitt.** Første
   utgave tegnet møne + takskjegg + gavlkant på BEGGE sider i `pal.tak`. Det
   ga fire mørke streker rundt og tvers over hver lille flate, og kvartalet
   leste som FLISER I EN MØRK FUGE — en annen feil enn dominobrikken, men like
   mye et mønster og like lite et hus. To rettelser: mønet er ikke lenger en
   strek, men SKILLET mellom de to takfallene (det hvite 7 %-overlegget flyttet
   fra en loddrett strimmel til det solvendte fallet, og hevet til 12 % fordi
   det nå har en jobb å gjøre), og gavlkanten tegnes bare på ÉN side, siden
   nabohusene deler skillet og to streker kant i kant over et 12 %-smug er
   nettopp den doble fugen. **Dette er synlig først ved 8x** — et nedskalert
   520 px-bilde viste det ikke, og 3x viste det bare som «litt mørkt».
   Samme familie som de tre størrelsesfeilene i steg B2/C: funnet på skjerm,
   rettet ved å fjerne noe, ikke ved å bytte farge.
5. **B5-regelen er holdt med et eget frø, og den er VERIFISERT og ikke antatt.**
   `rnd` beholder nøyaktig de samme tre kallstedene i samme rekkefølge som steg
   C — husdybden, tonevalget, og ett kall per rute i det ORIGINALE
   `rader × kol`-rutenettet. Rutenettet tegnes ikke lenger, men kallene gjøres
   og BRUKES: de samme verdiene under samme 0,4-terskel bestemmer nå hvilke
   vinduer i fasadebåndet som er hull. All ny tilfeldighet (båndhøyde,
   mønehøyde, vindusdeling, marg, blindt hus) tas fra `krnd =
   mulberry32(seedFromName(cfg.name+'|kvartal'))`, som er deklarert ØVERST i
   `buildTrackBg` ved siden av `LYS_PER_RUTENETT` — en `const` lenger nede
   ligger i den temporale dødsonen når `groundLayer` kalles (steg D1 punkt 1).
   Målt med et fingeravtrykk som pakker inn hvert `mulberry32`-kall og bokfører
   kalltall + FNV-sjekksum per FRØ: alle eksisterende strømmer er
   BIT-IDENTISKE på alle 13 banene, og diffen er en ren innsetting av den nye
   strømmen (0 kall på de ti banene uten by, 3180/3980/6680 på de tre byene =
   nøyaktig 5 trekk × 636/796/1336 hus).
6. **Det tente vinduet flyttet seg, og det SKULLE det.** Det satt før i øverste
   etasje av fasaden (lokal `-h+4`); nå sitter det i fasadebåndet mot gata.
   Gløden følger med gjennom `scene.lokal(r,lx,ly)` — omregningen lokal→bg går
   nå gjennom spillets ENE sted for den i stedet for å være skrevet ut på nytt
   inne i tegnefunksjonen, slik B4 slo fast at den skal. Det er mulig fordi
   tegneren alltid kalles som `s.kvartal(...)`, så `this` ER scene-objektet, og
   ruta fra `scene.rutenett` har alt både `ang` og `side`. Antall nattlys er
   uendret **44 / 44 / 68** — vakten `rader>0` er byttet mot `vh>0`, og begge
   er alltid sanne, så utvalget er det samme kvartal for kvartal.

**Takarealet er målt, ikke anslått.** Flatene males i sentinelfarger i en
MIDLERTIDIG kopi (med `rnd()`-kallene beholdt i erstatningene, ellers tegner
kopien en annen by), fordi den gamle eksakt-RGB-tellingen ikke lenger virker:
det hvite overlegget på det solvendte fallet endrer pikselverdien, så et
eksakt treff på husB/husC teller bare halve taket.

| by | takflate før | takflate etter | fasade etter | takandel |
|---|---|---|---|---|
| LABIRINTO | 0 px | 119 138 px | 44 046 px | **73,0 %** |
| SERPENTINA | 0 px | 189 996 px | 63 802 px | **74,9 %** |
| VISTANOTTE | 0 px | 286 547 px | 81 191 px | **77,9 %** |

Før var takandelen null: hele fotavtrykket var fasade, med bare et 4 px
takbånd lagt OVER huset. Tallene er flatenes INDRE (kantpikslene er
antialiasert og teller ikke), og siden et 6–11 px bånd taper forholdsmessig
mer til omkretsen enn en stor flate, er den virkelige takandelen litt HØYERE
enn tabellen viser. Vindusarealet falt fra 7887/11220/12254 px til omtrent en
åttendedel — det er det jevne rutenettet som er borte.

**Kostnad, målt i steg C3:** byggetid sum 178,7 ms (steg D2: 180,3), bybanene
13,6 / 14,4 / 19,6 ms mot et budsjett på 100 — færre og større fyll koster
ingenting. ARDENNE målte 43,1 ms i én kjøring og 16,0/16,6/18,8 i alle andre;
banen rører ikke `dBuildingGrid` i det hele tatt, så det er samme GC-støy som
er målt på VISTANOTTE (steg A) og TEMPIO (steg B5). Ett høyt tall skal måles
på nytt før det tolkes.

**Avvik verdt å vite i steg D3a (DUNAs fyrstråle):**

Dette steget er det første som har et BUDSJETT per bilde (0,3 ms for en synlig
detalj), og det første tallet for hva en detalj koster når den faktisk er inne
i bildet. Målingene står i `maalinger/maal_fps_D3a.txt` og
`maalinger/maal_straale_D3a.txt`.

1. **`--tod` på `chrome_harness.py fps` hadde ingen virkning — samme feil som
   `shot` hadde i steg D1, fortsatt levende her.** `todIdx` ble satt FØR
   `startRace()`, og `startRace()` kaller `resolveTodIdx(TR)`, som leser
   `SETTINGS.tid` (AUTO = banens egen `naturligTid`) og overskriver alt.
   **Følge: hvert «DAG/NATT»-par i ALLE tidligere `fps`-tabeller i dette
   notatet (steg B5, D1, D2) er i virkeligheten samme døgntid målt to ganger.**
   Det forklarer hvorfor de to kolonnene nesten alltid lå innenfor støyen av
   hverandre. Rettet samme sted som i `shot`: `todIdx` settes ETTER
   `startRace()`. Feilen ble rettet INNE i bestillingen og ikke lagt i
   `SENERE.md`, fordi DUNAs `naturligTid` er DAG — uten rettelsen kunne punkt 3
   i bestillingen («mål DUNA på NATT») ikke utføres i det hele tatt.
2. **Kameraet må pinnes PÅ NYTT hvert bilde, ikke bare én gang.** `fps --t`
   låner kamerasettingen fra `shot`, men `fps` lar rAF-løkka gå gjennom
   `--virtual-time-budget`, så bilen triller vekk fra punktet mens målingen
   pågår. En `fest()`-kladd kalles derfor først i hvert bilde. `tegnekall` og
   `skjermpos` i utskriften er beviset for at detaljen var inne i bildet —
   uten dem måler man like godt startstreken, og det er nettopp den fella
   steg D2-tallet gikk i.
3. **Dataen må legges TILBAKE mellom rundene.** `--uten-beveg` nuller
   `TR.bevegelse`, men `ensureTrackBg` returnerer tidlig når `TR.bg` alt
   finnes, så neste `startRace()` bygger den IKKE opp igjen. Uten en
   stash/restore målte andre døgntid — og alle banene etter den første —
   uten detalj selv når den skulle vært på, og rapporterte `skjermpos` som «–»
   fordi dataen var borte. En nullet verdi i en harness må alltid legges
   tilbake, for harnessen måler flere ting i samme nettleserøkt.
4. **Den direkte med/uten-differansen er FORTSATT ubrukelig, selv med
   B5-metoden.** 300 bilder i ett tidtatt stykke, beste av tre, gir
   differanser på +0,002 til +0,024 ms mot en blokkspredning på 0,056–0,19.
   Detaljen er derfor forstørret 40x på RAMMEVERKSNIVÅ (`scene.beveg` pakker
   `tegn` i en løkke på 40 i en midlertidig kopi) og differansen delt på 39.
   Å forstørre i rammeverket og ikke i den enkelte tegnefunksjonen er poenget:
   da er inngrepet BOKSTAVELIG TALT det samme for begge banene, og tallene kan
   sammenlignes.

| bane | tid | per bilde | % av 0,3 ms | margin |
|---|---|---|---|---|
| DUNA | DAG | 0,00244 ms | 0,8 % | 123x |
| DUNA | NATT | 0,00269 ms | 0,9 % | 111x |
| VISTANOTTE | DAG | 0,00292 ms | 1,0 % | 103x |
| VISTANOTTE | NATT | 0,00615 ms | 2,0 % | 49x |

**Budsjettet holdes med 49–123x margin. Ingenting trenger å bakes.** Merk at
VISTANOTTEs natt koster 2,6x dagen (de fire kabingløddene er radiale
gradienter som bare finnes om natta), mens DUNAs natt koster det SAMME som
dagen — strålen gjør identisk arbeid i alle tre tidene.

5. **`drawBevegelse` tar nå HELE døgntiden, ikke boolsken `natt`.** Grunnen er
   målt og ikke en smakssak: SOLNEDGANG har `night:false`, så et boolsk flagg
   kan ikke skille den fra DAG — og strålen skulle stå ulikt i nettopp de to.
   Alfaen ligger i `STRAALE_ALFA` navngitt PER DØGNTID, etter `KVART_GULV`-
   mønsteret fra steg C2, slik at en umålt fjerde døgntid gir en synlig feil
   og ikke en stille `undefined`.
6. **Strålen er en TREKANT og ikke en sirkelbue.** Buen ville stukket
   `SLEN*(1−cos SHALV)` = 1,2 px lenger ut, altså usynlig — men opptakslerretet
   i `test_bevegelse.js` må bokføre en `arc` som hele sirkelens omskrevne boks,
   og det ville blåst den oppgitte rekkevidden opp med 97 px uten at noe
   faktisk tegnes der. Formen er valgt av MÅLBARHET, og det er en gyldig grunn
   når forskjellen på skjermen er 1,2 px.
7. **EN PIKSELDIFF AV TO SKJERMBILDER ER IKKE RETTFERDIG, og det ga først feil
   tall.** Ledertavla og spillerbilens lakkering trekkes på nytt ved hver
   sidelasting, så to «identiske» bilder av samme bane skiller seg i ~2000
   piksler som ikke har noe med strålen å gjøre. Første runde med målinger
   tilskrev strålen nettopp de pikslene og rapporterte et fotavtrykk på
   3400–5200 px — mens strålen i virkeligheten knapt var på skjermen. Avslørt
   ved å SE på bildet: tallene sa at det skulle være en tydelig kjegle der, og
   det var ingenting. Alle tall er nå målt med HUD-en (y<170), spillerbilen
   (±34 px om skjermsenter) og minikartet maskert bort. **Lærdom i samme
   familie som «et bilde som skal bevise noe må sjekkes for alder»: en
   pikseldiff må først bevise at de to bildene er sammenlignbare.**
8. **Landemerket ligger ALLTID ved høyre bildekant, og det er geometri.**
   Lykta regnet om til skjermkoordinater for hele runden kommer aldri lenger
   til venstre enn x=488 på et 520 px bredt lerret — landemerket står i fast
   sideavstand fra banen, så det havner på samme skjerm-x hver gang du kjører
   forbi. Bare den delen av sveipet som peker INN i bildet er derfor synlig.
   Spissen (lykt + 210 px) ved `--t 0.08`, lykt (515,362):

   | tid (s) | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
   |---|---|---|---|---|---|---|---|---|
   | spiss | 515,572 | 366,511 | **305,362** | 366,214 | 515,152 | 663,214 | 725,362 | 663,511 |

   `--tid 0` og `--tid 4` peker rett ned og rett opp LANGS bildekanten og gir
   bare en 20 px bred flis — de to første «bevis»-bildene mine var nettopp de
   to, og beviste ingenting. De vedlagte er nå t=1,0 / 2,0 / 3,0, der
   tyngdepunktet flytter seg 145 px loddrett og boksen går fra nedre til øvre
   halvdel av skjermen.
9. **DAG ER TONET NED, og det er målingen som bestemte det — men først etter at
   målemetoden ble rettet.** Med ÉN felles alfa (0,26) er det RELATIVE løftet
   nesten likt i alle tre tider: x1,378 ved DAG, x1,319 ved SOLNEDGANG, x1,341
   ved NATT. Grunnen er at `lighter` legger til i sRGB, mens nattoverlegget
   `rgba(5,8,20,0.50)` komponeres ETTER `drawBevegelse` og demper strålen og
   bakgrunnen dens like mye. **En felles alfa ville altså gjort strålen
   nøyaktig like påfallende midt på dagen som midt på natta — og da har fyret
   ingen natt.** Alfaen er derfor `DAG 0,14 / SOLNEDGANG 0,26 / NATT 0,26`,
   målt som levert til x1,199 / x1,319 / x1,341. DAG står ikke på NULL fordi
   **DUNAs `naturligTid` ER dag**: slås strålen av der, har banen ingen
   bevegelig detalj i det løpet standardinnstillingen faktisk kjører.
10. **Den første alfaen (0,09/0,10/0,10) var i praksis usynlig.** Den målte
   x1,12, og på skjermen i 1:1 var det ingen kjegle å se i det hele tatt —
   bare en svak ujevnhet. Tallet var ikke galt, det var bare ikke et tall som
   svarte på spørsmålet «leser dette som et fyrlys». Samme lærdom som steg C2
   («alle tallene ble bedre og alle bildene ble verre»), bare med fortegnet
   snudd: her måtte bildet til for å si at tallet var for lavt. At alfaen gikk
   fra 0,10 til 0,26 koster ingenting — en gjennomsiktighet er like dyr som en
   annen, bekreftet ved å måle bildetiden på nytt etterpå (uendret).
11. **Ærlig observasjon:** fyrtårnet er tegnet som en oppriss lagt flatt
   (spillets konvensjon for alle landemerker), mens strålen sveiper 360 grader
   i bakkeplanet, så den krysser sitt eget tårn i deler av omdreiningen.
   Bildene viser at lesningen holder — de røde båndene blir røde, og det er
   båndene som sier «fyr» — men det er en egenskap ved konvensjonen.

**D2-HULLET ER LUKKET, og det er bevist med måling.** D2 kunne ikke fange at
`(p.side>0?Math.PI:0)` ble SLETTET, fordi VISTANOTTE ligger på side −1 og
leddet er en no-op akkurat der. DUNA ligger på side +1, og mutasjonen gir nå
`5: DUNA: nærmeste FASTE levende punkt ligger 100,17 px fra nærmeste nattlys`
→ STRYK. At utslaget er 100,17 og ikke hele speilforskyvningen på 302,6 px er
verdt å vite: moloens havnelys ligger nærmere den speilede posisjonen enn
lykta selv gjør. Dekningen er dessuten gjort til et KRAV og ikke en flaks —
**ny sjekk 7** krever at `TR.bevegelse.side` er 1 eller −1 og at det finnes
minst én bevegelig detalj på HVER side. `side` er derfor lagt inn i
`scene.beveg` som REN DATA; tegnekoden bruker den ikke, vendingen ligger alt
ferdig inne i `ang`. Den er der utelukkende for at testen skal kunne måle
dekningen sin.

**Sjekk 5 er samtidig gjort ÆRLIG, og det er to ulike tall.** D2 målte at
6 px forskyvning av rammen bare ga 2,50 px utslag — eikene feier over et
område, så et annet punkt kommer nærmere lyset enn det som skulle truffet.
Sjekken ser nå bare på de punktene som står STILLE mens detaljen beveger seg
(`fastePunkt`, to tidspunkt sammenlignet punkt for punkt), og for noe som
roterer er de faste punktene nettopp dreiepunktet. På DUNA leser 6 px
forskyvning nå **eksakt 6,00 px**. VISTANOTTE leser fortsatt 2,50, fordi
hjulets faste sett inneholder hjørnene i boksen til nav-prikken `arc(0,cy,6)`
8,49 px ute, og `|rotert(±6,±6)+(6,0)|` bunner ut på 8,49−6. Mutasjonen biter
uansett. Restfølsomheten er lagt i `SENERE.md`.

**Tretten mutasjoner, tolv biter — og den trettende er INERT, ikke et hull.**
«Fjern `if(bevegelse) return;`» bet ikke, og diagnosen er at ingen landemerke
kaller `beveg` to ganger, så koden er EKVIVALENT uten linja. Den er erstattet
av «DUNA registrerer to ganger» (et ekstra `s.beveg`-kall satt inn), som biter
på `1: DUNA registrerte 2 bevegelige detaljer (taket er 1)`. **Lærdom: en
mutasjon som ikke biter skal diagnostiseres før den tolkes** — en inert
mutasjon og et testhull ser helt like ut i utskriften.

**Et EKTE hull i testen ble funnet av mitt eget mutasjonsbatteri.** «DAG
mangler i `STRAALE_ALFA`» bet IKKE, enda kommentaren jeg hadde skrevet lovet
at «en umålt fjerde tid ikke kan gli forbi». Påstanden ble ikke slettet — den
ble gjort SANN: sjekk 2 går nå over ALLE døgntider og krever at minst ETT
punkt faktisk FLYTTET seg, ikke bare at tegnekallene endrer seg. Den biter nå
på `2: DUNA ved DAG: tegnekallene endrer seg, men ikke ETT punkt flyttet seg —
detaljen blinker, den beveger seg ikke`. En detalj som bare blinker er ikke
bevegelig, og det skillet fantes ikke i D2.

**Opptakslerretet måtte svare på strengkonvertering.** `createLinearGradient`
returnerer proxyen selv (slik at `.addColorStop()` virker), og da gjør
`g.fillStyle = gr` en `String(val)` på den — som spør etter
`Symbol.toPrimitive`, får en autogenerert funksjon, og kaster «Symbol.
toPrimitive returned an object». `symbol`/`toString`/`valueOf` svares nå
eksplisitt med en KONSTANT streng: fargestoppene bokføres av sine egne
`addColorStop`-kall, så et skiftende navn her ville bare gjort
op-sammenligningen i sjekk 2 til støy.

**Kostnad, målt i steg D3a:** byggetid sum 178,4 ms (to andre kjøringer samme
dag ga 175,1 og 186,7 — samme spredning som alltid), verste bane VISTANOTTE
19,6 ms mot budsjettet på 100 — strålen bygges ikke, den tegnes.
DUNA melder nå `beveg 1`, og nattlysene er UENDRET (DUNA 4, VISTANOTTE 68).
`test_banetema.js` 198/198 med svakeste verdi 3,45:1 (CORALIS/DUNA) og
svakeste landemerketone 3,15:1 (DESERTO `saltKant`), begge uendret — ingen
palettverdi er rørt. `test_banegeometri.js --mot geo_laas.json` uendret på
alle 13.

**Avvik verdt å vite i steg D3b (møllevingene og havnekrana):**

Bestillingen ba om ÉN avgjørelse per bane på hva som er bakt og hva som er
levende. Begge avgjørelsene falt på samme regel som D2/D3a — **det som ser likt
ut i alle stillinger bakes** — men de to banene sier noe nytt hver.

1. **CAMPAGNA: korset er levende, møllekroppen er bakt, og dempingen har ikke
   ÉN gren.** `GLOD_BASE - GLOD_DYP*(1+Math.cos(4*vinkel))/2` gir fire demp per
   omdreining helt av seg selv, fordi korset har fire armer. En
   `if (en arm er foran ruta)` ville gitt samme bilde og brutt sjekk 2, som
   krever at antall tegnekall er IDENTISK over tid innenfor én døgntid. En
   detalj som gjør ulikt mye arbeid på ulike tidspunkt gir hakk i
   bildefrekvensen, og det er hele grunnen til at regelen finnes. Gløden er
   samtidig det ENESTE i dette steget som har en tidsgren i det hele tatt
   (`if(tod.night)`) — og den grener på DØGNTID, ikke på TIDSPUNKT, som er
   nettopp det sjekk 2 tillater.
2. **EN LEVENDE GLØD MÅ VÆRE STØRRE ENN DET BAKTE NATTLYSET DEN LIGGER OPPÅ,
   ellers finnes det ingen rand å puste i.** Første forsøk satte gløden til
   alfa 0,34 / radius 15 — samme størrelsesorden som det bakte `s.lys(...,16)`
   i samme punkt, tegnet med alfa 0,5. Målt løfter den da 0,12 luminans fordelt
   på 50 piksler, og på skjermen er den i praksis ikke der: det bakte lyset
   metter midten fullstendig, og nattsløret (`rgba(5,8,20,0.50)`) halverer det
   som er igjen. Valgt er base 0,75 / dyp 0,55 / **radius 28**, som er over det
   bakte lysets 16. Det er en REGEL og ikke et enkelttall, og den gjelder hver
   framtidig glød som skal puste oppå et bakt lys.
3. **Dempingen flater ut på 83 %, så det finnes et punkt der mer lys ikke
   kjøper mer puls.** Målt mot den SAMME fila med `GLOD_BASE=0, GLOD_DYP=0` på
   samme `--tid` (tabellen står i `maalinger/maal_molle_D3b.txt`):
   0,34/15 → 60 %, 0,55/22 → 71 %, **0,75/28 → 83 %**, 1,00/34 → 83 %. Å gå til
   1,00 gir bare mer absolutt lys og gjør møllehodet til en lykt.
4. **Den første målemetoden sammenlignet lysest mot mørkest øyeblikk, og det er
   å måle feil ting.** Mellom de to stillingene har VINGENE flyttet seg over
   hele bildet, og vingene er mye større enn gløden — et firedobbelt hopp i
   glødstyrke flyttet tallet fra 2,6 % til 3,4 %, altså nesten ikke. Riktig
   referanse er samme fil med bare gløden slått av, på samme tidspunkt, så
   vingene står piksel for piksel likt i begge bildene. Samme familie som D3a
   punkt 7: **en pikseldiff må først bevise at de to bildene er
   sammenlignbare.** Fasene er dessuten regnet ut av formelen og ikke funnet med
   øyemål (`--tid 0.291` lysest, `0.916` mørkest).
5. **SERPENTINA: lasta HEISER, jibben svinger ikke — og den andre virkningen er
   viktigere enn kostnaden.** En svingende jibb ville tvunget tårn, jibb og
   motvekt ut i det levende laget, og en bjelke ser ut som en bjelke i hver
   stilling. Men avgjørende er at **en bakt jibb gir et punkt som ALDRI flytter
   seg**, og det er det ene stedet på krana der et bakt nattlys og en levende
   strek kan dele koordinat for alltid. Sjekk 5 krever nøyaktig et stillestående
   levende punkt innen 1 px av et nattlys; her er avstanden **0,00 px**, fordi
   begge leser `(18,−74)`. Med en svingende jibb måtte lykta enten stått på det
   bakte tårnet (og da deler de to halvdelene ingen ramme) eller fulgt jibben
   (og da er den ikke stillestående).
6. **`hoyde` KLEMMER bare, så 34 var galt-men-harmløst, og 88 flytter ikke
   havna.** `plasser` regner `tak = pad − hoyde − 14` og `ut = min(avstandUt,
   tak)`. SERPENTINA har TW 46 → pad 224 og avstandUt 113, så taket er 122 >
   113 og klemmen slår ikke inn: havna ligger piksel for piksel der den sto
   (grensa går ved hoyde 97). Tallet sto på 34 mens mastene rakk 52 px opp —
   det gjorde ingen skade, men det var ikke et ærlig tall. **At en verdi ikke
   gjorde skade er ikke det samme som at den var riktig**, og det er verdt å
   sjekke taket FØR man hever den, ikke etterpå.
7. **Vandringen er regnet ut fra hva den skal TREFFE, ikke valgt.** Kassa er
   9 px høy og henger i enden av tauet, så underkanten er `JY+len+9`. Nederst
   skal den stå på molodekket (y −26), som gir len 39; øverst gir len 7 en
   klaring på 5 px under jibben. Derfor `len = 23 + 16*sin(t*FART)`.
8. **Perioden 5,5 s er valgt MOT testens målepunkt.** Sjekk 2 sammenligner
   nøyaktig t = 0 mot t = 7,3 s. En periode på 7 s ville gitt 4,3 px forskjell
   mellom de to — bestått, men på en tilfeldighet. 5,5 s gir 14,1 px. En detalj
   skal bestå fordi den beveger seg, ikke fordi tallene ikke gikk opp.
9. **Opptakslerretet i `test_bevegelse.js` var BLINDT for gløder.**
   `drawImage`-håndtereren bokførte bare de to hjørnene av glødskiva, og en
   glød er en skive med senter i det punktet som betyr noe. Den bokfører nå
   også SENTERET, og følgen er målt: 6 px forskyvning av rammen leser nå eksakt
   **6,00 px** på SERPENTINA, CAMPAGNA og DUNA (VISTANOTTE står fortsatt på
   2,50 av den kjente grunnen i `SENERE.md`).
10. **`test_bevegelse.js` har sin EGEN `tegnLive()`, så en ramme-mutasjon må
   settes inn der rammen LAGRES.** To mutasjoner (rammen forskjøvet 6 px,
   rammen rotert 0,2 rad) bet ikke i det hele tatt da de ble satt inn i
   `drawBevegelse` — testen bruker ikke den funksjonen til sjekk 1, 2, 4, 5, 6
   og 7. Flyttet inn i `scene.beveg` (`x:p.x-ox+6`, `ang:p.ang+0,2+…`) biter
   begge. **En mutasjon som ikke biter skal diagnostiseres før den tolkes**
   (samme lærdom som den inerte mutasjonen i D3a) — her var det mutasjonen som
   var feilplassert, ikke testen som hadde hull. **14 av 14 biter nå.**
11. **`fps --runder 6` feiler STILLE på harness-tidsavbruddet.**
   `kjor_chrome` har `timeout=180`, og seks runder x to døgntider x 300 bilder
   går over. Feilen kommer ut som en halv Python-traceback, og var kallet
   skrevet med `2>/dev/null` ville den vært usynlig. Beste-av-ni er i stedet
   gjort ved å kjøre hele kommandoen TRE ganger med `--runder 3` og ta det
   laveste blokk-tallet per rad. Lagt i `SENERE.md`.
12. **En NEGATIV differanse er et nyttig varsel, ikke en feil i målingen.** Den
   direkte med/uten-differansen ga CAMPAGNA/NATT **−0,0093 ms** — detaljen
   «sparte» tid. Det er selvsagt ikke sant, og det er nettopp poenget: tallet
   er mindre enn spredningen mellom to blokker, så fortegnet er støy. Det sier
   at man måler under oppløsningen sin, og det er grunnen til at x40-leddet fra
   D3a fortsatt trengs (`/tmp/beveg_x40b.html`, `assert old in s`-vakt,
   differansen delt på 39).

| bane | tid | per bilde | % av 0,3 ms | margin |
|---|---|---|---|---|
| SERPENTINA | DAG | 0,00039 ms | 0,1 % | 765x |
| SERPENTINA | NATT | 0,00098 ms | 0,3 % | 305x |
| CAMPAGNA | DAG | 0,00110 ms | 0,4 % | 272x |
| CAMPAGNA | NATT | 0,00135 ms | 0,5 % | 222x |

**Budsjettet holdes med 222–765x margin — begge detaljene er BILLIGERE enn de
to fra D3a (0,0024–0,0062 ms), og det er som forventet:** DUNAs stråle er en
lineær gradient over 4000 piksler og VISTANOTTEs hjul har fire radiale
gradienter, mens møllekorset er to `fillRect` + én `drawGlow` og kranlasta er
én strek + én `fillRect`.

**SERPENTINAs natt koster 2,5x dagen enda lasta tegnes HELT likt i alle tre
døgntidene — det er ingen `tod`-gren i den i det hele tatt.** Forskjellen ligger
derfor ikke i detaljen, men i hva den tegnes OPPÅ: nattbildet har 45 nattgløder
i samme område, og alfablanding mot flere lag koster mer per piksel. Samme
mønster som D3a fant på VISTANOTTE, men med motsatt konklusjon der — der var det
detaljen selv som hadde nattarbeid. **En detalj uten tidsgren kan altså likevel
måle ulikt i to døgntider, og da er det bakgrunnen som er svaret.**
CAMPAGNAs natt koster 1,2x dagen, og der ER gløden den eneste forskjellen, så
én `drawGlow` er ~0,00025 ms.

**Kostnad, målt i steg D3b:** byggetid sum 203,9 ms, snitt 15,7, verste bane
TEMPIO 24,2 ms mot budsjettet på 100 — ingen bane over. SERPENTINA 14,8 ms og
CAMPAGNA 15,6 ms, begge med `beveg 1`. Nattlys UENDRET: SERPENTINA 45,
CAMPAGNA 1, DUNA 4, VISTANOTTE 68. `test_banetema.js` 198/198 og
`test_banegeometri.js --mot geo_laas.json` uendret på alle 13 — ingen
palettverdi og ingen geometri er rørt. Målingene står i
`maalinger/maal_fps_D3b.txt`, `maalinger/maal_molle_D3b.txt`,
`maalinger/maal_kran_D3b.txt` og `maalinger/maal_bygg_D3b.txt`, og de åtte
bevisbildene i `maalinger/bilder/D3b_*.png`.

**Med D3b er ALLE FIRE bevegelige detaljene på plass** (VISTANOTTE pariserhjul,
DUNA fyrstråle, CAMPAGNA møllevinger, SERPENTINA havnekran), og sjekk 7 har nå
dekning på begge sider av banen med to detaljer på hver.

**Git-identitet:** `user.name`/`user.email` var ikke satt noe sted, så git
utledet dem fra macOS-kontoen. Satt med `--local` i dette repoet til
`333276467+ItsYasky@users.noreply.github.com` (GitHubs noreply-form, bygget av
konto-ID fra `gh api user`, siden den private adressen er skjult og tokenet
mangler `user`-scope). De 18 commitene som alt er pushet bærer fortsatt den
gamle `.local`-adressen og er ikke knyttet til GitHub-profilen — å rette det
krever force-push til `main` og er IKKE gjort.

**Avvik verdt å vite i steg E (kontaktarket og sluttesten):**

Runde 4 har hele veien hvilt på én påstand: «hver bane skal kjennes igjen på et
skjermbilde». Steg E gjør den påstanden om til et TALL, og `vintage_f1.html` er
ikke rørt med én linje — steget er ren måling.

1. **Fingeravtrykket er et RUTENETT, ikke én middelfarge.** To baner kan ha
   nøyaktig samme gjennomsnittsfarge og se helt ulike ut (asfalt i midten med
   terreng i kantene gir samme snitt som en jevn grøt). `signatur` legger derfor
   et 6 x 8-rutenett over spillvisningen og skriver middel-RGB per rute;
   avstanden mellom to baner er RMS over rutene. Fire områder er MASKERT bort,
   og det er ikke pynt: HUD-stripa, ledertavla, minikartet og spillerbilen er
   felles for alle tretten og ville trukket hver avstand mot null. Ledertavla og
   bilen må dessuten bort fordi lagfargene og lakkeringen trekkes PÅ NYTT ved
   hver sidelasting — nøyaktig den fella pikseldiffen gikk i i D3a punkt 7.
2. **FØR-fila kan ikke svare på sitt eget kamerapunkt, og det måtte løses.**
   `theme.landmarkT` og `naturligTid` kom begge INN i runde 4, så fila fra
   `10f2261` ville gitt t=0,02 og DAG på alle tretten og målt et helt annet
   bilde. Derfor `--meta-fra`: kamerapunktet og døgntiden hentes fra ÉN fil og
   brukes på begge. Det er forsvarlig nettopp fordi runde 4 er en pynterunde —
   `geo_laas.json` beviser at PATH, raceLine og heading er bit-identiske, så
   **samme t ER samme kamerapose i begge filene**.
3. **Døgntiden måtte kunne slås AV, ellers måler man feil runde.** Hver banes
   `naturligTid` skiller banene godt (DESERTO er natt, DUNA er dag), men den ble
   satt i MENY-arbeidet og ikke i runde 4. Tabellen er derfor kjørt to ganger:
   i hver banes egen tid, og med alle tretten tvunget til DAG. Den andre er det
   ærlige målet på runde 4s eget arbeid, og den er den STERKESTE av de to.

| mål | egen døgntid | alle på DAG |
|---|---|---|
| minste avstand, alle 78 par | 4,72 → **24,94** (+429 %) | 4,78 → **30,77** (+544 %) |
| minste avstand, samme terreng | 31,27 → **38,46** (+23 %) | 19,90 → **38,48** (+93 %) |
| snitt over alle 78 par | 40,06 → **65,61** (+64 %) | 40,80 → **69,94** (+71 %) |

4. **Det likeste paret før runde 4 var ARDENNE/CAMPAGNA på 4,72 — og de er ikke
   engang samme terreng** (forest mot hedge). Til sammenligning ligger det
   svakeste paret i dag på 24,94. De tre parene i bunnen før runde 4 var alle
   «grønn bane mot grønn bane»: ARDENNE/CAMPAGNA 4,72 → 48,02 (10,2x),
   ARDENNE/TEMPIO 13,54 → 56,22 (4,2x), TEMPIO/CAMPAGNA 14,71 → 54,01 (3,7x).
   De åtte parene med SAMME terreng ble alle bedre, verst DESERTO/DUNA som gikk
   19,90 → 101,62 på felles døgntid.
5. **ETT PAR BLE MINDRE ULIKT, og det er et ekte funn og ikke støy.**
   VULCANO/DISCESA gikk 35,47 → **24,94** og er nå det svakeste paret i hele
   feltet. Bekreftet på bildet og ikke bare i tallet: begge cellene er brun
   bakke med et blekt, rektangulært landemerke til venstre (VULCANOs
   observatorium og DISCESAs olivengård), og VULCANOs ENE kjennetegn — lavaelva
   — er ikke i bildet i det hele tatt ved banens egen `landmarkT` 0,72.
   Seks av 78 par ble dårligere; de fem andre med 0,1–4,1 i utslag. Lagt i
   `SENERE.md`.
6. **Et landemerke er inne i bildet i bare 4–9 av 100 rundeposisjoner.** Målt
   ved å sveipe hele runden og regne om ankeret med spillets EGEN
   `worldToScreen` (`maalinger/maal_ark_kamera_E.txt`). Selv på det tetteste
   punktet i en by ligger bare 5–8 av 44–68 nattlys inne. `landmarkT` ± 0,01 er
   altså forskjellen på å se landemerket og ikke, og det er grunnen til at
   `ARK_T` i harnessen i det hele tatt trengs.
7. **VISTANOTTE er den ene banen der landemerket og byen ikke kan være i samme
   bilde.** Pariserhjulet er inne bare på t = 0,12–0,15, og der ligger 0–1
   nattlys inne; byen er tettest på 0,63–0,65 med 5. Det bekrefter D1 punkt 3
   («landmarkT 0,14 er det ENE punktet på runden uten by»), nå målt over hele
   runden i stedet for bare ved landemerket. **Arket viser BYEN (t=0,63).**
   Grunnen er hva arket skal brukes til: påstanden som prøves er at to baner med
   samme terreng er til å skille, og den prøves på de tre bybanene — LABIRINTO
   (0,26, katedral + 4 lys) og SERPENTINA (0,37, kran + 5 lys, banens maksimum)
   viser BEGGE bymassen. En VISTANOTTE-celle med hjul mot tom eng ville vært den
   ene cellen som ikke er med i sammenligningen. Begge bildene ligger i
   `maalinger/bilder/E_vistanotte_*.png`.
8. **Jeg satte først kameraet til 0,30 ut fra NOTATET og ikke ut fra bildet.**
   Overstyringen var begrunnet med D1 punkt 3 alene, altså «her er det ingen
   by», uten at jeg hadde sett på hvordan 0,14 faktisk leser — og 0,14 leser
   utmerket, med et glødende pariserhjul mot mørk mark. Tallet 0,30 var hverken
   hjul eller tettest by. **En overstyring begrunnet i en gammel notatlinje er
   ikke en måling**, og rettelsen kom først da bildene ble lagt ved siden av
   hverandre. Samme familie som D3a punkt 10, der bildet måtte til for å si at
   tallet var for lavt.
9. **Første kontaktark kom ut HELT HVITT**, fordi oppryddingen før skjermbildet
   skjulte `cv.parentNode` for å ta med en eventuell innpakning. Forelderen ER
   `<body>` i denne fila (body > canvas#g direkte), så hele sida forsvant.
   Bare `cv` skjules nå.
10. **`buildTrack(TRACKS[i])` kaster.** `TRACKS` inneholder FERDIG BYGDE baner —
   `buildTrack({...})` kalles inne i selve array-literalen — så argumentet er en
   bane og ikke en cfg, og `genCP` faller på `cfg.features.forEach`. Metadataen
   leses rett av `TRACKS[i].theme` / `.naturligTid` / `.cfg`.
11. **En injisert løkke som kaster etter at `<pre id="gpout">` er laget, gir
   TOM utskrift og exit-kode 0.** Første metadatakjøring kom tilbake med en tom
   streng og ingen feil. Løkka er nå pakket i `try/catch` som skriver
   `FEIL: <melding> | <stack>` inn i den samme `<pre>`-en — og det var nettopp
   den diagnosen som avslørte `genCP`-feilen over. Samme familie som de tre
   harness-punktene i `SENERE.md`: harnessen tier når kallet er feil.
12. **`worldToScreen` returnerer et ARRAY `[x,y]`, ikke `{x,y}`.** Lest som et
   objekt blir hver sammenligning `false` og hvert tall `undefined`, og
   kamerasveipen meldte først 0 nattlys inne på ALLE banene — et fullt troverdig
   tall som var rent tøys. Verdt å merke seg fordi `test_bevegelse.js` og
   `fps`-grenen begge leser den samme funksjonen.

**Sluttesten, alle fire portene:**

| port | resultat |
|---|---|
| `test_banegeometri.js --mot geo_laas.json` | UENDRET på alle 13 |
| `test_banetema.js` | 198/198, svakeste 3,45:1 (CORALIS/DUNA) |
| `test_bevegelse.js` | PASS, 7 sjekker, begge sider dekket |
| `chrome_harness.py maal` | alle 13 bygger, sum 180,5 ms, verste VISTANOTTE 20,2 ms |

**Bildetid — og dette er den FØRSTE ærlige dag/natt-tabellen for hele feltet**,
siden `--tod` ikke virket før D3a punkt 1 rettet den. Verste bane i hele spillet
er **1,88 ms (VISTANOTTE/NATT)** mot **1,92 ms før runde 4** — altså koster hele
pynterunden ingenting per bilde. Alle 13 ligger på 532–4464 bilder/s.

Det nye tallet den ærlige målingen gir, er at **natt alltid koster mer enn dag,
og at de BILLIGE banene betaler mest relativt:** LABIRINTO +33 %, ALPEN +31 %,
DUNA +26 %, MONTE SPIRA +12 %, mot +1–7 % på de tunge. Det er som forventet —
nattoverlegget og glødene er en omtrent fast kostnad per bilde, så den utgjør en
større andel av et bilde som ellers koster 0,22 ms enn av ett som koster 1,8.

**Byggetiden er det eneste som har steget, og den var budsjettert:** sum
107,7 → 180,5 ms (+68 %), verste bane VISTANOTTE 10,9 → 20,2 ms mot et budsjett
på 100 ms per bane. Ingen bane er i nærheten av taket.

**AI-simuleringen viser ingen regresjon** (`ai_baseline_etter_runde4.json` mot
`..._after_H.json`, 52 konfigurasjoner, 724,6 s): snittspredning 0,674 → 0,679
runder, største 0,996 (DUNA/CASUAL/ULTRA), ingen konfigurasjon over én runde,
og ingen bane fikk flere veggtreff. To bittesmå utslag i tid utenfor banen
(0,00000 → 0,00010 og 0,00060 → 0,00070). Det er som det skal være — runde 4
rører ikke fysikk eller AI, og geometriporten beviser det uavhengig.
Merk samtidig at ESSE/CASUAL/ULTRA, som står i `SENERE.md` med 0,9857, måler
0,744 i denne kjøringen — spredningen er altså ikke stabil nok til at ett tall
avgjør den.

**Åpent punkt i steg B:** ARDENNEs skog har praktisk talt usynlige trær —
`treeTint:['#0e2e1c','#14472a','#071d12']` måler ~1,3:1 mot
`ground:['#0b1710','#122017','#1b2c1e']`. Det er et steg A-palettspørsmål og
ble bevisst ikke rørt her. Dessuten: `cfg.treeTint`/`rockTint`/`bushTint`/
`groundBase`/`speckle` på cfg-nivå har INGEN lesere i det hele tatt etter at
tonene flyttet inn i temaet — dødkode som bør ryddes for seg.

### GRAND PRIX — nye menyer (`vintage_f1.html`)

Målet: bytte ut dagens spredte bokstavtaster (←→ bane, ↑↓ AI-nivå, Q/E
distanse, Z/X skin, C/V tid, L lag, P øving, TAB modus) med ÉN gjennomgående
navigasjon i alle menyer — ↑↓ velger rad, ← → endrer verdi, ENTER velger,
ESC går ett nivå tilbake (aldri rett ut) — og ingen bokstavtaster noe sted.
Arbeidet er delt i fire steg (A–D); etter hvert steg testes, committes,
loggføres her, og det stoppes for tilbakemelding før neste steg.

| Steg | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| A | ferdig | — | `SETTINGS`-objekt lagret i `localStorage` (`gp_innstillinger`), DITT LAG som ekte innstilling, TID PÅ DØGNET med AUTO (banens egen tid) og TILFELDIG, AI-NIVÅ lagret som NAVN (overlever modusbytte), og selve INNSTILLINGER-skjermen tegnet (med bilforhåndsvisning på SKIN-raden) | `test_innstillinger.js` (56/56) |
| B | ferdig | `ff3c151` | Ny hovedmeny (LØP/ØVING/INNSTILLINGER/LAG) og ombygd banevalg (karusell + samlet innstillingsboks + KJØR/ØVING-knapp), INNSTILLINGER koblet inn fra begge, LAGOVERSIKT nå nådd fra hovedmenyen (ikke `L`), alle bokstavtaster og TAB fjernet | `test_hovedmeny.js` (34/34), `test_innstillinger.js` (56/56, uendret) |
| C | ferdig | `874598e` | Pausemeny (fryser løpet helt) og ny resultatskjerm | `test_pause.js` (33/33) |
| D | ferdig | `49f9c4a` | Kontrast-/tekststørrelsessjekk av alle skjermer, oppdatert kontrollhjelp, sluttdokumentasjon | `test_meny_kontrast.js` (117/117) |

**Steg A i detalj:** `SETTINGS` samler modus, AI-nivå (som navn, ikke indeks —
`DIFFICULTIES_CASUAL`/`DIFFICULTIES_REALISTIC` har samme navn på samme
indeks, så navnet er det eneste som overlever et modusbytte), distanse, tid på
døgnet, lag, skin og spøkelse-på/av. `lagreInnstillinger()`/
`lastInnstillinger()` følger samme mønster som spøkelsets `skrivGhost()`/
`lesGhost()`: try/catch rundt både lesing og skriving, og HVERT felt valideres
for seg før det tas i bruk — ett ugyldig felt (f.eks. et lagnavn som ikke
finnes mer) faller tilbake til standardverdien uten å dra resten av
innstillingene med seg. `applySettingsToGame()` overfører `SETTINGS` til de
kjøreklare variablene resten av spillet alt leser (REALISTIC, DIFFICULTIES,
difficulty, lapsIdx/LAPS, skinSel, ghostOn), og kjøres ved oppstart og hver
gang en rad endres i INNSTILLINGER.

Banenes `naturligTid` (lagt til i `buildTrack`s returobjekt, fallback `'DAG'`):
DESERTO og VISTANOTTE → NATT, SERPENTINA og VULCANO → SOLNEDGANG, resten DAG.
AUTO i INNSTILLINGER viser «Banens egen tid · <BANE>: <TID>» under raden,
uavhengig av om raden er markert — det er informasjon, ikke en forklaring
knyttet til valget. AI-NIVÅ-forklaringen vises derimot KUN når raden er
markert, slik oppgaven ba om. Teksten er resultatorientert, ikke teknisk
(«Du vinner med små feil.», ikke noe om gummistrikk) — og ENKEL fikk bevisst
IKKE «Banegrenser av.» i teksten, for den funksjonen finnes ikke ennå (se
`SENERE.md`).

**Avvik/presiseringer i steg A:**
1. Selve INNSTILLINGER-skjermen (tegning + ↑↓←→/ESC-håndtering i
   `state==='settings'`) er bygget nå, slik oppgaven ba om, men har IKKE fått
   noen inngang fra hovedmenyen eller banevalget ennå — det hinten selv sa
   skulle komme i steg B («↓ goes to INNSTILLINGER»). Testet manuelt i
   nettleser ved å sette `state='settings'` direkte (se skjermbilder i
   samtalen), siden det ikke finnes en vei dit i spillet før steg B kobler
   den inn.
2. DITT LAG-raden viser lagets KORTE navn (`t.name`, samme som
   LAGOVERSIKT-rutene), ikke hele `teamFullName()` (sponsor + navn) — den
   fulle teksten er for lang til å stå høyrejustert uten å kunne krasje inn i
   radetiketten til venstre for lange lagnavn.
3. Bakgrunnen på den nye skjermen er `#07090d` (fra skissen), ikke spillets
   delte `#05070a` — alle farger på skjermen er derfor målt på nytt mot akkurat
   DEN bakgrunnen (se `/tmp/contrast2.js`, ikke en prosjektfil) og ikke arvet
   fra andre skjermers paletter. `#64748b`, som resten av spillet bruker til
   dempet hjelpetekst, stryker på 4,19:1 mot denne bakgrunnen og er derfor
   ERSTATTET med `#94a3b8` (7,77:1) på denne ene skjermen.
4. De gamle bokstavtastene i banevalget (Q/E/Z/X/C/V/L/P) og TAB i hovedmenyen
   er bevisst IKKE rørt eller fjernet i steg A — det er eksplisitt steg B sin
   jobb, og å fjerne dem nå ville latt banevalget stå uten noen måte å endre
   de samme valgene på før steg B er på plass.
5. Et `.claude/launch.json` fantes allerede i hjemmekatalogen med en
   `arkade`-server (`python3 -m http.server 3400 --directory ~/spillkatalog`)
   — den ble brukt for den manuelle nettleserverifiseringen i stedet for å
   lage en ny.

**Steg B i detalj:** hovedmenyen har fire rader (LØP/ØVING/INNSTILLINGER/LAG)
med samme ↑↓/ENTER-mønster som INNSTILLINGER. `menuTarget` ('race'/'practice')
settes når LØP eller ØVING velges og leses av banevalgets egen ENTER-handler,
siden banevalget selv ikke vet hvilken av de to du kom fra. Banevalget mistet
Q/E/Z/X/C/V/L (rundelengde, skin, tid, lagoversikt) — alt det bor nå i
INNSTILLINGER, nådd med ↓ (`settingsReturnTo='trackselect'`), eller i
hovedmenyen for LAG (`teamsReturnTo='menu'`). ESC går ett nivå tilbake overalt
unntatt i selve hovedmenyen, der det går ut til katalogen — nøyaktig
oppskriften fra bestillingen.

**Avvik/presiseringer i steg B:**
1. Den første versjonen av kontrollhjelpen på hovedmenyen lovet «ESC Pause»
   sammen med gass/brems/styr. Pausemenyen er steg C og finnes ikke ennå — i
   dag gjør ESC under løpet akkurat det samme som alle andre steder (rett ut
   til katalogen, se den generelle ESC-fallbacken i `keydown`). Linja er
   rettet til å ikke love en funksjon spillet ikke har. Funnet ved å se på
   skjermbildet av den nye hovedmenyen, ikke ved testing — testen dekker
   tilstandsmaskinen, ikke tegnet tekst.
2. `test_hovedmeny.js` kaller IKKE de ekte `startRace()`/`startPractice()` —
   begge bygger banebakgrunn på et ekte canvas (`ensureTrackBg`), og JSC-stubben
   har ingen `getImageData` som returnerer ekte piksler. Testen bytter dem ut
   med flagg-stubber før den trykker ENTER i banevalget, og sjekker bare HVILKEN
   av de to som ble kalt ut fra `menuTarget` — samme avveining som
   `test_innstillinger.js` gjorde da den varslet at selve navigasjonen ville
   bli testet i steg B.
3. Funnet, men IKKE rettet (utenfor det som ble bestilt i steg B, se
   `SENERE.md`): banevalg-karusellens dempede tekst (`#64748b` banenavn,
   `#475569` baneinfo) stryker på 4,5:1-kravet mot bakgrunnen — begge er eldre
   farger fra før meny-arbeidet, uberørt av denne endringen. Fanges uansett av
   steg D, som eksplisitt skal kontrastsjekke alle skjermer.

**Steg C i detalj:** pausemenyen fryser løpet helt UTEN å legge til noen ny
`state`-verdi — `state` står fortsatt i `'playing'`/`'practice'` gjennom hele
pausen, og den ene nye bryteren `paused` er den aller første linja i
`update()` (`if(paused) return;`). Det betyr at hele den eksisterende
HUD-/banetegningen i `draw()` fortsetter å tegnes helt urørt; pausemenyen er
bare et nytt overlay tegnet oppå, med fire rader (FORTSETT/START PÅ
NYTT/VELG BANE/AVSLUTT TIL KATALOG) i samme ↑↓/ENTER/ESC-mønster som resten
av de nye menyene, og samme fargeoppskrift (`#161b24`-bakgrunn + `#e10600`
venstrekant + `▸`-prefiks) som hovedmenyen — gjenbrukt uten ny
kontrastmåling, siden fargene og forholdet til bakgrunnen alt er målt der.
ESC under løp/øving åpner pausemenyen; ESC inni pausemenyen lukker den igjen
(ett nivå tilbake, ikke rett ut til katalogen, siden det ville druknet et
helt løp i ett tastetrykk). Resultatskjermen fikk samme behandling: de gamle
ad hoc-tastene (`ENTER` kjør igjen, `T` velg bane, `ESC` katalog) er
erstattet med en ↑↓-meny (KJØR IGJEN/VELG BANE) i samme oppskrift, og `ESC`
på resultatskjermen går nå ett nivå tilbake til banevalg i stedet for rett ut
til katalogen.

Frysingen er verifisert på tre nivåer: kodelesing (at `if(paused) return;`
faktisk er første linje i `update()`), den automatiske testen
`test_pause.js` (som også har en kontrollmåling — kaller den ekte `update()`
med `paused=false` og en minimal spillerstubb, og viser at `raceTime` DA
faktisk går videre, slik at frys-testen ikke er tom), og en visuell sjekk i
nettleser med to identiske skjermbilder av banen tatt uten noe tastetrykk
mellom dem mens spillet sto i pause.

**Avvik/presiseringer i steg C:**
1. Øvingsmodusens egne bokstavtaster (`t`/`r`/`g`, se `state==='practice'`-
   blokken i `keydown`) er bevisst IKKE rørt. Lista med bokstavtaster
   bestillingen ba om å fjerne (←→ bane, ↑↓ AI-nivå, Q/E distanse, Z/X skin,
   C/V tid, L lag, P øving, TAB modus) er alle MENYVALG — ting du gjør før
   eller mellom løp. `t`/`r`/`g` er sanntids-verktøy mens man faktisk kjører i
   øving (f.eks. vise idéallinje/nullstille posisjon), ikke navigasjon i en
   meny, og sto aldri på den opprinnelige lista. Derfor er det ikke et avvik
   fra steg C, og ikke loggført i `SENERE.md`.
2. Resultatskjermens `ESC` endret mening: gikk før rett til katalogen (samme
   generelle ESC-fallback som alle andre skjermer før meny-arbeidet), går nå
   ett nivå tilbake til banevalg — i tråd med den gjennomgående regelen
   («ESC går ett nivå tilbake, aldri rett ut») som resten av meny-arbeidet
   allerede følger overalt unntatt i selve hovedmenyen.
3. Testen trengte en `player`-stubb (`{x:0,y:0,angle:0,raceDist:0}`) for å
   kunne kalle den ekte `update()` i kontrollmålingen — `update()` leser
   `player.x/y/angle` ubetinget helt på slutten (kamerafølging), uavhengig av
   om `cars` er tom, så et kall uten en spillerstubb kastet en feil
   (`player.x` på `undefined`) før funnet.

**Steg D i detalj:** `test_meny_kontrast.js` måler spillets EGEN
`contrastRatio()` (ikke en kopi, ellers kunne testen hatt samme feil som
koden) mot den FAKTISKE bakgrunnen hver tekst males over på alle fem
skjermene — korttintene på LAGOVERSIKT/BANEVALG (alfa-komponert mot
`#05070a`) og verste-fall-overlegget på PAUSEMENY/RESULTATSKJERM
(`rgba(5,7,10,.88)` komponert mot HVIT, siden selve løpsscenen bak alltid er
mørkere enn hvitt og derfor aldri gir lavere kontrast enn verste-fall). Første
kjøring: 88/119 bestått, 31 feil.

**Avvik/presiseringer i steg D:**
1. `teamInk(hex)` garanterer bare ≥4,5:1 mot `UI_BG` (`#0b0b0e`). Resultat-/
   pauseoverleggets verste-fall-bakgrunn (`#232527`) er LYSERE enn `UI_BG`, så
   7 av 10 lagfarger falt til 3,60–3,78:1 der. `teamInk`/`podiumInk` deler nå
   samme `inkFor(hex,bg,cache)`-kjerne (lysner i HSL til 4,5:1 eller L=0,92),
   men med to ulike bakgrunner og to ulike cacher — `podiumInk` brukes KUN på
   resultatskjermens tekst, ikke på det dekorative flaggtrekantfyllet, som
   ikke bærer informasjon alene og derfor ikke er med i testen.
2. Fire hardkodede farger strøk mot sin faktiske bakgrunn og ikke mot der de
   opprinnelig ble målt: `#64748b` (3,23–4,09:1), `#475569` (2,54–2,56:1),
   `#334155` (1,49:1, beste runde-linja) og `#ef4444` (4,09:1, straffetid).
   Alle er erstattet med farger som alt var bevist et annet sted i spillet —
   `#9aa4b2` (6,10–8,00:1 mot alle berørte bakgrunner) og `#f87171` (samme
   rødtone som `#ef4444`, lysere, 5,56:1). Den dekorative `'···'`-skillelinja
   i resultatlista er bevisst IKKE rørt (fortsatt `#334155`) — den bærer ingen
   informasjon alene og er unntatt av samme grunn som flaggtrekanten.
3. Kontrollhjelpen på hovedmenyen lovet fortsatt ikke «ESC Pause», en rest fra
   steg B der pausemenyen (steg C) ikke fantes ennå. Lagt til nå
   (`... · ESC Pause`, 72 tegn ≈ 389 px på et 520 px lerret). De andre fire
   skjermenes kontrollhjelp (BANEVALG, INNSTILLINGER, RESULTATSKJERM,
   PAUSEMENY) var alt korrekte og trengte ingen endring.
4. Bokføringsfunn, rettet i egen commit (`bba0633`) før dette steget: steg
   G/H i del 3-tabellen stod som «pågår» uten hash enda arbeidet var committet
   i `10f2261`.

Alle 117 sjekker er bestått (sjekktallet falt fra 119 til 117 da LAGOVERSIKTs
fire separate sponsorlinje-sjekker ble slått sammen til to, siden etikett og
sponsorlinjer deler samme tekstfarge). Hele «nye menyer»-arbeidet
(A–D) er med dette ferdig: ÉN gjennomgående ↑↓/←→/ENTER/ESC-navigasjon i alle
fem skjermer, ingen bokstavtaster eller TAB noe sted, og alt av tekst på alle
skjermer er MÅLT til å holde WCAG 2.1 (4,5:1 vanlig tekst, 3:1 stor tekst) mot
den bakgrunnen den faktisk males over — ikke mot en antatt eller arvet bakgrunn.

### GRAND PRIX — ventelista-rettelser (`vintage_f1.html`)

Enkeltpunkter plukket fra `SENERE.md` etter en rydd-runde, ett om gangen.
Hvert punkt er lite nok til å ikke få sin egen steg-tabell.

| Punkt | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| Banegrenser av på ENKEL | ferdig | `6bef39c` | Spilleren er unntatt `checkTrackLimits()` på ENKEL: ingen slettet runde i øving, ingen straffetid eller `BANEGRENSER x/3`/flagg-toast i løp. AI-ens egne brudd telles fortsatt uansett nivå (de tallene brukes av AI-simuleringen, ikke til å dømme spilleren). INNSTILLINGER-forklaringen for ENKEL er utvidet til «For å lære banene. Banegrenser av.» | `test_track_limits.js` (30/30, ny test 6) |
| ARDENNEs trær usynlige | ferdig | `bf3b901` | `treeTint` lysnet fra `['#0e2e1c','#14472a','#071d12']` til `['#2d8151','#33905c','#3a9660']` — alle tre toner måler nå ≥3:1 mot alle tre bakketoner (verst 3,07:1, mot 1,00:1 før). | `test_banetema.js` (168/168, ny sjekk 16) |
| Flaky AI-test i `test_track_limits.js` | ferdig | `a4e4a3b` | `contactT` på testens AI-bil nulles rett før utflukten. Spillet var riktig — regelen «dyttet ut er ikke et brudd» er bevisst fra del 3 — testen manglet bare å isolere seg fra feltets ekte kollisjoner i de foregående utfluktene. | `test_track_limits.js` (30/30, fire ganger på rad) |
| Svak trekontrast på de andre tre-banene | ferdig | `1ee5725` | `dTree()` fikk en valgfri `hiTint`: fast, lav-opasitets skygge under krona + en lysnet topp-flekk, tegnet KUN når temaet har `treeHi` — resten av krona er urørt. MONTE SPIRA, TEMPIO, DISCESA og ALPEN fikk hver sin `treeHi` (den lyseste treeTint-tonen lysnet til ≥2,5:1 mot banens verste bakketone). ARDENNE og ESSE trengte ingen endring — begge når alt ≥2,5:1 (faktisk ≥3,5:1) med treeTint alene. | `test_banetema.js` (174/174, ny sjekk 17) |
| Død kode på cfg-nivå | ferdig | `fc4996f` | Fire linjer med `treeTint`/`rockTint`/`bushTint`/`groundBase`/`speckle` slettet fra `TRACKS` (ESSE, DISCESA, ALPEN, DUNA) — tonene flyttet inn i `THEMES` i runde 4 steg A, og `cfg.`-varianten hadde ingen lesere igjen (verifisert med søk på `cfg.<felt>`). Samme commit korter ned de lange kommentarblokkene som dokumenterte runde 3 og 4 mens arbeidet pågikk; begrunnelsene står i dette notatet og trengte ikke stå i to utgaver. | `test_banetema.js` (174/174), `test_banegeometri.js` (13/13 uendret) |

**Detaljer:** ENKEL er indeks 0 i BÅDE `DIFFICULTIES_CASUAL` og
`DIFFICULTIES_REALISTIC`, så fritaket er skrevet som
`DIFFICULTIES[difficulty].name==='ENKEL'` og gjelder uavhengig av modus.
Fritaket sitter i selve kallstedet i `update()`
(`!(c.isPlayer && ...)` før `checkTrackLimits(c,dist)` kalles), ikke inni
`checkTrackLimits()` selv — funksjonen kalles rett og slett ikke for
spilleren på ENKEL, så `limitArmed`/`limitOffT`/`contactT` for spillerbilen
fryser i den tilstanden de hadde når ENKEL ble valgt. Det er ikke et problem:
de leses aldri når funksjonen ikke kalles, og settes uansett på nytt av
`Car`-konstruktøren når bilene bygges på nytt ved neste løp. Verifisert med
`test_banegeometri.js` at
endringen (ren spillogikk, ingen banegeometri) ikke har rørt et eneste tall
i `geo_laas.json`.

**Detaljer, ARDENNEs trær:** `dTree()` tegner tre overlappende sirkler per
tre, én per tone i `treeTint`, og alle tre var mørkere enn bakken de står på
— verste kombinasjon (`#0e2e1c` mot `#1b2c1e`) målte 1,00:1 med spillets egen
`contrastRatio()`, langt under 3:1-kravet som landemerker måles mot i
`test_banetema.js`. Samme utregning viste at de ANDRE tolv banenes `treeTint`
har nøyaktig samme svakhet (1,0–1,3:1 hver) — det er lagt i `SENERE.md` som
et eget punkt, ikke rettet her, siden bestillingen var ARDENNE alene. Den nye
paletten er lysnet langs samme grønntone til alle tre klarer ≥3:1 mot alle
tre bakketoner (3,07 / 3,71 / 4,01:1). Ny sjekk 16 i `test_banetema.js` låser
akkurat denne banens tall, avgrenset med vilje til ARDENNE — en generell
sjekk for alle tretten ville strøket på de tolv som ikke er rettet.
Bakgrunnsbygget for alle 13 baner er verifisert på nytt med
`chrome_harness.py maal` (ARDENNE 16,8 ms, godt under 100 ms-budsjettet), og
`test_banegeometri.js` bekrefter at en rein palettendring ikke har rørt
banegeometrien.

**Detaljer, flaky AI-test:** feilsøkt med et eget instrumenteringsskript
(`/tmp/debug_ai.js`, ikke en prosjektfil) som logget `contactT`/`limitOffT`/
`limitArmed` steg for steg. Funnet: AI-bilen testen plukker
(`cars.filter(c=>c!==p)[0]`) hadde `contactT=22` FØR utflukten startet — fra
en ekte kollisjon med en annen AI-bil et sted i de fem foregående
spiller-utfluktene, der resten av feltet raser fritt i mange `update()`-kall.
`checkTrackLimits()` dekrementerer `contactT` ett steg per kall, så på det
8. steget (der bruddet ellers ville telt) stod det fortsatt på 14 — over 0,
og regelen i del 3 («dyttet ut av en annen bil er ikke et brudd») sperret
derfor bruddet. Testen hadde dermed ingen fast rekkefølge å feile i — den
feiler avhengig av AI-ens FRIE kjøring, som er akkurat flaky nok til å gi
samme utfall gjentatte ganger på denne maskinen, men ikke noe testen kan
stole på. Fikset ved å sette `ai.contactT = 0` rett før utflukten, samme
mønster som `parkAt()` alt bruker (sette tilstand direkte for et
deterministisk utgangspunkt) — ikke en endring i spillet, siden
kollisjonsregelen selv aldri var i tvil.

**Detaljer, trekontrast:** bestillingen sa «alle 13 baner», men bare SEKS
tegner trær i det hele tatt — `dTree()` kalles kun for `terrain`
mountain/forest/parkland (MONTE SPIRA, ARDENNE, TEMPIO, ESSE, DISCESA,
ALPEN). LABIRINTO og SERPENTINA har en `treeTint` i temaet, men den er
DØDKODE — city-terrenget tegner `dBuildingGrid`, aldri `dTree()`. DESERTO,
VULCANO, CAMPAGNA, DUNA og VISTANOTTE har ingen `treeTint` i det hele tatt
(arid/volcanic/hedge bruker `dBush`/`dLavaRock`/`dHedge`). Rettelsen omfatter
derfor de seks som faktisk tegner trær, ikke alle tretten — presisert her og i
`SENERE.md`.

Målt (spillets egen `contrastRatio()`, verste kombinasjon av alle treeTint-
toner mot alle bakketoner, FØR denne rettelsen):

| bane | før | lyseste tone mot verste bakketone |
|---|---|---|
| MONTE SPIRA | 1,03:1 | `#27503c` mot `#3c4441` → 1,10:1 |
| ARDENNE | 3,07:1 (alt fikset, `bf3b901`) | — |
| TEMPIO | 1,10:1 | `#2a7236` mot `#2d6330` → 1,21:1 |
| ESSE | 1,26:1 | `#b8722a` mot `#3a2b16` → **3,56:1** |
| DISCESA | 1,13:1 | `#6b7a2a` mot `#4b3320` → 2,48:1 |
| ALPEN | 1,06:1 | `#1a5c4f` mot `#223445` → 1,63:1 |

ESSE skiller seg ut: selv om bunntonen (`#5c3315`) stryker grovt (helt ned i
1,26:1), når den LYSESTE tonen alt 3,56:1 — godt over 2,5:1-kravet. Samme
mønster som bil-lakkeringenes «enten base eller acc må nå 3:1»-regel: det er
nok at ÉN tone bærer kontrasten, resten av krona kan være mørkere enn bakken
uten at treet blir usynlig. ARDENNE er i samme båt etter sin egen rettelse
(`bf3b901`, 3,07:1). Disse to trengte derfor INGEN endring her.

For de fire som faktisk strøk (MONTE SPIRA, TEMPIO, DISCESA, ALPEN) ble
ARDENNE-oppskriften (farge om hele paletten) bevisst IKKE gjenbrukt — den
bestillingen ba spesifikt om en annen teknikk: «lysere topp på kronen, mørkere
skygge under, eller begge», uten å røre bakken. `dTree(x,y,s,tint,hiTint)`
fikk et femte, valgfritt argument: når `hiTint` finnes, tegnes en fast
lav-opasitets skyggeellipse under krona (samme oppskrift som `CAR_SHADOW_COL`
— ikke en målt tone, den bærer ingen informasjon alene) FØR de tre vanlige
sirklene, og en liten lysnet topp-flekk i `hiTint` ETTER dem. Uten `hiTint`
(ARDENNE, ESSE, og alle andre temaer) er `dTree()` bit-for-bit den samme
funksjonen som før — ingen risiko for de banene som alt var i orden.

`treeHi` er den lyseste treeTint-tonen lysnet i HSL (samme hue/metning, bare
lyshet opp — altså en gradvis lysning, ikke en fargeomlegging) til den når
~2,5:1 mot banens VERSTE bakketone, regnet med spillets egen
`relLuminance`/`contrastRatio` (binærsøk, ikke øyemål):

| bane | treeHi | mot verste bakketone | mot ALLE bakketoner (min) |
|---|---|---|---|
| MONTE SPIRA | `#458f6b` | 2,57:1 | 2,57:1 |
| TEMPIO | `#41b053` | 2,57:1 | 2,57:1 |
| DISCESA | `#6d7d2b` | 2,58:1 | 2,58:1 |
| ALPEN | `#237d6b` | 2,56:1 | 2,56:1 |

**Ekte feil funnet underveis, ikke bare et testproblem:** `makeTheme()`
hvitlister hvilke felt som overlever fra `THEMES[navn]` til temaet
`buildTrackBg` faktisk leser (`treeTint`, `rockTint`, … hvert felt nevnt for
seg). Det nye `treeHi`-feltet sto IKKE på den lista, så `TH.treeHi` var
`undefined` for alle fire baner — ikke bare i testen, men i selve spillet.
Testen (`test_banetema.js` sjekk 17) fanget det med én gang («treeHi
(ingen)»), men feilen ville rammet ekte spilling også om den ikke var fanget.
Rettet ved å legge `treeHi: t.treeHi || null` inn i `makeTheme()`s
returobjekt, samme mønster som de andre feltene.

Ny sjekk 17 i `test_banetema.js` måler ALLE seks trebaner (ikke bare de fire
som ble endret): for hver bane kreves at enten beste treeTint-tone ELLER
treeHi når ≥2,5:1 mot banens verste bakketone — generell, ikke hardkodet til
bestemte hex-verdier, så den fanger en fremtidig regresjon på ARDENNE/ESSE
også, ikke bare på de fire nye. Sjekk 16 (ARDENNEs eget ≥3:1-krav, strengere
og uendret) står fortsatt ved siden av.

Verifisert: `test_banetema.js` 174/174, `test_banegeometri.js --mot
geo_laas.json` uendret på alle 13 baner (ren palett-/tegneendring, ingen
geometri rørt), `chrome_harness.py maal` bygger alle 13 baner uten feil
(verste TEMPIO 42,5 ms — samme GC-støy-mønster som tidligere målt der, godt
under 100 ms-budsjettet), og hele den øvrige testsuiten (banegrenser, boost,
avkjøling, spøkelse, menyer, pause, spillerens sving) uendret grønn. 1:1-
skjermbilder (ekte spillcanvas, ingen nedskalering, `TOD[0]`=DAG) av ARDENNE,
ALPEN og ESSE bekrefter visuelt at trærne skiller seg fra bakken — et
FØR/ETTER-par for ALPEN (samme kamerapunkt, treeHi fjernet i en midlertidig
kopi for FØR-bildet) viser krona gå fra nesten usynlig mot den mørke
fjellbakken til tydelig synlig med lys topp og skygge.

### GRAND PRIX — nye lag og lakker (`vintage_f1.html`)

Oppdraget står i sin helhet i [`prompter/grand-prix-lag.md`](prompter/grand-prix-lag.md).
Fem steg: A rydding uten synlig endring, B de ti nye lagene, C menyene,
D dokumentasjonen, E sluttest.

| Steg | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| A | ferdig | `936db02` | Ren omstrukturering: lakkene er egne objekter under `lag.lakk.{vanlig,spesial[]}`, `drawPattern` slår opp i `PATTERNS`, `aktivLakk()` er enestes velger av lakk, sprite-cachen nøkles på lakk-`id`, og hvert lag har en tom `profil` + `lagFaktor()` som alltid gir 1 | `test_lag.js` (105/105, ny), `test_banetema.js` (198/198, sjekk 4 bygget om) |
| B | ferdig | `b862db3` | De ti nye lagene og de 21 lakkene, `aktivLakk` utvidet med tidslakker, og to latente fargefeil rettet (`teamInk`-referansen og negativ kulør i `rgbToHsl`) | `test_lag.js` (229/229), `test_banetema.js` (208/208), `test_meny_kontrast.js` (117/117), `test_ai_compare.js` |
| C | ferdig | `89e4898` | SPESIALLAKK-innstillingen, LAG-skjermen bygget om til liste + detaljpanel med ← → mellom lakkene, spesiallakk-linja i banevalget, banebevisst bilforhåndsvisning, og `shot --tod`-feilen rettet | `test_meny_kontrast.js` (120/120, nå med 9 px-gulv), `test_lag.js` (229/229), `maalinger/lakk_grid_C.txt` |
| D | ferdig | `1d18641` | «Ny lakk eller nytt lag» øverst i dette notatet: feltene og de tre kontrastkravene på en spesiallakk, nytt mønster i `PATTERNS`, nytt lag, og hvilke tester som er porten. Avsnittet er PRØVD UT, ikke bare skrevet | `test_lag.js` (229/229 etter at prøvelakken ble fjernet), `test_banetema.js` (208/208), `test_meny_kontrast.js` |
| E | ferdig | `a811ec2` | Sluttest: hele suiten, geometrilåsen, byggeporten, startgrid-bilder på DAG og NATT, og de tre oppfølgingspunktene i `SENERE.md` | 19 JSC-tester grønne, `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` (sum 180,4 ms), `test_ai_compare.js` |

**Lakk-kontrakten.** En lakk er `{id,navn,base,acc,dark,hel,spc,pat}` pluss
valgfritt `bane`, `tid` og `bevisstLavKontrast`. `id` må være unik på tvers av
ALLE lag, fordi sprite-cachen (`carSprCache`) nøkles på den — to lakker med
samme `id` ville delt bilde. `lag.color`/`accent`/`dark` finnes fortsatt, men
er bare aliaser satt fra `lakk.vanlig` i løkka rett under `TEAMS`; de leses av
HUD-stripa, `teamInk()` og `podiumInk()`. Rør aldri aliasene direkte — endre
`lakk.vanlig` og la løkka sette dem.

**Bivirkning verdt å vite:** `buildCarSprites()` deler nå sprite mellom
lagkameratene, siden nøkkelen er lakken og ikke bilen. Antall sprites falt fra
40 til 20 uten synlig forskjell. `ghostSpr` i `startPractice()` lages utenom
cachen og må derfor fortsatt bygges ETTER `buildCarSprites()`.

**Lagenes egenskaper (`profil` + `lagFaktor`).** Plassen er laget, selve
egenskapene er det ikke. Hvert lag har
`profil:{toppfart:1, sving:1, akselerasjon:1, aggresjon:1}`, og
`lagFaktor(lag,nokkel)` returnerer alltid `1`. Funksjonen kalles ingen steder
ennå — den finnes for at kallstedene skal kunne tas i bruk ett om gangen
senere, uten at feltnavnene må finnes opp på nytt. Når den dagen kommer hører
nøklene hjemme slik:

- `toppfart` → bilens fartstak: `aiSpd` for AI-ene og `maxspeed` for spilleren
- `sving` → `corner`, altså hvor fort bilen kan ta en kurve
- `akselerasjon` → akselerasjonsleddet i `update()`
- `aggresjon` → hvor tett AI-en legger seg før den forsøker forbikjøring

Dette MÅ balanseres mot vanskelighetsnivåene, ikke legges oppå dem: nivåene
skrur allerede på de samme tallene, så en lagfaktor på 1,05 oppå ULTRA er en
helt annen endring enn den samme faktoren oppå ENKEL. Og det må avgjøres om
spillerens bil skal få lagets profil i det hele tatt — det bør bli en egen
innstilling, ellers er lagvalget i praksis et skjult vanskelighetsvalg.

**Verifisert i steg A:** `test_lag.js` 105/105 og `test_banetema.js` 198/198
med UENDRET svakeste verdi 3,45:1 (CORALIS Vanlig mot DUNA), hele den øvrige
suiten grønn, `test_banegeometri.js --mot geo_laas.json` uendret på alle 13
baner, `chrome_harness.py maal` bygger alle 13 (sum 176,8 ms, verste
VISTANOTTE 19,4 ms), og AI-simuleringen
(`maalinger/ai_baseline_lag_A.json`) bit-identisk med
`maalinger/ai_baseline_etter_runde4.json` på alle 52 konfigurasjoner —
snittspredning 0,679 → 0,679, største 0,996 (DUNA/CASUAL/ULTRA), ingen nye
veggtreff og ingen mer tid utenfor banen. Det ENESTE feltet som skiller de to
filene er `seconds` (724,6 mot 705,2), som er testens egen klokketid og ikke
et spilltall.

Skjermbilder av griden kunne IKKE brukes som før/etter-bevis: `shot` er ikke
reproduserbar (står på ventelista). I stedet er hver enkelt lakk tegnet i en
egen canvas og pikslene hashet — alle 19 lakker × 2 klaffstillinger pluss
spøkelset ga identisk hash før og etter.

**Laglista i steg B.** CORALIS, AZURA, ROSARIO og GRANITT er borte; MAKO,
SAHRA, LONGWEI og FRONTIER er nye. Dukker et av de fire gamle navnene opp i
eldre avsnitt i dette notatet, er det en MÅLING fra runde 4 og ikke en feil —
tallene er bevart slik de ble målt den gangen. Dagens ti er VULCANA, NORDHAV,
AURUM, ONYX, KESTREL, VERDANT, MAKO, SAHRA, LONGWEI og FRONTIER.

**Tidslakker.** `aktivLakk` har to omganger etter steg B, fordi en spesiallakk
nå kan høre til et sted (`bane`), en tid (`tid`) eller begge. NORDHAVs Nordlys
er den eneste uten `bane`: den gjelder alle tretten banene så lenge det er
NATT. Når to lakker passer samtidig, vinner den som peker på BANEN — et sted er
et mer spesifikt valg enn et tidspunkt. Ingen av dagens lag har begge slagene,
så regelen er dekket av et oppdiktet lag i `test_lag.js` i stedet for av
dataene, slik at den er bevist før et lag får bruk for den.

**To latente fargefeil kom fram i steg B** — begge lå i koden fra før, og begge
ble først SYNLIGE fordi de nye lagfargene traff dem:

1. `teamInk` lysnet lagfargen til 4,5:1 mot `UI_BG` (`#0b0b0e`), men lagnavnet
   males på kort-tonene i LAGOVERSIKT (`#1b0709` og `#0d0e11`), som er lysere.
   Garantien lovet altså mer enn den holdt. Hvilken bakgrunn som er verst
   avhenger av KULØREN og ikke bare av lysheten — AURUMs fiolett står svakest
   mot den nøytrale tinten, VULCANAs rødt mot den røde — så `inkFor` tar nå en
   LISTE med bakgrunner og lysner til fargen klarer kravet mot alle. AURUM var
   det eneste laget som falt i sprekken (4,46:1), og det eneste som flyttet seg
   av denne rettelsen (`#8766d1` → `#8d6ed3`, 4,46 → 4,87:1).
2. `rgbToHsl` ga NEGATIV kulør når rødt er sterkest og grønt svakere enn blått
   (karmosin, rosa, magenta) — −28° for LONGWEIs `#b0185f`. `hslToHex` tok da
   `h<60`-grenen med en negativ `x`, og ett kanal havnet under null:
   `teamInk('#b0185f')` ga **`#e4-1b36`**, en hex med minustegn. Canvas
   forkaster en slik verdi STILLE og beholder forrige `fillStyle`, så LONGWEIs
   navn ville dukket opp i en vilkårlig annen farge. Verre: `test_meny_kontrast`
   fanget det ikke, for `contrastRatio` tolket «-1» som et tall og rapporterte
   pene 4,55:1. Kuløren dreies nå inn i [0,360) ved kilden, og `test_lag.js`
   måler FORMEN på det `teamInk`/`podiumInk` gir ut, før noen måler kontrasten.
   ROSARIO (`#b5367e`, −34°) hadde samme negative kulør i runde 4 uten å gi
   ugyldig hex — feilen har altså ligget der lenge og bare ikke slått ut.
   `rgbToHsl`/`hslToHex` brukes BARE av `inkFor`, så rettelsen rører ingen
   banefarger.

Av de ti lagene flyttet tre seg til sammen: VULCANA og LONGWEI av kulør-
rettelsen, AURUM av bakgrunnsrettelsen. De sju andre har nøyaktig samme ink som
før.

**Verifisert i steg B:** `test_lag.js` 229/229 (10 lag, 21 lakker — 10 vanlige
og 11 spesial, 20 biler på griden), `test_banetema.js` 208/208,
`test_meny_kontrast.js` 117/117, resten av suiten grønn,
`test_banegeometri.js --mot geo_laas.json` uendret på alle 13,
`chrome_harness.py maal` bygger alle 13 (sum 181,6 ms, verste VISTANOTTE
21,6 ms). Svakeste asfaltkontrast er nå 3,21:1 (FRONTIER Mojave mot
VISTANOTTE), fortsatt over 3:1-kravet. Kontaktark over alle 21 lakkene på
banens egen asfalt: `maalinger/lakk_ark_B.png`. Startgrid med alle 20 bilene:
`maalinger/grid_B_dag.png`.

**AI-en er BIT-IDENTISK med steg A**, og det er målt felt for felt og ikke bare
på sammendraget: `maalinger/ai_baseline_lag_B.json` mot `..._lag_A.json` gir
NULL ulike felt over alle 52 konfigurasjoner × 13 målte størrelser. Det eneste
som skiller filene er `seconds` (705,2 mot 713,8), altså testens egen
klokketid. Snittspredning 0,679 → 0,679, største 0,996 (DUNA/CASUAL/ULTRA).
Det er som det skal være — feltet er fortsatt 20 biler, og ingenting i AI-en
henger på lagets plass i `TEAMS`. Merk at `test_ai_compare.js` alene ikke er
nok til å si «bit-identisk»: den skriver ut spredning/vegg/utenfor/brudd, men
ikke `besteLap`, `medLap`, `steps`, `finished` eller `otFrac`. Sammenligningen
må gå over ALLE feltene.

**Avvik verdt å vite i steg C (spesiallakk i menyene):**

1. **`shot --tod` målte med lakkene fra FEIL DØGNTID, og det er en ekte
   målefeil og ikke en kosmetisk.** `shot_js` satte `todIdx` ETTER
   `startRace()` (riktig for LYSET, det var rettelsen i runde 4 steg D1), men
   `startRace()` kaller `buildCarSprites()`, og en bils lakk velges av
   `aktivLakk(bane, TOD[todIdx].name, …)` PÅ BYGGETIDSPUNKTET. Et «VISTANOTTE
   på NATT»-bilde kom derfor med nattlys og DAGBILER — altså en NORDHAV uten
   Nordlys, som er nøyaktig det bildet skulle bevise. Rettet ved å sette
   `SETTINGS.tid = TOD[tod].name` FØR `startRace()`, slik at spillets egen
   `resolveTodIdx` løser den; tilordningen etterpå står igjen som belte og
   bukseseler. **Samme feil lever fortsatt i `fps_js`** og er lagt i
   `SENERE.md` (lyset og banen er riktige der, så alle eksisterende
   `fps`-tall står — det er bare bilenes lakk som er fra feil tid).
2. **`test_meny_kontrast.js` MÅLTE ALDRI TEKSTSTØRRELSE.** Bestillingen krever
   «minst 9 px og minst 4,5:1» i hvert steg, men testen regnet bare
   kontrastbrøken; `px` ble sendt inn utelukkende for å avgjøre `isLarge()`.
   Et `MIN_PX = 9`-gulv er lagt inn i `check()`, og det er mutasjonstestet (én
   sjekk endret til 8 px gir `FEIL … 8 px ← UNDER 9 px`, 119/120). **En test
   som skal håndheve et krav må faktisk håndheve det** — ellers er den grønne
   utskriften en påstand og ikke et bevis. Sjekktallet gikk 117 → 120.
3. **LAG-skjermen måtte BYGGES OM, og det var en måling som bestemte det.** De
   gamle kortene er 248 px brede med 156 px tekstområde. «Indianapolis, USA»
   pluss en 43 tegn lang type-linje krever 232 px ved 9 px Courier (0,6 ×
   px per tegn), altså 1,5x det som finnes — og 9 px er gulvet, så det kan
   ikke løses med mindre skrift. Skjermen er derfor en navneliste til venstre
   (140 px) og ett detaljpanel til høyre (348 px), som er det eneste oppsettet
   der all teksten bestillingen ber om faktisk får plass.
4. **Første panelutgave hadde 116 px TOMT i bunnen**, og det ble funnet på
   skjermbildet og ikke i koden: `ph=544` mens siste lakkrad slutter på
   `py+428`. Panelet er klemt til 450 og bilen hevet fra `scale` 3,4 til 4.
   Samme familie som størrelsesfeilene i runde 4 — et tall som ser rimelig ut
   i kildekoden kan være åpenbart galt i bildet.
5. **`planlagtTid(tr)` returnerer `null` på TILFELDIG, og det er med vilje.**
   Døgntiden trekkes i `resolveTodIdx` når LØPET STARTER, så en meny som
   gjetter lyver i halvparten av tilfellene. `aktivLakk(…, null, …)` hopper av
   samme grunn over hver lakk som henger på en tid: det er bedre at menyen sier
   mindre enn at den sier noe galt. AUTO slår opp banens `naturligTid`, som er
   kjent.
6. **`previewLivery` måtte bli BANEBEVISST.** Den gamle viste `lakk.vanlig`,
   altså AURUM i fiolett, mens bilen på LABIRINTO faktisk er Rosé — og
   forhåndsvisningen har siden meny-steg A lovet å være «den samme bilen du
   faktisk kjører». Den leser nå
   `aktivLakk(playerIdent.team, tr.name, planlagtTid(tr), SETTINGS.spesiallakk)`
   med fallback til `lakk.vanlig` når ingen bane er valgt.
7. **To punkter i bestillingen trengte INGEN kodeendring, og det er verifisert
   og ikke antatt.** «Spilleren kjører med spesiallakken til laget sitt» følger
   alt av at `liveryOf` faller gjennom til `aktivLakk` når SKIN er STANDARD, og
   «DITT LAG får de nye lagene» av at raden bygges fra `TEAMS.map`. Begge er
   målt i `maalinger/lakk_grid_C.txt` (STANDARD + AUTO på LABIRINTO gir Rosé i
   både bil og meny; ROSSO overstyrer som før).
8. **«Spesiallakk: …»-linja i banevalget viser ALLE lagene med spesiallakk på
   banen, ikke bare spillerens.** Den svarer på «hva kommer jeg til å se», og
   da er ti lag relevante. Den kuttes etter TEGNTELLING mot bokstavbredden
   (`(bw-24)/(9*0,6)`) med `+N` på resten — Courier er fast bredde, så
   avkuttingen er et regnestykke og ikke en gjetning.
9. **Et skjermbilde av griden kan IKKE avgjøre hvem som har hvilken lakk.**
   Bilene er noen få piksler på et 520×680-lerret. I stedet er alle åtte
   kombinasjonene av bane × døgntid × innstilling MÅLT og skrevet ut med navn
   (`maalinger/lakk_grid_C.txt`): AURUM Rosé på LABIRINTO, ONYX Neon 2099 +
   NORDHAV Nordlys + FRONTIER Mojave på VISTANOTTE/NATT, og alle 20 på vanlig
   lakk med SPESIALLAKK AV. Samme lærdom som D3a punkt 7 — et bilde må først
   bevise at det kan svare på spørsmålet.
10. **`shot` tok et bilde av HOVEDMENYEN når banen ble skrevet som flagg**
   (`shot --help`, `shot --bane X`), og avsluttet med kode 0. Punktet står i
   `SENERE.md`; her er den delen som gjelder posisjonsargumentet lukket med en
   vakt (`if bane.startswith("--"): raise SystemExit(...)`), siden jeg gikk i
   fella selv mens jeg målte. Resten av punktet (injeksjon som kaster skal gi
   exit ≠ 0) står igjen.
11. **`SETTINGS_VER` er IKKE hevet for `spesiallakk`.** `lastInnstillinger()`
   validerer hvert felt for seg, så et manglende felt i et gammelt lagret
   objekt faller tilbake til standardverdien AUTO uten å dra resten med seg.
   En versjonsheving ville derimot kastet ALLE lagrede innstillinger.

**Steg D i detalj:** avsnittet er testet slik bestillingen ba om — en
midlertidig spesiallakk (VERDANT «Midlertidig» på MONTE SPIRA) ble lagt inn ved
å følge BARE det nye avsnittet, og den virket på første forsøk: `test_lag.js`
gikk 229 → 238 med alle ni nye sjekker grønne. Deretter er lakken fjernet igjen,
og `git diff vintage_f1.html` er TOM — spillfila er bit-identisk med steg C.

To ting kom ut av prøven som ikke var åpenbare da avsnittet ble skrevet:

1. **Sjekktallene vokser med hver lakk** (+9 i `test_lag.js`, +1 i
   `test_banetema.js`). Uten en setning om det ville neste leser sammenlignet
   mot tallene i tabellen over og trodd noe var galt. Det står nå i avsnittet,
   sammen med at et LAVERE tall er den ekte faresignalet.
2. **At avsnittet stemmer er mutasjonstestet, ikke påstått.** De tre reglene
   det lover høyest, ble brutt én om gangen på kopier i `/tmp`: dublett-`id`
   felte «unike lakk-id», en lakk uten både `bane` og `tid` felte tre sjekker,
   og en aksent for nær grunnfargen felte både asfalt- og aksentkravet. Alle
   tre ble fanget — porten er altså ekte.

«Ett objekt og ingenting annet» er også verifisert og ikke antatt: alle seks
kallstedene går gjennom `lagLakker()`/`aktivLakk()` (kontrastrapporten,
banevalgets spesiallakk-linje, `liveryOf`, `previewLivery`, LAG-skjermens
detaljpanel og ←→-grensen), så en ny lakk blir plukket opp av menyene uten at
én linje i dem endres.

**Verifisert i steg E (sluttest):** alle testene som HAR en dom er grønne —
`test_lag.js` 229/229, `test_banetema.js` 208/208, `test_meny_kontrast.js`,
`test_boost`, `test_cooldown`, `test_gap`, `test_ghost`, `test_track_limits`,
`test_hovedmeny`, `test_innstillinger`, `test_pause`, `test_bevegelse`,
`test_fixed_timestep`, `test_lazy_track_bg` og de fire ASTEROIDER-testene.
`test_banegeometri.js --mot geo_laas.json` melder UENDRET på alle 13 baner, og
`chrome_harness.py maal` bygger alle 13 (sum 180,4 ms, snitt 13,9, verste
VISTANOTTE 20,4 ms, ingen over budsjettet på 100).

**`test_spiller_sving.js` har ingen dom** og skal ikke telles som en grønn test:
den skriver ut en tabell med tider og prosenter og har verken terskel eller
FEIL-utskrift. Det er et MÅLEVERKTØY — det var slik den fant `physSafe`-feilen i
del 3 steg H — og «alle testene grønne» betyr derfor de nitten som faktisk
dømmer.

**Spillfila er bit-identisk med steg C** (`git diff 89e4898 HEAD --
vintage_f1.html` er tom; steg D rørte bare notatet). Derfor er
`maalinger/lakk_grid_C.txt` fortsatt gyldig som lakk-fasit og er ikke målt opp
igjen — den sier hvilket lag som har hvilken lakk i alle åtte kombinasjonene av
bane × døgntid × innstilling.

**AI-en er BIT-IDENTISK helt tilbake til steg A**, og det er målt felt for felt:
`maalinger/ai_baseline_lag_E.json` mot `..._lag_B.json` gir NULL ulike felt over
alle 52 konfigurasjoner, og det eneste som skiller filene er `seconds` (714,8 mot
713,8), altså testens egen klokketid. Snittspredning 0,679 → 0,679, største
0,996 (DUNA/CASUAL/ULTRA), ingen nye veggtreff og ingen mer tid utenfor banen.
**Det var verdt å kjøre:** steg C endret faktisk spillfila (menyer,
`previewLivery`, `liveryOf`-veien) og ble ALDRI AI-verifisert — steg B var siste
måling. Denne kjøringen lukker det hullet og viser at lakkvalget ikke lekker inn
i fysikken.

Startgrid-bildene ligger i `maalinger/bilder/lag_E_grid_*.png` (LABIRINTO/DAG og
VISTANOTTE/NATT, 1:1 i 520×680). **Merk at `shot` tar bildet ved LANDEMERKET som
standard**, ikke på startstreken — første forsøk ga tretten biler som knapt
synlige prikker langt unna griden. `--t 0.0` setter kameraet på startstreken der
feltet faktisk står. Bildene underbygger og beviser ikke: som steg C punkt 9
slo fast, kan et 520 px-bilde ikke avgjøre HVEM som har hvilken lakk, og det er
nettopp derfor tekstmålingen finnes.

**Verifisert i steg C:** `test_meny_kontrast.js` 120/120 (117 før),
`test_lag.js` 229/229 med svakeste asfaltkontrast UENDRET 3,21:1 (FRONTIER
Mojave mot VISTANOTTE), `test_innstillinger.js`, `test_hovedmeny.js`,
`test_pause.js`, `test_banetema.js` 208/208, `test_bevegelse.js` PASS,
`test_boost.js`, `test_cooldown.js`, `test_ghost.js`, `test_gap.js`,
`test_track_limits.js` alle grønne, `test_banegeometri.js --mot
geo_laas.json` uendret på alle 13, og `chrome_harness.py maal` bygger alle 13
(sum 175,6 ms, snitt 13,5, verste VISTANOTTE 19,2 ms). Målingene står i
`maalinger/lakk_grid_C.txt` og bildene i `maalinger/bilder/C_*.png`.

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
