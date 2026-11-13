// ============================================================================
// Headless test av INNSTILLINGER-lagringen (GRAND PRIX-menyer, steg A) i
// vintage_f1.html.
//
// Kjøres med JavaScriptCore, samme opplegg som test_ghost.js — det finnes
// ingen `node` i dette miljøet:
//
//   osascript -l JavaScript tester/test_innstillinger.js
//   osascript -l JavaScript tester/test_innstillinger.js --html /tmp/annen.html
//
// Dekker BARE lagringslaget (SETTINGS, lagreInnstillinger/lastInnstillinger,
// applySettingsToGame, settingsAiIndex, settingsTeam, resolveTodIdx) og
// naturligTid på banene — selve INNSTILLINGER-skjermen og hovedmenyens
// navigasjon kommer i steg B/C og testes der skjermbilder uansett må tas.
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

// Samme lagringsstubb som test_ghost.js: mode='kaster' etterligner privat
// modus / avslåtte cookies / full kvote, der selve oppslaget kaster.
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

function loadGame(path, storage){
  const src = extractScript(readFile(path));
  const handlers = {};
  const documentStub = {
    hidden: false,
    addEventListener: function(type, fn){ handlers[type] = fn; },
    getElementById: function(){ return makeCanvasStub(); },
    createElement: function(){ return makeCanvasStub(); }
  };
  const windowStub = { location: { href: '' }, addEventListener: function(){} };
  const st = storage || makeStorage();
  windowStub.localStorage = st;
  const factory = eval('(function(document, window, requestAnimationFrame, performance, localStorage){\n' + src + '\n' +
    'return {\n' +
    '  get SETTINGS(){ return SETTINGS; },\n' +
    '  get SETTINGS_KEY(){ return SETTINGS_KEY; },\n' +
    '  get SETTINGS_VER(){ return SETTINGS_VER; },\n' +
    '  get REALISTIC(){ return REALISTIC; },\n' +
    '  get DIFFICULTIES(){ return DIFFICULTIES; },\n' +
    '  get difficulty(){ return difficulty; }, set difficulty(v){ difficulty = v; },\n' +
    '  get lapsIdx(){ return lapsIdx; },\n' +
    '  get LAPS(){ return LAPS; },\n' +
    '  get ghostOn(){ return ghostOn; }, set ghostOn(v){ ghostOn = v; },\n' +
    '  get playerIdent(){ return playerIdent; }, set playerIdent(v){ playerIdent = v; },\n' +
    '  get trackSel(){ return trackSel; }, set trackSel(v){ trackSel = v; },\n' +
    '  get TRACKS(){ return TRACKS; },\n' +
    '  get TEAMS(){ return TEAMS; },\n' +
    '  get TOD(){ return TOD; },\n' +
    '  get LAP_OPTIONS(){ return LAP_OPTIONS; },\n' +
    '  get DIFFICULTIES_CASUAL(){ return DIFFICULTIES_CASUAL; },\n' +
    '  get DIFFICULTIES_REALISTIC(){ return DIFFICULTIES_REALISTIC; },\n' +
    '  lagreInnstillinger: function(){ return lagreInnstillinger(); },\n' +
    '  lastInnstillinger: function(){ return lastInnstillinger(); },\n' +
    '  applySettingsToGame: function(){ return applySettingsToGame(); },\n' +
    '  settingsAiIndex: function(){ return settingsAiIndex(); },\n' +
    '  settingsTeam: function(){ return settingsTeam(); },\n' +
    '  resolveTodIdx: function(tr){ return resolveTodIdx(tr); },\n' +
    '  rollPlayerIdent: function(){ return rollPlayerIdent(); }\n' +
    '};\n})');
  const game = factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, st);
  return { game: game, storage: st, handlers: handlers };
}

const results = [];
function check(navn, ok, detalj){ results.push({ navn: navn, ok: !!ok, detalj: detalj }); }

