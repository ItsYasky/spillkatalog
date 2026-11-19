# GRAND PRIX — FJORD, den fjortende banen

Bestillingen slik Yasir ga den 2026-11-19. Gjengitt uendret.

---

Jeg vil legge til en FJORTENDE bane i GRAND PRIX (`vintage_f1.html`): FJORD, en
smal og teknisk kystbane, og hjemmebanen til NORDHAV (Stavanger). Den bygger på
den eksisterende banegeneratoren `genCP` og trenger INGEN endring i den —
kontrollpunktene under er allerede målt mot `genCP`/`buildPath` og gir en ren
bane. Banen er PC-only som resten av spillet.

Les `CLAUDE.md` først og følg den. Ikke les hele `vintage_f1.html`. Bruk
`grep -n` og les bare `buildTrack`, `TRACKS`-arrayet, `THEMES`, `buildTrackBg`
(de delene du trenger: `groundLayer`, `landmark`, `belte`/`utside`/`scene`-
hjelperne), og `update()` der veggene og grusen leses — ikke mer.

Lagre denne prompten som `prompter/grand-prix-baner-fjord.md` før du begynner,
og legg en henvisning i fremdriftstabellen. Jobb i fem steg (A–E). Etter hvert
steg: test, commit, oppdater loggen i `CLAUDE.md`, gi meg en kort statusrapport
med skjermbilder, og STOPP. Jeg skriver `/clear` og ber deg fortsette.

Alt du finner underveis som er utenfor bestillingen, FIKS DET IKKE — legg det i
`SENERE.md` etter reglene i `CLAUDE.md`.

## STEG A — Geometrien og et minimalt tema (banen skal kunne kjøres)

Legg banen inn i `TRACKS` med nøyaktig disse kontrollpunktene (P = `Math.PI*2`):

```js
buildTrack({name:'FJORD', info:'Fjord · Smal, tunnel og sikksakk over fjellet',
  ncp:46, R0:1400, cx:1500, cy:1400, wobbleAmp:220, wobbleFreq:2, wobblePhase:Math.PI/2,
  TW:48, terrain:'fjord', naturligTid:'SOLNEDGANG',
  features:[
    {a0:.15*P, width:.06*P,  depth:160},   // Fjordsvingen (rask)
    {a0:.25*P, width:.019*P, depth:-240},  // Brygga, venstre
    {a0:.285*P,width:.019*P, depth:200},   // Brygga, høyre
    {a0:.40*P, width:.10*P,  depth:60},    // slakt inn mot tunnelen
    {a0:.47*P, width:.016*P, depth:-230},  // Blindsvingen i tunnelen
    {a0:.64*P, width:.025*P, depth:-330},  // Stigen
    {a0:.70*P, width:.025*P, depth:250},   // sikksakk
    {a0:.76*P, width:.033*P, depth:-230},  // Svingane
    {a0:.82*P, width:.025*P, depth:250},   // Utsikten
    {a0:.93*P, width:.020*P, depth:-330},  // Naustsvingen
    {a0:.972*P,width:.016*P, depth:150}
  ],
  straightCount:2
}),
```

Bruk `Math.PI*2` i stedet for `P` hvis `P` ikke finnes i scope der `TRACKS`
står.

Dette er tallene, ikke et utgangspunkt å justere fritt — de er målt slik at ingen
sving er krappere enn at kantlinja, kerbene og grusen får plass på innsiden. Når
du har lagt dem inn, bekreft med en liten måling (samme formel som
`test_banegeometri`-tallene bygger på) at banen reproduserer:

* PATH-lengde ~10418 px, PN 828 (ncp 46 gir ~12,7 px mellom punktene, som
  VISTANOTTE — tett nok til at `smoothCurv` fanger hårnålene; derav ncp 46 og
  ikke 32).
* Minste svingradius ~74 px, altså over gulvet `TW + GRAVEL_SAFE = 71`. Avviker
  den, har du skrevet av feil — ikke «fiks» ved å endre et kontrollpunkt.
* ~28 % krappe partier.

