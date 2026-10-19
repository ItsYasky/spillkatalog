// ============================================================================
// Headless test av BANEGRENSER (steg B) i vintage_f1.html.
//
// Kjøres med JavaScriptCore, samme opplegg som test_fixed_timestep.js,
// test_lazy_track_bg.js og test_ai_sim.js — det finnes ingen `node` i dette
// miljøet:
//
//   osascript -l JavaScript test_track_limits.js
//   osascript -l JavaScript test_track_limits.js --html /tmp/annen.html
//   osascript -l JavaScript test_track_limits.js --ai          (AI-brudd per bane)
//
// Hele <script>-blokken fra spillet kjøres som den er, med stubbet
// document/canvas/window/localStorage. Testen måler altså den EKTE spillkoden,
// ikke en kopi av regelverket som kunne kommet ut av sync med den.
//
// HVORFOR BILEN «PARKERES» I STEDET FOR Å KJØRES
// Et brudd krever at bilen er mer enn TR.TW + LIMIT_MARGIN fra midtlinja i 8
// sammenhengende steg. Å kjøre en bil dit med tastetrykk ville vært avhengig
// av fysikk, grep og banegeometri, og testen ville målt kjøringen like mye som
// regelen. I stedet settes posisjonen direkte på en valgt plass i forhold til
// banelinja før hvert steg. Da er avstanden fra midtlinja en KJENT størrelse,
// og testen svarer på nøyaktig det den skal: teller regelen riktig når bilen
// er der?
//
// HVORFOR BILEN PARKERES LANGT FRA FELTET
// Et brudd telles ikke hvis bilen har vært i kontakt med en annen bil de siste
// CONTACT_GRACE stegene. Står testbilen midt i startfeltet, ville en tilfeldig
// berøring fra en AI-bil stilt bruddet i bero og testen ville feilet uten at
// regelen var feil. Derfor parkeres den på motsatt side av banen, og testen
// sjekker i tillegg at contactT faktisk var 0 i det bruddet skulle telles.
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

// ── stubs ───────────────────────────────────────────────────────────────────
// Ingen tegnekall betyr noe her. Proxyen svarer med en no-op på hva som helst
// og returnerer seg selv, slik at kjeder som createLinearGradient()
// .addColorStop() går gjennom uten spesialtilfeller.
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
    '  get TRACKS(){ return TRACKS; },\n' +
    '  get TR(){ return TR; },\n' +
    '  get cars(){ return cars; },\n' +
    '  get player(){ return player; },\n' +
    '  get state(){ return state; }, set state(v){ state = v; },\n' +
    '  get raceTime(){ return raceTime; },\n' +
    '  get toasts(){ return toasts; },\n' +
    '  get bestLap(){ return bestLap; },\n' +
    '  get bestSector(){ return bestSector; },\n' +
    '  get trackSel(){ return trackSel; }, set trackSel(v){ trackSel = v; },\n' +
    '  get difficulty(){ return difficulty; }, set difficulty(v){ difficulty = v; },\n' +
    '  setRealistic: function(v){ REALISTIC = v; DIFFICULTIES = v ? DIFFICULTIES_REALISTIC : DIFFICULTIES_CASUAL; },\n' +
    '  get LAPS(){ return LAPS; }, set LAPS(v){ LAPS = v; },\n' +
    '  get LIMIT_MARGIN(){ return LIMIT_MARGIN; },\n' +
    '  get LIMIT_STEPS(){ return LIMIT_STEPS; },\n' +
    '  get CONTACT_GRACE(){ return CONTACT_GRACE; },\n' +
    '  get LIMIT_PENALTY_SEC(){ return LIMIT_PENALTY_SEC; },\n' +
    '  get GRAVEL_SAFE(){ return GRAVEL_SAFE; },\n' +
    '  nearestOnPath: function(P,x,y){ return nearestOnPath(P,x,y); },\n' +
    '  finalTimeSec: function(c){ return finalTimeSec(c); },\n' +
    '  finalizeResults: function(){ return finalizeResults(); },\n' +
    '  startRace: startRace, startPractice: startPractice, update: update\n' +
    '};\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

