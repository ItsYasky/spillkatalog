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

### GRAND PRIX runde 4 — pynterunden (`vintage_f1.html`)

Målet: hver bane skal kjennes igjen på et skjermbilde. Før runde 4 var alle
tretten bygget av nøyaktig samme byggeklosser, og to baner med samme
terrain-type var ikke til å skille uten å lese navnet.

**Runden er en PYNTERUNDE — geometrien skal ikke flytte seg én piksel.** Det
håndheves av `test_banegeometri.js`, som låser de syv tallsettene fysikken og
AI-en leser (PATH, heading, smoothCurv, severity, raceLine, wallOffsArr,
straightZones) mot `geo_laas.json`. Kjør den etter hvert steg:

    osascript -l JavaScript test_banegeometri.js --mot geo_laas.json

| Steg | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| A | ferdig | `10612a9` | Seedet tilfeldighet (banenavn som frø), verdistøy, tema per bane (asfalt/grus/kerb/bakketoner), bakken som myke flekker i stedet for 1400 prikker, vegetasjon i klynger, avstandsrutenett | `test_banetema.js` (137/137), `test_banegeometri.js` (13/13) |
| B | første pulje ferdig | `15cdf0c` | Landemerker + bakkelag for fem baner (MONTE SPIRA, ARDENNE, DESERTO, ALPEN, DUNA) + nattlys koblet inn | `test_banetema.js` (152/152), `test_banegeometri.js` (13/13) |
| B2 | ferdig | `eb6f117` | Landemerker + bakkelag for fem til (VULCANO, TEMPIO, CAMPAGNA, ESSE, DISCESA) | `test_banetema.js` (167/167), `test_banegeometri.js` (13/13) |
| B3 | ferdig | `fde0f71` | Vend-feilen i nattgløden på de fem første landemerkene (slo bare ut på DUNA) | `test_banetema.js` (167/167), `test_banegeometri.js` (13/13), `chrome_harness.py maal` |
| B4 | ferdig | `e94db19` | `scene.lokal()`: gløden på selve lyskilden (ALPEN, ARDENNE, DUNA), og radier målt opp igjen | samme tre porter |
| B5 | ferdig | `0bc25c6` | Bakkeflis som gjentakende mønster under hele skjermen + uttonet ytterkant på bakgrunnsbildet, så lerretskanten ikke lenger synes | samme tre porter + skjøtemåling |
| C | ikke begynt | — | Bykvartaler (`dBuildingGrid`) for LABIRINTO, SERPENTINA, VISTANOTTE — se kommentaren i city-grenen i `buildTrackBg` | — |

**De tre bybanene ble BEVISST utsatt til steg C** (LABIRINTO, SERPENTINA,
VISTANOTTE). De trenger både landemerke og bykvartaler, og å skrive landemerket
nå ville betydd å skrive det om igjen når kvartalene kommer.

**`test_banetema.js` er ny i steg A.** Den måler det `contrastCheck()` i spillet
ikke lenger dekker: spillets egen sjekk måler lakkeringene mot ASPHALT_BASE
alene, men nå har hver bane sin egen asfalt. Testen regner hele krysstabellen —
atten lakkeringer mot tretten dekker. Svakeste verdi er 3,45:1 (CORALIS mot
DUNA), altså over 3:1-kravet.

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

**Git-identitet:** `user.name`/`user.email` var ikke satt noe sted, så git
utledet dem fra macOS-kontoen. Satt med `--local` i dette repoet til
`333276467+ItsYasky@users.noreply.github.com` (GitHubs noreply-form, bygget av
konto-ID fra `gh api user`, siden den private adressen er skjult og tokenet
mangler `user`-scope). De 18 commitene som alt er pushet bærer fortsatt den
gamle `.local`-adressen og er ikke knyttet til GitHub-profilen — å rette det
krever force-push til `main` og er IKKE gjort.

**Åpent punkt i steg B:** ARDENNEs skog har praktisk talt usynlige trær —
`treeTint:['#0e2e1c','#14472a','#071d12']` måler ~1,3:1 mot
`ground:['#0b1710','#122017','#1b2c1e']`. Det er et steg A-palettspørsmål og
ble bevisst ikke rørt her. Dessuten: `cfg.treeTint`/`rockTint`/`bushTint`/
`groundBase`/`speckle` på cfg-nivå har INGEN lesere i det hele tatt etter at
tonene flyttet inn i temaet — dødkode som bør ryddes for seg.

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
