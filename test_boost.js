// ============================================================================
// Headless test av 2026-REGLENE (steg D) i vintage_f1.html: rett-modus, boost
// og overtake mode.
//
//   osascript -l JavaScript test_boost.js
//   osascript -l JavaScript test_boost.js --html /tmp/annen.html
//
// HVORFOR TASTENE SIMULERES OG IKKE TILSTANDEN SETTES DIREKTE
// Det hadde vært enklere å sette c.boostActive=true rett før hvert steg, men
// da ville testen målt sin egen antagelse. update() overskriver nettopp det
// feltet for spilleren ut fra tastaturet, så en test som setter feltet direkte
// ville bestått selv om tastebindingen var borte. Her settes `keys` i stedet,
// akkurat slik nettleseren gjør, og resten er spillets egen kode.
//
// HVORFOR BILEN PARKERES I NOEN AV TESTENE
// Ladetaket og utladningstiden skal måles i steg, ikke i meter. En bil som
// kjører fritt krysser mållinja og nullstiller ladebudsjettet midt i målingen.
// Derfor står bilen stille i de to testene — batteriet er ikke avhengig av
// fart, bare av input, så målingen er den samme og den er reproduserbar.
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
    '  get TRACKS(){ return TRACKS; },\n' +
    '  get cars(){ return cars; },\n' +
    '  get player(){ return player; },\n' +
    '  get keys(){ return keys; },\n' +
    '  get state(){ return state; }, set state(v){ state = v; },\n' +
    '  get raceTime(){ return raceTime; }, set raceTime(v){ raceTime = v; },\n' +
    '  get BOOST_DRAIN(){ return BOOST_DRAIN; },\n' +
    '  get BOOST_CHARGE_BRAKE(){ return BOOST_CHARGE_BRAKE; },\n' +
    '  get BOOST_CHARGE_COAST(){ return BOOST_CHARGE_COAST; },\n' +
    '  get LAP_CHARGE_CAP(){ return LAP_CHARGE_CAP; },\n' +
    '  get BOOST_MAX_MUL(){ return BOOST_MAX_MUL; },\n' +
    '  get BOOST_MAX_MUL_OT(){ return BOOST_MAX_MUL_OT; },\n' +
    '  get BOOST_ACCEL_MUL(){ return BOOST_ACCEL_MUL; },\n' +
    '  get STRAIGHT_MAX_MUL(){ return STRAIGHT_MAX_MUL; },\n' +
    '  get OT_PROG(){ return OT_PROG; },\n' +
    '  get OT_GAP_SEC(){ return OT_GAP_SEC; },\n' +
    '  get OT_BATTERY(){ return OT_BATTERY; },\n' +
    '  get OT_COL(){ return OT_COL; },\n' +
    '  get EP_OFF(){ return EP_OFF; },\n' +
    '  get EP_BOOST(){ return EP_BOOST; },\n' +
    '  get EP_CHARGE(){ return EP_CHARGE; },\n' +
    '  get EP_OVERTAKE(){ return EP_OVERTAKE; },\n' +
    '  get toasts(){ return toasts; },\n' +
    '  set trackSel(v){ trackSel = v; },\n' +
    '  set difficulty(v){ difficulty = v; },\n' +
    '  setRealistic: function(v){ REALISTIC = v; DIFFICULTIES = v ? DIFFICULTIES_REALISTIC : DIFFICULTIES_CASUAL; },\n' +
    '  set LAPS(v){ LAPS = v; },\n' +
    '  chargeBattery: function(c,a){ return chargeBattery(c,a); },\n' +
    '  canCharge: function(c){ return canCharge(c); },\n' +
    '  endplateColor: function(c){ return endplateColor(c); },\n' +
    '  inStraightZone: function(p){ return inStraightZone(p); },\n' +
    '  gapAhead: function(c){ return gapAhead(c); },\n' +
    '  startRace: startRace, startPractice: startPractice, update: update\n' +
    '};\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

const results = [];
function check(navn, ok, detalj){ results.push({ navn: navn, ok: !!ok, detalj: detalj }); }

function clearKeys(game){ const k = game.keys; for(const n in k) delete k[n]; }

// Setter bilen nøyaktig på progresjon `p` (0–1) langs banelinja.
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