// ── parkering i forhold til banelinja ───────────────────────────────────────
// Setter bilen midt på segment nr. `idx`, forskjøvet `off` piksler langs
// segmentets normal. off = 0 er nøyaktig på midtlinja, off = TW er på den
// hvite linja, off = TW + 12 er godt utenfor den.
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
function distFromCenter(game, car){
  return game.nearestOnPath(game.TR.PATH, car.x, car.y).dist;
}
// Én utflukt: `steps` steg utenfor banen, deretter tilbake innenfor slik at
// telleren armeres på nytt.
function excursion(game, car, idx, off, steps, back){
  for(let i=0;i<steps;i++){ parkAt(game, car, idx, off); game.update(); }
  for(let i=0;i<(back===undefined?4:back);i++){ parkAt(game, car, idx, 0); game.update(); }
}
function hasToast(game, text){
  return game.toasts.some(function(t){ return t.t === text; });
}

const results = [];
function check(navn, ok, detalj){
  results.push({ navn: navn, ok: !!ok, detalj: detalj });
}

// ── TEST 1: fem bevisste utflukter i løp ────────────────────────────────────
function testFiveViolations(game){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 8;
  game.startRace();
  game.state = 'playing'; // hopp over nedtellingen
  const p = game.player;
  const PN = game.TR.PATH.length;
  const idx = Math.floor(PN*0.5); // motsatt side av banen, unna startfeltet
  const off = game.TR.TW + game.LIMIT_MARGIN + 4;

  const steg = [];
  for(let u=0; u<5; u++){
    game.toasts.length = 0; // bare denne utfluktens meldinger skal leses
    const foer = p.limitViolations;
    for(let i=0;i<10;i++){ parkAt(game, p, idx, off); game.update(); }
    steg.push({
      utflukt: u+1,
      brudd: p.limitViolations,
      nyeBrudd: p.limitViolations - foer,
      flagg: p.warnFlag,
      straff: p.penaltySec,
      kontakt: p.contactT,
      toasts: game.toasts.map(function(t){ return t.t; })
    });
    for(let i=0;i<4;i++){ parkAt(game, p, idx, 0); game.update(); } // tilbake innenfor
  }

  const s = steg;
  check('utflukt 1 gir ett brudd og «BANEGRENSER 1/3»',
    s[0].brudd===1 && s[0].toasts.indexOf('BANEGRENSER 1/3')>=0, JSON.stringify(s[0]));
  check('utflukt 2 gir «BANEGRENSER 2/3»',
    s[1].brudd===2 && s[1].toasts.indexOf('BANEGRENSER 2/3')>=0, JSON.stringify(s[1]));
  check('utflukt 3 gir svart-hvitt flagg',
    s[2].brudd===3 && s[2].flagg===true && s[2].toasts.indexOf('SVART-HVITT FLAGG – ADVARSEL')>=0, JSON.stringify(s[2]));
  check('utflukt 4 gir +5 s straff',
    s[3].brudd===4 && s[3].straff===5 && s[3].toasts.indexOf('+5 SEK STRAFF')>=0, JSON.stringify(s[3]));
  check('utflukt 5 gir +10 s straff totalt',
    s[4].brudd===5 && s[4].straff===10, JSON.stringify(s[4]));
  check('ingen av bruddene ble telt under kontaktnåde',
    s.every(function(r){ return r.kontakt===0; }), JSON.stringify(s.map(function(r){ return r.kontakt; })));
  check('hver utflukt teller nøyaktig ett brudd',
    s.every(function(r){ return r.nyeBrudd===1; }), JSON.stringify(s.map(function(r){ return r.nyeBrudd; })));
  return steg;
}

