# GRAND PRIX — nytt startfelt (lag og lakker)

> Original bestilling fra Yasir, lagret ordrett. Arbeidet går i fem steg (A–E).
> Etter hvert steg: test, commit, oppdater loggen i `CLAUDE.md`, kort
> statusrapport, og STOPP.

Jeg vil bytte ut lagene i GRAND PRIX (vintage_f1.html) med et nytt startfelt. Det er fortsatt 10 lag og 20 biler, men fire av lagene er nye. Hvert lag får en historie (hjemsted og type), og en eller flere spesiallakker. Koden skal bygges slik at det er enkelt å legge til nye lakker senere, og slik at lagene senere kan få egne egenskaper (for eksempel at ett lag er raskt på rettene). Selve egenskapene skal IKKE lages nå, bare plassen til dem.

Les CLAUDE.md først og følg den. Ikke les hele vintage_f1.html. Bruk grep og les bare koden som har med lag, lakk, buildCars(), sprites og lagoversikten å gjøre.

Ikke endre fysikk, AI-oppførsel, banene eller menyene utover det som står her. Alt du finner underveis som er utenfor oppgaven, legger du i SENERE.md.

Spillerens egne lakker (SKINS) er ikke en del av dette. De står som de er.

Jobb i fem steg (A–E). Etter hvert steg: test, commit, oppdater loggen i CLAUDE.md, gi meg en kort statusrapport, og stopp. Jeg skriver /clear og ber deg fortsette. Lagre denne prompten som prompter/grand-prix-lag.md før du begynner, og legg en henvisning til den i fremdriftstabellen.

## STEG A – Ny struktur, uten å endre noe synlig

Bygg om datastrukturen først, med de ti lagene som finnes i dag. Spillet skal oppføre seg nøyaktig likt etter dette steget. Målet er at steg B bare er å bytte data.

1. **Lakk som egen ting.** I dag ligger fargene direkte på laget. Flytt dem inn i et lakkobjekt:

```js
// Én lakk: alt som trengs for å tegne bilen.
// { id, navn, base, acc, dark, hel, spc, pat, bane?, tid?, bevisstLavKontrast? }
```

Hvert lag får `lakk: { vanlig: {...}, spesial: [ {...}, ... ] }`. Spesiallakkene er en liste, så et lag kan ha null, én eller flere. Feltet `bane` er banenavnet spesiallakken hører til (for eksempel `'TEMPIO'`), og `tid` er valgfritt (`'NATT'` betyr at lakken bare brukes når tiden på døgnet er NATT). Behold aliasene `color`, `dark` og `accent` på laget, pekende på den vanlige lakken, så resten av koden virker som før.

2. **Mønstre i ett oppslag.** Gjør om `drawPattern` til et objekt, `PATTERNS = { split(g,acc){...}, spine(...), ... }`. Et nytt mønster skal kunne legges til med én ny funksjon i objektet, uten å endre noe annet.

3. **Én funksjon velger lakk.** `aktivLakk(lag, bane, tid, innstilling)` returnerer lakken en bil skal kjøre med. Regel: hvis innstillingen tillater spesiallakk, og en spesiallakk har `bane` lik banen (og `tid` lik tiden, hvis `tid` er satt), brukes den. Ellers brukes den vanlige. Hvis flere passer, vinner den første i lista. All tegning av biler skal gå gjennom denne funksjonen.

4. **Sprites per lakk.** Sprite-cachen skal ha lakkens `id` i nøkkelen, ikke lagets navn, så to lakker for samme lag aldri deler sprite.

5. **Plass til egenskaper (ikke i bruk).** Hvert lag får et felt `profil` med nøytrale verdier:

```js
profil: { toppfart: 1, sving: 1, akselerasjon: 1, aggresjon: 1 }
```

