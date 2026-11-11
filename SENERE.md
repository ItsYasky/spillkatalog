# Senere

Venteliste. Alt som dukker opp utenfor det som er bestilt, havner nederst her i
stedet for å bli fikset med en gang. Reglene står i `CLAUDE.md` under
«Ventelista».

Format: `[spill] kort beskrivelse – størrelse – dato`, én linje per punkt, med
høyst én linje under som sier hvor i koden det gjelder.

## GRAND PRIX (`vintage_f1.html`)

- [GRAND PRIX] Vanskelighetsgrad-stigen: raskeste AI-bil mot Yasirs beste runde – middels – 2026-10-30
  ENKEL 12–15 % tregere, MIDDELS 7–8 %, VANSKELIG 3–4 %, ULTRA 0,5–1,5 %; samme stige i CASUAL (REALISTISK ULTRA er ferdig). Mål bare MONTE SPIRA, ARDENNE og CAMPAGNA.
- [GRAND PRIX] LEGENDE: femte nivå over ULTRA, like raskt som Yasirs beste runde ±0,5 %, ingen feil, hele feltet innenfor 1 % – stor – 2026-10-30
  Kan kreve bedre AI-linjer i hårnålene; `buildRaceLine` er alt forsøkt strammet én gang og ble FORKASTET (se `CLAUDE.md` steg H).
- [GRAND PRIX] ESSE/CASUAL/ULTRA har spredning 0,9857, så vidt under én runde – middels – 2026-10-30
  Banen var ikke med i de fem som ble målt da `posFactor` ble strammet; mål med `test_ai_sim.js`.
- [GRAND PRIX] SERPENTINA har 4,9–6,7 banegrensebrudd per bil i ALLE FIRE konfigurasjonene – middels – 2026-10-30
  Gammel kjent sak, ikke forårsaket av steg H. Punktet sa før «6,65 på REALISTISK/ULTRA, alle andre ≤0,8»; sluttmålingen i steg E viser at det var for snilt — SERPENTINA ligger på 5,00/6,50/4,88/6,70, og DISCESA/CASUAL/ULTRA på 4,85. Resten er fortsatt ≤0,8.
- [GRAND PRIX] Halv oppløsning på bakkeflis-fyllet hvis bildetiden blir trang – middels – 2026-10-30
  Et rotert mønsterfyll koster 2,21 ns/px mot 1,37 i halv oppløsning (−38 %), mot at bakken blir uskarpere; målingene står i `CLAUDE.md` under steg B5.
- [GRAND PRIX] Den YTRE kvartalsraden på LABIRINTO og SERPENTINA gir bare 4 kvartaler hver – middels – 2026-11-09
  `scene.rutenett`: klaringssjekken mot `CLEAR` kaster nesten hele raden på en trang gatebane, så byen står i praksis bare på innsiden (155 av 159, 195 av 199).
- [GRAND PRIX] VULCANOs lava kaster ikke lys på bakken rundt seg – liten – 2026-11-09
  Temaets `groundLayer` linje ~2164: `s.lys(...,P.lava,26)` henger på kjernen, som ligger inne i en skorpe langt bredere enn 26 px, så spillets eneste selvlysende flate får aldri gløden ut av seg selv.
- [GRAND PRIX] MONTE SPIRA er den eneste banen uten ett eneste nattlys – liten – 2026-11-09
  Akvedukten i temaets `landmark` (linje 1763–1814) har ingen `s.lys`-kall; banen ser lik ut dag og natt bortsett fra overlegget.
- [GRAND PRIX] `cityPal` på de tre bybanene måler 1,00–3,85:1 mot bakken – middels – 2026-11-10
  Gjelder de SPREDTE `dBuilding`-husene scatterTerrain strør utover, ikke kvartalene (de fikk egne målte toner i steg C). Forsøkt i steg C2 og IKKE gjennomført: flyttes de fire tonene langs sin egen kulør til gulvet holder i alle tre døgntider, havner de alle på lyshet 0,75–0,80 og blir umulige å skille — LABIRINTO går fra `#b08d5a`/`#c9a37a`/`#d8b48c`/`#9c7f5e` til `#dcccb5`/`#e0cab3`/`#e3caae`/`#d8ccbe`. Da er poenget med en palett på fire toner borte. Trenger en annen vei enn lyshet (tak eller omriss på de spredte husene, slik kvartalene har).
