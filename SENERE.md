# Senere

Venteliste. Alt som dukker opp utenfor det som er bestilt, havner nederst her i
stedet for å bli fikset med en gang. Reglene står i `CLAUDE.md` under
«Ventelista».

Format: `[spill] kort beskrivelse – størrelse – dato`, én linje per punkt, med
høyst én linje under som sier hvor i koden det gjelder.

## GRAND PRIX (`vintage_f1.html`)

- [GRAND PRIX] Runde 4 steg C: bykvartaler og landemerker for LABIRINTO, SERPENTINA og VISTANOTTE – stor – 2026-10-30
  `dBuildingGrid` og city-grenen i `buildTrackBg`; de tre ble bevisst utsatt fordi landemerket og kvartalene må lages sammen.
- [GRAND PRIX] Runde 4 steg D: bevegelige detaljer, maks én per bane, bare når den er på skjermen, styrt av `raceTime` – middels – 2026-10-30
  Samme steg: nattlys for byene, havna, pariserhjulet, lavaen, gården og hangarene; `addLight` lagrer VERDENSKOORDINATER.
- [GRAND PRIX] Runde 4 steg E: kontaktark med alle 13 baner side om side, og sluttest på geometri, AI-sim, byggetid og bildefrekvens – liten – 2026-10-30
  E1 (minikart i baneutvalget) er bevisst HOPPET OVER — den nye menyen bygger om baneutvalget uansett.
- [GRAND PRIX] Vanskelighetsgrad-stigen: raskeste AI-bil mot Yasirs beste runde – middels – 2026-10-30
  ENKEL 12–15 % tregere, MIDDELS 7–8 %, VANSKELIG 3–4 %, ULTRA 0,5–1,5 %; samme stige i CASUAL (REALISTISK ULTRA er ferdig). Mål bare MONTE SPIRA, ARDENNE og CAMPAGNA.
- [GRAND PRIX] LEGENDE: femte nivå over ULTRA, like raskt som Yasirs beste runde ±0,5 %, ingen feil, hele feltet innenfor 1 % – stor – 2026-10-30
  Kan kreve bedre AI-linjer i hårnålene; `buildRaceLine` er alt forsøkt strammet én gang og ble FORKASTET (se `CLAUDE.md` steg H).
- [GRAND PRIX] Slå av banegrenser på ENKEL – liten – 2026-10-30
  `checkTrackLimits()`; en nybegynner skal ikke få slettet runder.
- [GRAND PRIX] Ny meny: hovedmeny, banevalg, innstillinger, pausemeny og resultatskjerm – middels – 2026-10-30
  Innstillinger = modus, AI-nivå, distanse, tid på døgnet med AUTO, lag, skin, spøkelse. Ingen bokstavtaster, ESC går ett nivå tilbake, maks to trykk til løp.
- [GRAND PRIX] ARDENNEs trær er praktisk talt usynlige, ~1,3:1 mot bakken – liten – 2026-10-30
  `treeTint:['#0e2e1c','#14472a','#071d12']` mot `ground:['#0b1710','#122017','#1b2c1e']`; et palettspørsmål fra runde 4 steg A.
- [GRAND PRIX] ESSE/CASUAL/ULTRA har spredning 0,9857, så vidt under én runde – middels – 2026-10-30
  Banen var ikke med i de fem som ble målt da `posFactor` ble strammet; mål med `test_ai_sim.js`.
- [GRAND PRIX] SERPENTINA/REALISTISK/ULTRA har 6,65 banegrensebrudd per bil – middels – 2026-10-30
  Gammel kjent sak, ikke forårsaket av steg H; alle andre ligger på ≤0,8.
- [GRAND PRIX] Død kode: `cfg.treeTint`/`rockTint`/`bushTint`/`groundBase`/`speckle` har ingen lesere etter at tonene flyttet inn i temaet – liten – 2026-10-30
  Felt på cfg-nivå i `TRACKS`; sjekk at det faktisk er cfg-nivået som er dødt før noe slettes.
- [GRAND PRIX] Del 3 steg G og H står som «pågår» uten hash enda arbeidet er committet i `10f2261` – liten – 2026-10-30
  Bokføring i fremdriftstabellen i `CLAUDE.md`.
- [GRAND PRIX] Halv oppløsning på bakkeflis-fyllet hvis bildetiden blir trang – middels – 2026-10-30
  Et rotert mønsterfyll koster 2,21 ns/px mot 1,37 i halv oppløsning (−38 %), mot at bakken blir uskarpere; målingene står i `CLAUDE.md` under steg B5.

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