Lag én funksjon, `lagFaktor(lag, nokkel)`, som alltid returnerer 1 i denne runden, uansett hva som står i `profil`. Den skal ikke kalles noe sted ennå. Skriv en kommentar ved funksjonen og et avsnitt i CLAUDE.md om hvor den skal kobles inn når egenskaper skal lages: toppfart på `aiSpd`/maksfart, sving på svingfarten (`corner`), akselerasjon på akselerasjonen, aggresjon på hvor tett AI-en går inn i forbikjøringer. Skriv også at lagenes egenskaper må balanseres mot vanskelighetsgradene når de lages, og at spillerens bil skal kunne få dem eller ikke etter en innstilling.

6. **Validering.** Lag `tester/test_lag.js` som sjekker alle lag og alle lakker:

- Alle felt finnes, fargene er gyldige hex, og `pat` finnes i `PATTERNS`.
- Alle lakk-id er unike, og alle `bane` er navn som finnes i `TRACKS`.
- **Kontrast mot asfalten.** Etter runde 4 har hver bane sin egen asfalt (`theme.asphalt`), så det holder ikke å måle mot `#33333e`. Regelen er: `base` eller `acc` minst 3:1 mot asfalten på hver bane lakken faktisk kan kjøre på.
  - En vanlig lakk måles mot alle 13 banene.
  - En spesiallakk med `bane` måles bare mot den banen.
  - En spesiallakk med bare `tid` (ingen `bane`) måles mot alle banene. Dette er med vilje: Neon 2099 måler 2,88:1 og Mojave 2,75:1 mot DUNA, men 3,37:1 og 3,21:1 på VISTANOTTE, der de kjører.
- `hel` minst 3:1 mot cockpiten `#0b0b0e`. `acc` mot `base` minst 3:1, unntatt lakker med `bevisstLavKontrast: true`.
- Bruk spillets egen `contrastRatio()`, ikke en kopi.
- Antall lag × 2 er lik antall biler på griden.

7. Sjekk 4 i `test_banetema.js` (lakk mot hver banes asfalt) leser i dag `TEAMS` med `skinLivery(t)`. Bygg den om til å lese alle lakkene gjennom samme regel som i punkt 6, ellers stryker den når spesiallakkene kommer i steg B. Lakkene fra `SKINS` måles fortsatt mot alle banene, som i dag.

**Test:** alle testene grønne. Kjør `test_ai_sim.js` én gang (~12 min) og sammenlign med `maalinger/ai_baseline_etter_runde4.json` med `test_ai_compare.js`. Tallene skal være bit-identiske. Skjermbilder av startgriden (`chrome_harness.py shot`) skal være piksel-like før og etter. Dette er en ren omstrukturering.

## STEG B – De nye lagene

1. Bytt ut `TEAMS` med de 10 lagene under. CORALIS, ROSARIO, GRANITT og AZURA forsvinner. SAHRA, LONGWEI, FRONTIER og MAKO er nye.

| Lag | Kode | Hjem | Type | Tittelsponsor | Andre sponsorer |
|---|---|---|---|---|---|
| VULCANA | VUL | Modena, Italia | Gammel storhet som har falt litt | Ignaro | Tessera Ur, Ventoli Kaffe |
| NORDHAV | NDH | Stavanger, Norge | Liten underdog med sterk ingeniørkultur | Isvind Energi | Skjærgård Forsikring, Nordlys Mobil |
| AURUM | AUR | Monaco | Ny rikdom, glatt og dyr | Kairon Logistikk | Solvei Bank, Taurex Dekk |
| ONYX | ONX | Osaka, Japan | Aggressivt fabrikklag | Paxel Cloud | Nyxa Lyd, Obsidia Gaming |
| KESTREL | KES | Oxfordshire, England | Tradisjonsrikt britisk privatlag | Veltra Mobil | Arkivo Software, Quillon Klokker |
| VERDANT | VRD | Zürich, Sveits | Rikt og forsiktig | Mosslund Bank | Grønnbro Kraft, Tavik Byggevarer |
| MAKO | MAK | Gold Coast, Australia | Uredd og rask, vinner på mot fremfor penger | Riptide Surf | Southern Mining, Koru Air |
| SAHRA | SAH | Riyadh, Saudi-Arabia | Statsfinansiert, nesten ubegrenset budsjett | Rimal Petroleum | Qamar Fly, Nakheel Bygg |
| LONGWEI | LWE | Shanghai, Kina | Elbilprodusent som bygger alt selv | Longwei Auto | Jinlu Batteri, Huasheng Telekom |
| FRONTIER | FRO | Indianapolis, USA | Nykommer med en bilprodusent i ryggen | Ironwood Motors | Liberty Lane Forsikring, Summit Outdoor |