// Én spillerbil i øving, parkert på et punkt uten rett-modus-sone, slik at
// batterimålingene ikke forstyrres av noe annet.
function enBil(game, prog){
  game.trackSel = 0; game.setRealistic(false);
  game.startPractice();
  const c = game.player;
  let p = prog;
  if(p == null){
    p = 0;
    for(let i=0;i<200;i++){ const q = i/200; if(!game.inStraightZone(q)){ p = q; break; } }
  }
  parkProgress(game, c, p);
  return c;
}

// ── D2: utladningstid ───────────────────────────────────────────────────────
// Fasit: 100 / 0,28 = 357,1 steg. Spesifikasjonen ber om 360 ± 10.
function testUtladning(game){
  const c = enBil(game);
  clearKeys(game);
  game.keys['Shift'] = true;
  let steg = 0;
  const p0 = c.battery;
  while(c.battery > 0 && steg < 2000){
    parkProgress(game, c, c.curProg); // hold bilen i ro, se toppkommentaren
    game.update();
    steg++;
  }
  const fasit = 100/game.BOOST_DRAIN;
  check('fullt batteri varer 360 ± 10 steg med boost holdt inne',
    Math.abs(steg-360) <= 10, 'startbatteri=' + p0 + ' målt=' + steg + ' steg (regnet fasit ' + fasit.toFixed(1) + ')');
  check('batteriet er tomt, ikke negativt', c.battery === 0, 'battery=' + c.battery);
  clearKeys(game);
  return { steg: steg, fasit: fasit };
}

// ── D2: ladetaket per runde ─────────────────────────────────────────────────
function testLadetak(game){
  const c = enBil(game);
  clearKeys(game);
  c.battery = 0; c.lapCharge = 0;
  game.keys['ArrowDown'] = true; // brems = rask lading
  for(let s=0;s<1500;s++){
    parkProgress(game, c, c.curProg);
    game.update();
  }
  const tak = game.LAP_CHARGE_CAP;
  check('ladingen stopper på taket for runden',
    Math.abs(c.lapCharge - tak) < 1e-9, 'lapCharge=' + c.lapCharge.toFixed(4) + ' tak=' + tak);
  check('batteriet lader ikke forbi taket selv med bremsen inne i 25 sekunder',
    Math.abs(c.battery - tak) < 1e-9, 'battery=' + c.battery.toFixed(4));
  check('canCharge() sier nei når taket er brukt opp', game.canCharge(c) === false, 'canCharge=' + game.canCharge(c));
  clearKeys(game);
  return { lapCharge: c.lapCharge, battery: c.battery };
}

// Taket skal ikke kunne presse batteriet over 100 heller.
function testHundreTak(game){
  const c = enBil(game);
  c.battery = 95; c.lapCharge = 0;
  const inn = game.chargeBattery(c, 20);
  check('lading stopper på 100 selv når runde-taket har plass',
    Math.abs(c.battery-100) < 1e-9 && Math.abs(inn-5) < 1e-9,
    'battery=' + c.battery + ' inn=' + inn);
  check('bare det som faktisk kom inn belaster runde-budsjettet',
    Math.abs(c.lapCharge-5) < 1e-9, 'lapCharge=' + c.lapCharge);
}

// Ladetaket skal nullstilles ved målpassering, ikke ved løpsstart.
function testTakNullstillesVedMaal(game){
  const c = enBil(game);
  clearKeys(game);
  c.lapCharge = 40; c.seenHalf = true;
  parkProgress(game, c, 0.95); game.update();
  parkProgress(game, c, 0.02); game.update();
  check('ladetaket nullstilles ved målpassering',
    c.lapCharge < 1, 'lapCharge etter mål=' + c.lapCharge.toFixed(3));
}

// ── D1: rett-modus ──────────────────────────────────────────────────────────
function testRettModus(game){
  const c = enBil(game);
  // Finn et punkt som ligger inne i en sone.
  let pz = null;
  for(let i=0;i<400;i++){ const q = i/400; if(game.inStraightZone(q)){ pz = q; break; } }
  check('banen har minst én rett-modus-sone', pz != null, 'ingen sone funnet på ' + game.TR.name);
  if(pz == null) return;

  clearKeys(game);
  game.keys[' '] = true;
  parkProgress(game, c, pz); game.update();
  check('Space i sonen åpner klaffene med én gang (ingen ventetid)', c.straightMode === true, 'straightMode=' + c.straightMode);

  game.keys['ArrowDown'] = true;
  parkProgress(game, c, pz); game.update();
  check('klaffene lukkes i det bremsen røres', c.straightMode === false, 'straightMode=' + c.straightMode);
  delete game.keys['ArrowDown'];

  let pu = null;
  for(let i=0;i<400;i++){ const q = i/400; if(!game.inStraightZone(q)){ pu = q; break; } }
  parkProgress(game, c, pu); game.update();
  check('klaffene er lukket utenfor sonen', c.straightMode === false, 'straightMode=' + c.straightMode);

  delete game.keys[' '];
  parkProgress(game, c, pz); game.update();
  check('ingen rett-modus i sonen uten Space', c.straightMode === false, 'straightMode=' + c.straightMode);
  clearKeys(game);
}