- [GRAND PRIX] `roofPal` er dødkode, og DISCESAs `cityPal` likeså – liten – 2026-11-10
  `roofPal` settes på LABIRINTO (linje ~1937) og DISCESA (~2453) og føres gjennom `makeTheme`, men leses ingen steder. `dBuilding` kalles bare for `terrain==='city'`, så DISCESAs `cityPal` har heller ingen leser. Samme familie som cfg-feltene ryddet i `fc4996f`.
- [GRAND PRIX] `chrome_harness.py shot` skriver et bilde selv når den injiserte JS-en kaster – liten – 2026-11-10
  Et ukjent banenavn (f.eks. `shot --bane LABIRINTO`, der banen er et POSISJONSargument) gir et skjermbilde av hovedmenyen i stedet for en feil, så et «nattbilde av byen» kan i virkeligheten være menyen. Bør gi exit-kode ulik 0 når injeksjonen kaster.
- [GRAND PRIX] `chrome_harness.py` har to navn på samme flagg – liten – 2026-11-10
  `fps` skriver utdata med `--out`, `shot` med `--ut`. Bruker du `--out` på `shot`, tas bildet til standardnavnet uten at noe feiler, og et glob etterpå finner ingenting. Samme familie som punktet over: harnessen tier når kallet er feil.
- [GRAND PRIX] Sjekk 5 i `test_bevegelse.js` er fortsatt utvannet på VISTANOTTE – liten – 2026-11-10
  6 px forskyvning av rammen leser 6,00 px på DUNA, men bare 2,50 px på VISTANOTTE: hjulets faste punktsett inneholder hjørnene i boksen til nav-prikken (`arc(0,cy,6)`), som ligger 8,49 px fra dreiepunktet, og `|rotert(±6,±6)+(6,0)|` bunner ut på 8,49−6. Mutasjonen biter uansett, men følsomheten er ikke 1:1. Kan strammes ved å kreve at det faste punktet også ligger nær dreiepunktet.
- [GRAND PRIX] `chrome_harness.py fps --runder 6` sprenger harnessens eget tidsavbrudd – liten – 2026-11-10
  `kjor_chrome` har `timeout=180`, og seks runder x to døgntider x 300 bilder går over. Feilen kommer ut som en halv Python-traceback, så med `2>/dev/null` er den usynlig. Beste-av-N må i dag gjøres ved å kjøre `--runder 3` flere ganger og ta laveste blokk-tall selv. Bør enten skalere tidsavbruddet med `runder*tider` eller si tydelig hva som gikk galt — samme familie som de to andre harness-punktene over, der kallet tier når det feiler.
- [GRAND PRIX] VULCANO og DISCESA ble MINDRE ulike av runde 4 – middels – 2026-11-10
  Fingeravtrykksmålingen i steg E (`maalinger/maal_signatur_E.txt`) gir 35,47 → 24,94, og de er nå det svakeste paret av alle 78. Begge leser som brun bakke med et blekt rektangulært landemerke til venstre (observatoriet og olivengården). VULCANOs ene kjennetegn, lavaelva, er ikke i bildet i det hele tatt ved banens egen `landmarkT` 0,72. Fem andre par ble også dårligere, men bare med 0,1–4,1.
- [GRAND PRIX] `ARK_T`-overstyringene i harnessen dekker bare to baner, resten er ikke vurdert – liten – 2026-11-10
  Steg E målte at et landemerke er inne i bildet i bare 4–9 av 100 rundeposisjoner, men bare CAMPAGNA og VISTANOTTE har fått et målt kamerapunkt. De elleve andre står på temaets `landmarkT`, og for VULCANO er det beviselig et dårlig valg (punktet over). `maalinger/maal_ark_kamera_E.txt` har allerede tallene for hele runden på alle 13.
- [GRAND PRIX] ESSE/CASUAL/ULTRA-spredningen er ikke stabil nok til å måles med ett tall – liten – 2026-11-10
  Punktet over sier 0,9857, men sluttmålingen i steg E gir 0,744 for samme konfigurasjon. To kjøringer av `test_ai_sim.js` spriker altså med 25 %, så terskelen «under én runde» kan ikke avgjøres av én kjøring. Trenger beste-av-N eller flere forsøk per konfigurasjon før punktet kan lukkes.
