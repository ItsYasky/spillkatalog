// ============================================================================
// Headless test for STEG B: lazy banebakgrunn i vintage_f1.html.
//
// Som test_fixed_timestep.js kjøres denne med JavaScriptCore via macOS-
// verktøyet `osascript -l JavaScript`, fordi det ikke finnes noen `node`-
// binær i dette miljøet. Samme type JS-motor som nettleseren spillet kjører
// i, ingen avhengigheter:
//
//   osascript -l JavaScript test_lazy_track_bg.js
//   osascript -l JavaScript test_lazy_track_bg.js /tmp/vintage_f1_before.html
//
// Med et valgfritt filargument lastes ALLE 13 banene fra BÅDE referansefilen
// (f.eks. `git show HEAD:vintage_f1.html`) og dagens vintage_f1.html i samme
// kjøring, og hele banegeometrien sammenlignes felt for felt. Geometrien er
// helt deterministisk (ingen Math.random i genCP/buildPath/computeHeadingCurv/
// buildRaceLine/findDrsZones), så den sammenligningen er eksakt og er det som
// beviser at PATH/wallOffsArr/raceLine/straightZones ikke endret seg da bakgrunns-
// byggingen ble flyttet ut av buildTrack() — altså at banene fortsatt er
// NØYAKTIG de samme banene, bare med bakgrunnen bygget senere.
//
// Hele <script>-blokken fra vintage_f1.html kjøres som den er, pakket i en
// funksjon som får stubbet document/canvas/requestAnimationFrame inn som
// parametere. Da testes den EKTE spillkoden (ikke en omskrevet kopi), og to
// versjoner av filen kan lastes side om side i samme prosess uten at deres
// globale deklarasjoner kolliderer.
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
// 2D-konteksten brukes bare til å tegne; ingen av tegnekallene har noe å si
// for det denne testen sjekker. Proxyen svarer derfor med en no-op for hvilken
// som helst metode, og returnerer seg selv, slik at kjeder som
// createLinearGradient().addColorStop() også går gjennom uten spesialtilfeller.
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

// Laster én versjon av spillet i sin egen funksjonsscope og returnerer en
// liten håndtak-objekt for det testen trenger å lese/sette utenfra.
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
    '  startRace: startRace, startPractice: startPractice, update: update, draw: draw\n' +
    '};\n})');
  return factory(documentStub, windowStub, rafStub, perfStub);
}

// ── hjelpere ─────────────────────────────────────────────────────────────────
function liveBgs(game){
  const live = [];
  game.TRACKS.forEach(function(t, i){
    if(t.bg) live.push({ i: i, name: t.name, w: t.bg.width, h: t.bg.height });
  });
  return live;
}

function bgSizeOf(t){
  // Etter STEG B ligger de målte verdiene på geometri-objektet (bakgrunnen er
  // ikke bygget ennå); før STEG B finnes de bare som dimensjonene på den
  // ferdigbygde bg-canvasen.
  if(typeof t.bgW === 'number' && typeof t.bgH === 'number'){
    return { w: t.bgW, h: t.bgH, scale: (typeof t.bgScale === 'number' ? t.bgScale : 1), lazy: true };
  }
  if(t.bg) return { w: t.bg.width, h: t.bg.height, scale: 1, lazy: false };
  return null;
}

function fmtPx(n){
  return (n / 1e6).toFixed(2) + 'M';
}

function deepDiff(a, b, path){
  path = path || '';
  if(Array.isArray(a) || Array.isArray(b)){
    if(!Array.isArray(a) || !Array.isArray(b)) return path + ': array vs ikke-array';
    if(a.length !== b.length) return path + '.length: ' + a.length + ' vs ' + b.length;
    for(let i = 0; i < a.length; i++){
      const d = deepDiff(a[i], b[i], path + '[' + i + ']');
      if(d) return d;
    }
    return null;
  }
  if(a && b && typeof a === 'object' && typeof b === 'object'){
    const keys = Object.keys(a);
    if(keys.length !== Object.keys(b).length) return path + ': ulikt antall felt';
    for(let i = 0; i < keys.length; i++){
      const d = deepDiff(a[keys[i]], b[keys[i]], path + '.' + keys[i]);
      if(d) return d;
    }
    return null;
  }
  if(a !== b) return path + ': ' + a + ' vs ' + b;
  return null;
}

