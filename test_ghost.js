// ============================================================================
// Headless test av SPØKELSESBILEN (steg F) i vintage_f1.html.
//
// Kjøres med JavaScriptCore, samme opplegg som test_cooldown.js og
// test_boost.js — det finnes ingen `node` i dette miljøet:
//
//   osascript -l JavaScript test_ghost.js
//   osascript -l JavaScript test_ghost.js --html /tmp/annen.html
//
// Hele <script>-blokken fra spillet kjøres som den er, med stubbet
// document/canvas/window/localStorage, så testen måler den EKTE spillkoden.
//
// HVORDAN EN RUNDE KJØRES UTEN Å KUNNE KJØRE BIL
// Spillerbilen settes langs TR.PATH ett punkt per steg («på skinner»), og
// update() kalles mellom hver flytting. Da får progresjonen, raceDist og
// målpasseringen ekte tall å regne på, uten at testen må holde en bil på
// veien gjennom en hel runde. Farten nullstilles i hver flytting, så fysikken
// i update() flytter bilen praktisk talt ingenting selv — det er skinnene som
// bestemmer linja, og det er nettopp den linja opptaket skal gjengi.
//
// HVORFOR KONTRASTEN MÅLES OG IKKE VURDERES
// Spøkelset er hvitt tegnet med GHOST_ALPHA oppå asfalten. Det er blandingen
// av de to som havner på skjermen, så den må regnes ut før den kan sjekkes mot
// prosjektets 3:1-krav for en bil mot banedekket. Testen måler også verdien
// ETT hakk lavere, slik at kommentaren i spillfila om hvorfor det ble 0,36 og
// ikke 0,35 blir stående som et målt faktum og ikke som en påstand.
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
  c.getContext = function(){ if(!c._ctx) c._ctx = makeCtxStub(c); return c._ctx; };
  return c;
}

// Lagringsstubb som kan skrus til å kaste. Både privat modus, avslåtte cookies
// og full kvote gir et unntak fra selve localStorage-oppslaget, og det er den
// oppførselen `mode='kaster'` etterligner.
function makeStorage(){
  const mem = {};
  const s = {
    mode: 'ok',
    mem: mem,
    getItem: function(k){
      if(s.mode === 'kaster') throw new Error('lagring blokkert');
      return Object.prototype.hasOwnProperty.call(mem,k) ? mem[k] : null;
    },
    setItem: function(k,v){
      if(s.mode === 'kaster') throw new Error('lagring blokkert');
      mem[k] = String(v);
    },
    removeItem: function(k){ delete mem[k]; }
  };
  return s;
}

function loadGame(path){
  const src = extractScript(readFile(path));
  const handlers = {};
  const documentStub = {
    hidden: false,
    addEventListener: function(type, fn){ handlers[type] = fn; },
    getElementById: function(){ return makeCanvasStub(); },
    createElement: function(){ return makeCanvasStub(); }
  };
  const windowStub = { location: { href: '' }, addEventListener: function(){} };
  const storage = makeStorage();
  windowStub.localStorage = storage;
  const factory = eval('(function(document, window, requestAnimationFrame, performance, localStorage){\n' + src + '\n' +
    'return {\n' +
    '  get TR(){ return TR; },\n' +
    '  get cars(){ return cars; },\n' +
    '  get player(){ return player; },\n' +
    '  get state(){ return state; }, set state(v){ state = v; },\n' +
    '  get raceTime(){ return raceTime; },\n' +
    '  get bestLap(){ return bestLap; },\n' +
    '  get trackSel(){ return trackSel; }, set trackSel(v){ trackSel = v; },\n' +
    '  get difficulty(){ return difficulty; }, set difficulty(v){ difficulty = v; },\n' +
    '  setRealistic: function(v){ REALISTIC = v; DIFFICULTIES = v ? DIFFICULTIES_REALISTIC : DIFFICULTIES_CASUAL; },\n' +
    '  get GHOST_STEP(){ return GHOST_STEP; },\n' +
    '  get GHOST_HZ(){ return GHOST_HZ; },\n' +
    '  get GHOST_FIELDS(){ return GHOST_FIELDS; },\n' +
    '  get GHOST_VER(){ return GHOST_VER; },\n' +
    '  get GHOST_MAX(){ return GHOST_MAX; },\n' +
    '  get GHOST_ALPHA(){ return GHOST_ALPHA; },\n' +
    '  get GHOST_LIVERY(){ return GHOST_LIVERY; },\n' +
    '  get GHOST_TXT(){ return GHOST_TXT; },\n' +
    '  get GHOST_TXT_DIM(){ return GHOST_TXT_DIM; },\n' +
    '  get ASPHALT(){ return ASPHALT; },\n' +
    '  get ghostOn(){ return ghostOn; }, set ghostOn(v){ ghostOn = v; },\n' +
    '  get ghostRec(){ return ghostRec; }, set ghostRec(v){ ghostRec = v; },\n' +
    '  get ghostLap(){ return ghostLap; }, set ghostLap(v){ ghostLap = v; },\n' +
    '  get ghostProgMax(){ return ghostProgMax; }, set ghostProgMax(v){ ghostProgMax = v; },\n' +
    '  get ghostDist0(){ return ghostDist0; },\n' +
    '  get ghostNextT(){ return ghostNextT; },\n' +
    '  ghostKey: function(){ return ghostKey(); },\n' +
    '  lesGhost: function(){ return lesGhost(); },\n' +
    '  skrivGhost: function(t,p){ return skrivGhost(t,p); },\n' +
    '  lagreGhostRunde: function(t){ return lagreGhostRunde(t); },\n' +
    '  ghostPose: function(t){ return ghostPose(t); },\n' +
    '  ghostDelta: function(t){ return ghostDelta(t); },\n' +
    '  contrastRatio: function(a,b){ return contrastRatio(a,b); },\n' +
    '  wrapPi: function(a){ return wrapPi(a); },\n' +
    '  nearestOnPath: function(P,x,y){ return nearestOnPath(P,x,y); },\n' +
    '  startPractice: startPractice, update: update\n' +
    '};\n})');
  const game = factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, storage);
  return { game: game, storage: storage, handlers: handlers };
}