- [GRAND PRIX] `chrome_harness.py shot` kan ikke brukes til før/etter-bevis: griden er ikke reproduserbar – liten – 2026-11-11
  `buildCars()` stokker identitetspotten og `rollPlayerIdent()` velger lag med useedet `Math.random()`, som harnessen aldri seeder. To kjøringer av SAMME fil gir ulike bilder. Harnessen bør seede `Math.random` slik `test_ai_sim.js` gjør (`mulberry32`), eller ta et valgfritt `--seed`.
- [GRAND PRIX] MONTE SPIRA gir to ulike skjermbilder selv med seedet `Math.random` – liten – 2026-11-11
  Målt tre ganger på en uendret fil: hash `2cc63d99` på første kjøring, `52f83699` på de to neste. De tolv andre banene ble bit-identiske av seedingen, så det finnes en andre kilde til tilfeldighet som bare slår inn her. Må finnes før punktet over kan lukkes helt.
- [GRAND PRIX] `test_spiller_sving.js` kommer ikke rundt LABIRINTO, så banen måles ikke – liten – 2026-11-11
  Testens autopilot ligger 99,6 % utenfor banen og fullfører aldri en runde, både med og uten boost. Gjelder også før runde 5 (verifisert mot `HEAD`), så det er ikke en regresjon — men steg H-tallene for den trangeste gatebanen er i praksis ikke dekket. Autopiloten trenger trolig smalere linje i de 90-graderssvingene.
- [GRAND PRIX] `chrome_harness.py fps --tod` måler med lakkene fra feil døgntid – liten – 2026-11-11
  `fps_js` setter `todIdx` ETTER `startRace()`, og `startRace()` bygger spritene med `buildCarSprites()`, der `aktivLakk(bane,TID)` velger lakk ut fra den tiden som gjaldt DA spritene ble bygget. En «NATT»-måling tegner altså dagbiler i nattlys, så NORDHAVs Nordlys og de andre tidslakkene er ikke med i noen `fps`-tabell. Samme feil som nettopp ble rettet i `shot_js` (`SETTINGS.tid=TOD[tod].name` FØR `startRace()`), bare i nabofunksjonen. Lyset og banen er riktige, så alle eksisterende tall står — det er bare bilenes lakk som er fra feil tid.

## Arkaden (felles)

- [ARKADE] Del 1: felles `arkade.js` med løkke, taster, pause, lagring og farger, tatt i bruk i de andre spillene – stor – 2026-10-30
  Alle spillene i rotmappa har i dag hver sin kopi; `vintage_f1.html` og `asteroids.html` har de nyeste versjonene av løkka og tastehåndteringen.

## Kritiske feil i de andre spillene

Hører til ARKADE del 1, men står hver for seg så de kan tas enkeltvis.

- [BLOKK] HOLD virker ikke – liten – 2026-10-30
  `tetris.html`
- [RACING] Gassen henger – liten – 2026-10-30
  `racing.html`; samme familie som ASTEROIDER steg B, der `e.key` ble byttet til `e.code`.
- [RACING] Falsk tidsstraff – liten – 2026-10-30
  `racing.html`
- [ROM-RYDDER] Ubalansert vanskelighetsgrad – liten – 2026-10-30
  `space_shooter.html`
- [KLODDE] Partiklene oppfører seg feil – liten – 2026-10-30
  `mario.html`
- [SLANGE] Svinger blir tapt – liten – 2026-10-30
  `snake.html`; trolig samme sak som at taster leses i feil rekkefølge mot tidssteget.

## ASTEROIDER (`asteroids.html`)

Steg A–D er ferdige (`743a0a8`, `5299f6d`, `f65fc68`, `2583e8a`). Resten tas én del om gangen.

- [ASTEROIDER] Seedet tilfeldighet – liten – 2026-10-30
  Gjøres før del 2; samme mønster som GRAND PRIX runde 4 steg A (`mulberry32` + `seedFromName`).
- [ASTEROIDER] Del 2: lyd og juice – middels – 2026-10-30
- [ASTEROIDER] Del 3: PULS-modus, der hjerteslaget er klokka – middels – 2026-10-30
- [ASTEROIDER] Del 4: sektorer, steintyper og oppgraderinger – stor – 2026-10-30
- [ASTEROIDER] Del 5: moduser og attract mode – middels – 2026-10-30