Lakkene (rekkefølge: base, acc, dark, hel, spc, pat):

| Lag | Vanlig lakk | Spesiallakk (navn · bane) |
|---|---|---|
| VULCANA | `#5a0f17` `#e8b04a` `#2a0509` `#f4ecd8` `#e8b04a` edges | Bianco · TEMPIO: `#f4f1ec` `#5a0f17` `#3a0a0c` `#d23a42` `#5a0f17` spine |
| NORDHAV | `#2a4a78` `#bfe3f2` `#0f1d33` `#f8fafc` `#f8fafc` spine | Nordlys · alle baner, bare NATT: `#0b1424` `#3ee6a8` `#050a14` `#f8fafc` `#b8a6ff` sash |
| AURUM | `#5b35b0` `#e8d3a2` `#23123f` `#f2e6c8` `#f2e6c8` chevron | Rosé · LABIRINTO: `#d79a7b` `#4c2a92` `#6b3f2a` `#f8fafc` `#4c2a92` chevron |
| ONYX | `#281e38` `#a78bfa` `#100b18` `#a78bfa` `#e5e7eb` tail | Sakura · ESSE: `#281e38` `#f4a6c8` `#100b18` `#f4a6c8` `#f4a6c8` edges **og** Neon 2099 · VISTANOTTE, bare NATT: `#0a0a0d` `#7f8590` `#050507` `#ff2a3c` `#1c1c22` edges |
| KESTREL | `#f2f0e8` `#3a4a68` `#2c3850` `#e0571a` `#e0571a` sash | Heritage · CAMPAGNA: `#1f4d36` `#f2f0e8` `#0e2419` `#c2410c` `#f2f0e8` sash |
| VERDANT | `#556b2f` `#f5f0e1` `#263014` `#f5f0e1` `#e9c46a` spine | Alpin · ALPEN: `#f5f0e1` `#556b2f` `#8a8f7a` `#e63946` `#556b2f` spine |
| MAKO | `#ffd400` `#16181c` `#16181c` `#f8fafc` `#16181c` chevron | Outback · DISCESA: `#a8461f` `#ffd400` `#4a1d0c` `#ffd400` `#16181c` chevron |
| SAHRA | `#0b7a7a` `#e8d5a8` `#053a39` `#f4ecd8` `#f4ecd8` tail | Ørkennatt · DESERTO: `#0a0f14` `#22d3c5` `#000000` `#e8d5a8` `#e8d5a8` edges |
| LONGWEI | `#b0185f` `#ffd84a` `#4a0627` `#ffd84a` `#ffffff` split | Jade · ESSE: `#1c7f58` `#f2d16b` `#0c3a28` `#e23b3b` `#f8fafc` tail |
| FRONTIER | `#c9cdd2` `#9b1c2c` `#5b616a` `#f8fafc` `#1b2a4a` split | Mojave · VISTANOTTE: `#c26a30` `#14161c` `#5a2c10` `#f8fafc` `#14161c` spine |

Nordlys har ingen `bane`, bare `tid: 'NATT'`. Utvid regelen i `aktivLakk`, så en spesiallakk uten `bane` men med `tid` gjelder alle baner på den tiden. En spesiallakk med `bane` vinner over en uten.

Feltet `bevisstLavKontrast` brukes ikke av noen lakk nå, men behold det i valideringen, så en lakk senere bevisst kan bruke to farger med samme lyshet.