// Feltene som er REN geometri og derfor skal være bit-identiske før/etter at
// bakgrunnsbyggingen ble flyttet ut. (bg/standRects/flagPoles/marshalPosts/
// floodlights er bevisst utelatt: de bygges av bakgrunns-passet og bruker
// Math.random, så de er aldri identiske mellom to kjøringer — heller ikke før
// endringen.)
const GEOM_FIELDS = ['name','info','PN','TW','terrain','walls','sfx','sfy','sfAng',
  'bgMinX','bgMinY','bgOx','bgOy','CP','PATH','heading','smoothCurv','severity','raceLine','straightZones','wallOffsArr'];

function geomFingerprint(t){
  const o = {};
  GEOM_FIELDS.forEach(function(f){ o[f] = t[f]; });
  return o;
}

function run(argv){
  const out = [];
  const fails = [];
  function ok(cond, msg){ if(!cond) fails.push(msg); return cond; }

  const game = loadGame('vintage_f1.html');
  const TRACKS = game.TRACKS;

  // ── MÅLING: bakgrunnsstørrelse per bane ───────────────────────────────────
  const BUDGET = 16e6; // iOS Safari tåler rundt 16,7M piksler per canvas
  out.push('MÅLING — bakgrunnscanvas per bane (' + TRACKS.length + ' baner)');
  out.push('  ' + pad('BANE', 14) + pad('bw', 8) + pad('bh', 8) + pad('bw*bh', 10) + pad('skala', 7) + 'faktiske px');
  let totalPx = 0, overBudget = 0;
  TRACKS.forEach(function(t){
    const s = bgSizeOf(t);
    if(!s){ out.push('  ' + t.name + ': (ingen bakgrunn og ingen bgW/bgH — kan ikke måles)'); return; }
    const px = s.w * s.h;
    const actual = Math.ceil(s.w * s.scale) * Math.ceil(s.h * s.scale);
    totalPx += px;
    if(px > BUDGET) overBudget++;
    out.push('  ' + pad(t.name, 14) + pad(String(s.w), 8) + pad(String(s.h), 8) +
      pad(fmtPx(px), 10) + pad(s.scale.toFixed(3), 7) + fmtPx(actual) +
      (px > BUDGET ? '  ← over 16M' : ''));
  });
  out.push('  SUM (alle baner samtidig i minnet): ' + fmtPx(totalPx) +
    ' piksler · ' + overBudget + ' bane(r) over ' + fmtPx(BUDGET) + '-grensen');
  out.push('');

  // ── A: geometri for alle baner ved oppstart ───────────────────────────────
  const GEOM_REQUIRED = ['CP','PATH','PN','heading','smoothCurv','severity','raceLine','straightZones',
    'TW','name','info','sfAng','sfx','sfy','terrain'];
  let geomOk = 0;
  TRACKS.forEach(function(t){
    const missing = GEOM_REQUIRED.filter(function(f){ return t[f] === undefined || t[f] === null; });
    if(t.walls && !t.wallOffsArr) missing.push('wallOffsArr');
    if(missing.length) fails.push('A: ' + t.name + ' mangler geometri ved oppstart: ' + missing.join(', '));
    else geomOk++;
  });
  out.push('A  Geometri ved oppstart (banevalg trenger PATH til minikart + straightZones til teksten)');
  out.push('   ' + geomOk + '/' + TRACKS.length + ' baner har all geometri uten at bakgrunnen er bygget');

  // ── B: ingen bakgrunn bygget ved oppstart ─────────────────────────────────
  const atStartup = liveBgs(game);
  ok(atStartup.length === 0, 'B: ' + atStartup.length + ' bakgrunn(er) ble bygget allerede ved oppstart (skal være 0 — lazy)');
  out.push('B  Bakgrunner bygget ved oppstart: ' + atStartup.length + ' (forventet 0)');

  // ── C+D: alle baner, løp og øving, DAG og NATT ────────────────────────────
  const LIVE_LAYER = ['standRects','flagPoles','floodlights'];
  const todCases = [{ name: 'DAG', idx: 0 }, { name: 'NATT', idx: 2 }];
  const modes = [
    { name: 'løp',  go: function(){ game.startRace(); } },
    { name: 'øving', go: function(){ game.startPractice(); } }
  ];
  let starts = 0, maxLive = 0, marshalTotal = 0;
  const liveLayerCounts = [];
  modes.forEach(function(mode){
    todCases.forEach(function(tod){
      game.todIdx = tod.idx;
      TRACKS.forEach(function(t, i){
        game.trackSel = i;
        game.state = 'trackselect';
        mode.go();
        starts++;
        const TR = game.TR;
        if(TR !== t) fails.push('C: ' + mode.name + '/' + tod.name + '/' + t.name + ': TR ble ikke satt til valgt bane');
        if(!TR.bg) fails.push('C: ' + mode.name + '/' + tod.name + '/' + t.name + ': bakgrunnen ble ikke bygget');
        LIVE_LAYER.forEach(function(f){
          if(!TR[f] || !TR[f].length) fails.push('C: ' + mode.name + '/' + tod.name + '/' + t.name + ': ' + f + ' mangler/er tom før første frame');
        });
        if(!TR.marshalPosts) fails.push('C: ' + mode.name + '/' + tod.name + '/' + t.name + ': marshalPosts mangler');
        else marshalTotal += TR.marshalPosts.length;
        if(mode.name === 'løp' && tod.name === 'DAG'){
          liveLayerCounts.push(t.name + ': ' + TR.standRects.length + ' tribuner, ' + TR.flagPoles.length +
            ' flagg, ' + TR.marshalPosts.length + ' marshaler, ' + TR.floodlights.length + ' flomlys');
        }
        // kjør noen ekte frames (nedtelling + kjøring) for å fange exceptions
        // i update()/draw() med den nye lazy-bakgrunnen
        for(let f = 0; f < 200; f++){ game.update(); game.draw(); }
        const live = liveBgs(game);
        if(live.length > maxLive) maxLive = live.length;
        if(live.length > 1) fails.push('D: ' + mode.name + '/' + tod.name + '/' + t.name +
          ': ' + live.length + ' bakgrunner i minnet samtidig (' + live.map(function(l){ return l.name; }).join(', ') + ')');
      });
    });
  });
  out.push('');
  out.push('C  Startet ' + starts + ' sesjoner (' + TRACKS.length + ' baner × løp/øving × DAG/NATT), 200 frames hver');
  out.push('   Levende lag totalt: ' + marshalTotal + ' marshalposter plassert over alle sesjoner');
  out.push('D  Maks antall bakgrunner i minnet samtidig: ' + maxLive + ' (forventet 1)');
  out.push('');
  out.push('   Levende lag per bane (løp/DAG):');
  liveLayerCounts.forEach(function(l){ out.push('     ' + l); });

  // ── E: fem banebytter på rad ──────────────────────────────────────────────
  out.push('');
  const switchSeq = [0, 5, 9, 12, 3, 7];
  const liveAfter = [];
  switchSeq.forEach(function(i){
    game.trackSel = i;
    game.state = 'trackselect';
    game.startRace();
    for(let f = 0; f < 30; f++){ game.update(); game.draw(); }
    const live = liveBgs(game);
    liveAfter.push(TRACKS[i].name + '→' + live.length);
    if(live.length !== 1) fails.push('E: etter bytte til ' + TRACKS[i].name + ' lever ' + live.length + ' bakgrunner');
  });
  out.push('E  Fem+ banebytter på rad: ' + liveAfter.join(', ') + ' (antall bg i minnet etter hvert bytte)');

  // ── F: geometri identisk med referansefil (valgfritt argument) ────────────
  const refPath = (argv && argv.length) ? String(argv[0]) : null;
  if(refPath){
    const ref = loadGame(refPath);
    out.push('');
    if(ref.TRACKS.length !== TRACKS.length){
      fails.push('F: referansefilen har ' + ref.TRACKS.length + ' baner, dagens har ' + TRACKS.length);
    } else {
      let identical = 0;
      TRACKS.forEach(function(t, i){
        const d = deepDiff(geomFingerprint(ref.TRACKS[i]), geomFingerprint(t), t.name);
        if(d) fails.push('F: geometrien endret seg for ' + t.name + ' → ' + d);
        else identical++;
      });
      out.push('F  Geometri mot ' + refPath + ': ' + identical + '/' + TRACKS.length +
        ' baner bit-identiske (' + GEOM_FIELDS.length + ' felt hver, inkl. PATH, raceLine, straightZones og wallOffsArr)');
    }
  } else {
    out.push('');
    out.push('F  (hoppet over — kjør med sti til en referanse-HTML for å sammenligne geometrien felt for felt)');
  }

  // ── resultat ──────────────────────────────────────────────────────────────
  out.push('');
  if(fails.length){
    out.push('RESULTAT: FAIL — ' + fails.length + ' problem(er):');
    fails.slice(0, 25).forEach(function(f){ out.push('  · ' + f); });
    if(fails.length > 25) out.push('  · … og ' + (fails.length - 25) + ' flere');
  } else {
    out.push('RESULTAT: PASS — lazy bakgrunn, kun én bg i minnet, levende lag intakt på alle baner.');
  }
  console.log(out.join('\n'));
  return fails.length ? 'FAIL' : 'PASS';
}

function pad(s, n){
  s = String(s);
  while(s.length < n) s += ' ';
  return s;
}