// ── TEST 2: terskelen ───────────────────────────────────────────────────────
// Like innenfor TW + LIMIT_MARGIN skal ALDRI telle, uansett hvor lenge bilen
// blir der, og 7 steg utenfor skal heller ikke telle — først det 8. gjør det.
function testThresholds(game){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 8;
  game.startRace(); game.state = 'playing';
  const p = game.player;
  const PN = game.TR.PATH.length, idx = Math.floor(PN*0.5);

  // 30 steg like INNENFOR terskelen
  const innenfor = game.TR.TW + game.LIMIT_MARGIN - 2;
  for(let i=0;i<30;i++){ parkAt(game, p, idx, innenfor); game.update(); }
  check('30 steg innenfor TW+8 gir ingen brudd', p.limitViolations===0,
    'brudd=' + p.limitViolations + ' dist=' + distFromCenter(game,p).toFixed(1));

  // 7 steg utenfor — ett for lite
  for(let i=0;i<4;i++){ parkAt(game, p, idx, 0); game.update(); }
  const utenfor = game.TR.TW + game.LIMIT_MARGIN + 4;
  for(let i=0;i<7;i++){ parkAt(game, p, idx, utenfor); game.update(); }
  check('7 steg utenfor gir ingen brudd', p.limitViolations===0, 'brudd=' + p.limitViolations);
  // det 8. steget utløser
  parkAt(game, p, idx, utenfor); game.update();
  check('det 8. steget utenfor gir bruddet', p.limitViolations===1, 'brudd=' + p.limitViolations);
  // bli værende: fortsatt bare ett brudd
  for(let i=0;i<20;i++){ parkAt(game, p, idx, utenfor); game.update(); }
  check('å bli liggende utenfor gir ikke flere brudd', p.limitViolations===1, 'brudd=' + p.limitViolations);

  // gruset teller som brudd (helt ut i gruset er forbi den hvite linja)
  for(let i=0;i<4;i++){ parkAt(game, p, idx, 0); game.update(); }
  const iGruset = game.TR.TW + game.GRAVEL_SAFE - 1;
  for(let i=0;i<10;i++){ parkAt(game, p, idx, iGruset); game.update(); }
  check('å kjøre helt ut i gruset teller som brudd', p.limitViolations===2,
    'brudd=' + p.limitViolations + ' dist=' + distFromCenter(game,p).toFixed(1));
}

// ── TEST 3: utflukt rett etter en kollisjon telles ikke ─────────────────────
// Kollisjonen lages ekte: en AI-bil settes 10 px fra testbilen (grensen i
// spillet er 15 px), og spillets egen kollisjonskode setter contactT på begge.
function testContactGrace(game){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 8;
  game.startRace(); game.state = 'playing';
  const p = game.player;
  const PN = game.TR.PATH.length, idx = Math.floor(PN*0.5);
  const off = game.TR.TW + game.LIMIT_MARGIN + 4;

  // en annen bil flyttes inntil testbilen
  const other = game.cars.filter(function(c){ return c !== p; })[0];
  parkAt(game, p, idx, 0);
  other.x = p.x + 10; other.y = p.y; other.vx = 0; other.vy = 0; other.speed = 0;
  game.update();
  const kontaktEtter = p.contactT;
  check('kollisjon setter kontaktnåde', kontaktEtter > 0, 'contactT=' + kontaktEtter);

  // ut av banen med én gang, mens nåden gjelder
  const foer = p.limitViolations;
  for(let i=0;i<10;i++){ parkAt(game, p, idx, off); game.update(); }
  check('utflukt rett etter kollisjon telles ikke',
    p.limitViolations === foer, 'brudd ' + foer + ' -> ' + p.limitViolations);

  // når nåden har løpt ut skal neste utflukt telle igjen
  for(let i=0;i<game.CONTACT_GRACE+5;i++){ parkAt(game, p, idx, 0); game.update(); }
  for(let i=0;i<10;i++){ parkAt(game, p, idx, off); game.update(); }
  check('neste utflukt etter at nåden er ute teller',
    p.limitViolations === foer+1, 'brudd=' + p.limitViolations);
}

