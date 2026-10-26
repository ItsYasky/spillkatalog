#!/usr/bin/env python3
# ============================================================================
# Chrome-harness for RUNDE 4 i vintage_f1.html.
#
#   python3 chrome_harness.py maal  [--html fil] [--out fil.txt]
#   python3 chrome_harness.py fps   [--html fil] [--out fil.txt]
#   python3 chrome_harness.py shot  BANE  [--tod 0] [--modus spill|bg] [--ut fil.png]
#   python3 chrome_harness.py ark   [--ut fil.png]
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
HER = os.path.dirname(os.path.abspath(__file__))


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
    linjer.push(t.name+'\t'+tider[1].toFixed(1)+'\t'+t.bgW+'x'+t.bgH+'\t'+t.bgScale.toFixed(3)
      +'\t'+(t.nightLights?t.nightLights.length:0));
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
FPS_JS = r"""
(function(){
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  var linjer=[];
  var TODS=[0,2]; // DAG og NATT
  for(var i=0;i<TRACKS.length;i++){
    for(var ti=0;ti<TODS.length;ti++){
      trackSel=i; todIdx=TODS[ti]; lapsIdx=4; LAPS=20;
      difficulty=2;
      startRace();
      state='playing';
      // 90 bilder oppvarming: bilene står tett på grid de første stegene, og
      // slipstream/overtake-logikken er ikke i gang ennå — det er ikke et
      // representativt bilde av et løp.
      for(var w=0;w<90;w++){ update(); draw(); }
      var ms=[];
      for(var f=0;f<300;f++){
        var t0=performance.now();
        update(); draw();
        ms.push(performance.now()-t0);
      }
      var sum=0; for(var k=0;k<ms.length;k++) sum+=ms[k];
      var snitt=sum/ms.length;
      ms.sort(function(a,b){return a-b;});
      var p95=ms[Math.floor(ms.length*0.95)];
      linjer.push(TRACKS[i].name+'\t'+TOD[TODS[ti]].name+'\t'+snitt.toFixed(2)+'\t'+p95.toFixed(2)
        +'\t'+(1000/snitt).toFixed(0));
    }
  }
  pre.textContent=linjer.join('\n');
})();
"""


def shot_js(bane, tod, modus, ved_landemerke=True):
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
  todIdx=%d;
  trackSel=idx; lapsIdx=4; LAPS=20; difficulty=2;
  startRace();
  state='playing';
  var MODUS=%s, VEDLM=%s;
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
    var maalT = VEDLM && TR.theme && TR.theme.landmarkT!=null ? TR.theme.landmarkT : 0.02;
    var vakt=0;
    while(player.raceDist/TR.PATH.length < maalT && vakt<20000){ update(); vakt++; }
    for(var f=0;f<4;f++){ update(); draw(); }
    draw();
  }
  var pre=document.createElement('pre'); pre.id='gpout'; document.body.appendChild(pre);
  pre.style.display='none';
  pre.textContent='OK '+TRACKS[idx].name;
})();
""" % (json.dumps(bane), tod, json.dumps(modus), "true" if ved_landemerke else "false")


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
        linjer = ["BANE\tms\tbg-piksler\tbgScale\tnattlys"]
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
        txt = dump(html, FPS_JS, budget=600000)
        rader = [r.split("\t") for r in txt.strip().split("\n") if r.strip()]
        linjer = ["BANE\tTID\tsnitt_ms\tp95_ms\tbilder/s"]
        for r in rader:
            linjer.append("\t".join(r))
        tregeste = sorted(rader, key=lambda r: -float(r[2]))[:3]
        linjer.append("")
        linjer.append("tre tregeste: " + ", ".join(
            "%s/%s %s ms" % (r[0], r[1], r[2]) for r in tregeste))
        ut = "\n".join(linjer)
        print(ut)
        if flagg("out"):
            open(flagg("out"), "w", encoding="utf-8").write(ut + "\n")

    elif cmd == "shot":
        bane = args[0]
        tod = int(flagg("tod", "0"))
        modus = flagg("modus", "spill")
        ut = flagg("ut", "/tmp/gp_%s_%s.png" % (bane.replace(" ", "_"), modus))
        h = 680 if modus == "spill" else 1400
        skjermbilde(html, shot_js(bane, tod, modus), ut, 520, h)
        print(ut)

    else:
        raise SystemExit("ukjent kommando: " + cmd)


if __name__ == "__main__":
    main()
