// ============================================================================
// Headless AI-simulering for RUNDE 3 i vintage_f1.html.
//
// Kjøres med JavaScriptCore via macOS-verktøyet `osascript -l JavaScript`,
// fordi det ikke finnes noen `node`-binær i dette miljøet — samme opplegg som
// test_fixed_timestep.js og test_lazy_track_bg.js fra runde 1 og 2:
//
//   osascript -l JavaScript test_ai_sim.js                  (dagens fil)
//   osascript -l JavaScript test_ai_sim.js --out fasit.json
//   osascript -l JavaScript test_ai_sim.js --html /tmp/for.html --out for.json
//   osascript -l JavaScript test_ai_sim.js --trials 6 --laps 8
//
// Hele <script>-blokken kjøres som den er, pakket i en funksjon som får
// stubbet document/canvas/window inn som parametere. Da måles den EKTE
// spillkoden, ikke en omskrevet kopi som kan komme ut av sync med den.
//
// HVORFOR SPILLERBILEN GJØRES OM TIL AI
// Feltet er på 20 biler, der den siste er spillerens. I en headless test
// trykker ingen på tastene, så den bilen ville blitt stående stille på
// startstreken. Det ville ikke bare gitt en bil mindre å måle — det ville
// forgiftet selve målingen, fordi gummistrikken regner gapet sitt mot nettopp
// `player.raceDist`. Med en bil som står bom stille ville hele feltet ligget
// langt foran «spilleren» og blitt bremset ned til gulvet sitt hele løpet, og
// da måler vi en situasjon som aldri oppstår i et ekte løp. Derfor settes
// isPlayer=false på den bilen etter buildCars(): den kjøres av den vanlige
// AI-en, `player` peker fortsatt på den slik at gummistrikken har sitt
// referansepunkt, og vi får et rent 20-bilers AI-felt.
//
// HVORFOR Math.random ERSTATTES
// JavaScriptCore kan ikke så Math.random. Uten styring ville to kjøringer av
// samme fil gitt ulike tall, og «før/etter» ville druknet i støy. Her settes
// en egen PRNG med fast frø inn FØR spillet lastes, og hvert forsøk får sitt
// eget frø. Merk at frøet ikke gir bit-identiske løp på tvers av to ULIKE
// versjoner av spillet: endrer man antall Math.random-kall, forskyves hele
// rekken etterpå. Derfor kjøres flere forsøk og det er gjennomsnittet som
// sammenlignes, ikke ett enkelt løp.
// ============================================================================
ObjC.import('Foundation');

function readFile(path){
  const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if(data === null) throw new Error('Kunne ikke lese filen: ' + path + ' (kjør testen fra spillkatalog-mappen)');
  return ObjC.unwrap(data);
}
function writeFile(path, text){
  const s = $.NSString.alloc.initWithUTF8String(text);
  s.writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}
function extractScript(html){
  const open = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if(open < 0 || close < open) throw new Error('Fant ikke <script>-blokken i HTML-filen.');
  return html.slice(open + '<script>'.length, close);
}

// ── stubs ───────────────────────────────────────────────────────────────────
// Ingen av tegnekallene har noe å si for det som måles her. Proxyen svarer med
// en no-op for hvilken som helst metode og returnerer seg selv, slik at kjeder
// som createLinearGradient().addColorStop() går gjennom uten spesialtilfeller.
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