Nytt tema (minimalt i dette steget). `buildTrack` kaller `makeTheme('FJORD')`,
så banen KASTER i `buildTrackBg` uten en `THEMES['FJORD']`-oppføring. Legg en
oppføring med bare det som trengs for at bakgrunnen bygges: `ground` (2–3
bakketoner), `asphalt`, `speckle`. Landskap og landemerke kommer i steg B og C.
Velg bakketoner som holder ≥3:1 internt (`lagPal`-kravet i `test_banetema.js`
sjekk 14) — en grønn/grå kysttone. Asfalt i samme område som de andre
(`#3a` … `#40`).

Geometrilåsen må utvides BEVISST. `test_banegeometri.js --mot
maalinger/geo_laas.json` låser de TRETTEN eksisterende banene. FJORD er en ny,
fjortende bane:

1. Bekreft FØRST at de tretten gamle er BIT-IDENTISKE (en ny bane i `TRACKS`
   skal ikke flytte noen annen banes tall). Hvis en gammel bane endrer seg,
   stopp og finn ut hvorfor.
2. Regenerer så `geo_laas.json` slik at FJORD kommer med som et nytt grunnlag,
   og si i rapporten at låsen nå dekker 14.

AI-en må testes på banen. Kjør `test_ai_sim.js` for FJORD (ikke hele matrisen på
nytt — de 13 andre er uendret, bekreft det felt for felt mot
`ai_baseline_etter_runde4.json` / siste baseline). Se spesielt på de krappeste
svingene: Svingane (~0,76) og Naustsvingen (~0,93). Krav: spredning under én
runde i alle fire konfigurasjonene, og banegrensebrudd på nivå med de andre
banene (ikke en ny utligger som SERPENTINA). Renner AI-en vidt eller kjører i
grusen gjentatte ganger i én bestemt sving, ÅPNE den svingen litt (øk `width` på
den featuren med ~10 %) og mål på nytt — men bare den svingen, og bare hvis
AI-en faktisk feiler der.

Test A: banen bygger (`chrome_harness.py maal` — OBLIGATORISK PORT, ingen
JSC-test beviser at bakgrunnen bygges), geometrien på de 13 gamle uendret, FJORD
lagt til i låsen, AI-sim på FJORD innenfor kravene, og et skjermbilde av banen i
baneutvalgets minikart + ett i spill.

## STEG B — Landskapet (fjord-terrenget)

Nå får `terrain:'fjord'` sitt `groundLayer`. Følg oppskriften fra runde 4 steg B
(`belte(t0,t1,utside(),avstand,radius,rader,sving)`, toner i `lagPal`, unntak i
`lagMot`):

* Fjorden på utsiden langs kaia-strekket (start/mål, ~0,90–0,32): åpent vann,
  med den ene glimt-detaljen `scene.flate` ikke har, så det leses som vann og
  ikke som en tørr flate.
* Sundet under brua (~0,29–0,37, se steg C): vannet går inn under banen og ut i
  en liten poll i indre felt.
* Fjellsida på innsiden av sikksakken (~0,36–0,90): grå stein, med en lysere
  snøtone mot de høyeste punktene (Toppen/Utsikten, ~0,70–0,82).
* Trær: bjørk og gran i klynger, tettest på fjellsida, ingen ute i vannet.

Tonene måles som ellers: hver landskapstone ≥3:1 mot den verste bakketonen
(sjekk 14/15), og alt navngis i `lagPal`/`lagMot`. Fjorden er den eneste store
flaten som skal LANGS banen og ikke i indre felt (runde 4 steg B punkt 1).

Test B: `test_banetema.js` grønn med de nye sjekkene, `test_banegeometri.js`
uendret på alle 14, `chrome_harness.py maal`, og et 1:1-skjermbilde på
SOLNEDGANG av kaia-strekket (vann på utsiden) og av fjellsida.

## STEG C — Landemerket, brua og nattlysene

* Naustrekka (landemerket): en rad med røde naust på kaia, gavlen mot sjøen, på
  start/mål-strekket (~0,95–0,10, siden på vannsida). Plasseres med
  `scene.plasser` MED `hoyde`-argument (runde 4 steg B2 punkt 1 — taket er en
  egenskap ved lerretet). Hold byggene små: et naust er lite, og størrelse er en
  feilkilde på linje med farge (steg B2 punkt 5). De røde naustveggene måles mot
  bakketonen de står på, ikke mot vannet.
