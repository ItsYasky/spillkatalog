// ============================================================================
// Måler om SPILLEREN kan ta svingene uten å bremse i REALISTISK-modus.
//
//   osascript -l JavaScript test_spiller_sving.js
//   osascript -l JavaScript test_spiller_sving.js --html /tmp/annen.html
//   osascript -l JavaScript test_spiller_sving.js --tracks 0
//
// HVORFOR denne testen finnes: en runde på MONTE SPIRA ble kjørt i 20,52 s,
// mens full toppfart hele runden uten boost regnes til 21,4 s. Et snitt OVER
// toppfarten er fysisk umulig, så enten er fartstaket i svingene for høyt,
// eller noe lar bilen overstige toppfarten mer enn antatt. Spørsmålet er ikke
// om AI-en er for treg — det er om spillerens egen fysikk gir etter.
//
// Det som måles, per bane, i REALISTISK:
//
//  1. physSafe-PROFILEN. Spillerens trygge fart i en sving er
//     physSafe = PLAYER_MAX/(1+|smoothCurv|*PHYS_K), og `overRatio` straffer
//     bare fart OVER den. Ligger physSafe nær toppfarten hele runden, finnes
//     det i praksis ikke noe fartstak å bryte, og gassen kan stå i bånn.
//     MERK at physSafe leser `smoothCurv` — det SIGNERTE snittet over 21
//     punkter. Kommentaren ved computeHeadingCurv sier selv at det målet kan
//     nulle seg ut nær null i en chicane, og at `severity` ble laget nettopp
//     derfor. Testen regner ut begge, så det blir synlig om taket forsvinner
//     på steder der banen faktisk svinger skarpt.
//
//  2. EN RUNDE MED GASSEN I BÅNN. Spilleren kjøres med ArrowUp konstant nede,
//     ALDRI brems, ingen boost (Shift) og ingen rett-modus (Space), med en
//     enkel styrekontroller som sikter på kjørelinja. Kommer bilen rundt på
//     en tid i nærheten av 20,52 s, er saken avgjort: svingene koster ingenting.
//
// Øvingsmodus brukes med vilje: startPractice() setter cars=[spilleren], så
// det finnes verken slipstream eller kollisjoner som kan forurense tiden.
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
// Konstantene hentes ut av KILDEN, ikke skrevet av på nytt her. Endres de i
// spillet, følger testen etter i stedet for å måle mot en foreldet verdi.
// MERK at `const` IKKE kan kreves rett foran navnet: kilden skriver flere
// konstanter i samme erklæring (`const PLAYER_MAX_CASUAL=4.8, PLAYER_MAX_REALISTIC=6.8;`),
// så et krav om `const\s+NAVN` finner ikke den andre av dem.
function konstant(src, navn){
  const m = src.match(new RegExp('\\b' + navn + '\\s*=\\s*([0-9.]+)'));
  if(!m) throw new Error('Fant ikke konstanten ' + navn + ' i kilden.');
  return parseFloat(m[1]);
}

function makeStub(){
  const h = {
    get: function(t, p){
      if(p === 'width' || p === 'height') return 2048;
      if(p === 'style') return {};
      if(p === Symbol.toPrimitive) return function(){ return 0; };
      return function(){ return new Proxy({}, h); };
    },
    set: function(){ return true; }
  };
  return new Proxy({}, h);
}

