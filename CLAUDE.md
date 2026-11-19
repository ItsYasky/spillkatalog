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
## Faste lærdommer

Destillat av feil som har gjentatt seg. Full historikk i `DAGBOK.md`.

1. **Grønne JSC-tester beviser ikke at bakgrunnen bygges** — hvert tegnekall er en no-op på en stub. Kjør `chrome_harness.py maal` etter hvert som rører `buildTrackBg` eller et tema. (`pad` i B2, `LYS_PER_RUTENETT` i D1 kastet på alle 13 med full pott.)
2. **Konstanter som tegnekoden bruker hører ØVERST i `buildTrackBg`.** `groundLayer` kalles tidlig, så en `const` lenger nede ligger i den temporale dødsonen og kaster `ReferenceError`.
3. **Størrelse/form er en feilkilde på linje med farge.** Leser noe feil, rett ved å KRYMPE eller endre form før du bytter tone. De fleste «fargefeil» i runde 4 var proporsjonsfeil.
4. **Mål mot riktig referanse:** landskap og landemerker mot den verste BAKKEtonen (lysere vinner), tak og vindu mot den lyse FASADEN (mørkere vinner). Om natta er det TAKET/overlegget som er flaskehalsen, ikke paletten.
5. **`addLight` lagrer VERDENSKOORDINATER.** Omregning fra et landemerkes egen ramme til verden går gjennom `scene.lokal` — aldri skriv `p.side`-vendingen eller høyden ut for hånd (ga feil i B3 og B4).
6. **Flytter du en glød, mål lysmengden på nytt** — posisjon og styrke henger sammen gjennom blendingen. En levende glød må være større enn det bakte lyset den ligger oppå.
7. **Ett høyt byggetidstall er GC-støy.** Mål på nytt før du tolker det; banene selv ligger på 13–22 ms.
8. **En pikseldiff må først bevise at de to bildene er sammenlignbare.** Ledertavla og spillerbilen trekkes på nytt ved hver lasting — masker dem bort, eller du tilskriver detaljen ~2000 urelaterte piksler.
9. **Et bilde/tall som skal bevise noe sjekkes for alder og gyldighet først.** Harnessen tier når kallet er feil (skriver hovedmenyen, tom utskrift, exit 0) — pakk injeksjon i try/catch og se på tidsstempelet.
10. **En mutasjon som ikke biter skal diagnostiseres før den tolkes.** En INERT mutasjon (koden er ekvivalent) og et ekte testhull ser like ut i utskriften.
11. **En test som håndhever et krav må faktisk måle det** (tekststørrelse ble aldri målt før steg C), og den skal kalle spillets EGEN funksjon (`contrastRatio`, `worldToScreen`), ellers kan den ha samme feil som koden.
12. **Pynt/lakk/menyer rører ikke fysikk — bevis det.** `test_banegeometri.js --mot geo_laas.json` skal være uendret, og endrer du noe nær AI/fysikk, sammenlign AI-sim FELT FOR FELT (ikke bare sammendraget; `besteLap`/`medLap`/`steps`/`finished`/`otFrac` også).
13. **`git`-identiteten** er satt lokalt til GitHubs noreply-form; de 18 første commitene bærer den gamle `.local`-adressen, og å rette det krever force-push til `main` — IKKE gjort.

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

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.

### GRAND PRIX runde 4 — pynterunden (`vintage_f1.html`)

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

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.

### GRAND PRIX — nye menyer (`vintage_f1.html`)