* Brua (~0,29–0,37): dekke over sundet, med REKKVERK i stedet for grus på begge
  sider, og en skygge på vannet under. Dette er visuelt — ikke hard vegg (se
  steg D for tunnelen). Banen har rett-modus-sonen sin på kaia, ikke på brua.
* Nattlys: lamper langs naustrekka og på brua, lagt med `addLight` i
  VERDENSKOORDINATER (runde 4 steg A). Fyr-/kaistemning på SOLNEDGANG og NATT.

Test C: `test_banetema.js` (landemerketonene ≥3:1, sjekk 18 hvis den gjelder),
margin-sjekken for landemerket (minste margin ikke under ~128 px som DISCESA),
`test_banegeometri.js` uendret, `chrome_harness.py maal`, og skjermbilder på
SOLNEDGANG og NATT ved landemerket (`shot --t` på naust-strekket) som viser
naustene, brua og at lysene står på rett sted.

## STEG D — Tunnelen

Tunnelen (~0,40–0,58) er det ene virkelig nye ved banen. Del den i to, så
fysikken er isolert:

**D1 — tunnelen visuelt (rører ikke fysikk).**

* Fjellvegg tett inntil asfalten på begge sider gjennom tunnelpartiet, mørkere
  dekke, og lamper langs veggene (de samme `addLight`-lysene som ellers; om
  natta er de det eneste lyset inni).
* Skjermen dempes litt mens bilen er inne i tunnelen (et svakt mørkt overlegg
  når `rundepos` er i tunnelintervallet) — mål dempingen, ikke øyemål, så
  teksten i HUD-en fortsatt holder 4,5:1.
* Grusen og banegrensene er UENDRET her: dette steget legger ikke til kollisjon.

**D2 — harde tunnelvegger (VALGFRITT, egen avgjørelse). Spør meg før du gjør
D2.** Hvis vi vil at det skal koste fart å treffe tunnelveggen slik som på
gatebanene, må `cfg.walls`-systemet (wallOffsArr + kontakt i `update()`) utvides
fra «hele banen» til ET INTERVALL. Det rører `update()`, som er fysikk-/AI-stien,
så AI-en MÅ simuleres på nytt og bevises uendret på de 13 andre banene, og FJORD
må måles for at AI-en ikke setter seg fast i tunnelen. Som standard er FJORD
altså fysikk-ren (D1 alene), og de harde veggene er et bevisst tillegg.

Test D: `chrome_harness.py maal`, `test_banegeometri.js` uendret, og
skjermbilder inne i tunnelen på DAG og NATT som viser veggen tett inntil,
lampene og dempingen. For D2 i tillegg: full AI-sim, bit-identisk på de 13
andre.

## STEG E — Sluttsjekk

1. Alle testene i `tester/` grønne. `test_banegeometri.js --mot geo_laas.json`
   dekker nå 14 og er uendret på de 13 gamle.
2. `chrome_harness.py maal` bygger alle 14 (ingen over 100 ms-budsjettet).
3. `chrome_harness.py signatur`: FJORD skal være til å skille fra de andre
   banene. Den eneste banen i nordisk kystlandskap, så den bør ligge godt unna.
   Rapporter FJORDs nærmeste nabo.
4. AI-sim på FJORD innenfor kravene fra steg A, og de 13 andre uendret.
5. Legg i `SENERE.md` (ikke gjør det nå):
   * Hjemmelakk for NORDHAV på FJORD (egen spesiallakk, etter oppskriften «Ny
     lakk eller nytt lag» i `CLAUDE.md`).
   * En bevegelig detalj på FJORD (en båt som vugger i havna, etter
     `scene.beveg`-stillaset) hvis banen skal følge samme standard som de fire
     andre med bevegelse.
   * D2 (harde tunnelvegger) hvis vi ikke tok det.
6. Push.

Rapport: kort per steg. Si hva du endret, testresultater og målinger, og alt du
måtte gjøre annerledes enn denne prompten sier, og hvorfor.
