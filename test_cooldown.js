// ============================================================================
// Headless test av AVKJØLINGSRUNDEN (steg E) i vintage_f1.html.
//
// Kjøres med JavaScriptCore, samme opplegg som test_track_limits.js og
// test_gap.js — det finnes ingen `node` i dette miljøet:
//
//   osascript -l JavaScript test_cooldown.js
//   osascript -l JavaScript test_cooldown.js --html /tmp/annen.html
//
// Hele <script>-blokken fra spillet kjøres som den er, med stubbet
// document/canvas/window/localStorage, så testen måler den EKTE spillkoden.
//
// HVORDAN EN BIL FÅS I MÅL
// LAPS settes til 1 og løpet kjøres til en AI-bil krysser streken. Spillerbilen
// står stille hele tiden (ingen tastetrykk i stubben), og det er med vilje:
// bare spilleren utløser `state='win'`, som ellers ville stoppet simuleringen
// i det øyeblikket noen ble ferdig — og da ville avkjølingsrunden aldri kjørt.
// Det er nettopp tilfellet «AI-en er i mål mens spilleren fortsatt kjører»
// steget handler om.
//
// HVORFOR KOLLISJON MÅLES PÅ contactT OG IKKE PÅ POSISJON
// Begge bilene flytter seg av egen fysikk hvert steg, så to posisjoner før og
// etter et steg kan ikke skille «ble dyttet» fra «kjørte videre». Berøringen
// setter derimot contactT=CONTACT_GRACE på begge bilene, og det er et entydig
// ja/nei. Testen kjører både tilfellet som SKAL gi berøring (to biler i løp) og
// det som IKKE skal (en bil på avkjølingsrunde), ellers ville en test som bare
// sjekket «ingen berøring» også bestått om kollisjonen var slått av for alle.
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