| Steg | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| A | ferdig | — | `SETTINGS`-objekt lagret i `localStorage` (`gp_innstillinger`), DITT LAG som ekte innstilling, TID PÅ DØGNET med AUTO (banens egen tid) og TILFELDIG, AI-NIVÅ lagret som NAVN (overlever modusbytte), og selve INNSTILLINGER-skjermen tegnet (med bilforhåndsvisning på SKIN-raden) | `test_innstillinger.js` (56/56) |
| B | ferdig | `ff3c151` | Ny hovedmeny (LØP/ØVING/INNSTILLINGER/LAG) og ombygd banevalg (karusell + samlet innstillingsboks + KJØR/ØVING-knapp), INNSTILLINGER koblet inn fra begge, LAGOVERSIKT nå nådd fra hovedmenyen (ikke `L`), alle bokstavtaster og TAB fjernet | `test_hovedmeny.js` (34/34), `test_innstillinger.js` (56/56, uendret) |
| C | ferdig | `874598e` | Pausemeny (fryser løpet helt) og ny resultatskjerm | `test_pause.js` (33/33) |
| D | ferdig | `49f9c4a` | Kontrast-/tekststørrelsessjekk av alle skjermer, oppdatert kontrollhjelp, sluttdokumentasjon | `test_meny_kontrast.js` (117/117) |

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.

### GRAND PRIX — ventelista-rettelser (`vintage_f1.html`)

| Punkt | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| Banegrenser av på ENKEL | ferdig | `6bef39c` | Spilleren er unntatt `checkTrackLimits()` på ENKEL: ingen slettet runde i øving, ingen straffetid eller `BANEGRENSER x/3`/flagg-toast i løp. AI-ens egne brudd telles fortsatt uansett nivå (de tallene brukes av AI-simuleringen, ikke til å dømme spilleren). INNSTILLINGER-forklaringen for ENKEL er utvidet til «For å lære banene. Banegrenser av.» | `test_track_limits.js` (30/30, ny test 6) |
| ARDENNEs trær usynlige | ferdig | `bf3b901` | `treeTint` lysnet fra `['#0e2e1c','#14472a','#071d12']` til `['#2d8151','#33905c','#3a9660']` — alle tre toner måler nå ≥3:1 mot alle tre bakketoner (verst 3,07:1, mot 1,00:1 før). | `test_banetema.js` (168/168, ny sjekk 16) |
| Flaky AI-test i `test_track_limits.js` | ferdig | `a4e4a3b` | `contactT` på testens AI-bil nulles rett før utflukten. Spillet var riktig — regelen «dyttet ut er ikke et brudd» er bevisst fra del 3 — testen manglet bare å isolere seg fra feltets ekte kollisjoner i de foregående utfluktene. | `test_track_limits.js` (30/30, fire ganger på rad) |
| Svak trekontrast på de andre tre-banene | ferdig | `1ee5725` | `dTree()` fikk en valgfri `hiTint`: fast, lav-opasitets skygge under krona + en lysnet topp-flekk, tegnet KUN når temaet har `treeHi` — resten av krona er urørt. MONTE SPIRA, TEMPIO, DISCESA og ALPEN fikk hver sin `treeHi` (den lyseste treeTint-tonen lysnet til ≥2,5:1 mot banens verste bakketone). ARDENNE og ESSE trengte ingen endring — begge når alt ≥2,5:1 (faktisk ≥3,5:1) med treeTint alene. | `test_banetema.js` (174/174, ny sjekk 17) |
| Død kode på cfg-nivå | ferdig | `fc4996f` | Fire linjer med `treeTint`/`rockTint`/`bushTint`/`groundBase`/`speckle` slettet fra `TRACKS` (ESSE, DISCESA, ALPEN, DUNA) — tonene flyttet inn i `THEMES` i runde 4 steg A, og `cfg.`-varianten hadde ingen lesere igjen (verifisert med søk på `cfg.<felt>`). Samme commit korter ned de lange kommentarblokkene som dokumenterte runde 3 og 4 mens arbeidet pågikk; begrunnelsene står i dette notatet og trengte ikke stå i to utgaver. | `test_banetema.js` (174/174), `test_banegeometri.js` (13/13 uendret) |

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.

### GRAND PRIX — nye lag og lakker (`vintage_f1.html`)