// AI skal åpne klaffene automatisk i sonen, uten avstandskrav.
function testRettModusAI(game){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 8;
  game.startRace();
  game.state = 'playing';
  let pz = null;
  for(let i=0;i<400;i++){ const q = i/400; if(game.inStraightZone(q)){ pz = q; break; } }
  const ai = game.cars.find(function(c){ return !c.isPlayer; });
  // Alle andre biler flyttes langt unna, slik at ingen kan påstå at det var
  // nærheten til en annen bil som åpnet klaffene.
  game.cars.forEach(function(c,i){ if(c !== ai) parkProgress(game, c, 0.3 + i*0.002); });
  parkProgress(game, ai, pz);
  game.update();
  check('AI åpner klaffene i sonen uten noen bil i nærheten', ai.straightMode === true, 'straightMode=' + ai.straightMode);
}

// ── D3: overtake mode ───────────────────────────────────────────────────────
// To biler med kjent fart og kjent avstand føres forbi målepunktet på 0,95 og
// over mållinja. `d` er avstand i runder, `v` fart i runder per steg; med
// v = 1/2400 er en runde 40 sekunder, og d = 0,025 er dermed 1,0 sekund.
function overtakeLoep(game, d){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 8;
  game.startRace();
  game.state = 'playing';
  game.cars.splice(0, game.cars.length-2);
  const A = game.cars[0], B = game.cars[1];
  A.isPlayer = false; B.isPlayer = false;
  const v = 1/2400;
  let pB = 0.10;
  // Nok steg til å komme fra 0,10, gjennom 0,95 og over mållinja.
  const steps = Math.ceil(0.95/v) + 200;
  for(let s=0;s<steps;s++){
    parkProgress(game, B, pB);
    parkProgress(game, A, pB + d);
    game.update();
    pB += v;
  }
  return { A: A, B: B };
}

function testOvertakeUtloeses(game){
  const r = overtakeLoep(game, 0.0150); // 0,60 s foran
  check('bil innenfor ett sekund av bilen foran får overtake mode',
    r.B.overtakeMode === true, 'gap≈0,60 s  overtakeMode=' + r.B.overtakeMode);
  check('bilen i front, uten noen foran seg, får ikke overtake mode',
    r.A.overtakeMode === false, 'overtakeMode=' + r.A.overtakeMode);
  check('overtake gir ekstra batteri utenom runde-taket',
    r.B.battery > 0, 'battery=' + r.B.battery.toFixed(1));
}

function testOvertakeUtloesesIkke(game){
  const r = overtakeLoep(game, 0.0600); // 2,40 s foran
  check('bil mer enn ett sekund bak får ikke overtake mode',
    r.B.overtakeMode === false, 'gap≈2,40 s  overtakeMode=' + r.B.overtakeMode);
}

// De 25 enhetene skal komme inn selv når hele ladebudsjettet er brukt opp.
function testOvertakeBatteriUtenomTaket(game){
  game.trackSel = 0; game.setRealistic(false);
  game.startPractice();
  const c = game.player;
  clearKeys(game);
  c.seenHalf = true;
  // Først fram til 0,95, slik at prevProg er høy nok til at mål-porten
  // (prevProg>0,88 && pr<0,12) i det hele tatt kan utløses neste steg.
  parkProgress(game, c, 0.95); game.update();
  c.lapCharge = game.LAP_CHARGE_CAP; // budsjettet er tomt
  c.battery = 50;
  c.otPending = true;                // som om 0,95 ble passert med lite gap
  parkProgress(game, c, 0.02); game.update();
  check('overtake legger til 25 enheter selv med oppbrukt ladebudsjett',
    Math.abs(c.battery - 75) < 1e-9, 'battery=' + c.battery);
  check('de 25 enhetene belaster ikke runde-budsjettet',
    c.lapCharge === 0, 'lapCharge=' + c.lapCharge + ' (nullstilt ved mål, ikke økt til 85)');
}

