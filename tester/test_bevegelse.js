// ============================================================================
// Headless test for GRAND PRIX runde 4 steg D2: stillaset for BEVEGELIGE
// detaljer i kulissene (`scene.beveg` + `drawBevegelse`).
//
// Kjøres med JavaScriptCore via macOS-verktøyet `osascript`, fra
// spillkatalog-roten (spillfilen leses med relativ sti):
//
//   cd ~/spillkatalog
//   osascript -l JavaScript tester/test_bevegelse.js
//   osascript -l JavaScript tester/test_bevegelse.js --html /tmp/annen.html
//
// Hva denne testen finnes for:
//
// Bakgrunnen males ÉN gang og står resten av løpet, så alt som skal røre seg
// må tegnes på nytt hvert bilde. Det gir fire måter å gjøre det galt på, og
// tre av dem har allerede skjedd i dette prosjektet:
//
//   1. Budsjettet sprekker. Den bevegelige detaljen er den eneste delen av
//      kulissene som koster noe PER BILDE. Taket er én per bane, og et tak
//      ingen måler er ikke et tak.
//   2. Detaljen rører seg ikke likevel. Et stillbilde kan ikke skille en
//      detalj som snurrer fra en som står stille, så det må måles: samme
//      tegnefunksjon på to tidspunkt må gi to ulike bilder.
//   3. Kuttet er feil vei. Tegnes detaljen uansett, er hele poenget med
//      kuttet borte; kuttes den for hardt, popper den inn på skjermen i
//      stedet for å gli inn. Begge retninger måles her, og rekkevidden måles
//      mot det detaljen FAKTISK tegner.
//   4. Den levende delen og den bakte delen står i hver sin ramme. Dette er
//      steg B4-feilen, og den har truffet to ganger (lykta i feil ende av
//      moloen, og glød ved FOTEN av det som lyser). Den delen av landemerket
//      som er bakt inn i bildet og den delen som tegnes live er to halvdeler
//      av det samme bygget — glir rammene fra hverandre, snurrer eikene ved
//      siden av hjulet sitt.
//
// Metoden for punkt 4 er verdt å merke seg: testen tegner den levende delen på
// et lerret som FØLGER MED PÅ TRANSFORMEN, så hvert tegnekall kan leses av som
// et verdenspunkt. `drawBevegelse` gjør ingen kameraomregning selv, så med
// identitetsmatrise inn er de avleste punktene rene verdenskoordinater. Da kan
// de sammenlignes med `TR.nightLights`, som bakingen la ut med `scene.lokal` —
// altså spillets EGEN omregning fra landemerkets ramme til verden. Faller et
// levende punkt oppå et nattlys fra samme landemerke, deler de to halvdelene
// ramme. Testen regner ikke omregningen selv; da kunne den hatt samme feil som
// koden.
// ============================================================================
ObjC.import('Foundation');

function readFile(path){
  const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if(data === null) throw new Error('Kunne ikke lese filen: ' + path + ' (kjør testen fra spillkatalog-mappen)');
  return ObjC.unwrap(data);
}

function extractScript(html){
  const open = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if(open < 0 || close < open) throw new Error('Fant ikke <script>-blokken i HTML-filen.');
  return html.slice(open + '<script>'.length, close);
}

// ── stubs ────────────────────────────────────────────────────────────────────
// Bakgrunnsbyggingen bryr seg ikke om hva som faktisk males, så der holder det
// med en no-op-proxy (samme som test_lazy_track_bg.js).
function makeCtxStub(canvas){
  const target = { canvas: canvas };
  const proxy = new Proxy(target, {
    get: function(obj, key){
      if(key in obj) return obj[key];
      const noop = function(){ return proxy; };
      obj[key] = noop;
      return noop;
    },
    set: function(obj, key, val){ obj[key] = val; return true; }
  });
  return proxy;
}

function makeCanvasStub(){
  const c = { width: 0, height: 0 };
  c.getContext = function(){
    if(!c._ctx) c._ctx = makeCtxStub(c);
    return c._ctx;
  };
  return c;
}