const results = [];
function check(navn, ok, detalj){ results.push({ navn: navn, ok: !!ok, detalj: detalj }); }
function naer(a, b, slakk){ return Math.abs(a-b) <= slakk; }

// ── hjelpere ────────────────────────────────────────────────────────────────

// Setter bilen på senterlinja ved en gitt andel av runden (0–1).
function parkAtFrac(game, car, frac, off){
  const P = game.TR.PATH, PN = P.length;
  const f = ((frac % 1) + 1) % 1;
  const fi = f * PN;
  const i = Math.floor(fi) % PN, u = fi - Math.floor(fi);
  const a = P[i], b = P[(i+1) % PN];
  const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx,dy) || 1;
  car.x = a[0] + dx*u - dy/L*(off||0);
  car.y = a[1] + dy*u + dx/L*(off||0);
  car.angle = Math.atan2(dy,dx);
  car.vx = 0; car.vy = 0; car.speed = 0;
}

// Kjører én runde på skinner og returnerer steget målstreken ble krysset, eller
// -1. `brudd` setter lapHadViolation hvert steg, altså en runde som skal bli
// slettet.
function kjorRunde(game, steg, brudd){
  const startLap = game.player.lap;
  for(let i=1; i<=steg; i++){
    parkAtFrac(game, game.player, (i/steg) * 1.004, 0);
    if(brudd) game.player.lapHadViolation = true;
    game.update();
    if(game.player.lap > startLap) return i;
  }
  return -1;
}

function startOving(game, bane){
  game.trackSel = bane || 0;
  game.setRealistic(false);
  game.difficulty = 1;
  game.startPractice();
}

// Et kunstig spøkelse med jevn fart: n punkter, progresjon lineært 0→1 over
// `sek` sekunder. Gir et grunnlag der riktig Δ-tid kan regnes i hodet.
function lagKunstig(game, sek){
  const n = Math.round(sek * game.GHOST_HZ) + 1;
  const pts = [];
  for(let i=0; i<n; i++){
    pts.push(1000 + i, 2000, 0, Math.round((i/(n-1)) * 1e5));
  }
  return { t: sek, pts: pts };
}

