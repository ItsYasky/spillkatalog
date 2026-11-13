// ============================================================================
// Headless test av hovedmeny- og banevalg-navigasjonen (GRAND PRIX-menyer,
// steg B) i vintage_f1.html.
//
// Kjøres med JavaScriptCore, samme opplegg som test_innstillinger.js — det
// finnes ingen `node` i dette miljøet:
//
//   osascript -l JavaScript tester/test_hovedmeny.js
//   osascript -l JavaScript tester/test_hovedmeny.js --html /tmp/annen.html
//
// Dekker TILSTANDSMASKINEN (↑↓←→/ENTER/ESC i state 'menu'/'trackselect', og
// at ESC i 'teams'/'settings' går til riktig returadresse), IKKE selve
// tegningen eller hvordan skjermen ser ut — det er verifisert manuelt med
// skjermbilder (se CLAUDE.md, steg B), slik test_innstillinger.js varslet at
// det ville bli. startRace()/startPractice() er for tunge til å kjøre i en
// JSC-stub (de bygger banebakgrunn på et ekte canvas) og er derfor byttet ut
// med flagg-stubber i testene som trenger å vite HVILKEN som ble kalt.
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
  const documentStub = {
    hidden: false,
    addEventListener: function(type, fn){ handlers[type] = fn; },
    getElementById: function(){ return makeCanvasStub(); },
    createElement: function(){ return makeCanvasStub(); }
  };
  const windowStub = { location: { href: '' }, addEventListener: function(){} };
  windowStub.localStorage = makeStorage();
  const factory = eval('(function(document, window, requestAnimationFrame, performance, localStorage){\n' + src + '\n' +
    'return {\n' +
    '  get state(){ return state; }, set state(v){ state = v; },\n' +
    '  get menuSel(){ return menuSel; }, set menuSel(v){ menuSel = v; },\n' +
    '  get menuTarget(){ return menuTarget; }, set menuTarget(v){ menuTarget = v; },\n' +
    '  get teamsReturnTo(){ return teamsReturnTo; }, set teamsReturnTo(v){ teamsReturnTo = v; },\n' +
    '  get settingsReturnTo(){ return settingsReturnTo; }, set settingsReturnTo(v){ settingsReturnTo = v; },\n' +
    '  get settingsSel(){ return settingsSel; }, set settingsSel(v){ settingsSel = v; },\n' +
    '  get trackSel(){ return trackSel; }, set trackSel(v){ trackSel = v; },\n' +
    '  get difficulty(){ return difficulty; },\n' +
    '  get LAPS(){ return LAPS; },\n' +
    '  get playerIdent(){ return playerIdent; }, set playerIdent(v){ playerIdent = v; },\n' +
    '  get TRACKS(){ return TRACKS; },\n' +
    '  get startRace(){ return startRace; }, set startRace(v){ startRace = v; },\n' +
    '  get startPractice(){ return startPractice; }, set startPractice(v){ startPractice = v; },\n' +
    '  get windowLocationHref(){ return window.location.href; }\n' +
    '};\n})');
  const game = factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, windowStub.localStorage);
  return { game: game, handlers: handlers };
}

const results = [];
function check(navn, ok, detalj){ results.push({ navn: navn, ok: !!ok, detalj: detalj }); }
function key(g, k, extra){
  const e = Object.assign({ key: k, preventDefault: function(){} }, extra||{});
  g.handlers.keydown(e);
}

