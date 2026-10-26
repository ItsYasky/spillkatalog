// ============================================================================
// Geometrilås for RUNDE 4 i vintage_f1.html.
//
//   osascript -l JavaScript test_banegeometri.js --out geo_foer.json
//   osascript -l JavaScript test_banegeometri.js --mot geo_foer.json
//   osascript -l JavaScript test_banegeometri.js --html /tmp/annen.html --mot geo_foer.json
//
// HVORFOR DENNE FINNES
// Runde 4 er en ren PYNTERUNDE: hver bane skal bli gjenkjennelig på et
// skjermbilde, men formen på banen skal ikke flytte seg én piksel. Det er en
// farlig kombinasjon, fordi pynten bygges i samme funksjon som geometrien og
// leser de samme arrayene. Et uhell som å kalle den nye seedede PRNG-en i en
// rekkefølge som forskyver `Math.random`-strømmen, eller å røre `cfg.TW` for å
// få en farge til å sitte, ville flyttet veggen og kollisjonen uten at noe
// annet klaget.
//
// Derfor låses de syv tallsettene fysikken og AI-en faktisk leser:
//   PATH, heading, smoothCurv, severity, raceLine, wallOffsArr, straightZones
// Hvert av dem rundes til 3 desimaler og hashes med FNV-1a per bane. Etter
// hvert steg i runde 4 skal hashen være bit-identisk. Er den ikke det, er
// geometrien endret, og det må rettes før steget er ferdig.
//
// MERK at 3 desimaler er med vilje, ikke slurv. Tallene er piksler og
// radianer i størrelsesorden 1e3 til 1e-3, og en ren omskriving av tegnekode
// skal gi BIT-identiske tall — avrundingen er bare der for å gjøre hashen
// lesbar og stabil mot tekstformatering, ikke for å gi slingringsmonn.
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

// Tegnekallene har ingenting å si her — proxyen svarer no-op på alt og
// returnerer seg selv, slik at kjeder som createLinearGradient().addColorStop()
// går gjennom uten spesialtilfeller.
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
    'return { get TRACKS(){ return TRACKS; } };\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

// FNV-1a over tekst. Valgt fordi den er fire linjer, ikke trenger noe
// bibliotek, og er stabil på tvers av kjøringer — vi skal oppdage ENDRING, og
// trenger ingen kryptografisk styrke til det.
function fnv1a(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

// -0 og 0 skriver seg ulikt med toFixed, og en ren omskriving av tegnekode kan
// snu fortegnet på en nullverdi uten at noe er galt. Normaliseres derfor bort.
function r3(v){
  if(typeof v !== 'number' || !isFinite(v)) return String(v);
  const s = v.toFixed(3);
  return s === '-0.000' ? '0.000' : s;
}

function hashNums(arr){
  if(arr == null) return 'null';
  const parts = [];
  for(let i=0;i<arr.length;i++){
    const v = arr[i];
    if(Array.isArray(v)) parts.push(v.map(r3).join(','));
    else parts.push(r3(v));
  }
  return fnv1a(parts.join(';'));
}

function hashZones(zones){
  if(zones == null) return 'null';
  // Sonene er objekter {a,b} (normaliserte rundeposisjoner). Feltnavnene
  // skrives med for at en omdøping skal slå ut som en endring, ikke som
  // stilltiende like tall.
  return fnv1a(zones.map(function(z){
    return Object.keys(z).sort().map(function(k){ return k + '=' + r3(z[k]); }).join(',');
  }).join(';'));
}

function geometri(game){
  const ut = {};
  game.TRACKS.forEach(function(t){
    ut[t.name] = {
      PN: t.PN,
      TW: t.TW,
      walls: !!t.walls,
      soner: t.straightZones.length,
      PATH: hashNums(t.PATH),
      heading: hashNums(t.heading),
      smoothCurv: hashNums(t.smoothCurv),
      severity: hashNums(t.severity),
      raceLine: hashNums(t.raceLine),
      wallOffsArr: hashNums(t.wallOffsArr),
      straightZones: hashZones(t.straightZones)
    };
  });
  return ut;
}

// ── kjøring ─────────────────────────────────────────────────────────────────
function argv(){
  const a = {};
  const raw = (typeof $ !== 'undefined' && $.NSProcessInfo)
    ? ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments).slice(4)
    : [];
  for(let i=0;i<raw.length;i++){
    if(raw[i].slice(0,2) === '--') a[raw[i].slice(2)] = (raw[i+1] && raw[i+1].slice(0,2) !== '--') ? raw[++i] : true;
  }
  return a;
}

(function(){
  const a = argv();
  const htmlPath = a.html || 'vintage_f1.html';
  const game = loadGame(htmlPath);
  const nå = geometri(game);
  const navn = Object.keys(nå);

  let linjer = [];
  linjer.push('GEOMETRILÅS — ' + htmlPath);
  linjer.push('baner: ' + navn.length);
  linjer.push('');

  let avvik = 0;
  if(a.mot){
    const før = JSON.parse(readFile(a.mot));
    const alle = Object.keys(før).concat(navn.filter(function(n){ return !(n in før); }));
    const sett = {};
    alle.forEach(function(n){
      if(sett[n]) return; sett[n] = true;
      const f = før[n], e = nå[n];
      if(!f){ linjer.push('NY BANE      ' + n); avvik++; return; }
      if(!e){ linjer.push('BANE BORTE   ' + n); avvik++; return; }
      const feil = Object.keys(f).filter(function(k){ return String(f[k]) !== String(e[k]); });
      if(feil.length){
        avvik++;
        linjer.push('ENDRET       ' + n);
        feil.forEach(function(k){ linjer.push('               ' + k + ': ' + f[k] + ' -> ' + e[k]); });
      } else {
        linjer.push('uendret      ' + n);
      }
    });
    linjer.push('');
    linjer.push(avvik === 0
      ? 'RESULTAT: GEOMETRIEN ER UENDRET for alle ' + navn.length + ' baner.'
      : 'RESULTAT: ' + avvik + ' bane(r) har ENDRET GEOMETRI — må rettes før steget er ferdig.');
  } else {
    navn.forEach(function(n){
      const g = nå[n];
      linjer.push(n.padEnd(12) + ' PN=' + String(g.PN).padStart(4) + ' TW=' + String(g.TW).padStart(2) +
        ' soner=' + g.soner + '  ' + g.PATH + ' ' + g.heading + ' ' + g.smoothCurv + ' ' +
        g.severity + ' ' + g.raceLine + ' ' + g.wallOffsArr + ' ' + g.straightZones);
    });
  }

  if(a.out){ writeFile(a.out, JSON.stringify(nå, null, 1)); linjer.push('skrevet: ' + a.out); }
  console.log(linjer.join('\n'));
  if(avvik) throw new Error('Geometrien er endret.');
})();
