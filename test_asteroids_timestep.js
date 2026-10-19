// ============================================================================
// Headless test for STEG A: fast tidssteg (akkumulator) i asteroids.html.
//
// Dette miljøet har ingen `node`-binær. JavaScriptCore via macOS-verktøyet
// `osascript -l JavaScript` er den nærmeste tilgjengelige erstatningen: samme
// type JS-motor som kjører spillet i en nettleser, ingen avhengigheter, og
// kjøres headless fra terminalen. Kjør testen fra spillkatalog-mappen:
//
//   osascript -l JavaScript test_asteroids_timestep.js
//
// Testen henter den EKTE akkumulator-steppingen rett ut av asteroids.html
// (alt mellom "const STEP_MS" og den siste "requestAnimationFrame(loop);"),
// i stedet for å skrive den om på nytt — da bekrefter testen den faktiske
// koden som kjører i spillet, ikke en kopi som kan komme ut av sync.
// update()/draw()/requestAnimationFrame/document stubbes minimalt, siden
// selve spill-logikken ikke er relevant her: det som testes er KUN at
// update() kalles et fast antall ganger per virkelig sekund, uansett
// frametid (skjerm-Hz).
//
// Alt dette gjøres på TOPPNIVÅ i filen (ikke inni run()), fordi
// JavaScriptCore bare lar globale let/const/function-deklarasjoner fra en
// eval() bli synlige senere i scriptet når eval-kallet selv skjer på
// toppnivå. Derfor leser/eval'er vi her, slik at run() nedenfor trygt kan
// nullstille loop()-sin interne tilstand (lastFrameT/accumulator) mellom
// hver simulerte skjermfrekvens.
// ============================================================================
ObjC.import('Foundation');

function readFile(path){
  const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if(data === null) throw new Error('Kunne ikke lese filen: ' + path + ' (kjør testen fra spillkatalog-mappen)');
  return ObjC.unwrap(data);
}

function extractStepLogic(html){
  const start = html.indexOf('const STEP_MS');
  if(start < 0) throw new Error('Fant ikke "const STEP_MS" i asteroids.html — har loop()-koden blitt flyttet/endret?');
  const marker = 'requestAnimationFrame(loop);';
  const lastIdx = html.lastIndexOf(marker);
  if(lastIdx < start) throw new Error('Fant ikke avsluttende "requestAnimationFrame(loop);" etter STEP_MS.');
  return html.slice(start, lastIdx + marker.length);
}

// --- minimale globale stubs som den ekte loop()-koden rører ved ---
var updateCallCount = 0;
function update(){ updateCallCount++; }
function draw(){}
// vi driver "klokken" selv (manuelle t-verdier i simulate() under), så ekte
// rAF-planlegging er ikke nødvendig — bare la kallet eksistere som no-op.
function requestAnimationFrame(cb){}
var document = { hidden:false, addEventListener:function(){} };

var __html = readFile('asteroids.html');
eval(extractStepLogic(__html));

function simulate(dtMs, simSeconds){
  // nullstiller loop()-sin interne tilstand (gjort globalt synlig av
  // toppnivå-eval'en over) så hver skjermfrekvens starter helt likt.
  lastFrameT = null;
  accumulator = 0;
  updateCallCount = 0;

  const totalMs = simSeconds * 1000;
  let t = 0;
  while(t <= totalMs){
    loop(t);
    t += dtMs;
  }
  return updateCallCount;
}

// Egen sjekk: etter en lang pause (fanen skjult) skal tapt tid IKKE spilles
// inn som et byks av update()-steg.
function testLangPause(){
  lastFrameT = null; accumulator = 0; updateCallCount = 0;
  loop(0);
  loop(16.7);
  const foer = updateCallCount;
  loop(16.7 + 5000); // 5 sekunders "borte"-tid i ett sprang
  const bykset = updateCallCount - foer;
  return bykset;
}

function run(argv){
  const SIM_SECONDS = 60;
  // 16.7ms ≈ 60Hz (skjermen spillet er tunet for), 8.3ms ≈ 120Hz, 6.9ms ≈ 144Hz
  const scenarios = [
    { label:'60Hz',  dt:16.7 },
    { label:'120Hz', dt:8.3  },
    { label:'144Hz', dt:6.9  },
  ];

  const results = [];
  for(let i=0;i<scenarios.length;i++){
    const s = scenarios[i];
    results.push({ label:s.label, dt:s.dt, calls:simulate(s.dt, SIM_SECONDS) });
  }

  let maxCalls = -Infinity, minCalls = Infinity;
  results.forEach(r=>{ if(r.calls>maxCalls) maxCalls=r.calls; if(r.calls<minCalls) minCalls=r.calls; });
  const maxDiff = maxCalls - minCalls;
  const expected = SIM_SECONDS * 60; // 3600 update()-kall per 60 reelle sekunder, uansett skjerm-Hz
  const bykset = testLangPause();

  const okHz = maxDiff <= 1;
  const okPause = bykset <= 1;
  const PASS = okHz && okPause;

  let out = 'ASTEROIDER fast tidssteg — headless test (' + SIM_SECONDS + ' simulerte sekunder)\n';
  results.forEach(r=>{ out += '  ' + r.label + ' (dt=' + r.dt + 'ms): ' + r.calls + ' update()-kall\n'; });
  out += 'Forventet (60 update()/s uansett Hz): ~' + expected + '\n';
  out += 'Maks avvik mellom skjermfrekvenser: ' + maxDiff + ' steg -> ' + (okHz?'OK':'FEIL') + '\n';
  out += 'Byks etter 5s skjult fane: ' + bykset + ' update()-steg -> ' + (okPause?'OK':'FEIL') + '\n';
  out += PASS
    ? 'RESULTAT: PASS\n'
    : 'RESULTAT: FAIL — undersøk akkumulator-logikken i loop().\n';
  console.log(out);
  return PASS ? 'PASS' : 'FAIL';
}
