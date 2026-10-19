// ============================================================================
// Headless test av TIDSGAP (steg C) i vintage_f1.html.
//
//   osascript -l JavaScript test_gap.js
//   osascript -l JavaScript test_gap.js --html /tmp/annen.html
//
// HVORFOR TO BILER MED PÅTVUNGET FART
// Gapet skal være en TID, ikke en omregnet avstand. Den eneste måten å vite om
// tallet er riktig, er å sette opp en situasjon der fasiten kan regnes for
// hånd: to biler som kjører nøyaktig like fort, med en kjent avstand mellom
// seg. Da er tidsgapet per definisjon avstand delt på fart, og testen kan
// sammenligne spillets tall med det.
//
// Bilene flyttes derfor manuelt langs banelinja med et fast tillegg per steg i
// stedet for å kjøres av fysikken. raceDist i spillet summerer nettopp
// endringen i progresjon per steg, så en bil som flyttes 1/2400 runde per steg
// får en raceDist som vokser med nøyaktig 1/2400 per steg — en runde på 2400
// steg, altså 40 sekunder, som er omtrent en ekte rundetid i spillet.
//
// FORVENTET MÅLEFEIL
// Tidsstemplene settes det steget bilen passerer et punkt, så hvert stempel
// kan ligge inntil ett steg for sent. Differansen mellom to stempler har
// dermed en feil på opptil to steg = 0,033 sekund. Testen krever 0,05, som er
// akkurat nok til å slippe gjennom kvantiseringen, men ikke nok til å slippe
// gjennom en reell regnefeil.
// ============================================================================
ObjC.import('Foundation');