function loadGame(path){
  const src = extractScript(readFile(path));
  const documentStub = {
    hidden: false,
    addEventListener: function(){},
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
    '  get trackSel(){ return trackSel; }, set trackSel(v){ trackSel = v; },\n' +
    '  get difficulty(){ return difficulty; }, set difficulty(v){ difficulty = v; },\n' +
    '  setRealistic: function(v){ REALISTIC = v; DIFFICULTIES = v ? DIFFICULTIES_REALISTIC : DIFFICULTIES_CASUAL; },\n' +
    '  get LAPS(){ return LAPS; }, set LAPS(v){ LAPS = v; },\n' +
    '  get COOL_SPEED(){ return COOL_SPEED; },\n' +
    '  get COOL_ALPHA(){ return COOL_ALPHA; },\n' +
    '  get COOL_LAPS(){ return COOL_LAPS; },\n' +
    '  get COOL_FADE_AT(){ return COOL_FADE_AT; },\n' +
    '  get CONTACT_GRACE(){ return CONTACT_GRACE; },\n' +
    '  nearestOnPath: function(P,x,y){ return nearestOnPath(P,x,y); },\n' +
    '  finalTimeSec: function(c){ return finalTimeSec(c); },\n' +
    '  startRace: startRace, update: update\n' +
    '};\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

function parkAt(game, car, idx, off){
  const P = game.TR.PATH, PN = P.length;
  const i = ((idx % PN) + PN) % PN;
  const a = P[i], b = P[(i+1)%PN];
  const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx,dy) || 1;
  car.x = a[0] + dx*0.5 - dy/L*off;
  car.y = a[1] + dy*0.5 + dx/L*off;
  car.angle = Math.atan2(dy,dx);
  car.vx = 0; car.vy = 0; car.speed = 0;
}

const results = [];
function check(navn, ok, detalj){
  results.push({ navn: navn, ok: !!ok, detalj: detalj });
}
function naer(a, b, slakk){ return Math.abs(a-b) <= slakk; }

// Starter et løp med LAPS=1 og kjører til den første AI-bilen er i mål.
// Returnerer bilen og hvor mange steg det tok.
function kjorTilForsteIMaal(game, maksSteg){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 1;
  game.startRace();
  game.state = 'playing'; // hopp over nedtellingen
  // Farten bilen holdt i løpet, målt rett før mål, er referansen de 55 %
  // sammenlignes mot. Snittet tas over hele runden fordi en avkjølingsrunde
  // også dekker både rettstrekk og svinger.
  let sum = 0, n = 0;
  for(let i=0; i<maksSteg; i++){
    game.update();
    const f = game.cars.filter(function(c){ return c.finished; });
    if(f.length > 0) return { bil: f[0], steg: i+1, snittLop: n ? sum/n : 0 };
    // samler fart for alle AI-bilene som ennå kjører
    game.cars.forEach(function(c){ if(!c.isPlayer && !c.finished){ sum += c.speed; n++; } });
  }
  return { bil: null, steg: maksSteg, snittLop: n ? sum/n : 0 };
}

// ── TEST 1: konstantene er de avtalte ───────────────────────────────────────
function testKonstanter(game){
  check('konstant: avkjølingsfart = 0,55', naer(game.COOL_SPEED, 0.55, 1e-9), 'COOL_SPEED=' + game.COOL_SPEED);
  check('konstant: gjennomsiktighet = 0,40 (60 % gjennomsiktig)', naer(game.COOL_ALPHA, 0.40, 1e-9), 'COOL_ALPHA=' + game.COOL_ALPHA);
  check('konstant: varighet = en halv runde', naer(game.COOL_LAPS, 0.50, 1e-9), 'COOL_LAPS=' + game.COOL_LAPS);
  check('nedtoningen starter før slutten', game.COOL_FADE_AT > 0 && game.COOL_FADE_AT < game.COOL_LAPS,
    'COOL_FADE_AT=' + game.COOL_FADE_AT + ' COOL_LAPS=' + game.COOL_LAPS);
}

// ── TEST 2: bilen kjører videre, på nedsatt fart, og toner ut ───────────────
function testAvkjoling(game){
  const f = kjorTilForsteIMaal(game, 12000);
  if(!f.bil){ check('en AI-bil kommer i mål innen 12000 steg', false, 'ingen ble ferdig'); return null; }
  check('en AI-bil kommer i mål innen 12000 steg', true);

  const bil = f.bil;
  const startDist = bil.raceDist;
  check('finishDist settes ved målpassering', bil.finishDist != null && naer(bil.finishDist, startDist, 0.02),
    'finishDist=' + bil.finishDist + ' raceDist=' + startDist);
  check('gjennomsiktigheten starter på COOL_ALPHA', naer(bil.coolAlpha, game.COOL_ALPHA, 1e-9),
    'coolAlpha=' + bil.coolAlpha);
  check('bilen er ikke utonet med én gang', bil.coolDone === false, 'coolDone=' + bil.coolDone);

  // Følg bilen gjennom hele avkjølingsrunden.
  const tidslinje = [];
  let sumFart = 0, nFart = 0, alphaFallt = false, forrigeAlpha = bil.coolAlpha;
  let alphaStabilFoerFade = true, monotonNed = true;
  let steg = 0;
  while(!bil.coolDone && steg < 12000){
    game.update(); steg++;
    const kjort = bil.raceDist - bil.finishDist;
    if(!bil.coolDone){
      sumFart += bil.speed; nFart++;
      if(kjort < game.COOL_FADE_AT && !naer(bil.coolAlpha, game.COOL_ALPHA, 1e-9)) alphaStabilFoerFade = false;
      if(bil.coolAlpha > forrigeAlpha + 1e-9) monotonNed = false;
      if(bil.coolAlpha < game.COOL_ALPHA - 1e-9) alphaFallt = true;
      forrigeAlpha = bil.coolAlpha;
      if(steg % 40 === 0) tidslinje.push({ kjort: kjort.toFixed(3), alpha: bil.coolAlpha.toFixed(3), fart: bil.speed.toFixed(2) });
    }
  }
  const kjortTotalt = bil.raceDist - bil.finishDist;
  const snittKjoling = nFart ? sumFart/nFart : 0;

  check('bilen kjører videre etter mål (sto før stille)', kjortTotalt > 0.4,
    'kjørt siden mål=' + kjortTotalt.toFixed(3) + ' runder');
  check('bilen er utonet etter en halv runde', bil.coolDone === true && naer(kjortTotalt, game.COOL_LAPS, 0.02),
    'coolDone=' + bil.coolDone + ' kjørt=' + kjortTotalt.toFixed(3));
  check('gjennomsiktigheten ender på 0', naer(bil.coolAlpha, 0, 1e-9), 'coolAlpha=' + bil.coolAlpha);
  check('gjennomsiktigheten holder seg stabil før nedtoningen', alphaStabilFoerFade);
  check('gjennomsiktigheten går bare nedover', monotonNed);
  check('gjennomsiktigheten toner faktisk ned underveis', alphaFallt);

  // 55 %: snittfarten på avkjølingsrunden mot snittfarten i løpet.
  const forhold = f.snittLop > 0 ? snittKjoling/f.snittLop : 0;
  check('farten er omtrent 55 % av løpsfarten (0,45–0,65)', forhold > 0.45 && forhold < 0.65,
    'forhold=' + forhold.toFixed(3) + ' (løp=' + f.snittLop.toFixed(2) + ', avkjøling=' + snittKjoling.toFixed(2) + ')');

  return { bil: bil, steg: steg, forhold: forhold, snittLop: f.snittLop,
           snittKjoling: snittKjoling, kjortTotalt: kjortTotalt, tidslinje: tidslinje };
}

// ── TEST 3: ingen straffetid på avkjølingsrunden ───────────────────────────
// Dette er den som beskytter resultatlista: straffetid går inn i
// finalTimeSec(), som finalizeResults() rangerer etter. Uten sperra kunne en
// bil som alt var i mål falt bakover for noe den gjorde på utrullingen.
function testIngenStraff(game){
  const f = kjorTilForsteIMaal(game, 12000);
  if(!f.bil){ check('fikk en bil i mål for straffetest', false, 'ingen ble ferdig'); return; }
  const bil = f.bil;
  const straffFoer = bil.penaltySec, bruddFoer = bil.limitViolations;
  const tidFoer = game.finalTimeSec(bil);
  const PN = game.TR.PATH.length;
  const idx = Math.floor(PN*0.5);
  const off = game.TR.TW*2.5 + game.TR.TW; // langt ute i gresset
  for(let i=0;i<200;i++){ parkAt(game, bil, idx, off); game.update(); }
  check('ingen nye banegrenser på avkjølingsrunden', bil.limitViolations === bruddFoer,
    'før=' + bruddFoer + ' etter=' + bil.limitViolations);
  check('ingen straffetid på avkjølingsrunden', bil.penaltySec === straffFoer,
    'før=' + straffFoer + 's etter=' + bil.penaltySec + 's');
  check('sluttiden er uendret av avkjølingsrunden', naer(game.finalTimeSec(bil), tidFoer, 1e-9),
    'før=' + tidFoer.toFixed(3) + ' etter=' + game.finalTimeSec(bil).toFixed(3));
  check('finishT ble ikke overskrevet', bil.finishT != null && bil.finished === true,
    'finishT=' + bil.finishT);
}

// ── TEST 4: kollisjon — kontrollen og avkjølingsbilen ──────────────────────
function testKollisjon(gameA, gameB){
  // Kontroll: to biler i LØP som overlapper SKAL registrere berøring.
  gameA.trackSel = 0; gameA.setRealistic(false); gameA.difficulty = 1; gameA.LAPS = 8;
  gameA.startRace(); gameA.state = 'playing';
  const ai = gameA.cars.filter(function(c){ return !c.isPlayer; });
  const a1 = ai[0], a2 = ai[1];
  const PN = gameA.TR.PATH.length, idx = Math.floor(PN*0.5);
  a1.contactT = 0; a2.contactT = 0;
  parkAt(gameA, a1, idx, 0); parkAt(gameA, a2, idx, 3); // 3 px fra hverandre, godt under minD=15
  gameA.update();
  const kontroll = a1.contactT > 0 && a2.contactT > 0;
  check('KONTROLL: to biler i løp som overlapper gir berøring', kontroll,
    'contactT a1=' + a1.contactT + ' a2=' + a2.contactT);

  // Avkjølingsbilen skal IKKE gi berøring.
  const f = kjorTilForsteIMaal(gameB, 12000);
  if(!f.bil){ check('fikk en bil i mål for kollisjonstest', false, 'ingen ble ferdig'); return; }
  const ferdig = f.bil;
  const racer = gameB.cars.filter(function(c){ return !c.isPlayer && !c.finished; })[0];
  if(!racer){ check('fant en bil som fortsatt kjører', false, 'alle ble ferdige'); return; }
  const PN2 = gameB.TR.PATH.length, idx2 = Math.floor(PN2*0.25);
  ferdig.contactT = 0; racer.contactT = 0;
  parkAt(gameB, ferdig, idx2, 0); parkAt(gameB, racer, idx2, 3);
  gameB.update();
  check('bil på avkjølingsrunde gir ingen berøring', ferdig.contactT === 0 && racer.contactT === 0,
    'contactT ferdig=' + ferdig.contactT + ' racer=' + racer.contactT);
}

// ── TEST 5: tegnekoden nullstiller alpha ───────────────────────────────────
// Lest rett ut av kilden. Dette er den ene feilen i steget som ikke gir noe
// målbart utslag i spilltilstanden: glemmer drawCar() å sette globalAlpha
// tilbake til 1, blir ALLE biler som tegnes etter den utonede gjennomsiktige,
// og det ville ingen av testene over fanget.
function testAlphaNullstilles(raa){
  const i = raa.indexOf('function drawCar(c){');
  const j = raa.indexOf('\nfunction ', i+10);
  const kropp = raa.slice(i, j < 0 ? raa.length : j);
  check('drawCar() hopper over ferdig utonede biler', /if\(c\.coolDone\)\s*return/.test(kropp));
  check('drawCar() nullstiller globalAlpha til slutt', /ctx\.globalAlpha=1;\s*\n\}/.test(kropp),
    'fant ingen nullstilling på slutten av drawCar()');
  check('drawCar() ganger alpha-verdiene med faktoren A', (kropp.match(/\*A/g)||[]).length >= 5,
    'fant ' + (kropp.match(/\*A/g)||[]).length + ' bruk av *A');
}