function main(argv){
  const t0 = Date.now();
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html' && argv[i+1]) html = argv[i+1];

  console.log('HOVEDMENY/BANEVALG — navigasjon (GRAND PRIX-menyer, steg B) — ' + html);

  // ── TEST 1: hovedmenyen — ↑↓ bretter rundt over nøyaktig fire rader ──────
  {
    const L = loadGame(html);
    const g = L.game;
    check('starter i state=menu', g.state === 'menu', 'state=' + g.state);
    check('starter med menuSel=0 (LØP)', g.menuSel === 0, 'menuSel=' + g.menuSel);
    key(L, 'ArrowDown'); check('↓ fra 0 gir 1', g.menuSel === 1, 'fikk ' + g.menuSel);
    key(L, 'ArrowDown'); key(L, 'ArrowDown'); check('↓↓ fra 1 gir 3', g.menuSel === 3, 'fikk ' + g.menuSel);
    key(L, 'ArrowDown'); check('↓ fra 3 bretter til 0', g.menuSel === 0, 'fikk ' + g.menuSel);
    key(L, 'ArrowUp'); check('↑ fra 0 bretter til 3', g.menuSel === 3, 'fikk ' + g.menuSel);
  }

  // ── TEST 2: ENTER på hver av de fire radene ruter riktig ─────────────────
  {
    const L = loadGame(html); const g = L.game;
    g.menuSel = 0;
    key(L, 'Enter');
    check('LØP: state blir trackselect', g.state === 'trackselect', 'state=' + g.state);
    check('LØP: menuTarget blir race', g.menuTarget === 'race', 'menuTarget=' + g.menuTarget);
    check('LØP: spiller-ident trekkes (ikke null)', g.playerIdent !== null && g.playerIdent !== undefined);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.menuSel = 1;
    key(L, 'Enter');
    check('ØVING: state blir trackselect', g.state === 'trackselect', 'state=' + g.state);
    check('ØVING: menuTarget blir practice', g.menuTarget === 'practice', 'menuTarget=' + g.menuTarget);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.menuSel = 2;
    key(L, 'Enter');
    check('INNSTILLINGER: state blir settings', g.state === 'settings', 'state=' + g.state);
    check('INNSTILLINGER: settingsReturnTo blir menu', g.settingsReturnTo === 'menu', 'fikk ' + g.settingsReturnTo);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.menuSel = 3;
    key(L, 'Enter');
    check('LAG: state blir teams', g.state === 'teams', 'state=' + g.state);
    check('LAG: teamsReturnTo blir menu', g.teamsReturnTo === 'menu', 'fikk ' + g.teamsReturnTo);
  }

  // ── TEST 3: ESC fra hovedmenyen går til katalogen (window.location) ──────
  {
    const L = loadGame(html); const g = L.game;
    key(L, 'Escape');
    check('ESC i menu setter window.location.href til index.html',
      g.windowLocationHref === 'index.html', 'fikk ' + g.windowLocationHref);
  }

  // ── TEST 4: banevalget — ← → bretter over alle banene ─────────────────────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'trackselect'; g.trackSel = 0;
    const N = g.TRACKS.length;
    key(L, 'ArrowLeft');
    check('← fra bane 0 bretter til siste bane', g.trackSel === N-1, 'fikk ' + g.trackSel + ' av ' + N);
    key(L, 'ArrowRight');
    check('→ fra siste bane bretter til 0', g.trackSel === 0, 'fikk ' + g.trackSel);
    key(L, 'ArrowRight');
    check('→ fra 0 gir 1', g.trackSel === 1, 'fikk ' + g.trackSel);
  }

  // ── TEST 5: banevalget — ↓ går til INNSTILLINGER med riktig returadresse ──
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'trackselect';
    key(L, 'ArrowDown');
    check('↓ i trackselect gir state=settings', g.state === 'settings', 'state=' + g.state);
    check('↓ i trackselect setter settingsReturnTo=trackselect', g.settingsReturnTo === 'trackselect', 'fikk ' + g.settingsReturnTo);
  }

  // ── TEST 6: ESC i banevalget går til hovedmenyen, ikke ut til katalogen ──
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'trackselect';
    key(L, 'Escape');
    check('ESC i trackselect gir state=menu', g.state === 'menu', 'state=' + g.state);
    check('ESC i trackselect rører IKKE window.location', g.windowLocationHref === '', 'fikk ' + g.windowLocationHref);
  }

  // ── TEST 7: ENTER i banevalget kaller riktig funksjon ut fra menuTarget ──
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'trackselect'; g.menuTarget = 'race';
    let kaltMed = null;
    g.startRace = function(){ kaltMed = 'race'; };
    g.startPractice = function(){ kaltMed = 'practice'; };
    key(L, 'Enter');
    check('ENTER i trackselect med menuTarget=race kaller startRace', kaltMed === 'race', 'kalte ' + kaltMed);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'trackselect'; g.menuTarget = 'practice';
    let kaltMed = null;
    g.startRace = function(){ kaltMed = 'race'; };
    g.startPractice = function(){ kaltMed = 'practice'; };
    key(L, 'Enter');
    check('ENTER i trackselect med menuTarget=practice kaller startPractice', kaltMed === 'practice', 'kalte ' + kaltMed);
  }

  // ── TEST 8: ESC i settings/teams går til den lagrede returadressen ───────
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'settings'; g.settingsReturnTo = 'trackselect';
    key(L, 'Escape');
    check('ESC i settings går til settingsReturnTo (trackselect)', g.state === 'trackselect', 'state=' + g.state);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'settings'; g.settingsReturnTo = 'menu';
    key(L, 'Escape');
    check('ESC i settings går til settingsReturnTo (menu)', g.state === 'menu', 'state=' + g.state);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'teams'; g.teamsReturnTo = 'menu';
    key(L, 'Escape');
    check('ESC i teams går til teamsReturnTo', g.state === 'menu', 'state=' + g.state);
  }

  // ── TEST 9: de gamle bokstavtastene gjør INGENTING lenger ────────────────
  // Q/E (rundelengde), Z/X (den gamle skin-snarveien), C/V (tid), L
  // (lagoversikt), P (øving), TAB (modus) skal alle være dødt i de nye menyene
  // — de valgene bor nå bare i INNSTILLINGER eller hovedmenyen.
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'trackselect';
    const difFør = g.difficulty, lapsFør = g.LAPS, trackFør = g.trackSel;
    ['q','e','z','x','c','v','l','p','Tab'].forEach(function(k){ key(L, k); });
    check('bokstavtaster i trackselect endrer ikke difficulty', g.difficulty === difFør, 'før ' + difFør + ' etter ' + g.difficulty);
    check('bokstavtaster i trackselect endrer ikke LAPS', g.LAPS === lapsFør, 'før ' + lapsFør + ' etter ' + g.LAPS);
    check('bokstavtaster i trackselect endrer ikke trackSel', g.trackSel === trackFør, 'før ' + trackFør + ' etter ' + g.trackSel);
    check('"p" i trackselect starter ikke øving (state uendret)', g.state === 'trackselect', 'state=' + g.state);
  }
  // ── TEST 9b: INNSTILLINGER har syv rader, og markøren går rundt på dem ───
  // Porten mot en feilslått re-indeksering: da SKIN-raden gikk ut, måtte både
  // ROW_LABELS, radtegningen og ←→-grenene flyttes ned ett hakk. Peker ↑↓ på et
  // tall uten rad, treffer ← → ingenting og raden tegnes ikke — og det ser man
  // ikke før man står i menyen. Syv er MODUS, AI-NIVÅ, DISTANSE, TID PÅ DØGNET,
  // DITT LAG, SPESIALLAKK, SPØKELSE.
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'settings'; g.settingsSel = 0;
    const sett = [];
    for(let i=0;i<7;i++){ key(L, 'ArrowDown'); sett.push(g.settingsSel); }
    check('↓ sju ganger i settings er en hel runde (syv rader)', sett.join(',') === '1,2,3,4,5,6,0', 'fikk ' + sett.join(','));
    g.settingsSel = 0;
    key(L, 'ArrowUp');
    check('↑ fra rad 0 går til siste rad (6)', g.settingsSel === 6, 'fikk ' + g.settingsSel);
  }
  {
    const L = loadGame(html); const g = L.game;
    g.state = 'menu';
    const selFør = g.menuSel;
    key(L, 'Tab');
    check('TAB i hovedmenyen gjør ingenting (ingen modusbytte-snarvei lenger)', g.menuSel === selFør, 'menuSel=' + g.menuSel);
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