// ── TEST 4: øving — runde med brudd lagres ikke ─────────────────────────────
// Runden «kjøres» ved å parkere bilen på stadig høyere progresjon. Spillets
// egen målpassering krever prevProg > .88, pr < .12 og at bilen har vært forbi
// midten av banen (seenHalf), og alle tre oppfylles av denne rekkefølgen.
function lapAround(game, car, opts){
  const PN = game.TR.PATH.length;
  const stops = [0.20, 0.50, 0.75, 0.92, 0.01]; // .50 sørger for seenHalf
  for(let k=0;k<stops.length;k++){
    if(opts && opts.offAt === k){
      // ett brudd midt i runden
      for(let i=0;i<10;i++){ parkAt(game, car, Math.floor(PN*stops[k]), game.TR.TW + game.LIMIT_MARGIN + 4); game.update(); }
      for(let i=0;i<4;i++){ parkAt(game, car, Math.floor(PN*stops[k]), 0); game.update(); }
    } else {
      for(let i=0;i<3;i++){ parkAt(game, car, Math.floor(PN*stops[k]), 0); game.update(); }
    }
  }
}
function testPracticeLapDeleted(game){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1;
  game.startPractice();
  const p = game.player;

  // runde 1: med brudd -> skal slettes
  game.toasts.length = 0;
  lapAround(game, p, { offAt: 2 });
  const etterSkitten = {
    lap: p.lap, brudd: p.limitViolations, lapTimes: p.lapTimes.length,
    bestLap: game.bestLap, toasts: game.toasts.map(function(t){ return t.t; })
  };
  check('runden ble fullført', etterSkitten.lap === 1, JSON.stringify(etterSkitten));
  check('runde med brudd lagres ikke som rundetid', etterSkitten.lapTimes === 0, JSON.stringify(etterSkitten));
  check('runde med brudd blir ikke beste runde', game.bestLap === Infinity, 'bestLap=' + String(game.bestLap));
  check('runde med brudd gir «SLETTET»-melding',
    etterSkitten.toasts.some(function(t){ return t.indexOf('SLETTET') >= 0; }), JSON.stringify(etterSkitten.toasts));
  check('runde med brudd setter ingen beste sektor',
    game.bestSector.every(function(s){ return s === Infinity; }), JSON.stringify(game.bestSector.map(String)));

  // runde 2: ren -> skal lagres
  game.toasts.length = 0;
  lapAround(game, p, null);
  check('ren runde lagres som rundetid', p.lapTimes.length === 1,
    'lapTimes=' + JSON.stringify(p.lapTimes));
  check('ren runde blir beste runde', game.bestLap < Infinity, 'bestLap=' + String(game.bestLap));
}

// ── TEST 5: straffetid endrer resultatlista ─────────────────────────────────
function testPenaltyOrdersResults(game){
  game.trackSel = 0; game.setRealistic(false); game.difficulty = 1; game.LAPS = 8;
  game.startRace(); game.state = 'playing';
  const p = game.player;
  // la feltet kjøre litt, så bilene har ekte målepunkter å anslå tid fra
  for(let i=0;i<600;i++) game.update();
  p.penaltySec = 0; game.finalizeResults();
  const utenStraff = p.finalPlace;
  const tidUten = game.finalTimeSec(p);
  p.penaltySec = 5; game.finalizeResults();
  const medStraff = p.finalPlace;
  const tidMed = game.finalTimeSec(p);
  check('straffetid legges til sluttiden', Math.abs((tidMed - tidUten) - 5) < 1e-6,
    tidUten.toFixed(3) + ' -> ' + tidMed.toFixed(3));
  check('straffetid kan ikke forbedre plasseringen', medStraff >= utenStraff,
    'plass ' + utenStraff + ' -> ' + medStraff);
}

