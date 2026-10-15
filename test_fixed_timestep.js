// ============================================================================
// Headless test for STEG A: fast tidssteg (akkumulator) i vintage_f1.html.
//
// Dette miljøet har ingen `node`-binær installert. JavaScriptCore via
// macOS-verktøyet `osascript -l JavaScript` er den nærmeste tilgjengelige
// erstatningen: samme type JS-motor som kjører selve spillet i en nettleser,
// ingen ekstra avhengigheter, og kjøres headless fra terminalen akkurat som
// en node-test ville gjort. Kjør testen (fra spillkatalog-mappen, der
// vintage_f1.html ligger) med:
//
//   osascript -l JavaScript test_fixed_timestep.js
//
// Testen henter den EKTE akkumulator-steppingen rett ut av vintage_f1.html
// (alt mellom "const STEP_MS" og den siste "requestAnimationFrame(loop);"),
// i stedet for å skrive den om på nytt — da bekrefter testen den faktiske
// koden som kjører i spillet, ikke en kopi som kan komme ut av sync med den.
// update()/draw()/requestAnimationFrame/document stubbes minimalt, siden
// selve spill-logikken (fysikk/AI/canvas) ikke er relevant for dette steget
// — det som testes er KUN at update() kalles et fast antall ganger per
// virkelig sekund, uansett hvilken frametid (skjerm-Hz) som brukes.
//
// Alt dette gjøres på TOPPNIVÅ i filen (ikke inni run()), fordi
// JavaScriptCore bare lar globale let/const/function-deklarasjoner fra en
// eval() bli synlige/gjenbrukbare senere i scriptet når eval-kallet selv
// skjer på toppnivå — kaller man eval() inne i en funksjon er bindingene
// bare synlige INNE i den eval-kalte koden selv, ikke fra resten av
// programmet. Derfor leser/ekstraherer/eval'er vi her på toppnivå, slik at
// run() nedenfor trygt kan lese og nullstille loop()-sin interne tilstand
// (lastFrameT/accumulator) mellom hver simulerte skjermfrekvens.
// ============================================================================
ObjC.import('Foundation');

function readFile(path){
  const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if(data === null) throw new Error('Kunne ikke lese filen: ' + path + ' (kjør testen fra spillkatalog-mappen)');
  return ObjC.unwrap(data);
}

function extractStepLogic(html){
  const start = html.indexOf('const STEP_MS');
  if(start < 0) throw new Error('Fant ikke "const STEP_MS" i vintage_f1.html — har loop()-koden blitt flyttet/endret?');
  const marker = 'requestAnimationFrame(loop);';
  const lastIdx = html.lastIndexOf(marker);
  if(lastIdx < start) throw new Error('Fant ikke avsluttende "requestAnimationFrame(loop);" etter STEP_MS.');
  return html.slice(start, lastIdx + marker.length);
}

// --- minimale globale stubs som den ekte loop()-koden rører ved ---
var updateCallCount = 0;
function update(){ updateCallCount++; }
function draw(){}
// vi driver "klokken" selv (manuelle t-verdier i run() under), så en ekte
// requestAnimationFrame-planlegging er ikke nødvendig — bare la kallet
// eksistere som et no-op så loop() ikke kaster en feil når den kalles.
function requestAnimationFrame(cb){}
var document = { hidden:false, addEventListener:function(){} };

// henter den ekte akkumulator-koden fra vintage_f1.html og eval'er den HER,
// på selve toppnivået i scriptet — dette definerer de ekte globale
// bindingene STEP_MS, MAX_STEPS_PER_FRAME, lastFrameT, accumulator og
// loop(), tilgjengelig for run()/simulate() lenger ned.
var __html = readFile('vintage_f1.html');
var __stepLogicSrc = extractStepLogic(__html);
eval(__stepLogicSrc);

function simulate(dtMs, simSeconds){
  // nullstiller loop()-sin interne tilstand (disse let-bindingene ble gjort
  // globalt synlige av toppnivå-eval'en over) og telleren vår, slik at hver
  // simulerte skjermfrekvens starter helt likt.
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
  const PASS = maxDiff <= 1;

  let out = 'Fast tidssteg — headless test (' + SIM_SECONDS + ' simulerte sekunder)\n';
  results.forEach(r=>{ out += '  ' + r.label + ' (dt=' + r.dt + 'ms): ' + r.calls + ' update()-kall (= raceTime)\n'; });
  out += 'Forventet (60 update()/s uansett Hz): ~' + expected + '\n';
  out += 'Maks avvik mellom skjermfrekvenser: ' + maxDiff + ' steg\n';
  out += PASS
    ? 'RESULTAT: PASS — alle skjermfrekvenser er innenfor ett steg av hverandre.\n'
    : 'RESULTAT: FAIL — avvik > 1 steg, undersøk akkumulator-logikken i loop().\n';
  console.log(out);
  return PASS ? 'PASS' : 'FAIL';
}