function hexFra(c){
  return '#' + c.map(function(v){
    const s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
    return s.length < 2 ? '0' + s : s;
  }).join('');
}
function hexTil(h){
  h = h.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
// Canvas blander i sRGB, altså rett på 8-bits-verdiene — det er den blandingen
// som faktisk havner på skjermen, og dermed den som skal måles.
function blandOver(fgHex, a, bgHex){
  const f = hexTil(fgHex), b = hexTil(bgHex);
  return hexFra([0,1,2].map(function(i){ return f[i]*a + b[i]*(1-a); }));
}

// ── TEST 1: konstantene og lakkeringen ──────────────────────────────────────
function testKonstanter(game){
  check('konstant: ett punkt hvert tredje steg', game.GHOST_STEP === 3, 'GHOST_STEP=' + game.GHOST_STEP);
  check('konstant: 20 punkter i sekundet', naer(game.GHOST_HZ, 20, 1e-9), 'GHOST_HZ=' + game.GHOST_HZ);
  check('konstant: fire tall per punkt', game.GHOST_FIELDS === 4, 'GHOST_FIELDS=' + game.GHOST_FIELDS);
  check('konstant: taket svarer til 240 s runde',
    naer(game.GHOST_MAX / game.GHOST_HZ, 240, 1e-9), 'GHOST_MAX=' + game.GHOST_MAX);
  check('spøkelset er på som standard', game.ghostOn === true, 'ghostOn=' + game.ghostOn);

  // Flat hvit hele veien: er én av flatene en annen farge, er silhuetten ikke
  // lenger entydig hvit, og da kan spøkelset forveksles med en lakkering.
  const lv = game.GHOST_LIVERY;
  const flater = ['base','acc','dark','hel','spc'];
  const alleHvite = flater.every(function(k){ return lv[k] === '#ffffff'; });
  check('spøkelseslakkeringen er flat hvit', alleHvite,
    flater.map(function(k){ return k + '=' + lv[k]; }).join(' '));
}

// ── TEST 2: kontrasten mot asfalten ────────────────────────────────────────
function testKontrast(game){
  const asf = game.ASPHALT;
  const paa = blandOver('#ffffff', game.GHOST_ALPHA, asf);
  const k = game.contrastRatio(paa, asf);
  check('spøkelset når 3:1 mot asfalten', k >= 3,
    'alpha=' + game.GHOST_ALPHA + ' blandet=' + paa + ' kontrast=' + k.toFixed(3));

  // Ett hakk lavere skal IKKE bestå. Uten denne ville testen også gått gjennom
  // om alphaen ble satt til 0,8, og da sa den ingenting om at verdien er valgt
  // som den LAVESTE som består — som er hele poenget: spøkelset skal være så
  // svakt som kravet tillater.
  const lavere = blandOver('#ffffff', game.GHOST_ALPHA - 0.01, asf);
  const kLavere = game.contrastRatio(lavere, asf);
  check('ett hakk lavere alpha ville strøket (verdien er den laveste som består)',
    kLavere < 3, 'alpha=' + (game.GHOST_ALPHA-0.01).toFixed(2) + ' blandet=' + lavere +
    ' kontrast=' + kLavere.toFixed(3));

  // Δ-tallet i spøkelsespanelet: 15 px fet skrift er IKKE «stor tekst» etter
  // WCAG (grensen er 18,66 px), så kravet er 4,5:1 — ikke 3:1. Bakgrunnen er
  // panelets rgba(5,7,10,.78) oppå asfalten.
  const panel = blandOver('#05070a', 0.78, asf);
  // Tonene hentes fra spillets egne konstanter, ikke skrives av på nytt her:
  // ellers kunne panelet fått en dimmere farge uten at testen merket det.
  [['grønn Δ (du leder)','#4ade80'], ['rød Δ (du taper)','#ef4444'],
   ['overskrift, spøkelse på',game.GHOST_TXT],
   ['dempet tone (av, rundetid, Δ-strek)',game.GHOST_TXT_DIM]].forEach(function(r){
    const kr = game.contrastRatio(r[1], panel);
    // Overskriften og rundetiden er 9 px, altså også vanlig tekst → 4,5:1.
    check('Δ-panelet: ' + r[0] + ' når 4,5:1', kr >= 4.5,
      r[1] + ' mot ' + panel + ' = ' + kr.toFixed(2));
  });
  return { paa: paa, k: k, panel: panel };
}

// ── TEST 3: nøkkelen i localStorage ────────────────────────────────────────
function testNokkel(game){
  startOving(game, 0);
  const casual = game.ghostKey();
  check('nøkkelen har formen gp_ghost_<BANE>_<MODUS>',
    casual === 'gp_ghost_' + game.TR.name + '_CASUAL', 'nøkkel=' + casual);

  game.setRealistic(true);
  const real = game.ghostKey();
  game.setRealistic(false);
  check('realistisk og casual har hver sin nøkkel', real !== casual, casual + ' / ' + real);

  startOving(game, 1);
  check('hver bane har sin egen nøkkel', game.ghostKey() !== casual,
    casual + ' / ' + game.ghostKey());
  return casual;
}

// ── TEST 4: opptaket gjennom en hel runde ──────────────────────────────────
function testOpptak(game){
  startOving(game, 0);
  check('ingen spøkelse før første runde er kjørt', game.ghostLap === null,
    'ghostLap=' + game.ghostLap);
  check('punkt 0 tas opp ved rundestart (tiden 0 finnes)',
    game.ghostRec.length === game.GHOST_FIELDS, 'punkter=' + (game.ghostRec.length/4));

  const STEG = 600;
  const kryss = kjorRunde(game, STEG, false);
  if(kryss < 0){ check('runden fullføres på skinner', false, 'krysset aldri streken'); return null; }
  check('runden fullføres på skinner', true, 'krysset på steg ' + kryss);

  const g = game.ghostLap;
  if(!g){ check('den første gyldige runden blir spøkelse', false, 'ghostLap=null'); return null; }
  check('den første gyldige runden blir spøkelse', true);
  check('spøkelsets rundetid er rundetiden som ble kjørt', naer(g.t, kryss/60, 1e-9),
    'ghostLap.t=' + g.t.toFixed(4) + ' kjørt=' + (kryss/60).toFixed(4));

  const n = g.pts.length / game.GHOST_FIELDS;
  // Punkt 0 ligger på steg 0, så antallet er ett mer enn antall intervaller.
  const ventet = Math.floor(kryss / game.GHOST_STEP) + 1;
  check('antall punkter svarer til 20 Hz gjennom runden', n === ventet,
    'punkter=' + n + ' ventet=' + ventet + ' (steg=' + kryss + ')');

  check('alle tall er heltall (det som lagres er det som spilles av)',
    g.pts.every(function(v){ return Number.isInteger(v); }),
    'fant ' + g.pts.filter(function(v){ return !Number.isInteger(v); }).length + ' desimaltall');

  // Progresjonskolonnen MÅ stige: halveringssøket i ghostDelta() leter i den.
  let stiger = true, forrige = -1;
  for(let i=0;i<n;i++){
    const p = g.pts[i*4+3];
    if(p < forrige) stiger = false;
    forrige = p;
  }
  check('progresjonen stiger gjennom hele runden (grunnlag for halveringssøk)', stiger);
  check('progresjonen begynner på 0', g.pts[3] === 0, 'første progresjon=' + g.pts[3]);
  check('progresjonen ender på en hel runde',
    g.pts[(n-1)*4+3] > 0.97*1e5, 'siste progresjon=' + (g.pts[(n-1)*4+3]/1e5).toFixed(4));

  check('vinklene ligger innenfor ±pi', g.pts.every(function(v,i){
    return i%4 !== 2 || Math.abs(v) <= Math.round(Math.PI*1000);
  }));

  // Opptaket skal gjengi linja som ble kjørt. Bilen sto på senterlinja hele
  // runden, så hvert punkt skal ligge på senterlinja — innenfor avrundingen.
  let maksAvvik = 0;
  for(let i=0;i<n;i++){
    const x = g.pts[i*4], y = g.pts[i*4+1];
    const nr = game.nearestOnPath(game.TR.PATH, x, y);
    const d = Math.hypot(x - nr.x, y - nr.y);
    if(d > maksAvvik) maksAvvik = d;
  }
  check('opptaket gjengir linja som ble kjørt (på senterlinja)', maksAvvik < 5,
    'største avvik=' + maksAvvik.toFixed(2) + ' px');

  // Opptaket for den NYE runden er nullstilt og har alt punkt 0.
  check('opptaket nullstilles ved målpassering',
    game.ghostRec.length === game.GHOST_FIELDS, 'punkter=' + (game.ghostRec.length/4));

  const json = JSON.stringify({ v: game.GHOST_VER, t: g.t, pts: g.pts });
  return { g: g, n: n, kryss: kryss, maksAvvik: maksAvvik, bytes: json.length };
}

// ── TEST 5: avspilling og interpolasjon ────────────────────────────────────
function testAvspilling(game, opp){
  const g = game.ghostLap;
  const n = g.pts.length / 4;

  // På et punkttidspunkt skal posisjonen være punktet selv, ikke en blanding.
  let eksakt = true;
  for(let i=0; i<n; i+=17){
    const p = game.ghostPose(i / game.GHOST_HZ);
    if(!p || !naer(p.x, g.pts[i*4], 1e-6) || !naer(p.y, g.pts[i*4+1], 1e-6)) eksakt = false;
  }
  check('avspilling treffer punktene eksakt på deres eget tidspunkt', eksakt);

  // Midt mellom to punkter skal posisjonen være snittet.
  const halv = game.ghostPose(0.5 / game.GHOST_HZ);
  check('avspilling interpolerer mellom punktene',
    halv && naer(halv.x, (g.pts[0]+g.pts[4])/2, 1e-6) && naer(halv.y, (g.pts[1]+g.pts[5])/2, 1e-6),
    halv ? 'x=' + halv.x.toFixed(2) + ' ventet=' + ((g.pts[0]+g.pts[4])/2).toFixed(2) : 'ingen pose');

  check('spøkelset er borte etter at runden dens er slutt',
    game.ghostPose(g.t + 1) === null, 'pose ved t+1 s');
  check('spøkelset finnes gjennom hele runden sin',
    game.ghostPose(g.t * 0.5) !== null && game.ghostPose((n-1)/game.GHOST_HZ) !== null);

  // Vinkelen over pi-skillet: fra +3,140 til −3,140 rad er 0,003 rad den korte
  // veien. Uten wrapPi i ghostPose blir snittet 0 — altså en bil som peker rett
  // motsatt vei, og som snurrer én gang rundt hver gang den passerer skillet.
  game.ghostLap = { t: 1, pts: [0,0,3140,0, 100,0,-3140,50000, 200,0,-3140,100000] };
  const vend = game.ghostPose(0.5 / game.GHOST_HZ);
  check('vinkelen interpoleres den korte veien rundt pi-skillet',
    vend && Math.abs(game.wrapPi(vend.ang)) > 3.0,
    vend ? 'vinkel=' + vend.ang.toFixed(4) + ' rad (naiv interpolasjon ville gitt 0)' : 'ingen pose');
  game.ghostLap = g;
}

// ── TEST 6: Δ-tiden ────────────────────────────────────────────────────────
function testDelta(game){
  // Kunstig spøkelse: 10 s, progresjon lineært 0→1. Da er tiden spøkelset
  // brukte til progresjon p nøyaktig 10·p sekunder, og Δ kan regnes i hodet.
  const k = lagKunstig(game, 10);
  game.ghostLap = k;

  game.ghostProgMax = 0;
  check('Δ er ukjent før du har passert spøkelsets første punkt',
    game.ghostDelta(0.5) === null, 'Δ=' + game.ghostDelta(0.5));

  game.ghostProgMax = 0.5;
  const d1 = game.ghostDelta(4);
  check('Δ er negativ når du er foran spøkelset', d1 != null && naer(d1, -1, 0.03),
    'halv runde på 4 s mot spøkelsets 5 s → Δ=' + (d1 == null ? 'null' : d1.toFixed(3)));

  const d2 = game.ghostDelta(6);
  check('Δ er positiv når du er bak spøkelset', d2 != null && naer(d2, 1, 0.03),
    'halv runde på 6 s mot spøkelsets 5 s → Δ=' + (d2 == null ? 'null' : d2.toFixed(3)));

  game.ghostProgMax = 0.25;
  const d3 = game.ghostDelta(2.5);
  check('Δ er null når du er helt på linje med spøkelset', d3 != null && naer(d3, 0, 0.03),
    'Δ=' + (d3 == null ? 'null' : d3.toFixed(3)));

  // Forbi der spøkelset endte runden: svaret er differansen mot hele
  // rundetiden dens, ikke et oppslag utenfor lista.
  game.ghostProgMax = 1.0;
  const d4 = game.ghostDelta(9.4);
  check('Δ måles mot hele rundetiden når du er forbi spøkelsets siste punkt',
    d4 != null && naer(d4, -0.6, 1e-9), 'Δ=' + (d4 == null ? 'null' : d4.toFixed(3)));

  // Δ står stille, og tapet vokser, hvis du ikke kommer lenger. Dette er
  // poenget med at ghostProgMax er en MAKSVERDI: snur man og kjører bakover
  // over streken, faller progresjonen mot 1 og et oppslag på den øyeblikkelige
  // verdien ville vist et helt rundetap som gevinst.
  game.ghostProgMax = 0.5;
  const dA = game.ghostDelta(5), dB = game.ghostDelta(7);
  check('Δ vokser med tiden når du ikke kommer lenger', dB - dA > 1.9,
    'Δ(5 s)=' + dA.toFixed(2) + ' Δ(7 s)=' + dB.toFixed(2));

  game.ghostLap = null;
  check('ingen Δ uten lagret spøkelse', game.ghostDelta(1) === null);
}

// ── TEST 7: hvilke runder som faktisk blir lagret ──────────────────────────
function testHvaSomLagres(path){
  // Slettet runde: punktene skal ikke lagres, og nøkkelen skal bli stående tom.
  const a = loadGame(path);
  startOving(a.game, 0);
  const kryssA = kjorRunde(a.game, 600, true);
  check('en slettet runde blir ikke spøkelse', kryssA > 0 && a.game.ghostLap === null,
    'kryss=' + kryssA + ' ghostLap=' + (a.game.ghostLap ? 'satt' : 'null'));
  check('en slettet runde skriver ingenting til localStorage',
    a.storage.mem[a.game.ghostKey()] === undefined,
    'nøkkel=' + a.game.ghostKey());

  // Bare raskere runder overskriver.
  const b = loadGame(path);
  startOving(b.game, 0);
  const k = lagKunstig(b.game, 50);
  b.game.ghostLap = { t: 50, pts: k.pts };
  b.game.ghostRec = lagKunstig(b.game, 2).pts;
  check('en tregere runde overskriver ikke spøkelset',
    b.game.lagreGhostRunde(60) === false && b.game.ghostLap.t === 50,
    'ghostLap.t=' + b.game.ghostLap.t);
  check('en raskere runde overskriver spøkelset',
    b.game.lagreGhostRunde(40) === true && b.game.ghostLap.t === 40,
    'ghostLap.t=' + b.game.ghostLap.t);
  check('en raskere runde blir skrevet til localStorage',
    typeof b.storage.mem[b.game.ghostKey()] === 'string');

  // For få punkter, og en runde som traff taket.
  const c = loadGame(path);
  startOving(c.game, 0);
  c.game.ghostLap = null;
  c.game.ghostRec = [1,2,3,4];
  check('en runde med bare ett punkt lagres ikke', c.game.lagreGhostRunde(10) === false);
  const fullt = [];
  for(let i=0; i<c.game.GHOST_MAX; i++) fullt.push(i, 0, 0, Math.round(i/c.game.GHOST_MAX*1e5));
  c.game.ghostRec = fullt;
  check('en runde som traff taket lagres ikke (halvt spøkelse er verre enn ingen)',
    c.game.lagreGhostRunde(10) === false, 'punkter=' + (fullt.length/4) + ' tak=' + c.game.GHOST_MAX);
}

// ── TEST 8: lesing tåler ødelagt og blokkert lagring ───────────────────────
function testLesing(path){
  const { game, storage } = loadGame(path);
  startOving(game, 0);
  const K = game.ghostKey();
  const gyldig = { v: game.GHOST_VER, t: 12.5, pts: [1,2,3,0, 4,5,6,50000, 7,8,9,100000] };

  function les(raa){
    if(raa === null) delete storage.mem[K]; else storage.mem[K] = raa;
    return game.lesGhost();
  }

  check('blokkert lagring gir ingen spøkelse i stedet for å kaste', (function(){
    storage.mem[K] = JSON.stringify(gyldig);
    storage.mode = 'kaster';
    let svar, kastet = false;
    try { svar = game.lesGhost(); } catch(e){ kastet = true; }
    storage.mode = 'ok';
    return !kastet && svar === null;
  })());

  check('ingen lagret runde gir null', les(null) === null);
  check('ugyldig JSON gir null', les('{dette er ikke json') === null);
  check('ukjent versjon gir null', les(JSON.stringify({ v: 99, t: 1, pts: gyldig.pts })) === null);
  check('manglende rundetid gir null', les(JSON.stringify({ v: game.GHOST_VER, pts: gyldig.pts })) === null);
  check('rundetid på 0 gir null', les(JSON.stringify({ v: game.GHOST_VER, t: 0, pts: gyldig.pts })) === null);
  check('punktliste som ikke går opp i fire gir null',
    les(JSON.stringify({ v: game.GHOST_VER, t: 1, pts: [1,2,3,4,5,6,7] })) === null);
  check('for få punkter gir null',
    les(JSON.stringify({ v: game.GHOST_VER, t: 1, pts: [1,2,3,4] })) === null);
  check('tekst blant tallene gir null',
    les(JSON.stringify({ v: game.GHOST_VER, t: 1, pts: [1,2,3,0,'fire',5,6,7] })) === null);
  check('null blant tallene gir null',
    les(JSON.stringify({ v: game.GHOST_VER, t: 1, pts: [1,2,3,0,null,5,6,7] })) === null);
  check('punktliste som ikke er en liste gir null',
    les(JSON.stringify({ v: game.GHOST_VER, t: 1, pts: { '0': 1 } })) === null);

  const ok = les(JSON.stringify(gyldig));
  check('en gyldig lagret runde leses tilbake',
    ok !== null && naer(ok.t, 12.5, 1e-9) && ok.pts.length === gyldig.pts.length,
    ok ? 't=' + ok.t + ' punkter=' + (ok.pts.length/4) : 'null');

  // Skriving under blokkert lagring skal heller ikke kaste.
  storage.mode = 'kaster';
  let skrevKastet = false;
  try { game.skrivGhost(9.9, gyldig.pts); } catch(e){ skrevKastet = true; }
  storage.mode = 'ok';
  check('skriving under blokkert lagring kaster ikke', !skrevKastet);
}

// ── TEST 9: runden overlever en omstart (lagre → les → spill av) ───────────
// Dette er testen som binder det hele sammen: tallene som ble skrevet skal gi
// NØYAKTIG samme avspilling etter at siden er lastet på nytt. Hadde avrundingen
// bare skjedd på vei til localStorage, ville spøkelset flyttet seg her.
function testOmstart(path){
  const a = loadGame(path);
  startOving(a.game, 0);
  const kryss = kjorRunde(a.game, 600, false);
  if(kryss < 0 || !a.game.ghostLap){ check('fikk en runde å lagre for omstartstesten', false); return null; }
  const foer = a.game.ghostLap;
  const raa = a.storage.mem[a.game.ghostKey()];
  check('runden ligger i localStorage etter en gyldig runde', typeof raa === 'string');

  // Ny spilltilstand, samme lagrede data — som en ny fane.
  const b = loadGame(path);
  b.game.trackSel = 0; b.game.setRealistic(false); b.game.difficulty = 1;
  b.storage.mem['gp_ghost_' + a.game.TR.name + '_CASUAL'] = raa;
  b.game.startPractice();
  const etter = b.game.ghostLap;
  check('spøkelset leses inn igjen når øvingen starter',
    etter !== null, etter ? 't=' + etter.t : 'null');
  if(!etter) return null;
  check('alle punktene er like etter omstart',
    etter.pts.length === foer.pts.length &&
    etter.pts.every(function(v,i){ return v === foer.pts[i]; }),
    'punkter før=' + (foer.pts.length/4) + ' etter=' + (etter.pts.length/4));
  check('rundetiden er den samme etter omstart (3 desimaler)',
    naer(etter.t, foer.t, 0.0005), 'før=' + foer.t.toFixed(4) + ' etter=' + etter.t.toFixed(4));

  // Samme avspilling, punkt for punkt.
  let likAvspilling = true;
  for(let i=0; i<40; i++){
    const t = (i/40) * foer.t;
    const pa = a.game.ghostPose(t), pb = b.game.ghostPose(t);
    if(!pa || !pb || !naer(pa.x, pb.x, 1e-9) || !naer(pa.y, pb.y, 1e-9) || !naer(pa.ang, pb.ang, 1e-9)) likAvspilling = false;
  }
  check('avspillingen er identisk før og etter omstart', likAvspilling);
  return { bytes: raa.length };
}

// ── TEST 10: G slår spøkelset av og på ─────────────────────────────────────
function testTasten(path){
  const { game, handlers } = loadGame(path);
  if(typeof handlers.keydown !== 'function'){ check('spillet lytter på keydown', false); return; }
  check('spillet lytter på keydown', true);
  const trykk = function(k){ handlers.keydown({ key: k, code: 'Key' + k.toUpperCase(), preventDefault: function(){} }); };

  startOving(game, 0);
  const start = game.ghostOn;
  trykk('g');
  check('G slår spøkelset av', game.ghostOn === !start, 'ghostOn=' + game.ghostOn);
  trykk('G');
  check('G slår spøkelset på igjen (stor og liten bokstav)', game.ghostOn === start, 'ghostOn=' + game.ghostOn);

  // Innstillingen skal overleve R (ny økt på samme bane): har du slått
  // spøkelset av, skal det bli liggende av.
  trykk('g');
  const avslatt = game.ghostOn;
  trykk('r');
  check('av/på-valget overlever omstart med R', game.ghostOn === avslatt,
    'ghostOn=' + game.ghostOn);
  trykk('g');

  // Utenfor øving skal G ikke gjøre noe — den er en øvingstast.
  game.state = 'trackselect';
  const foer = game.ghostOn;
  trykk('g');
  check('G gjør ingenting utenfor øvingsmodus', game.ghostOn === foer, 'ghostOn=' + game.ghostOn);
}

// ── TEST 11: tegnerekkefølge, lest ut av kilden ────────────────────────────
// Tegningen har ingen tilstand å måle i en stubb, men rekkefølgen er et krav
// som er lett å brekke ved et uhell: tegnes spøkelset ETTER bilene, legger det
// seg oppå bilen du styrer, og da skjuler referansen det den skal måle.
function testTegning(raa){
  const i = raa.indexOf('function drawTrackScene(){');
  const j = raa.indexOf('\nfunction ', i+10);
  const kropp = raa.slice(i, j < 0 ? raa.length : j);
  const iGhost = kropp.indexOf('drawGhost()');
  const iCars = kropp.indexOf('.forEach(drawCar)');
  check('drawTrackScene() tegner spøkelset', iGhost > 0);
  check('spøkelset tegnes UNDER bilene', iGhost > 0 && iCars > 0 && iGhost < iCars,
    'drawGhost på ' + iGhost + ', drawCar på ' + iCars);
  check('spøkelset tegnes bare i øving, og bare når det er slått på',
    /state==='practice'\s*&&\s*ghostOn\s*&&\s*ghostLap/.test(kropp));

  const gi = raa.indexOf('function drawGhost(){');
  const gj = raa.indexOf('\nfunction ', gi+10);
  const gk = raa.slice(gi, gj < 0 ? raa.length : gj);
  check('drawGhost() bruker GHOST_ALPHA', /globalAlpha=GHOST_ALPHA/.test(gk));
  check('drawGhost() legger tegningen i save/restore (lekker ikke alpha videre)',
    /ctx\.save\(\)/.test(gk) && /ctx\.restore\(\)/.test(gk));

  // Panelet skal hente tonene fra de MÅLTE konstantene. Står det en hex rett i
  // panelblokka, er den ikke dekket av kontrastmålingen over — og det var
  // nettopp slik ledertavlas for mørke #475569 og #64748b kom inn hit først.
  const pi = raa.indexOf('// ── spøkelsespanel (øving) ──');
  const pk = raa.slice(pi, raa.indexOf('ctx.textAlign=\'center\';', pi));
  check('spøkelsespanelet bruker GHOST_TXT/GHOST_TXT_DIM, ikke egne hex-koder',
    pi > 0 && /GHOST_TXT\b/.test(pk) && /GHOST_TXT_DIM/.test(pk) &&
    !/fillStyle\s*=\s*(ghostOn\s*\?\s*)?'#[0-9a-f]{6}'/i.test(pk),
    pk.match(/fillStyle=[^;]*/g).join(' | '));
}

function main(argv){
  const t0 = Date.now();
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html' && argv[i+1]) html = argv[i+1];

  const raa = readFile(html);
  console.log('SPØKELSESBIL (steg F) — ' + html);

  const g1 = loadGame(html).game;
  testKonstanter(g1);
  const kon = testKontrast(g1);
  testNokkel(loadGame(html).game);

  const spill = loadGame(html).game;
  const opp = testOpptak(spill);
  if(opp){ testAvspilling(spill, opp); }
  testDelta(loadGame(html).game);
  testHvaSomLagres(html);
  testLesing(html);
  const om = testOmstart(html);
  testTasten(html);
  testTegning(raa);

  console.log('');
  console.log('── Målinger ───────────────────────────────────────────');
  console.log('  spøkelset på asfalt: hvit ved ' + g1.GHOST_ALPHA + ' → ' + kon.paa +
    ' = ' + kon.k.toFixed(3) + ':1 (krav 3,00)');
  console.log('  panelbakgrunn: ' + kon.panel);
  if(opp){
    console.log('  runde: ' + opp.kryss + ' steg (' + (opp.kryss/60).toFixed(2) + ' s), ' +
      opp.n + ' punkter = ' + (opp.n/(opp.kryss/60)).toFixed(1) + ' punkter/s');
    console.log('  avvik fra kjørt linje: ' + opp.maksAvvik.toFixed(2) + ' px største');
  }
  if(om) console.log('  i localStorage: ' + (om.bytes/1024).toFixed(1) + ' kB for denne runden');

  console.log('');
  console.log('── Resultat ───────────────────────────────────────────');
  let feil = 0;
  results.forEach(function(r){
    if(!r.ok) feil++;
    console.log('  ' + (r.ok ? 'OK  ' : 'FEIL') + '  ' + r.navn + (r.ok ? '' : '   [' + r.detalj + ']'));
  });
  console.log('  ' + (results.length - feil) + '/' + results.length + ' tester bestått');
  console.log('');
  console.log('Ferdig på ' + ((Date.now()-t0)/1000).toFixed(1) + ' s');
  return feil === 0 ? 'ALLE TESTER BESTÅTT' : (feil + ' TEST(ER) FEILET');
}

// MERK: funksjonen heter `main`, ikke `run`. JXA kaller automatisk en global
// funksjon ved navn `run`, så med det navnet kjører hele testen to ganger.
main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
