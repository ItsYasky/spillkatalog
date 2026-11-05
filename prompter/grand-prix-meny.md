Jeg vil bygge om menyene i GRAND PRIX (`vintage_f1.html`). I dag er baneutvalget fullt av valg som styres med ti forskjellige taster (←→ bane, ↑↓ AI-nivå, Q/E distanse, Z/X skin, C/V tid på døgnet, L lag, P øving, TAB modus i hovedmenyen). Det er rotete, vanskelig å huske og vanskelig å lese. Målet er en ryddig meny der du kommer raskt inn i et løp, og der alle innstillingene ligger på ett sted.

**Les `CLAUDE.md` først og følg den.** Ikke les hele `vintage_f1.html`. Bruk grep og les bare menykoden (`state==='menu'`, `'trackselect'`, `'teams'`, `'win'`, `'practice'` i `draw()` og i tastaturhendelsen).

Gjør BARE menyene. Ikke endre fysikk, AI, vanskelighetsgradene, banene eller selve løpet. Alt du finner underveis som er utenfor menyene, legger du i `SENERE.md` etter reglene i `CLAUDE.md`. Når menyen er ferdig, fjern menypunktet fra `SENERE.md`.

Jobb i fire steg (A–D). Etter hvert steg: test, commit, oppdater loggen i `CLAUDE.md`, gi meg en kort statusrapport med skjermbilder, og stopp. Jeg skriver `/clear` og ber deg fortsette.

## Prinsippene

1. **Én måte å navigere på, overalt:** ↑↓ flytter, ←→ endrer en verdi, ENTER velger, ESC går ett nivå tilbake. Ingen bokstavtaster i menyene.
2. **ESC går tilbake, ikke ut.** I dag sender ESC deg rett til katalogen fra baneutvalget. ESC skal bare gå til katalogen fra hovedmenyen.
3. **Kort vei til løp:** fra hovedmenyen skal det ta to trykk å starte et løp med innstillingene du hadde sist (ENTER på LØP, ENTER på banen).
4. **Innstillingene huskes.** Alt som kan stilles inn lagres i `localStorage` (nøkkel `gp_innstillinger`, JSON med versjonsnummer og try/catch), og er det samme neste gang du åpner spillet.
5. **Det du har valgt er alltid synlig.** Banevalget viser en kort linje med de viktigste innstillingene, så du ser hva du starter uten å gå inn i menyen.
6. All tekst minst 9 px og minst 4,5:1 kontrast, norsk tekst. Canvasen er 520 × 680.

## Ny oppbygning

Jeg har en visuell skisse av alle fem skjermene (hovedmeny, banevalg, innstillinger, pause og resultat). Følg den så tett som mulig: mørk bakgrunn (`#07090d`), Courier New, valgt rad markert med rød venstrekant og ▸, og en boks i banevalget som viser innstillingene. Skissen er tegnet i 520 × 680.

```
HOVEDMENY
  ▸ LØP              → BANEVALG → løp
    ØVING            → BANEVALG → øving
    INNSTILLINGER
    LAG               (lagoversikten som finnes i dag)
    ESC Katalog

BANEVALG
  ←  MONTE SPIRA  →     (minikart, info, landemerke som i dag)
  REALISTISK · ULTRA · 5 RUNDER · DAG (AUTO) · DITT LAG: Isvind Energi NORDHAV
  ENTER kjør   ↓ innstillinger   ESC tilbake

INNSTILLINGER  (↑↓ velg rad, ←→ endre)
  MODUS          ‹ REALISTISK ›
  AI-NIVÅ        ‹ ULTRA ›
  DISTANSE       ‹ 5 RUNDER ›
  TID PÅ DØGNET  ‹ AUTO ›        (AUTO, DAG, SOLNEDGANG, NATT, TILFELDIG)
  DITT LAG       ‹ TILFELDIG ›   (TILFELDIG eller et av de ti lagene)
  SKIN           ‹ STANDARD ›    (med bilforhåndsvisning)
  SPØKELSE       ‹ PÅ ›
  ESC tilbake (lagres automatisk)

PAUSE I LØP (ESC)
  FORTSETT · START PÅ NYTT · TIL BANEVALG · AVSLUTT TIL MENY

RESULTAT
  ▸ KJØR IGJEN · NESTE BANE · TIL BANEVALG · MENY
```

---

## STEG A – Innstillinger og lagring

