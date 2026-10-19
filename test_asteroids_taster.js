// ============================================================================
// Headless test for STEG B: taster som ikke henger, i asteroids.html.
//
// Kjør fra spillkatalog-mappen:
//   osascript -l JavaScript test_asteroids_taster.js
//
// Denne testen laster HELE spill-scriptet fra asteroids.html inn i et
// minimalt stub-miljø (falsk canvas/document/window), slik at den tester den
// ekte keydown/keyup-koden og den ekte update()-logikken — ikke en kopi.
// Canvas-kallene er no-ops: vi måler spilltilstand (ship.angle, ship.vx,
// keys-tabellen), ikke piksler.
//
// Math.random() er låst til en fast verdi så testen er deterministisk —
// ellers kunne hyperrom-sjansen på 12% drepe skipet midt i testen og
// skjule det vi egentlig måler.
//
// eval'en skjer på TOPPNIVÅ fordi JavaScriptCore bare gjør globale
// let/const/function fra en eval() synlige for resten av scriptet når
// eval-kallet selv står på toppnivå.
// ============================================================================
ObjC.import('Foundation');

function readFile(path){
  const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if(data === null) throw new Error('Kunne ikke lese filen: ' + path + ' (kjør testen fra spillkatalog-mappen)');
  return ObjC.unwrap(data);
}

// --- minimalt stub-miljø ----------------------------------------------------
function lagFalskCtx(){
  const noop=function(){};
  const c={};
  ['fillRect','clearRect','beginPath','arc','ellipse','fill','stroke','moveTo',
   'lineTo','closePath','save','restore','translate','rotate','scale','rect',
   'fillText','strokeText','drawImage','setTransform','setLineDash','clip',
   'strokeRect','arcTo','quadraticCurveTo','bezierCurveTo'
  ].forEach(function(n){ c[n]=noop; });
  c.measureText=function(){ return {width:0}; };
  c.createLinearGradient=function(){ return {addColorStop:noop}; };
  return c;
}

var __lyttere={};
function paa(bag,type,fn){ (bag[type]=bag[type]||[]).push(fn); }
var __vinduLyttere={};

var document={
  hidden:false,
  addEventListener:function(t,fn){ paa(__lyttere,t,fn); },
  getElementById:function(){ return { width:480, height:600, getContext:lagFalskCtx }; },
  createElement:function(){ return { width:0, height:0, getContext:lagFalskCtx }; },
};
var window={
  addEventListener:function(t,fn){ paa(__vinduLyttere,t,fn); },
  location:{ href:'' },
};
function requestAnimationFrame(cb){} // vi kaller update() selv, ingen auto-løkke
var performance={ now:function(){ return 0; } };

Math.random=function(){ return 0.99; }; // deterministisk: 0.99 > HYPER_DEATH_CHANCE, så hyperrom dreper aldri her

function send(type,ev){ (__lyttere[type]||[]).forEach(function(fn){ fn(ev); }); }
function sendVindu(type,ev){ (__vinduLyttere[type]||[]).forEach(function(fn){ fn(ev); }); }
function tast(code,key,repeat){
  return { code:code, key:key, repeat:!!repeat, preventDefault:function(){} };
}

function hentScript(html){
  const a=html.indexOf('<script>'), b=html.lastIndexOf('<\/script>');
  if(a<0||b<a) throw new Error('Fant ikke <script>-blokken i asteroids.html');
  const src=html.slice(a+'<script>'.length, b);
  // `let`/`const` inne i en eval() holder seg i eval-scopet og blir aldri
  // synlige for resten av testen (bare funksjonsdeklarasjoner lekker ut).
  // Vi gjør derfor om deklarasjonene som står helt til venstre — altså
  // scriptets toppnivå — til `var`, som lekker ut som globale variabler.
  // Deklarasjoner inne i funksjoner er indenterte og røres ikke, så
  // spill-logikken er bit for bit den samme som i nettleseren.
  const antall=(src.match(/^(let|const)\s/gm)||[]).length;
  if(antall<10) throw new Error('Fant bare '+antall+' toppnivå-deklarasjoner — har formateringen i asteroids.html endret seg?');
  return src.replace(/^(let|const)\s/gm,'var ');
}

// Filen kan overstyres med ASTEROIDS_FILE=... for å kjøre testen mot en
// kopi (brukes til å bekrefte at testen faktisk fanger den gamle feilen).
var __fil = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('ASTEROIDS_FILE')) || 'asteroids.html';
eval(hentScript(readFile(__fil)));

// --- selve testene ----------------------------------------------------------
function steg(n){ for(let i=0;i<n;i++) update(); }
function antallTasterNede(){
  let n=0;
  for(const k in keys) if(keys[k]) n++;
  return n;
}