function main(argv){
  const t0 = Date.now();
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html' && argv[i+1]) html = argv[i+1];

  const raa = readFile(html);
  console.log('AVKJØLINGSRUNDE (steg E) — ' + html);

  const g1 = loadGame(html);
  testKonstanter(g1);
  console.log('  COOL_SPEED=' + g1.COOL_SPEED + '  COOL_ALPHA=' + g1.COOL_ALPHA +
    '  COOL_LAPS=' + g1.COOL_LAPS + '  COOL_FADE_AT=' + g1.COOL_FADE_AT);

  const avk = testAvkjoling(loadGame(html));
  testIngenStraff(loadGame(html));
  testKollisjon(loadGame(html), loadGame(html));
  testAlphaNullstilles(raa);

  if(avk){
    console.log('');
    console.log('── Avkjølingsrunden, hvert 40. steg ───────────────────');
    avk.tidslinje.forEach(function(r){
      console.log('  kjørt=' + r.kjort + ' runder  alpha=' + r.alpha + '  fart=' + r.fart);
    });
    console.log('  varighet: ' + avk.steg + ' steg (' + (avk.steg/60).toFixed(1) + ' s), ' +
      avk.kjortTotalt.toFixed(3) + ' runder');
    console.log('  fart: løp=' + avk.snittLop.toFixed(2) + '  avkjøling=' + avk.snittKjoling.toFixed(2) +
      '  forhold=' + avk.forhold.toFixed(3) + ' (mål 0,55)');
  }

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