// ── opptakslerret ────────────────────────────────────────────────────────────
// Et lerret som ikke maler noe, men som fører regnskap med transformen og
// skriver ned hvor hvert tegnekall havnet. Dette er det eneste verktøyet som
// gjør punkt 2, 3 og 4 over målbare: uten transformen i hånd kan man bare se
// AT det ble tegnet, ikke HVOR.
//
// Matrisen er [a,b,c,d,e,f] slik canvas selv definerer den:
//   x' = a*x + c*y + e      y' = b*x + d*y + f
function makeRecorder(){
  let m = [1,0,0,1,0,0];
  const stack = [];
  const pts = [];      // verdenspunkt per tegnekall
  const ops = [];      // metodenavn + argumenter, til å sammenligne to tidspunkt

  function apply(x,y){ return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }
  function put(x,y){ pts.push(apply(x,y)); }
  function mul(n){
    m = [ m[0]*n[0] + m[2]*n[1], m[1]*n[0] + m[3]*n[1],
          m[0]*n[2] + m[2]*n[3], m[1]*n[2] + m[3]*n[3],
          m[0]*n[4] + m[2]*n[5] + m[4], m[1]*n[4] + m[3]*n[5] + m[5] ];
  }

  const handlers = {
    save: function(){ stack.push(m.slice()); },
    restore: function(){ if(stack.length) m = stack.pop(); },
    translate: function(x,y){ mul([1,0,0,1,x,y]); },
    scale: function(x,y){ mul([x,0,0,y,0,0]); },
    rotate: function(a){ const c = Math.cos(a), s = Math.sin(a); mul([c,s,-s,c,0,0]); },
    transform: function(a,b,c,d,e,f){ mul([a,b,c,d,e,f]); },
    setTransform: function(a,b,c,d,e,f){ m = [a,b,c,d,e,f]; },
    resetTransform: function(){ m = [1,0,0,1,0,0]; },
    moveTo: function(x,y){ put(x,y); },
    lineTo: function(x,y){ put(x,y); },
    rect: function(x,y,w,h){ put(x,y); put(x+w,y+h); },
    fillRect: function(x,y,w,h){ put(x,y); put(x+w,y+h); },
    strokeRect: function(x,y,w,h){ put(x,y); put(x+w,y+h); },
    // En sirkel når `r` ut til alle kanter, ikke bare til senteret — og det er
    // nettopp ytterkanten rekkevidden skal dekke.
    arc: function(x,y,r){ put(x-r,y-r); put(x+r,y+r); put(x+r,y-r); put(x-r,y+r); },
    ellipse: function(x,y,rx,ry){ put(x-rx,y-ry); put(x+rx,y+ry); },
    quadraticCurveTo: function(a,b,x,y){ put(a,b); put(x,y); },
    bezierCurveTo: function(a,b,c,d,x,y){ put(a,b); put(c,d); put(x,y); },
    arcTo: function(a,b,x,y){ put(a,b); put(x,y); },
    // drawGlow tegner glødskiva som et bilde med fire argumenter etter spriten,
    // altså (spr, x-rad, y-rad, rad*2, rad*2). Glødens ytterkant er en del av
    // rekkevidden: en glød som dukker opp er like synlig som en strek.
    drawImage: function(spr,a,b,c,d){
      if(typeof c === 'number' && typeof d === 'number' && arguments.length <= 5){
        put(a,b); put(a+c,b+d);
      } else if(typeof a === 'number' && typeof b === 'number'){ put(a,b); }
    }
  };

  const target = { canvas: { width: 520, height: 680 } };
  const proxy = new Proxy(target, {
    get: function(obj, key){
      if(key === '__pts') return pts;
      if(key === '__ops') return ops;
      if(key === '__m') return m;
      if(key in obj) return obj[key];
      // Ukjente navn blir til tegnekall som RETURNERER lerretet, slik at
      // `createLinearGradient(...).addColorStop(...)` virker. Men da er et
      // gradient-objekt det samme proxy-objektet, og `fillStyle = gr` under
      // gjør `String(val)` på det — som spør etter Symbol.toPrimitive, får en
      // funksjon som returnerer proxyen, og kaster «Symbol.toPrimitive
      // returned an object». Strengkonverteringen må derfor svares eksplisitt.
      // Verdien er konstant med vilje: fargestoppene bokføres av sine egne
      // `addColorStop`-kall, så et skiftende navn her ville bare gjort
      // op-sammenligningen i sjekk 2 til støy.
      if(typeof key === 'symbol' || key === 'toString' || key === 'valueOf')
        return function(){ return '[opptakslerret]'; };
      const h = handlers[key];
      const fn = function(){
        ops.push(String(key) + '(' + Array.prototype.slice.call(arguments).map(function(v){
          return typeof v === 'number' ? v.toFixed(4) : (typeof v === 'object' ? '#' : String(v));
        }).join(',') + ')');
        if(h) h.apply(null, arguments);
        return proxy;
      };
      obj[key] = fn;
      return fn;
    },
    set: function(obj, key, val){
      ops.push('set ' + String(key) + '=' + String(val));
      obj[key] = val;
      return true;
    }
  });
  return proxy;
}