// ── TEST 6: AI-brudd per bane ───────────────────────────────────────────────
// Kjøres bare med --ai, fordi den tar vesentlig lengre tid enn resten.
function testAIViolations(game, laps){
  const rader = [];
  for(let t=0; t<game.TRACKS.length; t++){
    game.trackSel = t; game.setRealistic(false); game.difficulty = 1; game.LAPS = laps;
    game.startRace(); game.state = 'playing';
    // Hele feltet kjøres av AI-en, også bilen `player` peker på (ellers ville
    // den stått stille og forgiftet både gummistrikk og måling).
    game.player.isPlayer = false;
    const cars = game.cars;
    let steps = 0;
    const maxSteps = laps * 2600;
    while(steps < maxSteps){
      game.update(); steps++;
      let ferdige = 0;
      for(let i=0;i<cars.length;i++) if(cars[i].raceDist >= laps) ferdige++;
      if(ferdige >= cars.length) break;
    }
    let brudd = 0, offSteps = 0;
    for(let i=0;i<cars.length;i++) brudd += cars[i].limitViolations;
    rader.push({ bane: game.TR.name, brudd: brudd, perBil: +(brudd/cars.length).toFixed(2), steg: steps });
  }
  return rader;
}

function main(argv){
  let html = 'vintage_f1.html', ai = false, laps = 3;
  for(let i=0;i<argv.length;i++){
    if(argv[i] === '--html') html = argv[++i];
    else if(argv[i] === '--ai') ai = true;
    else if(argv[i] === '--laps') laps = parseInt(argv[++i],10);
  }
  const t0 = Date.now();
  console.log('Laster ' + html + ' …');
  const game = loadGame(html);
  console.log('Konstanter: TW+MARGIN-terskel, LIMIT_STEPS=' + game.LIMIT_STEPS +
    ', LIMIT_MARGIN=' + game.LIMIT_MARGIN + ', CONTACT_GRACE=' + game.CONTACT_GRACE +
    ', straff=' + game.LIMIT_PENALTY_SEC + 's');

  const femSteg = testFiveViolations(game);
  testThresholds(loadGame(html));
  testContactGrace(loadGame(html));
  testPracticeLapDeleted(loadGame(html));
  testPenaltyOrdersResults(loadGame(html));

  console.log('');
  console.log('── Fem bevisste utflukter ─────────────────────────────');
  femSteg.forEach(function(s){
    console.log('  utflukt ' + s.utflukt + ': brudd=' + s.brudd + ' flagg=' + s.flagg +
      ' straff=' + s.straff + 's  ' + JSON.stringify(s.toasts));
  });

  console.log('');
  console.log('── Resultat ───────────────────────────────────────────');
  let feil = 0;
  results.forEach(function(r){
    if(!r.ok) feil++;
    console.log('  ' + (r.ok ? 'OK  ' : 'FEIL') + '  ' + r.navn + (r.ok ? '' : '   [' + r.detalj + ']'));
  });
  console.log('  ' + (results.length - feil) + '/' + results.length + ' tester bestått');

  if(ai){
    console.log('');
    console.log('── AI-brudd per bane (' + laps + ' runder, 20 biler) ──');
    const rader = testAIViolations(loadGame(html), laps);
    rader.forEach(function(r){
      console.log('  ' + r.bane + ': ' + r.brudd + ' brudd totalt, ' + r.perBil + ' per bil');
    });
    const sum = rader.reduce(function(a,r){ return a + r.brudd; }, 0);
    console.log('  SUM: ' + sum + ' brudd over ' + rader.length + ' baner');
  }

  console.log('');
  console.log('Ferdig på ' + ((Date.now()-t0)/1000).toFixed(1) + ' s');
  return feil === 0 ? 'ALLE TESTER BESTÅTT' : (feil + ' TEST(ER) FEILET');
}

// MERK: funksjonen heter `main`, ikke `run`. JXA kaller automatisk en global
// funksjon ved navn `run`, så med det navnet kjørte hele testen to ganger og
// resultatlista kom ut i dobbelt opplag. Samme felle som i test_ai_sim.js.
main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