// Liten, rask PRNG (mulberry32). Trenger ikke være kryptografisk — den skal
// bare være reproduserbar og jevnt fordelt.
function makeRng(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── rutenett for raskere nærmeste-punkt-søk ─────────────────────────────────
// `nearestOnPath` i spillet skanner ALLE segmentene i banelinjen (PN = 540–1044)
// for hver bil hvert steg. I nettleseren er det billig nok, men i JavaScriptCore
// ble hele måle-matrisen (13 baner x 2 moduser x 2 vanskelighetsgrader x 8
// runder) over 40 minutter per forsøk — altfor tregt til å kunne kjøres på nytt
// i steg G med 6 forsøk.
//
// Derfor bygger simuleringen et uniformt rutenett over banelinjen og søker
// ringvis utover fra bilens egen rute. Dette er IKKE en tilnærming: søket
// stopper først når den beste avstanden som er funnet er kortere enn
// r * CELLE, altså kortere enn noe punkt utenfor de rutene som alt er
// gjennomsøkt kan ligge. Likhet med originalen verifiseres med `--verify`.
//
// Spillkoden endres ikke — overstyringen settes bare inn i simuleringen.
const GRID_CELL = 40;

function buildPathGrid(PATH){
  const PN = PATH.length, S = GRID_CELL;
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for(let i=0;i<PN;i++){
    const p = PATH[i];
    if(p[0] < minx) minx = p[0];
    if(p[0] > maxx) maxx = p[0];
    if(p[1] < miny) miny = p[1];
    if(p[1] > maxy) maxy = p[1];
  }
  const gw = Math.max(1, Math.floor((maxx-minx)/S) + 1);
  const gh = Math.max(1, Math.floor((maxy-miny)/S) + 1);
  const nc = gw * gh;
  const starts = new Int32Array(nc + 1);
  const segCells = new Array(PN);
  for(let i=0;i<PN;i++){
    const a = PATH[i], b = PATH[(i+1)%PN];
    let cx0 = Math.floor((Math.min(a[0],b[0]) - minx)/S);
    let cx1 = Math.floor((Math.max(a[0],b[0]) - minx)/S);
    let cy0 = Math.floor((Math.min(a[1],b[1]) - miny)/S);
    let cy1 = Math.floor((Math.max(a[1],b[1]) - miny)/S);
    if(cx0 < 0) cx0 = 0;
    if(cy0 < 0) cy0 = 0;
    if(cx1 > gw-1) cx1 = gw-1;
    if(cy1 > gh-1) cy1 = gh-1;
    const cells = [];
    for(let cy=cy0;cy<=cy1;cy++) for(let cx=cx0;cx<=cx1;cx++){
      const id = cy*gw + cx;
      cells.push(id);
      starts[id+1]++;
    }
    segCells[i] = cells;
  }
  for(let i=0;i<nc;i++) starts[i+1] += starts[i];
  const items = new Int32Array(starts[nc]);
  const fill = new Int32Array(nc);
  for(let i=0;i<PN;i++){
    const cells = segCells[i];
    for(let k=0;k<cells.length;k++){
      const id = cells[k];
      items[starts[id] + fill[id]++] = i;
    }
  }
  return { S:S, minx:minx, miny:miny, gw:gw, gh:gh, starts:starts, items:items };
}

function makeFastNearest(orig){
  const grids = new Map();
  return function(PATH, gx, gy){
    let G = grids.get(PATH);
    if(!G){ G = buildPathGrid(PATH); grids.set(PATH, G); }
    const PN = PATH.length, S = G.S, gw = G.gw, gh = G.gh, starts = G.starts, items = G.items;
    const qcx = Math.floor((gx - G.minx)/S), qcy = Math.floor((gy - G.miny)/S);
    const maxR = gw + gh + Math.abs(qcx) + Math.abs(qcy) + 2;
    let best = 1e15, bi = -1, bt = 0;
    for(let r=0;r<=maxR;r++){
      const x0 = qcx-r, x1 = qcx+r, y0 = qcy-r, y1 = qcy+r;
      for(let cy=y0;cy<=y1;cy++){
        if(cy < 0 || cy >= gh) continue;
        const edgeRow = (cy === y0 || cy === y1);
        for(let cx=x0;cx<=x1;cx++){
          if(cx < 0 || cx >= gw) continue;
          // Bare ringen, ikke hele kvadratet — innsiden er alt gjennomsøkt.
          if(!edgeRow && cx !== x0 && cx !== x1) continue;
          const id = cy*gw + cx, end = starts[id+1];
          for(let k=starts[id];k<end;k++){
            const i = items[k];
            const a = PATH[i], b = PATH[(i+1)%PN];
            const dx = b[0]-a[0], dy = b[1]-a[1], ll = dx*dx + dy*dy || 1;
            let t = ((gx-a[0])*dx + (gy-a[1])*dy)/ll;
            if(t < 0) t = 0; else if(t > 1) t = 1;
            const px = a[0] + dx*t, py = a[1] + dy*t;
            const ex = gx-px, ey = gy-py, d = ex*ex + ey*ey;
            // Samme vinnerregel som originalen: strengt mindre avstand vinner,
            // og ved helt likt vinner det LAVESTE segmentindeksen. Originalen
            // skanner i indeksrekkefølge, ringsøket gjør det ikke — uten denne
            // regelen kunne de to valgt ulikt segment ved nøyaktig likhet.
            if(d < best || (d === best && i < bi)){ best = d; bi = i; bt = t; }
          }
        }
      }
      if(bi >= 0 && Math.sqrt(best) <= r*S) break;
    }
    if(bi < 0) return orig(PATH, gx, gy); // skal ikke skje, men aldri gi feil svar
    return { progress:(bi+bt)/PN, dist:Math.sqrt(best), idx:bi };
  };
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
      removeItem: function(k){ delete mem[k]; },
      _mem: mem
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
    '  get keys(){ return keys; },\n' +
    '  get trackSel(){ return trackSel; }, set trackSel(v){ trackSel = v; },\n' +
    '  get difficulty(){ return difficulty; }, set difficulty(v){ difficulty = v; },\n' +
    '  get REALISTIC(){ return REALISTIC; },\n' +
    '  setRealistic: function(v){ REALISTIC = v; DIFFICULTIES = v ? DIFFICULTIES_REALISTIC : DIFFICULTIES_CASUAL; },\n' +
    '  get LAPS(){ return LAPS; }, set LAPS(v){ LAPS = v; },\n' +
    '  get DIFFICULTIES(){ return DIFFICULTIES; },\n' +
    '  get nearestOnPath(){ return nearestOnPath; },\n' +
    '  setNearestOnPath: function(f){ nearestOnPath = f; },\n' +
    '  startRace: startRace, startPractice: startPractice, update: update,\n' +
    '  localStorage: localStorage\n' +
    '};\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

// ── én simulering ───────────────────────────────────────────────────────────
// Returnerer måltallene for ett løp: spredning i feltet etter gitte runder,
// veggtreff per bil, andel steg utenfor banen per bil, og (når spillet har
// fått steg B) banegrensebrudd per bil.
function simulate(game, opts){
  game.trackSel = opts.trackIdx;
  game.setRealistic(opts.realistic);
  game.difficulty = opts.difficulty;
  game.LAPS = opts.laps;
  game.startRace();
  // Hopp over nedtellingen: den er 180 steg der ingenting beveger seg.
  game.state = 'playing';

  const cars = game.cars;
  const player = game.player;
  // Spillerbilen kjøres av AI-en (se toppkommentaren). `player` peker fortsatt
  // på den, så gummistrikkens referansepunkt er intakt.
  player.isPlayer = false;

  const stats = cars.map(function(){ return { wallHits:0, offSteps:0, limitViolations:0 }; });
  const prevWall = cars.map(function(){ return false; });
  const prevViol = cars.map(function(c){ return c.limitViolations || 0; });

  const spreadAt = {};
  const want = opts.spreadLaps.slice();
  let steps = 0;
  const maxSteps = opts.laps * opts.maxStepsPerLap;

  while(steps < maxSteps){
    game.update();
    steps++;
    for(let i=0;i<cars.length;i++){
      const c = cars[i];
      if(c.finished) continue;
      if(c.offtrack) stats[i].offSteps++;
      if(c.wallHit && !prevWall[i]) stats[i].wallHits++;
      prevWall[i] = !!c.wallHit;
      const v = c.limitViolations || 0;
      if(v > prevViol[i]){ stats[i].limitViolations += (v - prevViol[i]); prevViol[i] = v; }
    }
    // Spredningen måles i det LEDEREN fullfører runden, ikke når alle gjør det
    // — det er det øyeblikket en seer faktisk ville sett feltet strukket ut.
    if(want.length){
      let leadLap = 0;
      for(let i=0;i<cars.length;i++) if(cars[i].lap > leadLap) leadLap = cars[i].lap;
      if(leadLap >= want[0]){
        const lap = want.shift();
        let mx = -1e9, mn = 1e9;
        for(let i=0;i<cars.length;i++){
          const rd = cars[i].raceDist;
          if(rd > mx) mx = rd;
          if(rd < mn) mn = rd;
        }
        spreadAt['lap' + lap] = +(mx - mn).toFixed(4); // i runder
      }
    }
    let allDone = true;
    for(let i=0;i<cars.length;i++) if(!cars[i].finished){ allDone = false; break; }
    if(allDone) break;
  }

  let wallHits = 0, offSteps = 0, viol = 0, liveSteps = 0;
  for(let i=0;i<stats.length;i++){
    wallHits += stats[i].wallHits;
    offSteps += stats[i].offSteps;
    viol += stats[i].limitViolations;
  }
  liveSteps = steps * cars.length;
  return {
    steps: steps,
    finished: cars.filter(function(c){ return c.finished; }).length,
    spread: spreadAt,
    wallHitsPerCar: +(wallHits / cars.length).toFixed(3),
    offFracPerCar: +(offSteps / Math.max(1, liveSteps)).toFixed(5),
    violPerCar: +(viol / cars.length).toFixed(3)
  };
}

// ── argumenter ──────────────────────────────────────────────────────────────
function parseArgs(argv){
  const o = { html:'vintage_f1.html', out:null, trials:2, laps:8, tracks:null, quick:false, slow:false, verify:false };
  for(let i=0;i<argv.length;i++){
    const a = argv[i];
    if(a === '--html') o.html = argv[++i];
    else if(a === '--out') o.out = argv[++i];
    else if(a === '--trials') o.trials = parseInt(argv[++i],10);
    else if(a === '--laps') o.laps = parseInt(argv[++i],10);
    else if(a === '--tracks') o.tracks = argv[++i].split(',').map(function(s){ return parseInt(s,10); });
    else if(a === '--quick') o.quick = true;
    else if(a === '--slow') o.slow = true;     // bruk spillets egen fullskanning
    else if(a === '--verify') o.verify = true; // sjekk at rutenettet gir samme svar
  }
  return o;
}

// Sjekker at rutenett-varianten gir BIT-identisk svar med spillets fullskanning.
// Punktene velges både tett på banelinjen (der bilene er) og langt utenfor (i
// grusen og mot veggene), fordi ringsøket må stoppe riktig i begge tilfeller.
function verifyNearest(game){
  const orig = game.nearestOnPath;
  const fast = makeFastNearest(orig);
  let checked = 0, bad = 0;
  for(let ti=0; ti<game.TRACKS.length; ti++){
    const t = game.TRACKS[ti];
    const PATH = t.PATH;
    if(!PATH){ console.log('  bane ' + ti + ' har ingen PATH – hoppet over'); continue; }
    for(let n=0;n<4000;n++){
      const base = PATH[Math.floor(Math.random()*PATH.length)];
      const spread = (n % 4 === 0) ? 400 : 60; // av og til langt utenfor banen
      const gx = base[0] + (Math.random()*2-1)*spread;
      const gy = base[1] + (Math.random()*2-1)*spread;
      const a = orig(PATH, gx, gy), b = fast(PATH, gx, gy);
      checked++;
      if(a.idx !== b.idx || a.dist !== b.dist || a.progress !== b.progress){
        bad++;
        if(bad <= 5) console.log('  AVVIK ' + t.name + ' (' + gx.toFixed(1) + ',' + gy.toFixed(1) + ') ' +
          'orig idx=' + a.idx + ' d=' + a.dist + ' | rask idx=' + b.idx + ' d=' + b.dist);
      }
    }
    console.log('  ' + t.name + ' OK (PN=' + PATH.length + ')');
  }
  console.log(bad === 0 ? 'VERIFISERT: ' + checked + ' punkter, ingen avvik.'
                        : 'FEIL: ' + bad + ' av ' + checked + ' punkter avvek.');
  return bad === 0;
}

function main(argv){
  const opts = parseArgs(argv);
  const started = Date.now();

  // PRNG installeres på global Math FØR spillet lastes, slik at alle kall inne
  // i spillkoden går gjennom den.
  const rngBox = { fn: makeRng(1) };
  Math.random = function(){ return rngBox.fn(); };

  const game = loadGame(opts.html);
  if(opts.verify){
    const ok = verifyNearest(game);
    return { verified: ok };
  }
  if(!opts.slow) game.setNearestOnPath(makeFastNearest(game.nearestOnPath));

  const trackCount = game.TRACKS.length;
  const trackIdxs = opts.tracks || Array.from({length:trackCount}, function(_,i){ return i; });
  const modes = [false, true];               // CASUAL, REALISTISK
  const diffs = opts.quick ? [1] : [1, 3];   // MIDDELS, ULTRA
  const spreadLaps = [1, 4, 8].filter(function(l){ return l <= opts.laps; });

  const results = [];
  trackIdxs.forEach(function(ti){
    modes.forEach(function(realistic){
      diffs.forEach(function(di){
        const runs = [];
        for(let t=0;t<opts.trials;t++){
          // Eget frø per (bane, modus, nivå, forsøk) — reproduserbart, men
          // ikke samme løp om og om igjen.
          rngBox.fn = makeRng(1000 + ti*131 + (realistic?7919:0) + di*29 + t*104729);
          runs.push(simulate(game, {
            trackIdx: ti, realistic: realistic, difficulty: di,
            laps: opts.laps, spreadLaps: spreadLaps, maxStepsPerLap: 9000
          }));
        }
        const avg = function(sel){
          let s = 0, n = 0;
          runs.forEach(function(r){ const v = sel(r); if(typeof v === 'number' && isFinite(v)){ s += v; n++; } });
          return n ? +(s/n).toFixed(4) : null;
        };
        const row = {
          track: game.TRACKS[ti].name,
          trackIdx: ti,
          mode: realistic ? 'REALISTISK' : 'CASUAL',
          diff: game.DIFFICULTIES[di].name,
          trials: runs.length,
          steps: avg(function(r){ return r.steps; }),
          finished: avg(function(r){ return r.finished; }),
          wallHitsPerCar: avg(function(r){ return r.wallHitsPerCar; }),
          offFracPerCar: avg(function(r){ return r.offFracPerCar; }),
          violPerCar: avg(function(r){ return r.violPerCar; })
        };
        spreadLaps.forEach(function(l){
          row['spreadLap'+l] = avg(function(r){ return r.spread['lap'+l]; });
        });
        results.push(row);
        console.log(row.track + ' / ' + row.mode + ' / ' + row.diff +
          '  spredning L1=' + row.spreadLap1 + ' L4=' + row.spreadLap4 + ' L8=' + row.spreadLap8 +
          '  vegg=' + row.wallHitsPerCar + ' utenfor=' + row.offFracPerCar + ' brudd=' + row.violPerCar);
      });
    });
  });

  const payload = {
    html: opts.html,
    laps: opts.laps,
    trials: opts.trials,
    seconds: +((Date.now()-started)/1000).toFixed(1),
    results: results
  };
  if(opts.out){
    writeFile(opts.out, JSON.stringify(payload, null, 2));
    console.log('Skrev ' + opts.out + ' (' + payload.seconds + ' s)');
  } else {
    console.log('Ferdig på ' + payload.seconds + ' s');
  }
  return payload;
}

// MERK: funksjonen heter `main`, ikke `run`. JXA har en innebygd konvensjon der
// en global funksjon ved navn `run` kalles automatisk av osascript — da kjørte
// hele simuleringen to ganger og tok dobbelt så lang tid.
main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