function readFile(path){
  const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if(data === null) throw new Error('Kunne ikke lese filen: ' + path);
  return ObjC.unwrap(data);
}
function extractScript(html){
  const open = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if(open < 0 || close < open) throw new Error('Fant ikke <script>-blokken.');
  return html.slice(open + '<script>'.length, close);
}
function makeCtxStub(canvas){
  const target = { canvas: canvas };
  const proxy = new Proxy(target, {
    get: function(obj, key){
      if(key in obj) return obj[key];
      const noop = function(){ return proxy; };
      obj[key] = noop; return noop;
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
function loadGame(path){
  const src = extractScript(readFile(path));
  const documentStub = {
    hidden: false, addEventListener: function(){},
    getElementById: function(){ return makeCanvasStub(); },
    createElement: function(){ return makeCanvasStub(); }
  };
  const windowStub = { location: { href: '' }, addEventListener: function(){} };
  const localStorageStub = (function(){
    const mem = {};
    return {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(mem,k) ? mem[k] : null; },
      setItem: function(k,v){ mem[k] = String(v); },
      removeItem: function(k){ delete mem[k]; }
    };
  })();
  windowStub.localStorage = localStorageStub;
  const factory = eval('(function(document, window, requestAnimationFrame, performance, localStorage){\n' + src + '\n' +
    'return {\n' +
    '  get TR(){ return TR; },\n' +
    '  get cars(){ return cars; },\n' +
    '  get player(){ return player; },\n' +
    '  get state(){ return state; }, set state(v){ state = v; },\n' +
    '  get raceTime(){ return raceTime; },\n' +
    '  get GAP_MARKS(){ return GAP_MARKS; },\n' +
    '  get GAP_RING(){ return GAP_RING; },\n' +
    '  set trackSel(v){ trackSel = v; },\n' +
    '  set difficulty(v){ difficulty = v; },\n' +
    '  setRealistic: function(v){ REALISTIC = v; DIFFICULTIES = v ? DIFFICULTIES_REALISTIC : DIFFICULTIES_CASUAL; },\n' +
    '  set LAPS(v){ LAPS = v; },\n' +
    '  gapAhead: function(c){ return gapAhead(c); },\n' +
    '  gapBehind: function(c){ return gapBehind(c); },\n' +
    '  fmtGap: function(s){ return fmtGap(s); },\n' +
    '  nearestOnPath: function(P,x,y){ return nearestOnPath(P,x,y); },\n' +
    '  startRace: startRace, update: update\n' +
    '};\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

// Setter bilen nøyaktig på progresjon `p` (0–1) langs banelinja, ved å
// interpolere innenfor det segmentet progresjonen peker på. Da svarer
// nearestOnPath med samme progresjon tilbake, og raceDist i spillet vokser med
// nøyaktig det tillegget testen ba om.
function parkProgress(game, car, p){
  const P = game.TR.PATH, PN = P.length;
  let q = p % 1; if(q < 0) q += 1;
  const f = q*PN, i = Math.floor(f) % PN, t = f - Math.floor(f);
  const a = P[i], b = P[(i+1)%PN];
  car.x = a[0] + (b[0]-a[0])*t;
  car.y = a[1] + (b[1]-a[1])*t;
  car.angle = Math.atan2(b[1]-a[1], b[0]-a[0]);
  car.vx = 0; car.vy = 0; car.speed = 0;
}

const results = [];
function check(navn, ok, detalj){ results.push({ navn: navn, ok: !!ok, detalj: detalj }); }
function nær(a, b, tol){ return a != null && Math.abs(a-b) <= tol; }

// To biler på banen, uten å ha kjørt et eneste steg ennå.
function settOpp(game){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 8;
  game.startRace();
  game.state = 'playing';
  // Bare to biler igjen: den siste i lista er spillerbilen (den starter bakerst),
  // og nest sist er en AI-bil. Med nøyaktig to biler er «foran» og «bak»
  // entydig, og testen slipper å ta hensyn til 18 andre som også kjører.
  game.cars.splice(0, game.cars.length-2);
  const A = game.cars[0], B = game.cars[1];
  A.isPlayer = false; B.isPlayer = false; // ingen toasts, ingen tastatur
  return { A: A, B: B };
}

// To biler, kjent fart, kjent avstand. `d` er avstanden i runder, `v` er fart
// i runder per steg.
function toBiler(game, opts){
  const r = settOpp(game);
  const A = r.A, B = r.B;

  const v = opts.v, d = opts.d;
  // Start begge på kjente progresjoner og la raceDist bygge seg opp derfra.
  let pB = 0.10;
  for(let s=0; s<opts.steps; s++){
    const dB = (opts.shrink ? d - opts.shrink*(s/opts.steps) : d);
    parkProgress(game, B, pB);
    parkProgress(game, A, pB + dB);
    game.update();
    pB += v;
  }
  return { A: A, B: B };
}

function testKjentGap(game){
  const v = 1/2400;              // 2400 steg per runde = 40 s
  const d = 0.025;               // 0,025 runde foran = 1,0 sekund
  const r = toBiler(game, { v: v, d: d, steps: 1400 });
  const fasit = d/v/60;          // sekunder
  const gA = game.gapAhead(r.B);
  const gB = game.gapBehind(r.A);
  check('gap til bilen foran stemmer med regnet verdi (±0,05 s)',
    nær(gA, fasit, 0.05), 'fasit=' + fasit.toFixed(3) + ' målt=' + (gA==null?'null':gA.toFixed(3)));
  check('gap til bilen bak stemmer med regnet verdi (±0,05 s)',
    nær(gB, fasit, 0.05), 'fasit=' + fasit.toFixed(3) + ' målt=' + (gB==null?'null':gB.toFixed(3)));
  check('gap foran og bak er samme tall sett fra hver sin bil',
    gA != null && gB != null && Math.abs(gA-gB) < 0.05,
    'foran=' + (gA==null?'null':gA.toFixed(3)) + ' bak=' + (gB==null?'null':gB.toFixed(3)));
  return { fasit: fasit, gA: gA, gB: gB };
}

// Et halvt så stort gap skal gi et halvt så stort tall — fanger en feil som
// tilfeldigvis stemmer for én enkelt avstand.
function testAnnetGap(game){
  const v = 1/2400, d = 0.0125;  // 0,5 sekund
  const r = toBiler(game, { v: v, d: d, steps: 1400 });
  const fasit = d/v/60;
  const gA = game.gapAhead(r.B);
  check('halvert avstand gir halvert gap (±0,05 s)',
    nær(gA, fasit, 0.05), 'fasit=' + fasit.toFixed(3) + ' målt=' + (gA==null?'null':gA.toFixed(3)));
  return { fasit: fasit, gA: gA };
}

// Halvert fart med samme avstand skal DOBLE tidsgapet. Dette er kjernen i at
// gapet er en tid og ikke en avstand: avstanden er den samme i begge tilfeller.
function testFartPaavirkerGap(game){
  const d = 0.025;
  const r = toBiler(game, { v: 1/4800, d: d, steps: 2600 }); // halv fart
  const fasit = d/(1/4800)/60;
  const gA = game.gapAhead(r.B);
  check('halvert fart dobler tidsgapet ved samme avstand (±0,05 s)',
    nær(gA, fasit, 0.05), 'fasit=' + fasit.toFixed(3) + ' målt=' + (gA==null?'null':gA.toFixed(3)));
  return { fasit: fasit, gA: gA };
}

function testLederOgSist(game){
  const r = toBiler(game, { v: 1/2400, d: 0.025, steps: 600 });
  check('lederen har ingen bil foran seg', game.gapAhead(r.A) === null,
    'gapAhead(leder)=' + String(game.gapAhead(r.A)));
  check('siste bil har ingen bil bak seg', game.gapBehind(r.B) === null,
    'gapBehind(sist)=' + String(game.gapBehind(r.B)));
}

// Trendfargen: gapet krymper jevnt gjennom hele kjøringen, så etter at begge
// bilene har vært innom samme punkt to runder på rad skal trenden være «-1».
function testTrend(game){
  const r = toBiler(game, { v: 1/2400, d: 0.030, steps: 5200, shrink: 0.020 });
  check('krympende gap gir grønn trend (-1)', r.B.gapTrend === -1, 'gapTrend=' + r.B.gapTrend);
  const r2 = toBiler(game, { v: 1/2400, d: 0.010, steps: 5200, shrink: -0.020 });
  check('voksende gap gir rød trend (+1)', r2.B.gapTrend === 1, 'gapTrend=' + r2.B.gapTrend);
}

// Hele poenget med å lese av låste tidsstempler istedenfor «nå minus ...» er at
// tallet ikke skal krype oppover mellom målepunktene. Med konstant fart og
// konstant avstand skal gapet derfor stå helt stille gjennom en hel runde.
// Prompt-varianten ville gitt et sagtannmønster på opp mot ett punktintervall
// (0,8 sekunder her), så denne testen skiller de to formlene fra hverandre.
function testStabiltMellomPunkter(game){
  const v = 1/2400, d = 0.025;
  const r = settOpp(game);
  let pB = 0.10, lav = Infinity, høy = -Infinity;
  for(let s=0; s<3600; s++){
    parkProgress(game, r.B, pB);
    parkProgress(game, r.A, pB + d);
    game.update();
    pB += v;
    if(s > 1200){ // først når ringbufferet har to runder bak seg
      const g = game.gapAhead(r.B);
      if(g != null){ if(g < lav) lav = g; if(g > høy) høy = g; }
    }
  }
  check('gapet står stille mellom målepunktene ved konstant fart (< 0,05 s svai)',
    høy - lav < 0.05, 'lavest=' + lav.toFixed(3) + ' høyest=' + høy.toFixed(3) +
    ' svai=' + (høy-lav).toFixed(3));
}

// Baksiden av låste tidsstempler: står bilen stille, har den ikke passert noe
// nytt punkt, og et rent oppslag blir hengende på den siste målingen. Målt i
// nettleseren viste HUD-en «▲ +0.00» mens bilen var sju sekunder bak. Gapet
// skal vokse omtrent som stillstanden, og innenfor ett punktintervall — finere
// enn det kan 50 punkter per runde ikke måle.
function testStillstandVokser(game){
  const v = 1/2400, d = 0.025;
  const punktIntervall = (1/game.GAP_MARKS)/v/60;   // 0,8 s
  const r = settOpp(game);
  let pB = 0.10;
  for(let s=0; s<1400; s++){
    parkProgress(game, r.B, pB);
    parkProgress(game, r.A, pB + d);
    game.update();
    pB += v;
  }
  const før = game.gapAhead(r.B);
  const stillstand = 2.0;                            // sekunder
  let pA = pB + d, forrige = før, aldriNed = true;
  for(let s=0; s<stillstand*60; s++){
    parkProgress(game, r.B, pB);                     // B rører seg ikke
    parkProgress(game, r.A, pA);
    game.update();
    pA += v;
    const g = game.gapAhead(r.B);
    if(g != null && g < forrige - 1e-9) aldriNed = false;
    if(g != null) forrige = g;
  }
  const etter = game.gapAhead(r.B);
  const vekst = etter - før;
  check('gapet vokser når bilen står stille (ikke frosset på siste måling)',
    vekst > punktIntervall, 'før=' + før.toFixed(3) + ' etter=' + etter.toFixed(3) +
    ' vekst=' + vekst.toFixed(3));
  check('veksten tilsvarer stillstanden innenfor ett punktintervall',
    vekst <= stillstand + 0.05 && vekst >= stillstand - punktIntervall,
    'vekst=' + vekst.toFixed(3) + ' stillstand=' + stillstand.toFixed(2) +
    ' punktintervall=' + punktIntervall.toFixed(2));
  check('gapet faller aldri tilbake underveis (ingen sagtann)', aldriNed,
    'siste=' + forrige.toFixed(3));
}

function testFormat(game){
  check('under 10 sekunder vises med to desimaler', game.fmtGap(0.839) === '0.84', game.fmtGap(0.839));
  check('over 10 sekunder vises med én desimal', game.fmtGap(12.34) === '12.3', game.fmtGap(12.34));
  check('negativt gap formateres uten fortegn (fortegnet settes i HUD-en)',
    game.fmtGap(-1.204) === '1.20', game.fmtGap(-1.204));
}

function main(argv){
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html') html = argv[++i];
  const t0 = Date.now();
  console.log('Laster ' + html + ' …');
  const g0 = loadGame(html);
  console.log('GAP_MARKS=' + g0.GAP_MARKS + ' punkter per runde, ringbuffer=' + g0.GAP_RING + ' (to runder)');

  const k = testKjentGap(loadGame(html));
  const h = testAnnetGap(loadGame(html));
  const f = testFartPaavirkerGap(loadGame(html));
  testLederOgSist(loadGame(html));
  testTrend(loadGame(html));
  testStabiltMellomPunkter(loadGame(html));
  testStillstandVokser(loadGame(html));
  testFormat(g0);

  console.log('');
  console.log('── Målte gap mot fasit ────────────────────────────────');
  console.log('  1,0 s forventet: ' + (k.gA==null?'null':k.gA.toFixed(3)) + ' s  (avvik ' +
    (k.gA==null?'-':Math.abs(k.gA-k.fasit).toFixed(4)) + ' s)');
  console.log('  0,5 s forventet: ' + (h.gA==null?'null':h.gA.toFixed(3)) + ' s  (avvik ' +
    (h.gA==null?'-':Math.abs(h.gA-h.fasit).toFixed(4)) + ' s)');
  console.log('  2,0 s forventet (halv fart): ' + (f.gA==null?'null':f.gA.toFixed(3)) + ' s  (avvik ' +
    (f.gA==null?'-':Math.abs(f.gA-f.fasit).toFixed(4)) + ' s)');

  console.log('');
  console.log('── Resultat ───────────────────────────────────────────');
  let feil = 0;
  results.forEach(function(r){
    if(!r.ok) feil++;
    console.log('  ' + (r.ok ? 'OK  ' : 'FEIL') + '  ' + r.navn + (r.ok ? '' : '   [' + r.detalj + ']'));
  });
  console.log('  ' + (results.length-feil) + '/' + results.length + ' tester bestått');
  console.log('');
  console.log('Ferdig på ' + ((Date.now()-t0)/1000).toFixed(1) + ' s');
  return feil === 0 ? 'ALLE TESTER BESTÅTT' : (feil + ' TEST(ER) FEILET');
}

// `main`, ikke `run` — JXA kaller en global `run` automatisk, og da hadde hele
// testen kjørt to ganger. Samme felle som i test_ai_sim.js.
main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