function loadGame(path){
  const src = extractScript(readFile(path));
  const documentStub = {
    hidden: false,
    addEventListener: function(){},
    getElementById: function(){ return makeStub(); },
    createElement: function(){ return makeStub(); }
  };
  const windowStub = { location:{href:''}, addEventListener: function(){} };
  const lsMem = {};
  const localStorageStub = {
    getItem: function(k){ return Object.prototype.hasOwnProperty.call(lsMem,k) ? lsMem[k] : null; },
    setItem: function(k,v){ lsMem[k] = String(v); },
    removeItem: function(k){ delete lsMem[k]; }
  };
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
    '  set trackSel(v){ trackSel = v; },\n' +
    '  setRealistic: function(v){ REALISTIC = v; DIFFICULTIES = v ? DIFFICULTIES_REALISTIC : DIFFICULTIES_CASUAL; },\n' +
    '  startPractice: startPractice, update: update\n' +
    '};\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

function wrapPi(a){ while(a > Math.PI) a -= Math.PI*2; while(a < -Math.PI) a += Math.PI*2; return a; }

// ── 1. physSafe-profilen ────────────────────────────────────────────────────
function profil(TR, PLAYER_MAX, PHYS_K){
  const PN = TR.PN;
  let minSafe = Infinity, naerTopp = 0, minSafeSev = Infinity;
  for(let i=0;i<PN;i++){
    const safe = PLAYER_MAX/(1 + Math.abs(TR.smoothCurv[i])*PHYS_K);
    if(safe < minSafe) minSafe = safe;
    if(safe >= PLAYER_MAX*0.95) naerTopp++;
    // Samme formel, men med severity (fortegnsløs, kort vindu) i stedet — det
    // taket banen VILLE hatt om physSafe brukte målet som ikke nuller seg ut.
    const safeSev = PLAYER_MAX/(1 + TR.severity[i]*PHYS_K);
    if(safeSev < minSafeSev) minSafeSev = safeSev;
  }
  return { minSafe, minSafeSev, fracNaerTopp: naerTopp/PN };
}

// ── 1b. KREVD vs TILGJENGELIG svingrate ─────────────────────────────────────
// Den avgjørende regnestykket, og grunnen til at det ikke holder å se på
// physSafe alene: physSafe senker ALDRI farten. Den går inn i turnPenalty
// (styreutslag) og gripPenalty (hvor raskt fartsvektoren følger nesa) — men
// `MAX` røres ikke av overRatio. Står gassen i bånn, blir bilen altså liggende
// på toppfarten gjennom svingen uansett hvor mye physSafe er brutt.
//
// Da er spørsmålet rent geometrisk: for å følge en kurve med krumning k i
// fart v trengs en giringsrate paa k*v radianer per steg. Tilgjengelig rate er
// TURN_BASE*turnPenalty. Er tilgjengelig større enn krevd overalt, finnes det
// ingen sving på banen spilleren MÅ bremse for — og da er en runde raskere enn
// «full toppfart hele veien» ikke lenger et mysterium, bare aritmetikk.
//
// Krumningen regnes ut av KJØRELINJA selv (ikke smoothCurv), fordi det er den
// linja bilen faktisk skal følge, og fordi smoothCurv er det signerte maalet
// som kan nulle seg ut. Vinduet W glatter ut punktstøy.
function svingkrav(TR, PLAYER_MAX, PHYS_K, TURN_BASE, W){
  const PN = TR.PN, RL = TR.raceLine;
  // Buelengden rundt kjørelinja — gir bade teoretisk rundetid og krumning.
  const seg = new Array(PN);
  let lengde = 0;
  for(let i=0;i<PN;i++){
    const a = RL[i], b = RL[(i+1)%PN];
    seg[i] = Math.hypot(b[0]-a[0], b[1]-a[1]);
    lengde += seg[i];
  }
  const head = new Array(PN);
  for(let i=0;i<PN;i++){
    const a = RL[i], b = RL[(i+1)%PN];
    head[i] = Math.atan2(b[1]-a[1], b[0]-a[0]);
  }
  // Senterlinjas lengde til sammenligning. HVORFOR den er med: «full toppfart
  // hele runden» er bare en nedre grense hvis bilen faktisk FØLGER kjørelinja.
  // Rundetelleren leser framdrift langs PATH, så en spiller som kutter
  // svingene kjører en KORTERE vei enn kjørelinja og kan slå den teoretiske
  // tiden uten å bryte en eneste fartsgrense.
  let pathLen = 0;
  for(let i=0;i<PN;i++){
    const a = TR.PATH[i], b = TR.PATH[(i+1)%PN];
    pathLen += Math.hypot(b[0]-a[0], b[1]-a[1]);
  }
  let maksKrav = 0, mustBrake = 0, verstIdx = 0, maksRatio = 0;
  for(let i=0;i<PN;i++){
    // Total retningsendring over vinduet, delt på buelengden i samme vindu.
    const i0 = (i-W+PN)%PN, i1 = (i+W)%PN;
    let bue = 0;
    for(let k=0;k<2*W;k++) bue += seg[(i0+k)%PN];
    if(bue <= 0) continue;
    const k_ = Math.abs(wrapPi(head[i1]-head[i0]))/bue;   // rad per px
    const krav = k_*PLAYER_MAX;                            // rad per steg ved toppfart
    // Tilgjengelig rate der physSafe brytes mest: ved toppfart.
    const safe = PLAYER_MAX/(1 + Math.abs(TR.smoothCurv[i])*PHYS_K);
    const overRatio = Math.max(0, PLAYER_MAX/safe - 1);
    const tilgj = TURN_BASE/(1 + overRatio*2.4);
    if(krav > maksKrav) maksKrav = krav;
    const ratio = krav/tilgj;
    if(ratio > maksRatio){ maksRatio = ratio; verstIdx = i; }
    if(ratio > 1) mustBrake++;
  }
  return { lengde, pathLen, maksKrav, maksRatio, fracMustBrake: mustBrake/PN, verstIdx,
           teoretisk: lengde/PLAYER_MAX/60,
           teoretiskPath: pathLen/PLAYER_MAX/60,
           // Fartstaket er ikke PLAYER_MAX: linja `c.speed=min(c.speed,MAX*1.02)`
           // slipper bilen 2 % over, og slipstream gir 1+0.10. Dette er altså
           // tiden paa kjoerelinja med de takene som faktisk finnes i koden.
           medOverspeed: lengde/(PLAYER_MAX*1.02)/60,
           medSlip: lengde/(PLAYER_MAX*1.02*1.10)/60,
           // Korteste vei + de samme takene: den reelle nedre grensa.
           pathMedSlip: pathLen/(PLAYER_MAX*1.02*1.10)/60 };
}

// ── 2. runde med gassen i bånn ──────────────────────────────────────────────
// Styringen er med vilje enkel og den samme for alle baner: sikt på
// kjørelinja 11 punkter fram (samme lookAhead alle AI-nivåene bruker) og slå
// på venstre/høyre over en liten dødsone. Poenget er ikke å kjøre perfekt,
// men å vise hva som er mulig UTEN å bremse.
function flattUt(game, trackIdx, maksRunder, medBoost){
  game.trackSel = trackIdx;
  game.setRealistic(true);
  game.startPractice();
  const TR = game.TR, PN = TR.PN, c = game.cars[0];
  const keys = game.keys;
  for(const k in keys) delete keys[k];
  keys['ArrowUp'] = true;   // gassen står i bånn hele runden
  if(medBoost){
    // Slik banen faktisk spilles: Shift og Space nede også. Begge er med vilje
    // atskilte taster i spillet nettopp for at de skal kunne stå samtidig, så
    // en spiller som holder dem inne er ikke å jukse — det er å bruke reglene.
    keys['Shift'] = true;
    keys[' '] = true;
  }

  const LOOK = 11, DEAD = 0.03;
  const rundetider = [];
  let forrigeLap = c.lap, forrigeT = game.raceTime;
  let maxFart = 0, minFart = Infinity, stegUtenfor = 0, steg = 0;
  const maksSteg = maksRunder*9000;
  // Veien bilen FAKTISK kjører, målt skritt for skritt. HVORFOR den må måles:
  // «full toppfart hele runden» ble regnet ut av kjørelinjas lengde, men
  // rundetelleren leser framdrift langs PATH — følger ikke bilen kjørelinja,
  // er den teoretiske tiden regnet på en annen vei enn den som ble kjørt.
  const veilengder = [];
  let vei = 0, forrigeX = c.x, forrigeY = c.y;

  while(rundetider.length < maksRunder && steg < maksSteg){
    const li = Math.floor(c.curProg*PN);
    const [tx, ty] = TR.raceLine[(li + LOOK) % PN];
    const diff = wrapPi(Math.atan2(ty - c.y, tx - c.x) - c.angle);
    keys['ArrowLeft']  = diff < -DEAD;
    keys['ArrowRight'] = diff >  DEAD;
    game.update();
    steg++;
    vei += Math.hypot(c.x - forrigeX, c.y - forrigeY);
    forrigeX = c.x; forrigeY = c.y;
    if(c.speed > maxFart) maxFart = c.speed;
    if(c.speed < minFart) minFart = c.speed;
    if(c.offtrack) stegUtenfor++;
    if(c.lap > forrigeLap){
      rundetider.push((game.raceTime - forrigeT)/60);
      veilengder.push(vei);
      vei = 0;
      forrigeLap = c.lap; forrigeT = game.raceTime;
    }
  }
  return {
    rundetider, veilengder, maxFart, minFart,
    fracUtenfor: steg ? stegUtenfor/steg : 0,
    brudd: c.limitViolations,
    naaddeRunder: rundetider.length
  };
}

function pad(s,n){ s=String(s); return s.length>=n ? s : s+' '.repeat(n-s.length); }
function padL(s,n){ s=String(s); return s.length>=n ? s : ' '.repeat(n-s.length)+s; }

function main(argv){
  let html = 'vintage_f1.html', tracks = null;
  for(let i=0;i<argv.length;i++){
    if(argv[i] === '--html') html = argv[++i];
    else if(argv[i] === '--tracks') tracks = argv[++i].split(',').map(function(s){ return parseInt(s,10); });
  }
  const src = extractScript(readFile(html));
  const PLAYER_MAX = konstant(src, 'PLAYER_MAX_REALISTIC');
  const PHYS_K     = konstant(src, 'PHYS_K');
  const TURN_BASE  = konstant(src, 'TURN_BASE');
  const game = loadGame(html);
  const n = game.TRACKS.length;
  const idxs = tracks || Array.from({length:n}, function(_,i){ return i; });

  console.log('Spillerens svingfart i REALISTISK  (PLAYER_MAX=' + PLAYER_MAX + ', PHYS_K=' + PHYS_K + ')');
  console.log('');
  console.log('physSafe = PLAYER_MAX/(1+|smoothCurv|*PHYS_K) — taket spilleren straffes for aa bryte.');
  console.log('"% av runden naer topp" = andel av banen der taket er over 95 % av toppfarten,');
  console.log('altsaa der det i praksis ikke finnes noe fartstak i det hele tatt.');
  console.log('');
  console.log(pad('BANE',13) + padL('min physSafe',13) + padL('% naer topp',13) + padL('min m/severity',16));
  const rader = [];
  for(const ti of idxs){
    game.trackSel = ti;
    game.setRealistic(true);
    game.startPractice();
    const p = profil(game.TR, PLAYER_MAX, PHYS_K);
    rader.push({navn: game.TRACKS[ti].name, ti, p});
    console.log(pad(game.TRACKS[ti].name,13)
      + padL(p.minSafe.toFixed(2) + ' (' + (p.minSafe/PLAYER_MAX*100).toFixed(0) + '%)',13)
      + padL((p.fracNaerTopp*100).toFixed(0) + '%',13)
      + padL(p.minSafeSev.toFixed(2) + ' (' + (p.minSafeSev/PLAYER_MAX*100).toFixed(0) + '%)',16));
  }

  console.log('');
  console.log('KREVD vs TILGJENGELIG svingrate ved toppfart. physSafe senker aldri farten,');
  console.log('bare styreutslag og grep, saa staar gassen i baann ligger bilen paa 6.8 uansett.');
  console.log('"% maa bremse" = andel av banen der krevd giringsrate er STOERRE enn den');
  console.log('tilgjengelige — altsaa de eneste stedene spilleren fysisk MAA ned i fart.');
  console.log('"teoretisk" = kjoerelinjas lengde delt paa toppfarten: full gass hele runden.');
  console.log('');
  console.log(pad('BANE',13) + padL('kjlinje px',11) + padL('senter px',11) + padL('teoretisk',11) + padL('verste krav/tilgj',19) + padL('% maa bremse',14));
  const svingrader = [];
  for(const ti of idxs){
    game.trackSel = ti;
    game.setRealistic(true);
    game.startPractice();
    const s = svingkrav(game.TR, PLAYER_MAX, PHYS_K, TURN_BASE, 6);
    svingrader.push({navn: game.TRACKS[ti].name, s});
    console.log(pad(game.TRACKS[ti].name,13)
      + padL(s.lengde.toFixed(0),11)
      + padL(s.pathLen.toFixed(0),11)
      + padL(s.teoretisk.toFixed(2)+' s',11)
      + padL(s.maksRatio.toFixed(2),19)
      + padL((s.fracMustBrake*100).toFixed(1)+'%',14));
  }

  console.log('');
  console.log('NEDRE GRENSER for rundetid, med de fartstakene som faktisk staar i koden:');
  console.log('');
  console.log(pad('BANE',13) + padL('kjlinje',10) + padL('+2% cap',10) + padL('+slipstr',10) + padL('senter+begge',14));
  for(const r of svingrader){
    console.log(pad(r.navn,13)
      + padL(r.s.teoretisk.toFixed(2),10)
      + padL(r.s.medOverspeed.toFixed(2),10)
      + padL(r.s.medSlip.toFixed(2),10)
      + padL(r.s.pathMedSlip.toFixed(2),14));
  }

  console.log('');
  console.log('Runde med gassen i baann, aldri brems, ingen boost, ingen rett-modus:');
  console.log('');
  console.log(pad('BANE',13) + padL('beste runde',13) + padL('teoretisk',11) + padL('kjoert vei',11) + padL('vs kjlinje',11) + padL('% utenfor',11) + padL('brudd',7));
  for(let j=0;j<idxs.length;j++){
    const ti = idxs[j];
    const r = flattUt(game, ti, 3);
    let beste = null, besteVei = null;
    for(let k=0;k<r.rundetider.length;k++){
      if(beste===null || r.rundetider[k]<beste){ beste=r.rundetider[k]; besteVei=r.veilengder[k]; }
    }
    const ref = svingrader[j].s;
    console.log(pad(game.TRACKS[ti].name,13)
      + padL(beste===null ? 'kom ikke rundt' : beste.toFixed(2)+' s',13)
      + padL(ref.teoretisk.toFixed(2)+' s',11)
      + padL(besteVei===null?'-':besteVei.toFixed(0),11)
      + padL(besteVei===null?'-':((besteVei/ref.lengde-1)*100).toFixed(1)+'%',11)
      + padL((r.fracUtenfor*100).toFixed(1)+'%',11)
      + padL(String(r.brudd),7));
  }
  console.log('');
  console.log('Samme runde, men MED boost (Shift) og rett-modus (Space) inne — slik banen spilles:');
  console.log('');
  console.log(pad('BANE',13) + padL('beste runde',13) + padL('teoretisk',11) + padL('vs teoretisk',14) + padL('maks fart',11) + padL('% utenfor',11) + padL('brudd',7));
  for(let j=0;j<idxs.length;j++){
    const ti = idxs[j];
    const r = flattUt(game, ti, 3, true);
    let beste = null;
    for(let k=0;k<r.rundetider.length;k++) if(beste===null || r.rundetider[k]<beste) beste=r.rundetider[k];
    const ref = svingrader[j].s;
    console.log(pad(game.TRACKS[ti].name,13)
      + padL(beste===null ? 'kom ikke rundt' : beste.toFixed(2)+' s',13)
      + padL(ref.teoretisk.toFixed(2)+' s',11)
      + padL(beste===null?'-':((beste/ref.teoretisk-1)*100).toFixed(1)+'%',14)
      + padL(r.maxFart.toFixed(2),11)
      + padL((r.fracUtenfor*100).toFixed(1)+'%',11)
      + padL(String(r.brudd),7));
  }

  console.log('');
  console.log('Toppfarten er ' + PLAYER_MAX + '. Er "min fart" nær den, er svingene gratis.');
}

main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