// ── TEST 1: standardverdier og naturligTid på banene ────────────────────────
function testStandard(game){
  const S = game.SETTINGS;
  check('standard: CASUAL (ikke realistisk)', S.realistisk === false, 'realistisk=' + S.realistisk);
  check('standard: AI-NIVÅ er MIDDELS', S.aiNavn === 'MIDDELS', 'aiNavn=' + S.aiNavn);
  check('standard: TID er AUTO', S.tid === 'AUTO', 'tid=' + S.tid);
  check('standard: LAG er TILFELDIG', S.lag === 'TILFELDIG', 'lag=' + S.lag);
  check('standard: spøkelse er på', S.spokelse === true, 'spokelse=' + S.spokelse);
  check('MIDDELS finnes i begge vanskelighetstabellene på samme indeks',
    game.DIFFICULTIES_CASUAL[1].name === 'MIDDELS' && game.DIFFICULTIES_REALISTIC[1].name === 'MIDDELS',
    'casual[1]=' + game.DIFFICULTIES_CASUAL[1].name + ' realistisk[1]=' + game.DIFFICULTIES_REALISTIC[1].name);

  const navn = {};
  game.TRACKS.forEach(function(t){ navn[t.name] = t.naturligTid; });
  check('DESERTO har naturligTid NATT', navn['DESERTO'] === 'NATT', 'DESERTO=' + navn['DESERTO']);
  check('VISTANOTTE har naturligTid NATT', navn['VISTANOTTE'] === 'NATT', 'VISTANOTTE=' + navn['VISTANOTTE']);
  check('SERPENTINA har naturligTid SOLNEDGANG', navn['SERPENTINA'] === 'SOLNEDGANG', 'SERPENTINA=' + navn['SERPENTINA']);
  check('VULCANO har naturligTid SOLNEDGANG', navn['VULCANO'] === 'SOLNEDGANG', 'VULCANO=' + navn['VULCANO']);
  check('MONTE SPIRA faller tilbake til DAG', navn['MONTE SPIRA'] === 'DAG', 'MONTE SPIRA=' + navn['MONTE SPIRA']);
  const antallIkkeDag = game.TRACKS.filter(function(t){ return t.naturligTid !== 'DAG'; }).length;
  check('nøyaktig fire baner har en annen naturligTid enn DAG', antallIkkeDag === 4, 'antall=' + antallIkkeDag);
}

// ── TEST 2: resolveTodIdx (AUTO / TILFELDIG / fast) ─────────────────────────
function testResolveTod(game){
  const deserto = game.TRACKS.find(function(t){ return t.name === 'DESERTO'; });
  const monte = game.TRACKS.find(function(t){ return t.name === 'MONTE SPIRA'; });

  game.SETTINGS.tid = 'AUTO';
  const iDeserto = game.resolveTodIdx(deserto);
  check('AUTO på DESERTO gir NATT', game.TOD[iDeserto].name === 'NATT', 'fikk ' + game.TOD[iDeserto].name);
  const iMonte = game.resolveTodIdx(monte);
  check('AUTO på MONTE SPIRA gir DAG', game.TOD[iMonte].name === 'DAG', 'fikk ' + game.TOD[iMonte].name);

  game.SETTINGS.tid = 'NATT';
  check('fast NATT gir NATT uansett bane', game.TOD[game.resolveTodIdx(monte)].name === 'NATT');

  game.SETTINGS.tid = 'TILFELDIG';
  const sett = {};
  for(let i=0;i<60;i++) sett[game.TOD[game.resolveTodIdx(monte)].name] = true;
  const navn = Object.keys(sett).sort();
  check('TILFELDIG gir bare gyldige TOD-navn', navn.every(function(n){ return game.TOD.some(function(t){ return t.name===n; }); }), navn.join(','));
  check('TILFELDIG varierer over mange kall', navn.length > 1, 'fikk bare ' + navn.join(','));
  game.SETTINGS.tid = 'AUTO';
}

// ── TEST 3: settingsAiIndex overlever modusbytte ────────────────────────────
function testAiIndex(game){
  game.SETTINGS.aiNavn = 'VANSKELIG';
  game.applySettingsToGame();
  check('CASUAL + VANSKELIG gir indeks 2', game.difficulty === 2, 'difficulty=' + game.difficulty);
  check('CASUAL + VANSKELIG farge stemmer', game.DIFFICULTIES[game.difficulty].name === 'VANSKELIG');

  game.SETTINGS.realistisk = true;
  game.applySettingsToGame();
  check('bytte til REALISTISK holder navnet VANSKELIG', game.DIFFICULTIES[game.difficulty].name === 'VANSKELIG',
    'fikk ' + game.DIFFICULTIES[game.difficulty].name);
  check('REALISTIC-flagget er satt', game.REALISTIC === true);

  // Ukjent navn (f.eks. fra en gammel lagring) skal falle tilbake til MIDDELS (indeks 1), ikke krasje.
  game.SETTINGS.aiNavn = 'LEGENDE';
  check('ukjent AI-navn faller tilbake til indeks 1', game.settingsAiIndex() === 1, 'fikk ' + game.settingsAiIndex());

  game.SETTINGS.aiNavn = 'MIDDELS';
  game.SETTINGS.realistisk = false;
  game.applySettingsToGame();
}