| Steg | Status | Commit | Innhold | Test |
|---|---|---|---|---|
| A | ferdig | `936db02` | Ren omstrukturering: lakkene er egne objekter under `lag.lakk.{vanlig,spesial[]}`, `drawPattern` slår opp i `PATTERNS`, `aktivLakk()` er enestes velger av lakk, sprite-cachen nøkles på lakk-`id`, og hvert lag har en tom `profil` + `lagFaktor()` som alltid gir 1 | `test_lag.js` (105/105, ny), `test_banetema.js` (198/198, sjekk 4 bygget om) |
| B | ferdig | `b862db3` | De ti nye lagene og de 21 lakkene, `aktivLakk` utvidet med tidslakker, og to latente fargefeil rettet (`teamInk`-referansen og negativ kulør i `rgbToHsl`) | `test_lag.js` (229/229), `test_banetema.js` (208/208), `test_meny_kontrast.js` (117/117), `test_ai_compare.js` |
| C | ferdig | `89e4898` | SPESIALLAKK-innstillingen, LAG-skjermen bygget om til liste + detaljpanel med ← → mellom lakkene, spesiallakk-linja i banevalget, banebevisst bilforhåndsvisning, og `shot --tod`-feilen rettet | `test_meny_kontrast.js` (120/120, nå med 9 px-gulv), `test_lag.js` (229/229), `maalinger/lakk_grid_C.txt` |
| D | ferdig | `1d18641` | «Ny lakk eller nytt lag» øverst i dette notatet: feltene og de tre kontrastkravene på en spesiallakk, nytt mønster i `PATTERNS`, nytt lag, og hvilke tester som er porten. Avsnittet er PRØVD UT, ikke bare skrevet | `test_lag.js` (229/229 etter at prøvelakken ble fjernet), `test_banetema.js` (208/208), `test_meny_kontrast.js` |
| E | ferdig | `a811ec2` | Sluttest: hele suiten, geometrilåsen, byggeporten, startgrid-bilder på DAG og NATT, og de tre oppfølgingspunktene i `SENERE.md` | 19 JSC-tester grønne, `test_banegeometri.js` (13/13 uendret), `chrome_harness.py maal` (sum 180,4 ms), `test_ai_compare.js` |

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.

### GRAND PRIX — pause i fullskjerm (`vintage_f1.html`)

| Status | Commit | Innhold | Test |
|---|---|---|---|
| ferdig | `57a9df8` | `P` som pausetast ved siden av ESC, autopause når vinduet mister forgrunnen, og «ESC/P» i begge hjelpelinjene | `test_pause.js` (89/89, var 33/33) |

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.

### GRAND PRIX — SKIN fjernet (`vintage_f1.html`)

| Status | Commit | Innhold | Test |
|---|---|---|---|
| ferdig | `204ff10` | Hele SKIN-laget ute: raden i INNSTILLINGER, `SKINS`/`skinAt`/`skinLivery`/`skinSel`/`SETTINGS.skinIdx` og spiller-grenen i `liveryOf`. Spilleren kjører lagets lakk, spesiallakkene inkludert | `test_innstillinger.js` (55/55, var 56), `test_hovedmeny.js` (35/35, var 34), `test_meny_kontrast.js` (119/119, var 120), `test_lag.js` (229/229), `test_banetema.js` (208/208) |

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.

### ASTEROIDER (`asteroids.html`)

| Steg | Status | Commit | Innhold |
|---|---|---|---|
| A | ferdig | `743a0a8` | Fast tidssteg med akkumulator |
| B | ferdig | `5299f6d` | `e.code` i stedet for `e.key`, så taster ikke henger |
| C | ferdig | `f65fc68` | Kollisjon mot steinenes faktiske form |
| D | ferdig | `2583e8a` | Lesbar tekst (målt kontrast) + topp 10 med initialer |

> Avvik, målinger og begrunnelser for dette avsnittet: se `DAGBOK.md`.
