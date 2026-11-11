#!/usr/bin/env python3
# ============================================================================
# Chrome-harness for RUNDE 4 i vintage_f1.html.
#
#   python3 chrome_harness.py maal  [--html fil] [--out fil.txt]
#   python3 chrome_harness.py fps   [--html fil] [--out fil.txt] [--bane NAVN]
#                                         [--t 0.08] [--tod 0,2] [--runder 3]
#                                         [--uten-beveg]
#   python3 chrome_harness.py shot  BANE  [--tod 0] [--modus spill|bg] [--ut fil.png]
#                                         [--t 0.42] [--tid 0]
# MERK at BANE er et POSISJONSargument. Skrives det `shot --bane LABIRINTO`,
# kaster den injiserte JS-en på «ukjent bane» — men Chrome skriver skjermbildet
# likevel, av hovedmenyen, og harnessen avslutter med kode 0. Et «nattbilde av
# byen» kan altså i virkeligheten være menyen (se SENERE.md).
# `--tid` er løpsklokka i SEKUNDER, og trengs fordi update() nulles i shot:
# uten den står alt som beveger seg i samme stilling i hvert eneste bilde.
#   python3 chrome_harness.py ark   [--ut fil.png] [--kol 5] [--tid 2.0] [--tod 0]
# `ark` tegner alle 13 banene side om side i ÉN nettleserøkt, 1:1 med
# spillvisningen, hver bane i SIN EGEN naturligTid (--tod tvinger én felles).
# Kamerapunktet er temaets landmarkT med de unntakene som står i ARK_T.
#
# HVORFOR DENNE FINNES, OG HVORFOR DEN ER PYTHON
# `node` finnes ikke på maskinen, så logikktestene kjøres med JavaScriptCore
# (se test_banegeometri.js). Men JSC har ikke noe ekte canvas: der er hvert
# tegnekall en no-op, så JSC kan måle REKKEFØLGEN på tegnekallene, men aldri
# hvor LANG TID de faktisk tar eller hvordan bildet ser ut. Byggetid i
# millisekunder og skjermbilder må komme fra en ekte nettleser.
#
# Playwright finnes heller ikke (ingen npx/node), men Chrome gjør:
#   --headless=new --dump-dom     leser ut tall et injisert skript har regnet
#   --headless=new --screenshot    gir et ekte PNG av canvaset
# Python 3 ligger i /usr/bin og trengs bare til å klippe sammen HTML-filen og
# starte Chrome — all måling skjer i det injiserte JavaScriptet.
#
# HVORFOR EN INJISERT <script>-BLOKK VIRKER
# Spillet er én <script> uten moduler, og `const`/`let` på toppnivå i et
# klassisk skript havner i det delte globale leksikalske miljøet. En ny
# <script> som legges inn ETTER spillets egen blokk ser derfor TRACKS,
# buildTrackBg, startRace og resten direkte, uten at spillfilen må endres for
# å kunne måles. Måleskriptet legges rett før </body>.
# ============================================================================
import os, re, subprocess, sys, tempfile, json

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Scriptet selv ligger i tester/, men spillene ligger i spillkatalog-roten —
# default-stien til vintage_f1.html må derfor peke én mappe opp.
HER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def les(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def bygg_side(html_path, injisert):
    """Setter måleskriptet inn rett før </body> og skriver en midlertidig fil."""
    html = les(html_path)
    if "</body>" not in html:
        raise SystemExit("Fant ikke </body> i " + html_path)
    side = html.replace("</body>", "<script>\n" + injisert + "\n</script>\n</body>", 1)
    fd, p = tempfile.mkstemp(suffix=".html", dir="/tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(side)
    return p


def kjor_chrome(args, timeout=180):
    base = [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--hide-scrollbars", "--disable-lcd-text",
            "--user-data-dir=" + tempfile.mkdtemp(prefix="gpchrome")]
    r = subprocess.run(base + args, capture_output=True, text=True, timeout=timeout)
    return r.stdout


def dump(html_path, injisert, budget=120000):
    """Kjører et måleskript og plukker ut det det skrev i #gpout."""
    side = bygg_side(html_path, injisert)
    try:
        out = kjor_chrome(["--virtual-time-budget=%d" % budget, "--dump-dom",
                           "file://" + side])
    finally:
        os.unlink(side)
    m = re.search(r"<pre id=\"gpout\"[^>]*>(.*?)</pre>", out, re.S)
    if not m:
        raise SystemExit("Fant ikke #gpout i DOM-en. Chrome skrev:\n" + out[:3000])
    txt = m.group(1)
    for a, b in (("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&"), ("&quot;", '"')):
        txt = txt.replace(a, b)
    return txt


def skjermbilde(html_path, injisert, ut, bredde=520, hoyde=680, budget=20000):
    side = bygg_side(html_path, injisert)
    try:
        kjor_chrome(["--virtual-time-budget=%d" % budget,
                     "--window-size=%d,%d" % (bredde, hoyde),
                     "--screenshot=" + ut, "file://" + side])
    finally:
        os.unlink(side)
    if not os.path.exists(ut):
        raise SystemExit("Chrome lagde ikke " + ut)
    return ut


# ── måleskript: byggetid per bane ───────────────────────────────────────────
# Hver bane bygges tre ganger med en fersk TR.bg hver gang (buildTrackBg er
# idempotent og returnerer med en gang om bg finnes, så den må nulles mellom
# forsøkene) og MEDIANEN rapporteres. HVORFOR median og ikke snitt: første
# bygging på en bane betaler for oppvarming av canvas-backingen i Chrome og
# ligger systematisk 10-30 % over de neste, så snittet ville overdrevet
# kostnaden for alle baner likt. Medianen av tre er robust mot det ene uteliggeren.
MAAL_JS = r"""
(function(){
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  var linjer=[];
  for(var i=0;i<TRACKS.length;i++){
    var t=TRACKS[i], tider=[];
    for(var k=0;k<3;k++){
      if(t.bg){ t.bg.width=0; t.bg.height=0; t.bg=null; }
      var t0=performance.now();
      buildTrackBg(t);
      tider.push(performance.now()-t0);
    }
    if(t.bg){ t.bg.width=0; t.bg.height=0; t.bg=null; }
    tider.sort(function(a,b){return a-b;});
    // `beveg` er antall bevegelige detaljer. Taket er ÉN per bane, og det er
    // et tall nettopp for at taket skal være synlig utenfra — se kommentaren
    // over `bevegelse` i buildTrackBg.
    linjer.push(t.name+'\t'+tider[1].toFixed(1)+'\t'+t.bgW+'x'+t.bgH+'\t'+t.bgScale.toFixed(3)
      +'\t'+(t.nightLights?t.nightLights.length:0)+'\t'+(t.bevegelseN||0));
  }
  pre.textContent=linjer.join('\n');
})();
"""

# ── måleskript: bildefrekvens ───────────────────────────────────────────────
# Kjører et ekte løp med 20 biler og måler hvor lang tid update()+draw() tar
# per bilde, ikke hvor mange requestAnimationFrame-kall Chrome rekker. HVORFOR:
# i headless med --virtual-time-budget går klokka kunstig fort, så rAF-frekvens
# er meningsløs der. Tiden ett bilde KOSTER er derimot ekte, og det er den som
# avgjør om 60 Hz holder. Rapporterer snitt og 95-persentil i ms, pluss hvor
# mange bilder per sekund det tilsvarer.
#
# TO TALL PER RAD, og de måler ulike ting:
#   snitt_ms   — snittet av 300 enkeltmålinger. `performance.now()` er klemt til
#                0,1 ms i Chrome, så én enkeltmåling har 0,1 ms oppløsning og
#                snittet arver kvantiseringsstøyen. Greit til å se at en bane
#                ligger på 1,8 og ikke 18 ms.
#   blokk_ms   — HELE stykket på 300 bilder tidtatt som ÉN måling, delt på 300.
#                Da er 0,1 ms-klemmen fordelt på 300 bilder, altså 0,0003 ms per
#                bilde, og det er den eneste av de to som kan avgjøre et budsjett
#                på 0,3 ms. Samme metode som restkostnaden i steg B5 ble målt
#                med. `--runder N` gjentar stykket og rapporterer det BESTE
#                (laveste) — ikke snittet, for en treg runde er GC eller en
#                annen prosess på maskinen, og det er ikke tegnekostnad.
FPS_JS_MAL = r"""
(function(){
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  var linjer=[];
  var BANE=%s, OVR=%s, RUNDER=%d, UTEN=%s, TODS=%s;
  for(var i=0;i<TRACKS.length;i++){
    if(BANE!=null && TRACKS[i].name!==BANE) continue;
    for(var ti=0;ti<TODS.length;ti++){
      trackSel=i; lapsIdx=4; LAPS=20;
      difficulty=2;
      startRace();
      // MÅ settes ETTER startRace(), ikke før: startRace() kaller
      // resolveTodIdx(TR), som leser SETTINGS.tid (standard AUTO = banens egen
      // naturligTid) og overskriver alt som er satt på forhånd. Sto denne
      // linja før kallet, målte HVER rad banens egen tid — altså var «DAG» og
      // «NATT» for samme bane to målinger av nøyaktig samme bilde. Det er den
      // SAMME fella som ble rettet i `shot` i steg D1, og `fps` hadde den
      // fortsatt.
      todIdx=TODS[ti];
      state='playing';
      // --t: kameraet SETTES på kjørelinja ved rundeposisjon t, samme grep som
      // `shot --t`. Uten den måles alltid startstreken, og en bevegelig detalj
      // er KUTTET BORT der (det er nettopp poenget med kuttet) — bildetiden i
      // steg D2 var derfor prisen for et objekt som ikke ble tegnet.
      var PX=0,PY=0,PA=0;
      if(OVR!=null){
        var pi=Math.round(OVR*TR.PATH.length)%%TR.PATH.length;
        var rl=TR.raceLine[pi];
        PX=rl[0]; PY=rl[1]; PA=TR.heading[pi];
      }
      // Kameraet FESTES på nytt hvert bilde, og det er ikke pynt. update()
      // lerper kameraet mot spillerbilen, og en bil som står parkert midt på
      // banen blir påkjørt av feltet bakfra — da glir kameraposen under
      // målingen, og «med detalj» og «uten detalj» måler to ulike bilder.
      // Spillerbilen står stille uansett (update() leser keys['ArrowUp'], og
      // ingen taster trykkes), så festet endrer ingenting annet enn at posen
      // er beviselig den samme i alle 300 bildene i begge kjøringene.
      var fest=function(){
        if(OVR==null) return;
        player.x=PX; player.y=PY; player.angle=PA;
        camX=PX; camY=PY; camAngle=PA;
      };
      fest();
      // Detaljen slås av ved å nulle DATAEN, ikke ved å endre kode: det er
      // nøyaktig den tilstanden de tolv banene uten bevegelig detalj står i, så
      // differansen mellom de to kjøringene er detaljen og ingenting annet.
      var b=TR.bevegelse;
      if(UTEN) TR.bevegelse=null;
      // Teljaren står bare på under oppvarmingen og tas av før tidtakingen, så
      // den ikke måles med. Den svarer på det ene spørsmålet tallene ellers
      // ikke kan: ble detaljen faktisk TEGNET, eller målte vi kuttet igjen?
      var tegnKall=0;
      if(TR.bevegelse){
        var ekte=TR.bevegelse.tegn;
        TR.bevegelse.tegn=function(){ tegnKall++; return ekte.apply(this,arguments); };
      }
      // 90 bilder oppvarming: bilene står tett på grid de første stegene, og
      // slipstream/overtake-logikken er ikke i gang ennå — det er ikke et
      // representativt bilde av et løp.
      for(var w=0;w<90;w++){ update(); fest(); draw(); }
      if(TR.bevegelse) TR.bevegelse.tegn=ekte;
      var sp = b ? worldToScreen(b.x,b.y) : null;
      var ms=[], beste=Infinity, verst=0;
      for(var r=0;r<RUNDER;r++){
        ms=[];
        var b0=performance.now();
        for(var f=0;f<300;f++){
          var t0=performance.now();
          update(); fest(); draw();
          ms.push(performance.now()-t0);
        }
        var blokk=(performance.now()-b0)/300;
        if(blokk<beste) beste=blokk;
        if(blokk>verst) verst=blokk;
      }
      // DATAEN legges tilbake før neste runde. `ensureTrackBg` returnerer tidlig
      // når TR.bg alt finnes, så et nullet TR.bevegelse blir IKKE bygget på nytt
      // av neste startRace() — uten dette målte andre døgntid (og alle banene
      // etter den første) uten detalj selv om den skulle vært på, og rapporterte
      // skjermpos som «–» fordi dataen var borte.
      TR.bevegelse=b;
      var sum=0; for(var k=0;k<ms.length;k++) sum+=ms[k];
      var snitt=sum/ms.length;
      ms.sort(function(a,b2){return a-b2;});
      var p95=ms[Math.floor(ms.length*0.95)];
      linjer.push(TRACKS[i].name+'\t'+TOD[TODS[ti]].name+'\t'+snitt.toFixed(2)+'\t'+p95.toFixed(2)
        +'\t'+(1000/snitt).toFixed(0)+'\t'+beste.toFixed(4)+'\t'+(verst-beste).toFixed(4)
        +'\t'+(UTEN?'av':(b?tegnKall:'–'))
        +'\t'+(sp?('('+sp[0].toFixed(0)+','+sp[1].toFixed(0)+')'):'–'));
    }
  }
  pre.textContent=linjer.join('\n');
})();
"""


def fps_js(bane=None, t_overstyr=None, runder=1, uten_beveg=False, tods=(0, 2)):
    return FPS_JS_MAL % (
        "null" if bane is None else json.dumps(bane),
        "null" if t_overstyr is None else repr(float(t_overstyr)),
        int(runder),
        "true" if uten_beveg else "false",
        json.dumps(list(tods)))


# ── kontaktark: alle 13 baner side om side ──────────────────────────────────
# Kamerapunktet for kontaktarket, per bane. Standarden er temaets `landmarkT`,
# men den er landemerkets POSISJON og ikke nødvendigvis det punktet banen ser
# best ut fra: kameraet settes PÅ kjørelinja i det punktet, så et landemerke
# kan ligge rett til siden eller alt være passert. Hvert unntak under har en
# MÅLT grunn, ikke en smakssak — og at det trengs unntak i det hele tatt er
# verdt å vite før man bruker `landmarkT` som «vis meg banen»-punkt.
#
# Grunnlaget er en sveip over hele runden i hundre steg der ankeret til den
# bevegelige detaljen og hvert nattlys regnes om med spillets EGEN
# `worldToScreen` (se `maalinger/maal_ark_kamera_E.txt`). To tall derfra er
# verdt å ha i hodet: en bevegelig detalj er inne i bildet i bare 4–9 av 100
# rundeposisjoner, og selv på det tetteste punktet i en by ligger bare 5–8 av
# 44–68 nattlys inne. Landemerket er altså en liten del av runden, og
# `landmarkT` ± 0,01 er forskjellen på å se det og ikke.
ARK_T = {
    # Mølla er inne i bildet på 0,41-0,45. Temaets egen 0,44 setter ankeret
    # 114 px fra nærmeste bildekant, 0,42 setter det 136 px inn — altså mest
    # klaring til at vingene får svinge uten å bli klippet.
    "CAMPAGNA": 0.42,
    # Den ENE banen der landemerket og byen ikke kan være i samme bilde:
    # pariserhjulet er inne bare på 0,12-0,15, og der ligger 0-1 nattlys inne,
    # mens byen er tettest på 0,63-0,65 med 5. Kvartalene ligger på 0,20-0,98
    # og 0,24-0,96, så landemerket står i rundas eneste hull (steg D1 punkt 3)
    # — nå målt over hele runden og ikke bare ved landemerket.
    #
    # Valget falt på BYEN, og grunnen er hva arket skal brukes til: runde 4
    # påstår at to baner med samme terreng nå er til å skille. Den påstanden
    # prøves på de tre bybanene, og LABIRINTO (0,26, katedral + 4 lys) og
    # SERPENTINA (0,37, kran + 5 lys, banens maksimum) viser BEGGE bymassen.
    # En VISTANOTTE-celle med hjul mot tom eng ville vært den ene cellen som
    # ikke er med i sammenligningen. Hjulet er dessuten bevist et annet sted
    # (`test_bevegelse.js` og bildene fra D2); bymassen er det arket prøver.
    "VISTANOTTE": 0.63,
}

# Tiden på løpsklokka i kontaktarket, i sekunder. Ikke 0: de fire bevegelige
# detaljene står i utgangsstillingen sin på t=0, og for SERPENTINAs kran er
# det midtstillingen — altså det ene tidspunktet der lasta ikke sier om den
# er på vei opp eller ned. 2,0 s er valgt fordi det ligger utenfor startpunktet
# til alle fire periodene (5 s, 5,5 s, 7,2 s, 8 s).
ARK_TID = 2.0

# Arket trenger landemerkeposisjonen og banens egen døgntid FØR cellene kan
# legges ut, og de to tallene bor i temaet. TRACKS inneholder FERDIG BYGDE
# baner (buildTrack kalles inne i selve literalen), så de leses rett av banen —
# `buildTrack(TRACKS[i])` ville kastet, siden argumentet skal være en cfg.
ARK_META_JS = r"""
(function(){
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  // Cellestørrelsen LESES av spillcanvaset i stedet for å skrives inn som et
  // tall. Målt er den 520x680 (`<canvas id="g" width="520" height="680">` og
  // `const W=520,H=680`), altså nøyaktig det vinduet `shot` ber om, og
  // ingenting skalerer den underveis. Avlesningen står likevel her, og
  // ARK_JS_MAL sjekker den mot sitt eget layout-tall, slik at et ark ikke
  // kan legges ut for en annen størrelse enn den det faktisk tegnes i.
  var ut=['CV\t'+cv.width+'\t'+cv.height+'\t-'];
  for(var i=0;i<TRACKS.length;i++){
    var tr=TRACKS[i];
    var lmT=(tr.theme && tr.theme.landmarkT!=null) ? tr.theme.landmarkT : -1;
    var nat=tr.naturligTid||'DAG', todI=0;
    for(var k=0;k<TOD.length;k++) if(TOD[k].name===nat) todI=k;
    ut.push([i, tr.name, lmT.toFixed(4), todI].join('\t'));
  }
  pre.textContent=ut.join('\n');
})();
"""

ARK_JS_MAL = r"""
(function(){
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  var CELLER=%s, KOL=%d, CW=cv.width, CH=cv.height, LBL=%d, GAP=%d, TID=%s;
  if(CW!==%d || CH!==%d) throw new Error('canvas er '+CW+'x'+CH+', arket er lagt ut for %dx%d');
  var RAD=Math.ceil(CELLER.length/KOL);
  var ark=document.createElement('canvas');
  ark.width = KOL*CW + (KOL+1)*GAP;
  ark.height = RAD*(CH+LBL) + (RAD+1)*GAP;
  var a=ark.getContext('2d');
  a.fillStyle='#05070a'; a.fillRect(0,0,ark.width,ark.height);
  var logg=[];
  for(var n=0;n<CELLER.length;n++){
    var c=CELLER[n], idx=c[0], tod=c[1], t=c[2];
    trackSel=idx; lapsIdx=4; LAPS=20; difficulty=2;
    startRace();
    // ETTER startRace(), ellers overskriver resolveTodIdx(TR) valget — samme
    // felle som `shot` og `fps` begge har gått i (steg D1 punkt 2, D3a punkt 1).
    if(tod>=0) todIdx=tod;
    state='playing';
    // update() nulles: spillets rAF-løkke kjører videre gjennom hele
    // --virtual-time-budget, og med fysikken i gang triller bilen vekk fra
    // punktet før bildet er tatt.
    update=function(){};
    var pi=Math.round(t*TR.PATH.length)%%TR.PATH.length;
    var rl=TR.raceLine[pi];
    player.x=rl[0]; player.y=rl[1]; player.angle=TR.heading[pi];
    camX=player.x; camY=player.y; camAngle=player.angle;
    raceTime=TID*60;
    draw();
    var kx=GAP + (n%%KOL)*(CW+GAP);
    var ky=GAP + Math.floor(n/KOL)*(CH+LBL+GAP);
    a.drawImage(cv, kx, ky);
    // Etikettstripa UNDER cellen, ikke oppå bildet: en etikett tegnet i
    // bildet dekker HUD-en, som er en del av det arket skal vise.
    a.fillStyle='#0b0e14'; a.fillRect(kx,ky+CH,CW,LBL);
    a.textBaseline='middle';
    a.fillStyle='#ffffff'; a.font='bold 15px system-ui,sans-serif';
    a.fillText(TR.name, kx+9, ky+CH+LBL/2);
    a.fillStyle='#9aa4b2'; a.font='11px system-ui,sans-serif';
    var hoyre = TR.cfg.terrain+' · TW '+TR.cfg.TW+' · '+TOD[todIdx].name+' · t='+t.toFixed(2);
    a.fillText(hoyre, kx+CW-9-a.measureText(hoyre).width, ky+CH+LBL/2);
    logg.push(TR.name+'\t'+TOD[todIdx].name+'\t'+t.toFixed(3)+'\t'+TR.bgW+'x'+TR.bgH
              +'\t'+(TR.bevegelseN||0)+'\t'+(TR.nightLights?TR.nightLights.length:0));
    // Bakgrunnen frigis FØR neste bane bygges. Uten dette ligger 13
    // bakgrunnscanvas på opptil 16M px i minnet samtidig (~830 MB), og
    // Chrome faller over lenge før den trettende.
    if(TR.bg){ TR.bg.width=0; TR.bg.height=0; TR.bg=null; }
  }
  // draw() nulles til slutt, ellers maler rAF-løkka spillvisningen for den
  // SISTE banen oppå arket mens --virtual-time-budget fortsatt løper.
  draw=function(){};
  document.body.style.margin='0';
  document.body.style.background='#05070a';
  // BARE spillcanvaset skjules. Første utgave skjulte `cv.parentNode` også,
  // for å ta med en eventuell innpakning — men forelderen ER <body> i denne
  // fila, så hele sida forsvant og skjermbildet kom ut helt hvitt.
  cv.style.display='none';
  document.body.appendChild(ark);
  ark.style.position='fixed'; ark.style.left='0'; ark.style.top='0';
  pre.style.display='none';
  pre.textContent=logg.join('\n');
})();
"""


def ark_js(celler, kol, cw, ch, lbl=30, gap=6, tid=ARK_TID):
    return ARK_JS_MAL % (json.dumps(celler), kol, lbl, gap, repr(float(tid)),
                         cw, ch, cw, ch)


# Fingeravtrykket av én bane: middelfargen i hver rute av et rutenett lagt over
# spillvisningen. To baner er «til å skille» når avstanden mellom avtrykkene er
# stor, og det er den påstanden hele runde 4 hviler på — her gjort til ET TALL
# i stedet for en vurdering av et skjermbilde.
#
# Rutenettet og ikke ÉN middelfarge: to baner kan ha nøyaktig samme gjennomsnitt
# og se helt ulike ut (asfalt i midten, terreng i kantene er det samme snittet
# som en jevn grøt). Rutenettet bærer både farge og grovlayout.
#
# Fire områder er MASKERT bort, og det er ikke pynt — de er felles for alle 13
# banene og ville trukket hver avstand mot null:
#   * HUD-stripa øverst,
#   * ledertavla (lagfargene DER trekkes på nytt ved hver sidelasting, så de er
#     ren støy mellom to kjøringer — samme felle som pikseldiffen i D3a punkt 7),
#   * minikartet, og
#   * spillerbilen rundt CHASE_Y (lakkeringen trekkes også på nytt).
SIG_JS_MAL = r"""
(function(){
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  var CELLER=%s, KOL=%d, RAD=%d, TID=%s;
  var ut=[];
  try{
    var CW=cv.width, CH=cv.height;
    for(var n=0;n<CELLER.length;n++){
      var c=CELLER[n], idx=c[0], tod=c[1], t=c[2];
      trackSel=idx; lapsIdx=4; LAPS=20; difficulty=2;
      startRace();
      if(tod>=0) todIdx=tod;
      state='playing';
      update=function(){};
      var TR=TRACKS[idx];
      var pi=Math.round(t*TR.PATH.length)%%TR.PATH.length;
      var rl=TR.raceLine[pi];
      player.x=rl[0]; player.y=rl[1]; player.angle=TR.heading[pi];
      camX=player.x; camY=player.y; camAngle=player.angle;
      raceTime=TID*60;
      draw();
      var d=ctx.getImageData(0,0,CW,CH).data;
      var rad=[];
      for(var ry=0;ry<RAD;ry++) for(var rx=0;rx<KOL;rx++){
        var x0=Math.floor(rx*CW/KOL), x1=Math.floor((rx+1)*CW/KOL);
        var y0=Math.floor(ry*CH/RAD), y1=Math.floor((ry+1)*CH/RAD);
        var mx=(x0+x1)/2, my=(y0+y1)/2;
        var maskert = (my<60)                       // HUD-stripa
                   || (mx>395 && my<175)            // ledertavla
                   || (mx<112 && my>570)            // minikartet
                   || (Math.abs(mx-CW/2)<42 && Math.abs(my-478)<42); // spillerbilen
        if(maskert){ rad.push('-'); continue; }
        var sr=0,sg=0,sb=0,nn=0;
        for(var y=y0;y<y1;y++) for(var x=x0;x<x1;x++){
          var o=(y*CW+x)*4; sr+=d[o]; sg+=d[o+1]; sb+=d[o+2]; nn++;
        }
        rad.push((sr/nn).toFixed(2)+','+(sg/nn).toFixed(2)+','+(sb/nn).toFixed(2));
      }
      ut.push(TR.name+'\t'+TR.cfg.terrain+'\t'+TOD[todIdx].name+'\t'+t.toFixed(3)
              +'\t'+rad.join(' '));
      if(TR.bg){ TR.bg.width=0; TR.bg.height=0; TR.bg=null; }
    }
  }catch(e){ ut.push('FEIL: '+e.message+' | '+e.stack); }
  draw=function(){};
  pre.textContent=ut.join('\n');
})();
"""


def sig_js(celler, kol, rad, tid=ARK_TID):
    return SIG_JS_MAL % (json.dumps(celler), kol, rad, repr(float(tid)))


def shot_js(bane, tod, modus, ved_landemerke=True, t_overstyr=None, tid=0.0,
            spesiallakk="AUTO"):
    """Måleskript som rigger spillet til ett bilde og tegner det på canvaset.

    modus 'spill' = vanlig spillvisning (kamera bak bilen, HUD, 20 biler).
    modus 'bg'    = hele den forhåndstegnede bakgrunnen, nedskalert til bredden.
    HVORFOR bakgrunnen tas som ETT nedskalert bilde: spillvisningen ser bare
    ~500 px av en bane som er 3000-4000 px bred, så den kan ikke vise om et
    objekt et helt annet sted på banen har havnet oppå asfalten. Oversiktsbildet
    kan det, og det er nettopp det testen i steg B og C skal avgjøre.
    """
    return r"""
(function(){
  var idx=-1;
  for(var i=0;i<TRACKS.length;i++) if(TRACKS[i].name===%s) idx=i;
  if(idx<0) throw new Error('ukjent bane');
  trackSel=idx; lapsIdx=4; LAPS=20; difficulty=2;
  // SETTINGS.tid må settes FØR startRace(), ikke bare todIdx etter: startRace
  // kaller buildCarSprites(), og en bils lakk velges av aktivLakk(bane,TID),
  // altså av den tiden som gjaldt DA spritene ble bygget. Med bare todIdx satt
  // etterpå fikk nattbildet nattlys og dagbiler — en NORDHAV uten Nordlys.
  SETTINGS.tid=TOD[%d].name;
  SETTINGS.spesiallakk=%s;
  startRace();
  // Settes også etter, som før: resolveTodIdx kan ikke gi noe annet nå, men
  // linja gjør bildet uavhengig av om SETTINGS-veien skulle endre seg.
  todIdx=%d;
  state='playing';
  var MODUS=%s, VEDLM=%s, naadd='-';
  if(MODUS==='bg'){
    ensureTrackBg(TR);
    // Spillets egen rAF-løkke kjører fortsatt, og --virtual-time-budget lar den
    // kjøre mange bilder før skjermbildet tas. Uten dette rekker den å tegne
    // vanlig spillvisning OPPÅ oversikten vi akkurat har malt — og siden
    // canvaset her er mye høyere enn spillvisningen, ble resultatet et
    // spillbilde på toppen og svart under. Løkka får beholde takten, men
    // update/draw gjøres til no-ops så ingenting mer treffer canvaset.
    update=function(){}; draw=function(){};
    var bredde=520;
    var s=bredde/TR.bgW;
    cv.width=bredde; cv.height=Math.max(1,Math.round(TR.bgH*s));
    var c2=cv.getContext('2d');
    c2.imageSmoothingQuality='high';
    c2.fillStyle='#05070a'; c2.fillRect(0,0,cv.width,cv.height);
    c2.drawImage(TR.bg,0,0,cv.width,cv.height);
    // Kjørelinja legges oppå i rødt, bare i oversiktsbildet: uten den er det
    // umulig å se på et 520 px bilde om et objekt ligger PÅ asfalten eller
    // like utenfor, som er nøyaktig det dette bildet skal avgjøre.
    c2.save();
    c2.scale(s,s); c2.translate(-TR.bgMinX,-TR.bgMinY);
    c2.strokeStyle='rgba(255,0,0,.9)'; c2.lineWidth=2/s;
    c2.beginPath();
    for(var p=0;p<TR.PATH.length;p++){
      var pt=TR.PATH[p];
      p===0?c2.moveTo(pt[0],pt[1]):c2.lineTo(pt[0],pt[1]);
    }
    c2.closePath(); c2.stroke();
    c2.restore();
  } else {
    // Flytt feltet fram til det punktet bildet skal tas på. Landemerket
    // ligger i LANDMARK_T (en rundeposisjon lagret i temaet) der banen har
    // ett, ellers tas bildet rett etter start.
    // --t overstyrer rundeposisjonen. Trengs fordi landemerket og kulissene
    // ikke alltid ligger samme sted: VISTANOTTE legger kvartalene på 0,20-0,98
    // og 0,24-0,96, mens landemerket står på 0,14 — et bilde «ved landemerket»
    // viser altså byen fra det ene punktet på runden der det ikke ER noen by.
    var OVR=%s;
    var maalT = OVR!=null ? OVR
      : (VEDLM && TR.theme && TR.theme.landmarkT!=null ? TR.theme.landmarkT : 0.02);
    // Kameraet SETTES på kjørelinja; feltet kjøres ikke fram dit.
    //
    // To forsøk som ikke virker, begge prøvd: å kalle update() i løkke flytter
    // ingenting, for update() leser keys['ArrowUp'] for spillerbilen og uten
    // tastetrykk står den bom stille — den gamle løkka gikk tjue tusen runder
    // og tok hvert eneste bilde på startstreken, uansett landmarkT. Og holder
    // man bare gassen inne, kjører bilen rett ut i terrenget i første sving,
    // for det er ingen som styrer. Et kulissebilde trenger uansett bare
    // kameraet på rett sted, ikke en bil som har kjørt dit.
    // update() nulles først: spillets rAF-løkke kjører videre gjennom hele
    // --virtual-time-budget, og med fysikken i gang ville bilen trillet vekk
    // fra punktet vi nettopp satte den på før bildet ble tatt.
    update=function(){};
    var i=Math.round(maalT*TR.PATH.length)%%TR.PATH.length;
    var rl=TR.raceLine[i];
    player.x=rl[0]; player.y=rl[1]; player.angle=TR.heading[i];
    camX=player.x; camY=player.y; camAngle=player.angle;
    // --tid: løpsklokka SETTES, i sekunder. Fordi update() er nullet over står
    // raceTime ellers på 0 i hvert eneste skjermbilde, og alt som beveger seg
    // (flagg, marshaler, den bevegelige detaljen i steg D2) ville kommet ut i
    // nøyaktig samme stilling hver gang. To bilder på to tidspunkt er den
    // eneste måten å BEVISE på et stillbilde at noe faktisk rører seg.
    raceTime = %s * 60;
    draw();
    naadd = maalT.toFixed(3);
  }
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  pre.style.display='none';
  pre.textContent='OK '+TRACKS[idx].name+' rundepos '+naadd;
})();
""" % (json.dumps(bane), tod, json.dumps(spesiallakk), tod,
       json.dumps(modus), "true" if ved_landemerke else "false",
       "null" if t_overstyr is None else repr(float(t_overstyr)), repr(float(tid)))


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__ or "bruk: maal | fps | shot BANE | ark")
    cmd = sys.argv[1]
    args = sys.argv[2:]

    def flagg(navn, std=None):
        if "--" + navn in args:
            return args[args.index("--" + navn) + 1]
        return std

    html = flagg("html", os.path.join(HER, "vintage_f1.html"))

    if cmd == "maal":
        txt = dump(html, MAAL_JS, budget=240000)
        rader = [r.split("\t") for r in txt.strip().split("\n") if r.strip()]
        linjer = ["BANE\tms\tbg-piksler\tbgScale\tnattlys\tbeveg"]
        tot = 0.0
        for r in rader:
            linjer.append("\t".join(r))
            tot += float(r[1])
        linjer.append("")
        linjer.append("sum: %.1f ms   snitt: %.1f ms   verste: %s" % (
            tot, tot / max(1, len(rader)),
            max(rader, key=lambda r: float(r[1]))[0] + " " + max(rader, key=lambda r: float(r[1]))[1] + " ms"))
        over = [r[0] + " (" + r[1] + " ms)" for r in rader if float(r[1]) > 100]
        linjer.append("over 100 ms: " + (", ".join(over) if over else "ingen"))
        ut = "\n".join(linjer)
        print(ut)
        if flagg("out"):
            open(flagg("out"), "w", encoding="utf-8").write(ut + "\n")

    elif cmd == "fps":
        t_ovr = flagg("t")
        runder = int(flagg("runder", "1"))
        tods = [int(x) for x in flagg("tod", "0,2").split(",")]
        js = fps_js(flagg("bane"), t_ovr, runder, "--uten-beveg" in args, tods)
        txt = dump(html, js, budget=600000)
        rader = [r.split("\t") for r in txt.strip().split("\n") if r.strip()]
        linjer = ["BANE\tTID\tsnitt_ms\tp95_ms\tbilder/s\tblokk_ms\tspredning\ttegnekall\tskjermpos"]
        for r in rader:
            linjer.append("\t".join(r))
        tregeste = sorted(rader, key=lambda r: -float(r[5]))[:3]
        linjer.append("")
        linjer.append("rundepos: " + ("startstreken" if t_ovr is None else "t=" + t_ovr) +
                      "   runder: %d   detalj: %s" % (
                          runder, "AV" if "--uten-beveg" in args else "på"))
        linjer.append("tre tregeste (blokk_ms): " + ", ".join(
            "%s/%s %s ms" % (r[0], r[1], r[5]) for r in tregeste))
        ut = "\n".join(linjer)
        print(ut)
        if flagg("out"):
            open(flagg("out"), "w", encoding="utf-8").write(ut + "\n")

    elif cmd == "shot":
        bane = args[0]
        if bane.startswith("--"):
            raise SystemExit("shot tar BANE som posisjonsargument: shot LABIRINTO --tod 0")
        tod = int(flagg("tod", "0"))
        modus = flagg("modus", "spill")
        spes = flagg("spesiallakk", "AUTO")
        if spes not in ("AUTO", "AV"):
            raise SystemExit("--spesiallakk må være AUTO eller AV")
        ut = flagg("ut", "/tmp/gp_%s_%s.png" % (bane.replace(" ", "_"), modus))
        h = 680 if modus == "spill" else 1400
        t_ovr = flagg("t")
        tid = float(flagg("tid", "0"))
        skjermbilde(html, shot_js(bane, tod, modus, t_overstyr=t_ovr, tid=tid,
                                  spesiallakk=spes), ut, 520, h)
        print(ut)

    elif cmd == "ark":
        # Kontaktarket svarer på runde 4s EGEN påstand: «hver bane skal kjennes
        # igjen på et skjermbilde». Derfor er cellene 1:1 med spillvisningen
        # (520x680) og ikke nedskalert — en nedskalering ville skjult nettopp
        # det som skal bedømmes, slik steg C3 punkt 4 fant da den doble fugen i
        # kvartalene bare var synlig ved 8x.
        ut = flagg("ut", "/tmp/gp_kontaktark.png")
        kol = int(flagg("kol", "5"))
        tid = float(flagg("tid", repr(ARK_TID)))
        tod_ovr = flagg("tod")
        meta = [r.split("\t") for r in dump(html, ARK_META_JS).strip().split("\n")]
        cw, ch = int(meta[0][1]), int(meta[0][2])
        celler = []
        for idx, navn, lm_t, tod_nat in meta[1:]:
            t = ARK_T.get(navn, float(lm_t))
            if float(lm_t) < 0 and navn not in ARK_T:
                t = 0.02
            celler.append([int(idx), int(tod_nat) if tod_ovr is None else int(tod_ovr), t])
        rader = (len(celler) + kol - 1) // kol
        bredde = kol * cw + (kol + 1) * 6
        hoyde = rader * (ch + 30) + (rader + 1) * 6
        js = ark_js(celler, kol, cw, ch, tid=tid)
        side = bygg_side(html, js)
        try:
            kjor_chrome(["--virtual-time-budget=240000",
                         "--window-size=%d,%d" % (bredde, hoyde),
                         "--screenshot=" + ut, "file://" + side], timeout=300)
        finally:
            os.unlink(side)
        if not os.path.exists(ut):
            raise SystemExit("Chrome lagde ikke " + ut)
        print("%s   %d baner i %dx%d celler   %dx%d px   løpsklokke %.1f s"
              % (ut, len(celler), kol, rader, bredde, hoyde, tid))

    elif cmd == "signatur":
        # Samme celleliste som `ark`, men i stedet for et bilde skrives
        # middelfargen per rute ut som tall, så «er de 13 til å skille» kan
        # avgjøres med en avstand i stedet for med øyemål.
        #
        # `--meta-fra` finnes fordi en FØR-fil ikke kan svare på sitt eget
        # kamerapunkt: `theme.landmarkT` og `naturligTid` kom begge INN i runde
        # 4, så fila fra før runde 4 ville gitt t=0,02 og DAG på alle tretten og
        # målt et helt annet bilde. Kamerapunktet og døgntiden hentes derfor fra
        # ÉN fil og brukes på begge. Det er forsvarlig nettopp fordi runde 4 er
        # en pynterunde: `geo_laas.json` beviser at PATH, raceLine og heading er
        # bit-identiske, så samme t ER samme kamerapose i begge filene.
        kol = int(flagg("kol", "6"))
        rad = int(flagg("rad", "8"))
        tid = float(flagg("tid", repr(ARK_TID)))
        ut = flagg("ut")
        meta_html = flagg("meta-fra", html)
        # `--tod` tvinger ÉN felles døgntid. Uten den måles hver bane i sin egen
        # `naturligTid`, og da er en del av avstanden mellom to baner bare
        # forskjellen på dag og natt — DESERTO/DUNA er samme terreng, men den
        # ene er natt. Døgntiden ER et skille mellom banene, men den ble satt i
        # meny-arbeidet og ikke i runde 4, så den må kunne slås av når det er
        # runde 4s eget arbeid som skal måles.
        tod_ovr = flagg("tod")
        meta = [r.split("\t") for r in dump(meta_html, ARK_META_JS).strip().split("\n")]
        celler = []
        for idx, navn, lm_t, tod_nat in meta[1:]:
            t = ARK_T.get(navn, float(lm_t))
            if float(lm_t) < 0 and navn not in ARK_T:
                t = 0.02
            celler.append([int(idx), int(tod_nat) if tod_ovr is None else int(tod_ovr), t])
        tekst = dump(html, sig_js(celler, kol, rad, tid=tid))
        if ut:
            with open(ut, "w") as f:
                f.write(tekst)
            print(ut)
        else:
            print(tekst)

    else:
        raise SystemExit("ukjent kommando: " + cmd)


if __name__ == "__main__":
    main()