// ── TEST 4: settingsTeam / rollPlayerIdent ──────────────────────────────────
function testTeam(game){
  game.SETTINGS.lag = 'TILFELDIG';
  check('TILFELDIG gir null (ingen fast lag)', game.settingsTeam() === null);

  const navn = game.TEAMS[3].name;
  game.SETTINGS.lag = navn;
  check('et gyldig lagnavn gir det laget', game.settingsTeam() === game.TEAMS[3], 'navn=' + navn);

  game.rollPlayerIdent();
  check('rollPlayerIdent respekterer fast lag', game.playerIdent.team === game.TEAMS[3],
    'fikk ' + game.playerIdent.team.name);

  // Et lagnavn som ikke finnes (f.eks. et lag som er fjernet) skal gi null,
  // ikke kaste — rollPlayerIdent faller da videre tilbake til tilfeldig trekning.
  game.SETTINGS.lag = 'FINNES_IKKE';
  check('ukjent lagnavn gir null, ikke krasj', game.settingsTeam() === null);
  game.rollPlayerIdent();
  check('rollPlayerIdent trekker tilfeldig når laget ikke finnes', game.TEAMS.indexOf(game.playerIdent.team) >= 0);

  game.SETTINGS.lag = 'TILFELDIG';
}

// ── TEST 5: applySettingsToGame dekker alle feltene ─────────────────────────
function testApply(game){
  game.SETTINGS.lapsIdx = 3;
  game.SETTINGS.spokelse = false;
  game.applySettingsToGame();
  check('applySettingsToGame setter LAPS fra lapsIdx', game.LAPS === game.LAP_OPTIONS[3], 'LAPS=' + game.LAPS);
  check('applySettingsToGame setter ghostOn', game.ghostOn === false, 'ghostOn=' + game.ghostOn);

  game.SETTINGS.lapsIdx = 1;
  game.SETTINGS.spokelse = true;
  game.applySettingsToGame();
}

// ── TEST 6: lagring/lesing rundtur ───────────────────────────────────────────
function testRundtur(html){
  const storage = makeStorage();
  const a = loadGame(html, storage).game;
  a.SETTINGS.realistisk = true;
  a.SETTINGS.aiNavn = 'ULTRA';
  a.SETTINGS.lapsIdx = 4;
  a.SETTINGS.tid = 'NATT';
  a.SETTINGS.lag = a.TEAMS[5].name;
  a.SETTINGS.spokelse = false;
  a.lagreInnstillinger();

  check('lagring skrev noe til nøkkelen', typeof storage.mem[a.SETTINGS_KEY] === 'string');

  const b = loadGame(html, storage).game; // ny spillinstans, samme lagring
  b.lastInnstillinger();
  const S = b.SETTINGS;
  check('rundtur: realistisk', S.realistisk === true, JSON.stringify(S));
  check('rundtur: aiNavn', S.aiNavn === 'ULTRA');
  check('rundtur: lapsIdx', S.lapsIdx === 4);
  check('rundtur: tid', S.tid === 'NATT');
  check('rundtur: lag', S.lag === a.TEAMS[5].name);
  check('rundtur: spokelse', S.spokelse === false);
  check('rundtur: ingen skinIdx i det som lagres', storage.mem[a.SETTINGS_KEY].indexOf('skinIdx') < 0,
    storage.mem[a.SETTINGS_KEY]);

  b.applySettingsToGame();
  check('rundtur: applySettingsToGame etter lesing gir riktig LAPS', b.LAPS === b.LAP_OPTIONS[4], 'LAPS=' + b.LAPS);
}