2. Antall biler er fortsatt 20. Bare farger, navn og sponsorer endres, så AI-en skal kjøre nøyaktig likt. Kjør AI-simuleringen og bekreft at tallene er bit-identiske med etter steg A. Hvis de ikke er det (for eksempel fordi noe i AI-en henger på lagets plass i lista), finn ut hvorfor før du går videre.

3. Fjern rester av de gamle lagene: navn, sponsorer og farger i kode, kommentarer og tekst (blant annet kommentaren ved ONYX om GRANITT, og CORALIS i notatet om `test_banetema.js` i CLAUDE.md). Hvis en lagret innstilling (`gp_innstillinger`) peker på et lag som ikke finnes lenger, fall tilbake til TILFELDIG.

4. Lagfargene i menyene går gjennom `teamInk`/`podiumInk`. Kjør `test_meny_kontrast.js` og bekreft at alle de nye lagene holder 4,5:1 på LAGOVERSIKT, banevalget og resultatskjermen.

**Test:** `test_lag.js` grønn for alle 10 lag og 21 lakker (10 vanlige og 11 spesial). Skjermbilde av startgriden med alle 20 bilene.

## STEG C – Spesiallakk i spillet og i menyene

- Legg til en rad i INNSTILLINGER: `SPESIALLAKK ‹ AUTO ›`, med valgene AUTO (spesiallakk på banen den hører til) og AV (alltid vanlig lakk). Forklaringslinje: «Lagene kjører med egen lakk på enkelte baner.»
- LAG-skjermen (lagoversikten fra hovedmenyen) skal vise hvert lag med hjemsted, type, tittelsponsor og bilen i vanlig lakk. Med ←→ kan man bla mellom lakkene til et lag og se navnet på spesiallakken og hvilken bane den hører til.
- Banevalget: hvis et lag har spesiallakk på banen som er valgt, vis en liten linje, for eksempel «Spesiallakk: AURUM Rosé».
- DITT LAG i innstillingene får de nye lagene. Spilleren kjører med spesiallakken til laget sitt på samme måte som AI-bilene.
- All ny tekst minst 9 px og minst 4,5:1 kontrast.

**Test:** ta skjermbilder av startgriden med `chrome_harness.py shot` (`--tod` virker nå): LABIRINTO på DAG og VISTANOTTE på NATT. AURUM skal ha Rosé på LABIRINTO. ONYX skal ha Neon 2099, NORDHAV Nordlys og FRONTIER Mojave på VISTANOTTE om natten. Med SPESIALLAKK AV skal alle ha vanlig lakk. `test_meny_kontrast.js` grønn med den nye raden og LAG-skjermen.

## STEG D – Slik legger man til en ny lakk

Skriv et kort avsnitt i CLAUDE.md med overskriften «Ny lakk eller nytt lag», som forklarer:

- Hvor man legger til en ny spesiallakk (ett objekt i `lakk.spesial` til laget), og hvilke felt den trenger.
- Hvordan man legger til et nytt mønster (én funksjon i `PATTERNS`).
- At `test_lag.js` må være grønn før det committes.
- Hvor `profil` og `lagFaktor` skal kobles inn når lagene skal få egenskaper (fra steg A5).

Test dokumentasjonen: legg til en midlertidig ekstra spesiallakk for ett lag ved å følge bare det avsnittet, kjør testene, og fjern den igjen. Si fra hvis noe i avsnittet manglet.

## STEG E – Sluttsjekk

- Alle testene i `tester/` grønne. Geometrien uendret (`test_banegeometri.js`).
- Skjermbilder i 1:1 av startgriden på DAG og NATT.
- Legg dette i `SENERE.md` (ikke gjør det nå):
  - Lagenes egenskaper (`profil`), med balansering mot vanskelighetsgradene.
  - Glød på kanten til Neon 2099 og andre spesiallakker med `edges` på nattløp, med glød-spriten fra runde 2.
  - Hjemmelakk for NORDHAV på FJORD og FRONTIER på OVALE, når de banene finnes.
- Push.

**Rapport:** kort per steg. Si hva du endret, testresultater og målinger før og etter, og alt du måtte gjøre annerledes enn prompten sier, og hvorfor.
