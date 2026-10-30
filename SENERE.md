# Senere

Ting som er bevisst IKKE gjort, med nok bakgrunn til at de kan tas opp igjen
uten å måtte måles på nytt. Står noe her, er det fordi det er vurdert og lagt
bort — ikke fordi det er glemt.

## GRAND PRIX (`vintage_f1.html`)

**Halv oppløsning på bakkeflis-fyllet.** Bakkemønsteret under skjermkanten
fylles i dag i full oppløsning inne i verdenstransformen, og et ROTERT
mønsterfyll koster 2,21 ns per piksel (mot 0,36 akseparallelt — det er
rotasjonen som koster, ikke mønsteret). Det gir +0,26 ms på VULCANO og
+0,23 ms på VISTANOTTE, de to banene der mest av skjermen ligger utenfor
bakgrunnsbildet. Å fylle i et halvt så stort lerret og blåse det opp
akseparallelt er målt til 1,37 ns/px, altså **−38 %**, mot at bakken blir
tilsvarende uskarpere.

Ikke gjort nå fordi bildetiden er 1,9 ms mot et budsjett på 16,7 ms ved 60 Hz
— det er ~540 bilder/s, og uskarphet er en dårlig handel for tid vi ikke
trenger. Tas opp igjen hvis bildefrekvensen noen gang blir et reelt problem.
Målingene står i `CLAUDE.md` under «Avvik verdt å vite i steg B5».