// ── TEST 7: ødelagt/ugyldig lagring faller tilbake til standard uten å krasje ─
function testOdelagt(html){
  let storage = makeStorage();
  storage.mem['gp_innstillinger'] = '{ ikke gyldig json ]][';
  let g = loadGame(html, storage).game;
  let feil = null;
  try { g.lastInnstillinger(); } catch(e){ feil = e; }
  check('ødelagt JSON kaster ikke', feil === null, feil && feil.message);
  check('ødelagt JSON: SETTINGS er standardverdier', g.SETTINGS.aiNavn === 'MIDDELS' && g.SETTINGS.realistisk === false);

  storage = makeStorage();
  storage.mem['gp_innstillinger'] = JSON.stringify({ v: 99, aiNavn: 'ULTRA' });
  g = loadGame(html, storage).game;
  feil = null;
  try { g.lastInnstillinger(); } catch(e){ feil = e; }
  check('feil versjon kaster ikke', feil === null, feil && feil.message);
  check('feil versjon beholder standardverdier', g.SETTINGS.aiNavn === 'MIDDELS');

  // Delvis ugyldig: bare de ugyldige feltene skal falle tilbake, resten skal brukes.
  storage = makeStorage();
  storage.mem['gp_innstillinger'] = JSON.stringify({
    v: 1, realistisk: true, aiNavn: 'ULTRA', lapsIdx: 999, tid: 'MIDNATT', lag: 'IKKE_ET_LAG', skinIdx: -4, spokelse: false
  });
  g = loadGame(html, storage).game;
  feil = null;
  try { g.lastInnstillinger(); } catch(e){ feil = e; }
  check('delvis ugyldig lagring kaster ikke', feil === null, feil && feil.message);
  check('delvis ugyldig: gyldig felt (realistisk) brukes', g.SETTINGS.realistisk === true);
  check('delvis ugyldig: gyldig felt (aiNavn) brukes', g.SETTINGS.aiNavn === 'ULTRA');
  check('delvis ugyldig: gyldig felt (spokelse) brukes', g.SETTINGS.spokelse === false);
  check('delvis ugyldig: ugyldig lapsIdx faller tilbake', g.SETTINGS.lapsIdx === 1, 'fikk ' + g.SETTINGS.lapsIdx);
  check('delvis ugyldig: ugyldig tid faller tilbake', g.SETTINGS.tid === 'AUTO', 'fikk ' + g.SETTINGS.tid);
  check('delvis ugyldig: ugyldig lag faller tilbake', g.SETTINGS.lag === 'TILFELDIG', 'fikk ' + g.SETTINGS.lag);
  // skinIdx er med i lagringen over fordi en ekte lagring fra før SKIN ble
  // fjernet HAR det feltet. Den skal ignoreres i stillhet — verken krasje,
  // havne i SETTINGS eller dra de gyldige feltene over seg med ned.
  check('delvis ugyldig: lagret skinIdx ignoreres', g.SETTINGS.skinIdx === undefined, 'fikk ' + g.SETTINGS.skinIdx);

  // Tomt (ingenting lagret før) skal også gi stille standardverdier.
  storage = makeStorage();
  g = loadGame(html, storage).game;
  feil = null;
  try { g.lastInnstillinger(); } catch(e){ feil = e; }
  check('tom lagring kaster ikke', feil === null);
  check('tom lagring: standardverdier', g.SETTINGS.aiNavn === 'MIDDELS');
}

// ── TEST 8: lagring som KASTER (privat modus / full kvote) ──────────────────
function testKasterLagring(html){
  const storage = makeStorage();
  storage.mode = 'kaster';
  const g = loadGame(html, storage).game;

  let feil = null;
  try { g.lagreInnstillinger(); } catch(e){ feil = e; }
  check('lagreInnstillinger() kaster ikke når localStorage kaster', feil === null, feil && feil.message);

  feil = null;
  try { g.lastInnstillinger(); } catch(e){ feil = e; }
  check('lastInnstillinger() kaster ikke når localStorage kaster', feil === null, feil && feil.message);
  check('SETTINGS er standardverdier etter blokkert lesing', g.SETTINGS.aiNavn === 'MIDDELS' && g.SETTINGS.realistisk === false);
}

function main(argv){
  const t0 = Date.now();
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html' && argv[i+1]) html = argv[i+1];

  console.log('INNSTILLINGER — lagring (GRAND PRIX-menyer, steg A) — ' + html);

  testStandard(loadGame(html).game);
  testResolveTod(loadGame(html).game);
  testAiIndex(loadGame(html).game);
  testTeam(loadGame(html).game);
  testApply(loadGame(html).game);
  testRundtur(html);
  testOdelagt(html);
  testKasterLagring(html);

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