- Samle alle innstillingene (modus, AI-nivå, distanse, tid på døgnet, lag, skin, spøkelse) i ett objekt, og lagre og hent det med `gp_innstillinger`. Ved ugyldig eller manglende lagring brukes dagens standardverdier.
- **DITT LAG:** i dag trekkes et tilfeldig lag hver gang du går inn i baneutvalget. Gjør det til en innstilling: TILFELDIG (som i dag, trekkes per løp) eller et fast lag.
- **TID PÅ DØGNET** får to nye valg:
  - **AUTO (standard):** hver bane får sin naturlige tid på døgnet. Legg feltet `naturligTid` i hver banes konfigurasjon. Forslag: VISTANOTTE og DESERTO NATT (neonby og nattløp i ørkenen), SERPENTINA og VULCANO SOLNEDGANG (kveldslys og lavaglød), alle de andre DAG. Under raden i INNSTILLINGER står «Banens egen tid · MONTE SPIRA: DAG», og i banevalget vises tiden som «DAG (AUTO)».
  - **TILFELDIG:** trekker en ny tid per løp.
- Raden du står på i INNSTILLINGER får én kort forklaringslinje. For AI-NIVÅ: ENKEL «For å lære banene.» (legg til « Banegrenser av.» bare hvis det faktisk er laget, se `SENERE.md`), MIDDELS «Du vinner med små feil.», VANSKELIG «Du må kjøre bra for å vinne.», ULTRA «AI-en kjører nesten perfekt.», og hvis nivået LEGENDE finnes: «Feilfri. Bare en perfekt runde slår den.» Ikke nevn gummistrikk eller andre tekniske detaljer i teksten spilleren ser.
- Lag INNSTILLINGER-skjermen som i skissen, med bilforhåndsvisning ved SKIN-raden. Når MODUS byttes, må AI-nivået fortsatt peke på riktig nivå i riktig tabell (`DIFFICULTIES_CASUAL` eller `DIFFICULTIES_REALISTIC`).

**Test:** headless: lagre innstillinger, last siden på nytt (eller kjør oppstarten på nytt) og bekreft at alt er likt. Ødelagt JSON og en `localStorage` som kaster feil gir standardverdier uten krasj.

## STEG B – Hovedmeny og banevalg

- Ny hovedmeny som i skissen. Dagens kontrollhjelp (gass, brems, styring, rett-modus, boost) flyttes til en egen rad eller til bunnen av hovedmenyen. Den skal ikke ta all plassen.
- BANEVALG har bare ←→ for bane og ENTER. Linjen med innstillingene vises under banen. ↓ eller en egen knapp går til INNSTILLINGER, og ESC tilbake går til banevalget, ikke til hovedmenyen.
- Fjern alle bokstavtastene fra baneutvalget (Q/E, Z/X, C/V, L, P, og TAB i hovedmenyen).
- Hvis ENKEL er valgt og banegrenser av på ENKEL er laget, vis «BANEGRENSER AV» i innstillingslinjen. Er det ikke laget ennå, ikke vis noe om det.

**Test:** skjermbilder av hovedmeny, banevalg og innstillinger. Ingen overlappende tekst. Tell tastetrykk fra hovedmenyen til et løp starter med lagrede innstillinger. Det skal være 2.

## STEG C – Pause og resultatskjerm

- ESC i løp og i øving åpner en pausemeny i stedet for å gå rett ut. Løpet står stille så lenge menyen er oppe (bruk det faste tidssteget, så ingenting hopper når du fortsetter). Pause skal også skje automatisk når fanen mister fokus.
- I øving: pausemenyen har START ØKTA PÅ NYTT (erstatter R) og SPØKELSE PÅ/AV (erstatter G, men G kan beholdes som snarvei i øving).
- Resultatskjermen får valgene i skissen. NESTE BANE starter neste bane med samme innstillinger.

**Test:** headless: pause i 600 steg endrer ikke `raceTime`, posisjoner eller rundetider. Skjermbilder av pausemeny og resultatskjerm.

## STEG D – Rydding og sluttsjekk

- Gå gjennom alle menyskjermene og sjekk kontrast og skriftstørrelse med målte tall.
- Oppdater kontrollteksten for GRAND PRIX i `index.html`, slik at den passer med de nye menyene (for eksempel «↑ Gass · ↓ Brems · ← → Styr · SPC Rett-modus · SHIFT Boost · ESC Pause»).
- Skriv i `CLAUDE.md` hvordan menyene henger sammen, hvilke taster som gjelder hvor, og hvordan `gp_innstillinger` ser ut.

**Sjekkliste for meg:** kom deg fra katalogen inn i et løp, endre AI-nivå, kjør et løp, start på nytt fra pausemenyen, og gå til neste bane. Ingenting av det skal kreve at du husker en bokstavtast.

**Rapport:** kort per steg. Si hva du endret, testresultater, og alt du måtte gjøre annerledes enn denne prompten sier, og hvorfor.