function testShiftSlipp(){
  // Scenarioet som var ødelagt: hold A, trykk Shift (hyperrom), slipp A.
  // Nettleseren sender keyup med key:'A' (STOR bokstav, fordi Shift var
  // nede) mens keydown kom som key:'a'. Med e.key ble keys['a'] aldri
  // nullstilt, og skipet roterte videre for alltid.
  resetGame();
  send('keydown', tast('KeyA','a'));
  const foerRotasjon = ship.angle;
  steg(5);
  const roterteMensHoldt = Math.abs(ship.angle - foerRotasjon) > 1e-9;

  send('keydown', tast('ShiftLeft','Shift'));
  send('keyup',   tast('KeyA','A'));      // <- stor bokstav: selve fellen
  send('keyup',   tast('ShiftLeft','Shift'));

  const vinkelEtterSlipp = ship.angle;
  steg(20);
  const roterteEtterSlipp = Math.abs(ship.angle - vinkelEtterSlipp) > 1e-9;

  return {
    roterteMensHoldt: roterteMensHoldt,
    roterteEtterSlipp: roterteEtterSlipp,
    tasterNede: antallTasterNede(),
    ok: roterteMensHoldt && !roterteEtterSlipp && antallTasterNede()===0,
  };
}

function testCapsLock(){
  // Samme felle uten Shift: med Caps Lock på kommer både keydown og keyup
  // som 'W'. Med e.code er det 'KeyW' begge veier.
  resetGame();
  send('keydown', tast('KeyW','W'));
  steg(5);
  const gassVirket = ship.thrusting === true;
  send('keyup', tast('KeyW','W'));
  steg(1);
  const gassSluppet = ship.thrusting === false;
  return { gassVirket:gassVirket, gassSluppet:gassSluppet, ok: gassVirket && gassSluppet };
}

function testBlur(){
  // Mister vinduet fokus mens W holdes, går keyup til det NYE vinduet og
  // aldri til oss. Uten opprydding ved blur ville gassen stått på for alltid.
  resetGame();
  send('keydown', tast('KeyW','w'));
  steg(5);
  const gassFoer = ship.thrusting === true;
  const fartFoer = Math.hypot(ship.vx, ship.vy);

  sendVindu('blur', {});
  const gassEtterBlur = ship.thrusting === false;
  steg(10);
  const fartEtter = Math.hypot(ship.vx, ship.vy);
  // friksjonen (0.988/steg) skal nå bremse skipet, ikke gassen akselerere det
  const bremser = fartEtter < fartFoer;

  return {
    gassFoer:gassFoer, gassEtterBlur:gassEtterBlur,
    fartFoer:fartFoer.toFixed(3), fartEtter:fartEtter.toFixed(3), bremser:bremser,
    tasterNede: antallTasterNede(),
    ok: gassFoer && gassEtterBlur && bremser && antallTasterNede()===0,
  };
}

function testSkjultFane(){
  resetGame();
  send('keydown', tast('ArrowRight','ArrowRight'));
  steg(3);
  document.hidden=true;
  send('visibilitychange', {});
  const nede = antallTasterNede();
  document.hidden=false;
  return { tasterNede:nede, ok: nede===0 };
}

function testRepeatHyperrom(){
  // Autorepeat skal ikke utløse hyperrom om og om igjen mens Shift holdes.
  // Hyperrom har sin egen cooldown-sperre, så vi MÅ nulle den mellom
  // trykkene — ellers er det cooldownen som stopper repeat-kallene, og
  // testen ville passert uten at e.repeat-sjekken fins i det hele tatt.
  resetGame();
  send('keydown', tast('ShiftLeft','Shift'));
  const etterEkteTrykk = hyperCooldown;   // ekte trykk: skal fyre, setter cooldown
  hyperCooldown = 0;                      // fjern sperren som ellers skjuler feilen
  send('keydown', tast('ShiftLeft','Shift',true));
  const etterRepeat = hyperCooldown;      // autorepeat: skal IKKE fyre, cooldown forblir 0
  return {
    etterEkteTrykk:etterEkteTrykk, etterRepeat:etterRepeat,
    ok: etterEkteTrykk>0 && etterRepeat===0,
  };
}

function run(argv){
  const t=[
    ['Hold A, Shift, slipp A (stor bokstav)', testShiftSlipp()],
    ['Caps Lock: W ned og opp som stor bokstav', testCapsLock()],
    ['blur mens W holdes', testBlur()],
    ['fane skjules mens pil holdes', testSkjultFane()],
    ['autorepeat utløser ikke hyperrom flere ganger', testRepeatHyperrom()],
  ];
  let out='ASTEROIDER taster — headless test\n';
  let alle=true;
  t.forEach(function(p){
    const navn=p[0], r=p[1];
    if(!r.ok) alle=false;
    out+='  ['+(r.ok?'OK  ':'FEIL')+'] '+navn+'\n';
    for(const k in r) if(k!=='ok') out+='          '+k+': '+r[k]+'\n';
  });
  out += alle ? 'RESULTAT: PASS\n' : 'RESULTAT: FAIL\n';
  console.log(out);
  return alle ? 'PASS' : 'FAIL';
}
