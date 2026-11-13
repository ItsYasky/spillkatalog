// ============================================================================
// Headless test av pausemenyen og den nye resultatskjerm-navigasjonen
// (GRAND PRIX-menyer, steg C) i vintage_f1.html.
//
// Kjøres med JavaScriptCore, samme opplegg som test_hovedmeny.js — det finnes
// ingen `node` i dette miljøet:
//
//   osascript -l JavaScript tester/test_pause.js
//   osascript -l JavaScript tester/test_pause.js --html /tmp/annen.html
//
// Dekker TILSTANDSMASKINEN (ESC og P åpner/lukker pausemenyen fra 'playing' og
// 'practice', ↑↓/ENTER i pausemenyen, at update() fryser helt mens paused=true,
// autopause på blur/skjult fane/forlatt fullskjerm, og ↑↓/ENTER/ESC på den nye
// resultatskjermen) — IKKE selve tegningen. Det er
// verifisert manuelt med skjermbilder (se CLAUDE.md, steg C), slik
// test_hovedmeny.js varslet for steg B. startRace()/startPractice() er for
// tunge til å kjøre i en JSC-stub og byttes derfor ut med flagg-stubber i
// testene som trenger å vite HVILKEN som ble kalt.
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
function makeStorage(){
  const mem = {};
  return {
    getItem: function(k){ return Object.prototype.hasOwnProperty.call(mem,k) ? mem[k] : null; },
    setItem: function(k,v){ mem[k] = String(v); },
    removeItem: function(k){ delete mem[k]; }
  };
}

function loadGame(path){
  const src = extractScript(readFile(path));
  const handlers = {};
  const winHandlers = {};
  const documentStub = {
    hidden: false,
    addEventListener: function(type, fn){ handlers[type] = fn; },
    getElementById: function(){ return makeCanvasStub(); },
    createElement: function(){ return makeCanvasStub(); }
  };
  // `blur` ligger på window og ikke på document, så den må fanges for seg —
  // uten dette ville autopause-testene stilltiende målt ingenting.
  const windowStub = { location: { href: '' }, addEventListener: function(type, fn){ winHandlers[type] = fn; } };
  windowStub.localStorage = makeStorage();
  const factory = eval('(function(document, window, requestAnimationFrame, performance, localStorage){\n' + src + '\n' +
    'return {\n' +
    '  get state(){ return state; }, set state(v){ state = v; },\n' +
    '  get paused(){ return paused; }, set paused(v){ paused = v; },\n' +
    '  get pauseSel(){ return pauseSel; }, set pauseSel(v){ pauseSel = v; },\n' +
    '  get winSel(){ return winSel; }, set winSel(v){ winSel = v; },\n' +
    '  get menuTarget(){ return menuTarget; }, set menuTarget(v){ menuTarget = v; },\n' +
    '  get raceTime(){ return raceTime; }, set raceTime(v){ raceTime = v; },\n' +
    '  get player(){ return player; }, set player(v){ player = v; },\n' +
    '  get trackSel(){ return trackSel; },\n' +
    '  get startRace(){ return startRace; }, set startRace(v){ startRace = v; },\n' +
    '  get startPractice(){ return startPractice; }, set startPractice(v){ startPractice = v; },\n' +
    '  get update(){ return update; },\n' +
    '  get accumulator(){ return accumulator; }, set accumulator(v){ accumulator = v; },\n' +
    '  get lastFrameT(){ return lastFrameT; }, set lastFrameT(v){ lastFrameT = v; },\n' +
    '  get windowLocationHref(){ return window.location.href; }\n' +
    '};\n})');
  const game = factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, windowStub.localStorage);
  return { game: game, handlers: handlers, winHandlers: winHandlers, documentStub: documentStub };
}

const results = [];
function check(navn, ok, detalj){ results.push({ navn: navn, ok: !!ok, detalj: detalj }); }
function key(g, k, extra){
  const e = Object.assign({ key: k, preventDefault: function(){} }, extra||{});
  g.handlers.keydown(e);
}
// En lytter som ikke er registrert skal gi FEIL og ikke et kast som river hele
// kjøringen — en glemt lytter er nettopp den feilen autopause-testene finnes for.
function fyr(L, hvor, type){
  const map = hvor === 'window' ? L.winHandlers : L.handlers;
  if(typeof map[type] !== 'function'){
    check(type + '-lytteren er registrert på ' + hvor, false, 'ingen ' + type + '-lytter funnet');
    return false;
  }
  map[type]({ preventDefault: function(){} });
  return true;
}

