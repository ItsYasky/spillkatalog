# Senere

Venteliste. Alt som dukker opp utenfor det som er bestilt, havner nederst her i
stedet for å bli fikset med en gang. Reglene står i `CLAUDE.md` under
«Ventelista».

Format: `[spill] kort beskrivelse – størrelse – dato`, én linje per punkt, med
høyst én linje under som sier hvor i koden det gjelder.

## GRAND PRIX (`vintage_f1.html`)

- [GRAND PRIX] Runde 4 steg C: bykvartaler og landemerker for LABIRINTO, SERPENTINA og VISTANOTTE – stor – 2026-10-30
  `dBuildingGrid` og city-grenen i `buildTrackBg`; de tre ble bevisst utsatt fordi landemerket og kvartalene må lages sammen.
- [GRAND PRIX] Runde 4 steg D – ukjent – 2026-10-30
  Innholdet er ikke skrevet ned noe sted; må planlegges før det kan estimeres.
- [GRAND PRIX] Runde 4 steg E – ukjent – 2026-10-30
  Samme som steg D: ikke nedskrevet ennå.
- [GRAND PRIX] Vanskelighetsgrad-stigen henger ikke sammen – ukjent – 2026-10-30
  Gjelder `DIFFICULTIES`; hva som konkret skal endres er ikke nedskrevet.
- [GRAND PRIX] LEGENDE-nivå over ULTRA – ukjent – 2026-10-30
  Nytt steg i `DIFFICULTIES`; avhenger av at stigen over er avklart først.
- [GRAND PRIX] Slå av banegrenser på ENKEL – liten – 2026-10-30
  `checkTrackLimits()`; en nybegynner skal ikke få slettet runder.
- [GRAND PRIX] Ny meny – ukjent – 2026-10-30
  Innholdet er ikke nedskrevet; dagens meny er bane-, runde- og vanskelighetsvalg.
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

- [ARKADE] Del 1: felles `arkade.js` som spillene deler i stedet for at hver HTML-fil har sin egen kopi – stor – 2026-10-30
  Gjelder alle spillene i rotmappa; innholdet er ikke nedskrevet ennå.

## ASTEROIDER (`asteroids.html`)

- [ASTEROIDER] Del 1 til 5 – ukjent – 2026-10-30
  Steg A–D er ferdige (`743a0a8`, `5299f6d`, `f65fc68`, `2583e8a`); hva «del 1–5» skal inneholde er ikke nedskrevet.