// ── last spillet ─────────────────────────────────────────────────────────────
function loadGame(path){
  const src = extractScript(readFile(path));
  const documentStub = {
    hidden: false,
    addEventListener: function(){},
    getElementById: function(){ return makeCanvasStub(); },
    createElement: function(){ return makeCanvasStub(); }
  };
  const windowStub = { location: { href: '' } };
  const rafStub = function(){};
  const perfStub = { now: function(){ return 0; } };
  const factory = eval('(function(document, window, requestAnimationFrame, performance){\n' + src + '\n' +
    'return {\n' +
    '  get TRACKS(){ return TRACKS; },\n' +
    '  get TR(){ return TR; },\n' +
    '  get state(){ return state; }, set state(v){ state = v; },\n' +
    '  get trackSel(){ return trackSel; }, set trackSel(v){ trackSel = v; },\n' +
    '  get todIdx(){ return todIdx; }, set todIdx(v){ todIdx = v; },\n' +
    '  TOD: TOD,\n' +
    '  setCam: function(x,y,a){ camX = x; camY = y; camAngle = a; },\n' +
    '  worldToScreen: worldToScreen,\n' +
    '  drawBevegelse: drawBevegelse,\n' +
    '  startRace: startRace,\n' +
    '  W: W, H: H, HY: HY\n' +
    '};\n})');
  return factory(documentStub, windowStub, rafStub, perfStub);
}

// ── hjelpere ─────────────────────────────────────────────────────────────────
function pad(s, n){ s = String(s); while(s.length < n) s += ' '; return s; }
function padL(s, n){ s = String(s); while(s.length < n) s = ' ' + s; return s; }

// Tegner den bevegelige detaljen på et opptakslerret i landemerkets egen
// ramme, uten kamera og uten kutt — altså slik `drawBevegelse` ville gjort det
// hvis detaljen sto midt på skjermen. Punktene som kommer ut er verdenspunkt.
// Fjerde argument er HELE døgntiden, slik `drawBevegelse` nå sender den.
// Boolsken `natt` holdt ikke: SOLNEDGANG har `night:false`, så den og DAG var
// ett og samme tilfelle, og DUNAs stråle skal stå ulikt sterkt i nettopp de to.
function tegnLive(b, t, tod){
  const g = makeRecorder();
  g.save();
  g.translate(b.x, b.y);
  g.rotate(b.ang);
  b.tegn(g, t, tod);
  g.restore();
  return g;
}

// Punktene som står STILLE mens detaljen beveger seg, funnet ved å tegne to
// ulike tidspunkt og sammenligne tegnekall for tegnekall. For noe som roterer
// er de faste punktene nettopp dreiepunktet — eikene møtes i navet, strålen har
// toppunktet sitt i lykta — og det er dreiepunktet som må treffe det bakte
// lyset. Sjekk 2 krever likt antall tegnekall, så indeksene kan parres direkte.
function fastePunkt(b, t1, t2, tod){
  const a = tegnLive(b, t1, tod), c = tegnLive(b, t2, tod);
  const n = Math.min(a.__pts.length, c.__pts.length), ut = [];
  for(let k = 0; k < n; k++){
    const dx = a.__pts[k][0] - c.__pts[k][0], dy = a.__pts[k][1] - c.__pts[k][1];
    if(Math.sqrt(dx*dx + dy*dy) <= 0.01) ut.push(a.__pts[k]);
  }
  return { faste: ut, alle: a.__pts };
}