function main(argv){
  const t0 = Date.now();
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html' && argv[i+1]) html = argv[i+1];

  console.log('PAUSEMENY/RESULTATSKJERM — navigasjon (GRAND PRIX-menyer, steg C) — ' + html);

  // ── TEST 1: ESC under løp/øving åpner pausemenyen, ikke katalogen ────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing';
    key(L, 'Escape');
    check('ESC i playing setter paused=true', g.paused === true, 'paused=' + g.paused);
    check('ESC i playing starter på rad 0', g.pauseSel === 0, 'pauseSel=' + g.pauseSel);
    check('ESC i playing lar state stå urørt (fortsatt playing)', g.state === 'playing', 'state=' + g.state);
    check('ESC i playing rører IKKE window.location', g.windowLocationHref === '', 'fikk ' + g.windowLocationHref);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'practice';
    key(L, 'Escape');
    check('ESC i practice setter paused=true også', g.paused === true, 'paused=' + g.paused);
  }

  // ── TEST 2: pausemenyen — ↑↓ bretter rundt over nøyaktig fire rader ──────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 0;
    key(L, 'ArrowDown'); check('↓ fra 0 gir 1', g.pauseSel === 1, 'fikk ' + g.pauseSel);
    key(L, 'ArrowDown'); key(L, 'ArrowDown'); check('↓↓ fra 1 gir 3', g.pauseSel === 3, 'fikk ' + g.pauseSel);
    key(L, 'ArrowDown'); check('↓ fra 3 bretter til 0', g.pauseSel === 0, 'fikk ' + g.pauseSel);
    key(L, 'ArrowUp'); check('↑ fra 0 bretter til 3', g.pauseSel === 3, 'fikk ' + g.pauseSel);
  }

  // ── TEST 3: ESC mens pausemenyen er oppe fortsetter løpet (lukker menyen) ─
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 2;
    key(L, 'Escape');
    check('ESC i pausemenyen gir paused=false', g.paused === false, 'paused=' + g.paused);
    check('ESC i pausemenyen lar state stå (playing)', g.state === 'playing', 'state=' + g.state);
  }

  // ── TEST 4: ENTER på FORTSETT (rad 0) lukker bare menyen ─────────────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 0;
    key(L, 'Enter');
    check('ENTER på FORTSETT gir paused=false', g.paused === false, 'paused=' + g.paused);
    check('ENTER på FORTSETT lar state stå (playing)', g.state === 'playing', 'state=' + g.state);
  }

  // ── TEST 5: ENTER på START PÅ NYTT (rad 1) kaller riktig funksjon ────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 1; g.menuTarget = 'race';
    let kaltMed = null;
    g.startRace = function(){ kaltMed = 'race'; };
    g.startPractice = function(){ kaltMed = 'practice'; };
    key(L, 'Enter');
    check('START PÅ NYTT med menuTarget=race kaller startRace', kaltMed === 'race', 'kalte ' + kaltMed);
    check('START PÅ NYTT lukker pausemenyen', g.paused === false, 'paused=' + g.paused);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'practice'; g.paused = true; g.pauseSel = 1; g.menuTarget = 'practice';
    let kaltMed = null;
    g.startRace = function(){ kaltMed = 'race'; };
    g.startPractice = function(){ kaltMed = 'practice'; };
    key(L, 'Enter');
    check('START PÅ NYTT med menuTarget=practice kaller startPractice', kaltMed === 'practice', 'kalte ' + kaltMed);
  }

  // ── TEST 6: ENTER på VELG BANE (rad 2) går til baneutvalget ──────────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 2;
    key(L, 'Enter');
    check('VELG BANE setter state=trackselect', g.state === 'trackselect', 'state=' + g.state);
    check('VELG BANE lukker pausemenyen', g.paused === false, 'paused=' + g.paused);
  }

  // ── TEST 7: ENTER på AVSLUTT TIL KATALOG (rad 3) går helt ut ─────────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 3;
    key(L, 'Enter');
    check('AVSLUTT TIL KATALOG setter window.location.href',
      g.windowLocationHref === 'index.html', 'fikk ' + g.windowLocationHref);
  }

  // ── TEST 8: mens pausemenyen er oppe gjør ingen andre taster noe ────────
  // Øvingens egne T/R/G-snarveier (uendret, utenfor steg C sitt mandat) skal
  // heller ikke virke mens pausemenyen ligger over dem.
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'practice'; g.paused = true; g.pauseSel = 0;
    let kaltMed = null;
    g.startPractice = function(){ kaltMed = 'practice'; };
    key(L, 'r');
    check('"r" gjør ingenting mens pausemenyen er oppe', kaltMed === null, 'kalte ' + kaltMed);
    key(L, 't');
    check('"t" gjør ingenting mens pausemenyen er oppe (state uendret)', g.state === 'practice', 'state=' + g.state);
  }

  // ── TEST 9: update() fryser HELT mens paused=true ────────────────────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.raceTime = 500; g.paused = true;
    g.update();
    check('update() lar raceTime stå urørt mens paused=true', g.raceTime === 500, 'raceTime=' + g.raceTime);
  }
  {
    // Kontrollmåling: viser at update() FAKTISK ville flyttet raceTime når
    // paused=false, så testen over ikke bare er en no-op uansett hva update()
    // gjør. Spilleren må stubbes minimalt (x/y/angle) fordi update() leser
    // dem urørt av `cars`-løkken (kamera-følgingen helt til slutt i
    // funksjonen) — cars=[] holder resten av løpslogikken som no-op.
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.raceTime = 500; g.paused = false;
    g.player = { x:0, y:0, angle:0, raceDist:0 };
    g.update();
    check('update() uten pause går videre som før (kontrollmåling)', g.raceTime === 501, 'raceTime=' + g.raceTime);
  }

  // ── TEST 10: resultatskjermen — ↑↓ bretter rundt over nøyaktig to rader ──
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'win'; g.winSel = 0;
    key(L, 'ArrowDown'); check('↓ fra 0 gir 1', g.winSel === 1, 'fikk ' + g.winSel);
    key(L, 'ArrowDown'); check('↓ fra 1 bretter til 0', g.winSel === 0, 'fikk ' + g.winSel);
    key(L, 'ArrowUp'); check('↑ fra 0 bretter til 1', g.winSel === 1, 'fikk ' + g.winSel);
  }

  // ── TEST 11: ENTER på resultatskjermen dispatcher ut fra winSel ─────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'win'; g.winSel = 0;
    let kaltMed = null;
    g.startRace = function(){ kaltMed = 'race'; };
    key(L, 'Enter');
    check('ENTER på KJØR IGJEN (rad 0) kaller startRace', kaltMed === 'race', 'kalte ' + kaltMed);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'win'; g.winSel = 1;
    let kaltMed = null;
    g.startRace = function(){ kaltMed = 'race'; };
    key(L, 'Enter');
    check('ENTER på VELG BANE (rad 1) setter state=trackselect', g.state === 'trackselect', 'state=' + g.state);
    check('ENTER på VELG BANE (rad 1) kaller IKKE startRace', kaltMed === null, 'kalte ' + kaltMed);
  }

  // ── TEST 12: ESC på resultatskjermen går til baneutvalget, ikke katalogen ─
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'win';
    key(L, 'Escape');
    check('ESC i win gir state=trackselect', g.state === 'trackselect', 'state=' + g.state);
    check('ESC i win rører IKKE window.location', g.windowLocationHref === '', 'fikk ' + g.windowLocationHref);
  }

  // ── TEST 13: de gamle ENTER/T-bokstavtastene på resultatskjermen er borte ─
  // (ENTER virker fortsatt, men bare via winSel — dekket av TEST 11. Her
  // sjekkes at en bokstav som før gjorde noe, T, nå er dødt på denne skjermen.)
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'win';
    key(L, 't');
    check('"t" på resultatskjermen gjør ingenting lenger (state uendret)', g.state === 'win', 'state=' + g.state);
    key(L, 'T');
    check('"T" på resultatskjermen gjør ingenting lenger (state uendret)', g.state === 'win', 'state=' + g.state);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P-tasten og autopause (fullskjermrettelsen)
  // ══════════════════════════════════════════════════════════════════════════
  // Bakgrunn: i fullskjerm tar nettleseren ESC selv og går ut av fullskjerm, og
  // ingen side kan hindre det (Keyboard Lock finnes bare i Chrome). Derfor må
  // P gjøre nøyaktig det samme som ESC, og løpet må pause av seg selv når
  // vinduet mister forgrunnen.

  // ── TEST 14: P åpner pausemenyen, både liten og stor bokstav ─────────────
  // Begge skrivemåtene må med: e.key er 'P' når Shift holdes, og en test som
  // bare sjekket 'p' ville godkjent en normKey-glipp.
  ['p','P'].forEach(function(tast){
    ['playing','practice'].forEach(function(st){
      const L = loadGame(html); const g = L.game;
      g.state = st;
      key(L, tast);
      check('"' + tast + '" i ' + st + ' setter paused=true', g.paused === true, 'paused=' + g.paused);
      check('"' + tast + '" i ' + st + ' starter på rad 0', g.pauseSel === 0, 'pauseSel=' + g.pauseSel);
      check('"' + tast + '" i ' + st + ' lar state stå urørt', g.state === st, 'state=' + g.state);
      check('"' + tast + '" i ' + st + ' rører IKKE window.location', g.windowLocationHref === '', 'fikk ' + g.windowLocationHref);
    });
  });

  // ── TEST 15: P lukker pausemenyen igjen (FORTSETT), som ESC ──────────────
  ['p','P'].forEach(function(tast){
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 2;
    key(L, tast);
    check('"' + tast + '" i pausemenyen gir paused=false', g.paused === false, 'paused=' + g.paused);
    check('"' + tast + '" i pausemenyen lar state stå (playing)', g.state === 'playing', 'state=' + g.state);
    check('"' + tast + '" i pausemenyen lar pauseSel stå (ingen navigasjon)', g.pauseSel === 2, 'pauseSel=' + g.pauseSel);
  });
  // P skal kunne slås av og på gjentatte ganger, ikke bare én vei
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'practice';
    key(L, 'p'); key(L, 'p'); key(L, 'p');
    check('P tre ganger ender i pause (av/på/av…)', g.paused === true, 'paused=' + g.paused);
    key(L, 'p');
    check('P fjerde gang lukker igjen', g.paused === false, 'paused=' + g.paused);
  }

  // ── TEST 16: P er BARE en pausesnarvei — død i alle andre skjermer ────────
  // Her ligger kollisjonsfaren: P må ikke bli en ny meny-tast, og den må ikke
  // røre øvingens t/r/g.
  ['menu','trackselect','teams','settings','win'].forEach(function(st){
    const L = loadGame(html); const g = L.game;
    g.state = st;
    let startet = null;
    g.startRace = function(){ startet = 'race'; };
    g.startPractice = function(){ startet = 'practice'; };
    key(L, 'p'); key(L, 'P');
    check('P/p gjør ingenting i ' + st + ' (paused står false)', g.paused === false, 'paused=' + g.paused);
    check('P/p gjør ingenting i ' + st + ' (state uendret)', g.state === st, 'state=' + g.state);
    check('P/p gjør ingenting i ' + st + ' (starter ingen økt)', startet === null, 'kalte ' + startet);
  });
  {
    // Øvingens egne snarveier er uendret av at P kom til: P returnerer FØR
    // practice-blokken, så t/r/g kan ikke ha blitt skadet — det måles her.
    const L = loadGame(html); const g = L.game;
    g.state = 'practice';
    let kaltMed = null;
    g.startPractice = function(){ kaltMed = 'practice'; };
    key(L, 'r');
    check('"r" i øving starter fortsatt økta på nytt', kaltMed === 'practice', 'kalte ' + kaltMed);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'practice';
    key(L, 't');
    check('"t" i øving går fortsatt til baneutvalget', g.state === 'trackselect', 'state=' + g.state);
  }

  // ── TEST 17: autopause når vinduet mister forgrunnen ─────────────────────
  ['playing','practice'].forEach(function(st){
    const L = loadGame(html); const g = L.game;
    g.state = st;
    fyr(L, 'window', 'blur');
    check('blur i ' + st + ' setter paused=true', g.paused === true, 'paused=' + g.paused);
    check('blur i ' + st + ' setter pauseSel=0', g.pauseSel === 0, 'pauseSel=' + g.pauseSel);
  });
  ['playing','practice'].forEach(function(st){
    const L = loadGame(html); const g = L.game;
    g.state = st;
    L.documentStub.hidden = true;
    fyr(L, 'document', 'visibilitychange');
    check('visibilitychange med hidden=true i ' + st + ' setter paused=true', g.paused === true, 'paused=' + g.paused);
    check('visibilitychange med hidden=true i ' + st + ' setter pauseSel=0', g.pauseSel === 0, 'pauseSel=' + g.pauseSel);
  });
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'playing';
    fyr(L, 'document', 'fullscreenchange');
    check('fullscreenchange ut av fullskjerm setter paused=true', g.paused === true, 'paused=' + g.paused);
  }
  {
    // Fortsatt I fullskjerm: hendelsen fyrer også når man går INN, og da skal
    // løpet ikke pauses.
    const L = loadGame(html); const g = L.game;
    g.state = 'playing';
    L.documentStub.fullscreenElement = {};
    fyr(L, 'document', 'fullscreenchange');
    check('fullscreenchange INN i fullskjerm pauser IKKE', g.paused === false, 'paused=' + g.paused);
  }
  {
    // Autopause må holde seg til løpet: i menyene finnes ingen pausemeny å
    // vise, og en paused=true der ville frosset dem uten vei ut.
    const L = loadGame(html); const g = L.game;
    g.state = 'menu';
    fyr(L, 'window', 'blur');
    L.documentStub.hidden = true;
    fyr(L, 'document', 'visibilitychange');
    check('blur/hidden i menyen setter IKKE paused', g.paused === false, 'paused=' + g.paused);
  }
  {
    // Ingen automatisk gjenopptaking: spilleren velger FORTSETT selv, ellers
    // ruller bilen i gang før han har hendene på tastene.
    const L = loadGame(html); const g = L.game;
    g.state = 'playing';
    fyr(L, 'window', 'blur');
    L.documentStub.hidden = false;
    fyr(L, 'document', 'visibilitychange');
    check('pausen står når fokus kommer tilbake (ingen auto-fortsett)', g.paused === true, 'paused=' + g.paused);
  }
  {
    // Autopause må ikke flytte markøren i en pause spilleren selv åpnet og
    // navigerte i — et programbytte skal ikke kaste valget hans tilbake til rad 0.
    const L = loadGame(html); const g = L.game;
    g.state = 'playing'; g.paused = true; g.pauseSel = 3;
    fyr(L, 'window', 'blur');
    check('blur i en alt pauset meny lar pauseSel stå', g.pauseSel === 3, 'pauseSel=' + g.pauseSel);
  }

  // ── TEST 18: akkumulator-nullstillingen står fortsatt ────────────────────
  // Den delte visibilitychange-lytteren har to jobber nå. Uten nullstillingen
  // hopper raceTime i det fanen blir synlig igjen, så den må måles eksplisitt.
  {
    const L = loadGame(html); const g = L.game;
    g.accumulator = 1234; g.lastFrameT = 999;
    L.documentStub.hidden = false;
    fyr(L, 'document', 'visibilitychange');
    check('visibilitychange synlig nullstiller accumulator', g.accumulator === 0, 'accumulator=' + g.accumulator);
    check('visibilitychange synlig nullstiller lastFrameT', g.lastFrameT === null, 'lastFrameT=' + g.lastFrameT);
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

// MERK: funksjonen heter `main`, ikke `run` — JXA kaller automatisk en global
// `run`, og med det navnet kjører hele testen to ganger.
main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