// ── D4: endeplatelysene ─────────────────────────────────────────────────────
function testEndeplate(game){
  const bil = function(o){
    return Object.assign({ overtakeMode:false, boostActive:false, braking:false, battery:50, lapCharge:0 }, o);
  };
  game.raceTime = 0; // blinkefasen: Math.floor(0/7,5)%2 === 0, altså lyset PÅ
  check('overtake + boost gir gull',
    game.endplateColor(bil({overtakeMode:true, boostActive:true})) === game.OT_COL,
    'fikk ' + game.endplateColor(bil({overtakeMode:true, boostActive:true})));
  check('boost alene gir cyan',
    game.endplateColor(bil({boostActive:true})) === game.EP_BOOST,
    'fikk ' + game.endplateColor(bil({boostActive:true})));
  check('overtake uten boost gir ikke gull',
    game.endplateColor(bil({overtakeMode:true})) === game.EP_OFF,
    'fikk ' + game.endplateColor(bil({overtakeMode:true})));
  check('bremsing med plass i budsjettet gir rødt',
    game.endplateColor(bil({braking:true})) === game.EP_CHARGE,
    'fikk ' + game.endplateColor(bil({braking:true})));
  check('bremsing med oppbrukt budsjett gir av, ikke rødt',
    game.endplateColor(bil({braking:true, lapCharge:game.LAP_CHARGE_CAP})) === game.EP_OFF,
    'fikk ' + game.endplateColor(bil({braking:true, lapCharge:game.LAP_CHARGE_CAP})));
  check('bremsing med fullt batteri gir av, ikke rødt',
    game.endplateColor(bil({braking:true, battery:100})) === game.EP_OFF,
    'fikk ' + game.endplateColor(bil({braking:true, battery:100})));
  check('ingenting på gir av', game.endplateColor(bil({})) === game.EP_OFF,
    'fikk ' + game.endplateColor(bil({})));
  // 4 Hz: et halvt blink er 7,5 steg, så fasen skal snu mellom steg 0 og 8.
  game.raceTime = 8;
  check('det ladende lyset blinker (fasen snur etter 7,5 steg)',
    game.endplateColor(bil({braking:true})) === game.EP_OFF,
    'fikk ' + game.endplateColor(bil({braking:true})) + ' ved raceTime=8');
  game.raceTime = 0;
}

// ── konstantene ─────────────────────────────────────────────────────────────
function testKonstanter(game){
  const par = [
    ['boost-utladning', game.BOOST_DRAIN, 0.28],
    ['lading under bremsing', game.BOOST_CHARGE_BRAKE, 0.35],
    ['lading ved gassløft', game.BOOST_CHARGE_COAST, 0.08],
    ['ladetak per runde', game.LAP_CHARGE_CAP, 60],
    ['boost toppfart', game.BOOST_MAX_MUL, 1.06],
    ['boost toppfart i overtake', game.BOOST_MAX_MUL_OT, 1.09],
    ['boost akselerasjon', game.BOOST_ACCEL_MUL, 1.15],
    ['rett-modus toppfart', game.STRAIGHT_MAX_MUL, 1.12],
    ['overtake-målepunkt', game.OT_PROG, 0.95],
    ['overtake-gap', game.OT_GAP_SEC, 1.0],
    ['overtake-batteri', game.OT_BATTERY, 25]
  ];
  par.forEach(function(p){
    check('konstant: ' + p[0] + ' = ' + p[2], Math.abs(p[1]-p[2]) < 1e-9, 'er ' + p[1]);
  });
}

function main(argv){
  const t0 = Date.now();
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html') html = argv[++i];

  const u = testUtladning(loadGame(html));
  const l = testLadetak(loadGame(html));
  testHundreTak(loadGame(html));
  testTakNullstillesVedMaal(loadGame(html));
  testRettModus(loadGame(html));
  testRettModusAI(loadGame(html));
  testOvertakeUtloeses(loadGame(html));
  testOvertakeUtloesesIkke(loadGame(html));
  testOvertakeBatteriUtenomTaket(loadGame(html));
  testEndeplate(loadGame(html));
  testKonstanter(loadGame(html));

  console.log('');
  console.log('── Målte tall ─────────────────────────────────────────');
  console.log('  utladning: ' + u.steg + ' steg (' + (u.steg/60).toFixed(2) + ' s), regnet fasit ' + u.fasit.toFixed(1));
  console.log('  lading med bremsen inne i 1500 steg: ' + l.battery.toFixed(2) + ' enheter (tak 60)');

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