function maxAvstand(pts, x, y){
  let d = 0;
  for(let i = 0; i < pts.length; i++){
    const dx = pts[i][0] - x, dy = pts[i][1] - y;
    const r = Math.sqrt(dx*dx + dy*dy);
    if(r > d) d = r;
  }
  return d;
}

function run(argv){
  const out = [];
  const fails = [];
  function ok(cond, msg){ if(!cond) fails.push(msg); return cond; }

  let htmlPath = 'vintage_f1.html';
  for(let i = 0; argv && i < argv.length; i++){
    if(String(argv[i]) === '--html' && argv[i+1]) htmlPath = String(argv[i+1]);
  }

  const game = loadGame(htmlPath);
  const TRACKS = game.TRACKS;
  const TOD = game.TOD;
  // Natta plukkes på `night`-flagget og ikke på indeks: kommer det en fjerde
  // døgntid, skal testen fortsatt måle den som faktisk er natt.
  const DAG = TOD.filter(function(d){ return !d.night; })[0];
  const NATT = TOD.filter(function(d){ return d.night; })[0];
  if(!DAG || !NATT) fails.push('0: TOD mangler en dag- eller en nattoppføring');
  const TAK = 1;   // maks én bevegelig detalj per bane — se kommentaren i buildTrackBg

  // ── 1: taket på én per bane ───────────────────────────────────────────────
  // Hele poenget med `bevegelseN` er at et tak som ikke måles ikke er et tak.
  // Teljaren står ved siden av objektet nettopp for at en bane som registrerer
  // to skal gi et TALL som endrer seg, ikke «alt ser grønt ut».
  out.push('1  Taket på bevegelige detaljer (maks ' + TAK + ' per bane)');
  out.push('   ' + pad('BANE', 14) + padL('bevegelseN', 11) + '  objekt');
  const medBevegelse = [];
  TRACKS.forEach(function(t, i){
    game.trackSel = i;
    game.state = 'trackselect';
    game.startRace();
    const TR = game.TR;
    const n = TR.bevegelseN, b = TR.bevegelse;
    if(n > TAK) fails.push('1: ' + t.name + ' registrerte ' + n + ' bevegelige detaljer (taket er ' + TAK + ')');
    // Teljaren og objektet må fortelle den samme historien: teller den uten at
    // noe ble lagret, er detaljen stille borte.
    if(n >= 1 && !b) fails.push('1: ' + t.name + ' teller ' + n + ' bevegelig(e) detalj(er), men TR.bevegelse er tom');
    if(n === 0 && b) fails.push('1: ' + t.name + ' har et TR.bevegelse-objekt uten å ha telt det');
    if(b){
      const mangler = ['x','y','ang','rekkevidde','tegn'].filter(function(f){ return b[f] === undefined || b[f] === null; });
      if(mangler.length) fails.push('1: ' + t.name + ': TR.bevegelse mangler ' + mangler.join(', '));
      if(typeof b.tegn !== 'function') fails.push('1: ' + t.name + ': TR.bevegelse.tegn er ikke en funksjon');
      if(!(b.rekkevidde > 0)) fails.push('1: ' + t.name + ': rekkevidde er ' + b.rekkevidde + ' (må være positiv)');
      medBevegelse.push({ i: i, name: t.name, b: b, nightLights: TR.nightLights || [] });
    }
    out.push('   ' + pad(t.name, 14) + padL(n, 11) + '  ' + (b ? 'ja (rekkevidde ' + b.rekkevidde + ' px)' : '–'));
  });
  out.push('   ' + medBevegelse.length + ' av ' + TRACKS.length + ' baner har en bevegelig detalj, ingen har mer enn ' + TAK);

  // Stillaset er verdiløst hvis ingen bruker det. Minst én bane må ha en
  // detalj, ellers består alt det under uten å ha målt noe som helst.
  ok(medBevegelse.length >= 1, '1: ingen bane har en bevegelig detalj — da er det ingenting å teste');

  // ── 2: detaljen drives av TID, i HVER døgntid ─────────────────────────────
  // Et stillbilde kan ikke skille «snurrer» fra «står stille». Samme
  // tegnefunksjon på to tidspunkt må gi to ulike bilder; gjør den ikke det, er
  // detaljen bare pynt som betaler per bilde uten å gi noe tilbake.
  //
  // Kravet gjelder ALLE døgntidene og ikke bare dag, etter KVART_GULV-mønsteret
  // fra steg C2: regninga per bilde løper i hver døgntid, så detaljen må gjøre
  // seg fortjent til den i hver døgntid. Det er dette kravet som gjør at en
  // detalj med en tabell PER DØGNTID (DUNAs `STRAALE_ALFA`) ikke kan få en
  // umålt fjerde tid smuglet inn: en tid som ikke står i tabellen tegner
  // ingenting som rører seg, og da er det den tiden som navngis i meldinga.
  out.push('');
  out.push('2  Drevet av tid i hver døgntid (to tidspunkt må gi ulikt bilde)');
  medBevegelse.forEach(function(e){
    TOD.forEach(function(tod){
      const a = tegnLive(e.b, 0, tod);
      const c = tegnLive(e.b, 7.3, tod);
      const ulik = (a.__ops.join('|') !== c.__ops.join('|'));
      if(!ulik) fails.push('2: ' + e.name + ' ved ' + tod.name +
        ': tegningen er bit-identisk på t=0 og t=7,3 s — detaljen rører seg ikke i denne døgntiden');
      // Antall tegnekall skal derimot være det SAMME innenfor én døgntid: en
      // detalj som tegner ulikt mye arbeid på ulike tidspunkt har en gren i
      // seg, og da er kostnaden per bilde ikke lenger et tall man måler én
      // gang. (På tvers av døgntider har den lov til å variere — nattgløden
      // finnes bare om natta.)
      if(a.__ops.length !== c.__ops.length)
        fails.push('2: ' + e.name + ' ved ' + tod.name + ': ulikt antall tegnekall på t=0 (' +
          a.__ops.length + ') og t=7,3 (' + c.__ops.length + ')');
      let flyttet = 0;
      const n = Math.min(a.__pts.length, c.__pts.length);
      for(let k = 0; k < n; k++){
        const dx = a.__pts[k][0] - c.__pts[k][0], dy = a.__pts[k][1] - c.__pts[k][1];
        if(Math.sqrt(dx*dx + dy*dy) > 0.5) flyttet++;
      }
      // Ops kan skille seg på en ren alfaverdi uten at noe faktisk flytter seg,
      // så det må MÅLES at et punkt beveger seg og ikke bare at strengen endret
      // seg. Uten dette ville en detalj som bare blinker bestått som «snurrer».
      if(ulik && flyttet === 0) fails.push('2: ' + e.name + ' ved ' + tod.name +
        ': tegnekallene endrer seg, men ikke ETT punkt flyttet seg — detaljen blinker, den beveger seg ikke');
      out.push('   ' + pad(e.name, 14) + pad(tod.name, 12) + padL(a.__ops.length, 4) + ' tegnekall · ' +
        padL(flyttet, 3) + ' av ' + padL(n, 3) + ' punkt flyttet seg' +
        (ulik && flyttet ? '' : '  ← STÅR STILLE'));
    });
  });

  // ── 3: kuttet virker begge veier ──────────────────────────────────────────
  // Kuttes det aldri, er hele grunnen til kuttet borte (detaljen er ETT sted på
  // en bane som er flere tusen piksler bred). Kuttes det alltid, finnes ikke
  // detaljen. Begge feilene ser like grønne ut hvis man bare teller tegnekall
  // på ett kamerapunkt.
  out.push('');
  out.push('3  Kuttet utenfor skjermen (både at det kutter og at det slipper gjennom)');
  medBevegelse.forEach(function(e){
    const b = e.b;

    // På skjermen: kameraet rett på ankeret.
    game.setCam(b.x, b.y, 0);
    const paa = makeRecorder();
    game.drawBevegelse(paa, game.TRACKS[e.i], 2.0, NATT);

    // Langt unna: ti tusen piksler er mer enn den største banen er bred, så
    // ankeret kan umulig være innenfor noen margin.
    game.setCam(b.x + 10000, b.y + 10000, 0);
    const av = makeRecorder();
    game.drawBevegelse(av, game.TRACKS[e.i], 2.0, NATT);

    // HVOR går grensa? Testen regner ikke kameratransformen om igjen selv —
    // da kunne den hatt samme feil som koden, og `worldToScreen` roterer
    // dessuten verden med kjøreretningen, så «flytt kameraet i x» er ikke
    // «flytt detaljen i skjermens x». Kameraet sveipes i stedet til detaljen
    // slutter å bli tegnet, og SKJERMPOSISJONEN i det øyeblikket leses av med
    // spillets egen `worldToScreen`. Den posisjonen må ligge på
    // `-rekkevidde`: kuttes det tidligere, popper detaljen inn i stedet for å
    // gli inn; kuttes det senere, tegnes den etter at siste piksel er borte.
    const m = b.rekkevidde;
    let inn = 0, ut = 4000;   // forskyvning av kameraet langs y, i piksler
    function tegnesVed(d){
      game.setCam(b.x, b.y + d, 0);
      const r = makeRecorder();
      game.drawBevegelse(r, game.TRACKS[e.i], 2.0, NATT);
      return r.__ops.length > 0;
    }
    if(!tegnesVed(inn) || tegnesVed(ut)){
      fails.push('3: ' + e.name + ': fant ingen grense å måle mellom 0 og 4000 px kamerasveip');
    } else {
      for(let k = 0; k < 40; k++){
        const mid = (inn + ut) / 2;
        if(tegnesVed(mid)) inn = mid; else ut = mid;
      }
      game.setCam(b.x, b.y + inn, 0);
      const grense = game.worldToScreen(b.x, b.y);
      // Hvilken av de fire kantene sveipet traff avhenger av rotasjonen, så
      // avstanden måles til den kanten detaljen faktisk falt ut over.
      const kanter = [
        { navn: 'venstre', d: grense[0] - (-m) },
        { navn: 'høyre',   d: grense[0] - (game.W + m) },
        { navn: 'topp',    d: grense[1] - (game.HY - m) },
        { navn: 'bunn',    d: grense[1] - (game.H + m) }
      ];
      kanter.sort(function(a2, b2){ return Math.abs(a2.d) - Math.abs(b2.d); });
      const truffet = kanter[0];
      if(Math.abs(truffet.d) > 1)
        fails.push('3: ' + e.name + ': kuttet slår inn ' + truffet.d.toFixed(1) +
          ' px fra ' + truffet.navn + ' marginkant (skal være 0)');
      out.push('   ' + pad(e.name, 14) + 'på skjermen ' + padL(paa.__ops.length, 4) + ' kall · 10 000 px unna ' +
        padL(av.__ops.length, 3) + ' kall · grensa går ' + truffet.d.toFixed(2) + ' px fra ' +
        truffet.navn + ' marginkant (rekkevidde ' + m + ' px)');
    }

    if(!paa.__ops.length) fails.push('3: ' + e.name + ': ingenting ble tegnet med kameraet rett på detaljen');
    if(av.__ops.length) fails.push('3: ' + e.name + ': detaljen ble tegnet med kameraet 10 000 px unna (kuttet virker ikke)');
  });

  // ── 4: rekkevidden dekker det detaljen faktisk tegner ─────────────────────
  // Marginen må romme HELE detaljen, ikke bare ankerpunktet — inkludert
  // glødskivene, som er like synlige som en strek. Er den for liten, kuttes
  // detaljen mens en del av den fortsatt er på skjermen, og den forsvinner
  // bitvis i kanten. Målt over en hel omdreining, ikke på ett tidspunkt.
  out.push('');
  out.push('4  Rekkevidde mot faktisk utstrekning (24 tidspunkt x alle ' + TOD.length + ' døgntider)');
  medBevegelse.forEach(function(e){
    const b = e.b;
    let verst = 0, verstT = 0, verstTid = '';
    for(let k = 0; k < 24; k++){
      const t = k * 1.37;
      // ALLE døgntidene, ikke bare natt/dag: en detalj kan tegne noe i én tid
      // som den ikke tegner i de andre (DUNAs stråle har sin egen alfa per
      // døgntid), og da er utstrekningen et tall per tid og ikke ett tall.
      TOD.forEach(function(tod){
        const g = tegnLive(b, t, tod);
        const d = maxAvstand(g.__pts, b.x, b.y);
        if(d > verst){ verst = d; verstT = t; verstTid = tod.name; }
      });
    }
    if(verst > b.rekkevidde)
      fails.push('4: ' + e.name + ': tegner ut til ' + verst.toFixed(1) + ' px fra ankeret (t=' + verstT.toFixed(1) +
        ' s, ' + verstTid + '), men rekkevidden er bare ' + b.rekkevidde + ' px');
    out.push('   ' + pad(e.name, 14) + 'tegner ut til ' + padL(verst.toFixed(1), 6) + ' px · rekkevidde ' +
      padL(b.rekkevidde, 4) + ' px · margin ' + padL((b.rekkevidde - verst).toFixed(1), 6) + ' px');
  });

  // ── 5: levende del og bakt del deler ramme ────────────────────────────────
  // Steg B4-feilen, som har truffet to ganger. Bakingen la nattlysene ut med
  // `scene.lokal`, altså spillets egen omregning fra landemerkets ramme til
  // verden. Faller et punkt den LEVENDE delen tegner oppå et slikt lys, bruker
  // de to halvdelene samme ramme — og da lander eikene på hjulet sitt.
  //
  // Sjekken gjelder bare baner der det samme landemerket BÅDE beveger seg og
  // lyser. Hvor mange det er står i utskriften, så en dag der den slutter å
  // gjelde noen som helst blir synlig i stedet for å gli forbi som grønt.
  out.push('');
  out.push('5  Felles ramme: et levende punkt må falle oppå et nattlys fra samme landemerke');
  let gjaldt = 0;
  medBevegelse.forEach(function(e){
    const b = e.b;
    // Bare lys som hører til dette landemerket er relevante — en by lenger ute
    // på banen har sine egne. Rekkevidden er nettopp radiusen rundt ankeret.
    const nære = e.nightLights.filter(function(l){
      const dx = l.x - b.x, dy = l.y - b.y;
      return Math.sqrt(dx*dx + dy*dy) <= b.rekkevidde;
    });
    if(!nære.length){
      out.push('   ' + pad(e.name, 14) + '(ingen nattlys innenfor rekkevidden — sjekken gjelder ikke her)');
      return;
    }
    gjaldt++;
    // Bare de FASTE punktene får være kandidater, og det er en målt
    // innstramming og ikke en formalitet. Med alle punktene med kunne et
    // sveipende punkt tilfeldigvis gli innenfor 1 px av et lys det ikke har
    // noe med å gjøre — steg D2 målte nettopp det: 6 px forskyvning av rammen
    // ga bare 2,50 px utslag, fordi eikene feier over et område og et annet
    // punkt rykket inn i stedet. For noe som roterer ER dreiepunktet det
    // rotasjonsinvariante punktet, og det er dreiepunktet bakingen la lyset
    // på. Da måler sjekken forskyvningen av RAMMEN og ikke bredden på sveipet.
    const fp = fastePunkt(b, 3.0, 4.9, NATT);
    if(!fp.faste.length){
      fails.push('5: ' + e.name + ': ingen av de ' + fp.alle.length +
        ' levende punktene står stille mellom to tidspunkt — da finnes det ikke noe ' +
        'dreiepunkt å måle rammen med');
      out.push('   ' + pad(e.name, 14) + nære.length + ' lys innenfor rekkevidden · INGEN FASTE PUNKT');
      return;
    }
    let best = Infinity, bestLys = null;
    fp.faste.forEach(function(p){
      nære.forEach(function(l){
        const dx = p[0] - l.x, dy = p[1] - l.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if(d < best){ best = d; bestLys = l; }
      });
    });
    const GRENSE = 1.0;
    if(!(best <= GRENSE))
      fails.push('5: ' + e.name + ': nærmeste FASTE levende punkt ligger ' + best.toFixed(2) +
        ' px fra nærmeste nattlys på samme landemerke (grensa er ' + GRENSE +
        ' px) — den levende delen og den bakte delen står i hver sin ramme');
    out.push('   ' + pad(e.name, 14) + nære.length + ' lys innenfor rekkevidden · ' +
      padL(fp.faste.length, 3) + ' av ' + padL(fp.alle.length, 3) + ' punkt står stille · ' +
      'nærmeste treff ' + best.toFixed(2) + ' px' + (best <= GRENSE ? '' : '  ← RAMMENE GLIR FRA HVERANDRE'));
  });
  out.push('   sjekken gjaldt ' + gjaldt + ' av ' + medBevegelse.length + ' bane(r) med bevegelig detalj');

  // ── 6: ankeret ligger innenfor bakgrunnslerretet ──────────────────────────
  // Samme familie som `pad`-fella i steg B2: et landemerke som havner utenfor
  // lerretets omriss klippes av en knivrett kant. Den bevegelige delen tegnes
  // riktignok oppå og klippes ikke, men da ville den snurret i løse lufta uten
  // den bakte halvdelen sin. Ankeret er i verdenskoordinater, altså bg minus
  // (ox,oy).
  out.push('');
  out.push('6  Ankeret innenfor bakgrunnsbildet');
  medBevegelse.forEach(function(e){
    const t = game.TRACKS[e.i], b = e.b;
    const bx = b.x + t.bgOx, by = b.y + t.bgOy;
    const inne = bx >= 0 && by >= 0 && bx <= t.bgW && by <= t.bgH;
    if(!inne) fails.push('6: ' + e.name + ': ankeret ligger på (' + bx.toFixed(0) + ',' + by.toFixed(0) +
      ') i et bakgrunnsbilde på ' + t.bgW + '×' + t.bgH);
    out.push('   ' + pad(e.name, 14) + 'bg (' + padL(bx.toFixed(0), 5) + ',' + padL(by.toFixed(0), 5) + ') i ' +
      t.bgW + '×' + t.bgH + ' · nærmeste kant ' +
      padL(Math.min(bx, by, t.bgW - bx, t.bgH - by).toFixed(0), 5) + ' px');
  });

  // ── 7: begge sider av banen er dekket ────────────────────────────────────
  // Hullet steg D2 etterlot, skrevet som et krav. Vendingen i `scene.beveg`
  // (`p.side>0 ? Math.PI : 0`) er en NO-OP på side −1, så en test som bare ser
  // baner på den sida kan ikke si om leddet finnes i det hele tatt: i D2 var
  // VISTANOTTE alene, og mutasjonen «slett vendingen» besto testen mens
  // mutasjonen «snu vendingen» ble fanget. Forskjellen er ren dekning, ikke
  // noe sjekk 5 mangler. Derfor kreves nå minst én detalj på HVER side, og
  // `side` ligger på objektet som rent tall for at kravet skal kunne måles i
  // stedet for å leses ut av koden på nytt.
  out.push('');
  out.push('7  Dekning: en bevegelig detalj på hver side av banen');
  const sider = {};
  medBevegelse.forEach(function(e){
    const sd = e.b.side;
    if(sd !== 1 && sd !== -1) fails.push('7: ' + e.name + ': TR.bevegelse.side er ' + sd + ' (må være 1 eller −1)');
    sider[sd] = (sider[sd] || []).concat([e.name]);
    out.push('   ' + pad(e.name, 14) + 'side ' + padL(sd, 2));
  });
  [-1, 1].forEach(function(sd){
    const har = sider[sd] || [];
    if(!har.length)
      fails.push('7: ingen bane har en bevegelig detalj på side ' + sd +
        ' — da er halvomdreiningen for side>0 utestet, og det var nøyaktig hullet i steg D2');
    out.push('   side ' + padL(sd, 2) + ': ' + (har.length ? har.join(', ') : '– INGEN, VENDINGEN ER UTESTET'));
  });

  // ── resultat ──────────────────────────────────────────────────────────────
  out.push('');
  if(fails.length){
    out.push('RESULTAT: FAIL — ' + fails.length + ' problem(er):');
    fails.forEach(function(f){ out.push('  · ' + f); });
  } else {
    out.push('RESULTAT: PASS — stillaset for bevegelige detaljer holder taket, drives av tid, ' +
      'kutter begge veier, dekker sin egen utstrekning og deler ramme med bakingen.');
  }
  console.log(out.join('\n'));
  return fails.length ? 'FAIL' : 'PASS';
}
