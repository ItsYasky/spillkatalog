// ============================================================================
// Headless test for STEG D: kontrast (D1) og topp 10 med initialer (D2).
//
// Kjør fra spillkatalog-mappen:
//   osascript -l JavaScript test_asteroids_topp10.js
//
// Spill-scriptet lastes flere ganger, med ulike localStorage-stubber, for å
// treffe hver feilsituasjon lagringen må tåle. Det er trygt fordi
// toppnivå-deklarasjonene gjøres om til `var`, og `var` kan redeklareres.
// eval()-kallene MÅ stå på toppnivå for at spillets globale variabler skal
// bli synlige for testen (JavaScriptCore holder let/const inne i eval-scopet).
// ============================================================================
ObjC.import('Foundation');

function readFile(path){
  const data = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if(data === null) throw new Error('Kunne ikke lese filen: ' + path + ' (kjør testen fra spillkatalog-mappen)');
  return ObjC.unwrap(data);
}

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
// Lytterne samles opp så vi kan sende inn ekte tastehendelser i scenario 7.
// MERK: hver eval registrerer et nytt sett lyttere, og siden toppnivå-
// variablene er globale (var) ville to sett behandlet samme tastetrykk to
// ganger. Derfor nullstilles __lyttere rett før den eval'en vi sender
// hendelser til.
var __lyttere={};
var document={
  hidden:false,
  addEventListener:function(t,fn){ (__lyttere[t]=__lyttere[t]||[]).push(fn); },
  getElementById:function(){ return { width:480, height:600, getContext:lagFalskCtx }; },
  createElement:function(){ return { width:0, height:0, getContext:lagFalskCtx }; },
};
var window={ addEventListener:function(){}, location:{ href:'' } };
function send(type,ev){ (__lyttere[type]||[]).forEach(function(fn){ fn(ev); }); }
function tast(code,key,repeat){ return { code:code, key:key, repeat:!!repeat, preventDefault:function(){} }; }
function requestAnimationFrame(cb){}
var performance={ now:function(){ return 0; } };
var __seed=42;
Math.random=function(){ __seed=(__seed*1103515245+12345)&0x7fffffff; return __seed/0x7fffffff; };

// Nøkkelen skrives med vilje ut i testen også, så en endring i spillet uten
// endring her blir fanget (se sjekken i scenario 1).
var NOKKEL='arkade_asteroider_v1';

// localStorage-stub. `kasterLes`/`kasterSkriv` etterligner privat modus,
// avslåtte cookies og full kvote, der selve oppslaget kaster.
function lagLager(opts){
  opts=opts||{};
  const data={};
  if(opts.innhold!==undefined) data[NOKKEL]=opts.innhold;
  return {
    getItem:function(k){
      if(opts.kasterLes) throw new Error('lagring blokkert');
      return Object.prototype.hasOwnProperty.call(data,k) ? data[k] : null;
    },
    setItem:function(k,v){
      if(opts.kasterSkriv) throw new Error('lagring blokkert');
      data[k]=v;
    },
    _data:data,
  };
}

function hentScript(html){
  const a=html.indexOf('<script>'), b=html.lastIndexOf('<\/script>');
  if(a<0||b<a) throw new Error('Fant ikke <script>-blokken i asteroids.html');
  return html.slice(a+'<script>'.length, b).replace(/^(let|const)\s/gm,'var ');
}

var __fil = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('ASTEROIDS_FILE')) || 'asteroids.html';
var __raa = readFile(__fil);
var __src = hentScript(__raa);

// ── Scenario 1: tomt lager, 12 resultater inn ───────────────────────────────
var localStorage = lagLager({});
eval(__src);
var s1_noekkelStemmer = (LAGER_NOKKEL===NOKKEL);
var s1_startListeTom  = (listeFor(MODUS).length===0);
var s1_besteTom       = (bestePoeng()===0);
// legger inn 12 resultater i stigende rekkefølge, så de SISTE er de beste —
// da må innsettingen flytte dem oppover og kaste de to dårligste
for(var i=1;i<=12;i++){ settInnRekord('P'+(i<10?'0':'')+i, i*1000, i); }
// Alt som skal rapporteres MÅ fanges her og nå. Scenarioene under laster
// spillet på nytt og nullstiller de globale variablene, så et kall som
// bestePoeng() utsatt til rapporten ville lest siste scenario i stedet.
var s1_liste = listeFor(MODUS).slice();
var s1_beste = bestePoeng();
var s1_lagret = JSON.parse(localStorage._data[NOKKEL]);

// ── Scenario 2: lesing kaster (privat modus) ────────────────────────────────
var localStorage = lagLager({ kasterLes:true, kasterSkriv:true });
var s2_feil=null, s2_statusEtter=null, s2_poengEtter=null;
try {
  eval(__src);
  resetGame();
  for(var i=0;i<120;i++) update();
  settInnRekord('ABC',5000,3);   // skriving kaster også — skal svelges
  s2_statusEtter=state;
  s2_poengEtter=score;
} catch(e){ s2_feil=String(e); }

// ── Scenario 3: ugyldig JSON i nøkkelen ─────────────────────────────────────
var localStorage = lagLager({ innhold:'{dette er ikke json!!' });
var s3_feil=null, s3_listeLengde=null, s3_status=null;
try { eval(__src); s3_listeLengde=listeFor(MODUS).length; s3_status=state; }
catch(e){ s3_feil=String(e); }

// ── Scenario 4: feil versjon ────────────────────────────────────────────────
var localStorage = lagLager({ innhold:JSON.stringify({ v:99, initialer:'ZZZ', lister:{ STANDARD:[{i:'OLD',s:999999,b:50,d:'2020-01-01'}] } }) });
var s4_feil=null, s4_listeLengde=null, s4_beste=null;
try { eval(__src); s4_listeLengde=listeFor(MODUS).length; s4_beste=bestePoeng(); }
catch(e){ s4_feil=String(e); }

// ── Scenario 5: gyldig fil, men noen ødelagte rader ─────────────────────────
var localStorage = lagLager({ innhold:JSON.stringify({ v:1, initialer:'YAS', lister:{ STANDARD:[
  { i:'AAA', s:5000, b:4, d:'2026-01-01' },      // gyldig
  { i:'BBB', s:'mye', b:4, d:'2026-01-01' },     // poeng er tekst
  { s:3000, b:2, d:'2026-01-01' },               // mangler initialer
  { i:'CCC', s:9000, b:6, d:'2026-01-02' },      // gyldig
  null,                                          // tom rad
  { i:'DDDD', s:1000, b:1, d:'2026-01-01' },     // for mange bokstaver
] } }) });
var s5_feil=null, s5_liste=null, s5_initialer=null;
try { eval(__src); s5_liste=listeFor(MODUS).slice(); s5_initialer=initialer.join(''); }
catch(e){ s5_feil=String(e); }

// ── Scenario 6: manglende nøkkel i det hele tatt ────────────────────────────
var localStorage = lagLager({});
var s6_feil=null, s6_listeLengde=null;
try { eval(__src); s6_listeLengde=listeFor(MODUS).length; }
catch(e){ s6_feil=String(e); }

// ── Scenario 7: initial-skjermen med ekte tastetrykk ────────────────────────
// Her sendes virkelige keydown-hendelser inn i spillets EGEN lytter, så det
// som testes er den ekte initialTast() — ikke en kopi. Særlig viktig fordi
// initial-skjermen er det ENE stedet spillet med vilje leser e.key framfor
// e.code: vi vil vite hvilket TEGN tasten gir, slik at Æ/Ø/Å havner riktig.
// Lageret starter med én bedre rekord, så vi også får testet innsetting BAK
// en eksisterende rad.
var localStorage = lagLager({ innhold:JSON.stringify({ v:1, initialer:'OLD', lister:{ STANDARD:[
  { i:'TOP', s:50000, b:9, d:'2026-01-01' },
] } }) });
__lyttere={};   // se kommentaren øverst: bare DETTE settet lyttere skal fyre
var s7={ feil:null };
try {
  eval(__src);
  resetGame();
  score=12345; wave=7;
  for(var i=0;i<4;i++) killShip();        // 3 liv + ett dødsfall til
  s7.status=state;                        // 'initialer'
  s7.foreslaatt=initialer.join('');       // forrige initialer, lest fra lageret

  // skriv bokstavene rett inn, som på en ekte arkademaskin
  send('keydown', tast('KeyY','y'));
  send('keydown', tast('KeyA','a'));
  send('keydown', tast('KeyS','s'));
  s7.skrevet=initialer.join('');          // 'YAS'
  s7.posEtterTreTegn=initialPos;          // 2 — markøren skal stoppe på siste plass

  // Æ, Ø og Å. På norsk tastatur er e.code Semicolon/Quote/BracketLeft —
  // altså navn uten noe med æøå å gjøre. Leste spillet e.code her, ville
  // de tre bokstavene vært umulige å skrive.
  send('keydown', tast('ArrowLeft','ArrowLeft'));
  send('keydown', tast('ArrowLeft','ArrowLeft'));   // 2 -> 1 -> 0
  send('keydown', tast('Semicolon','æ'));
  send('keydown', tast('Quote','ø'));
  send('keydown', tast('BracketLeft','å'));
  s7.norske=initialer.join('');           // 'ÆØÅ'

  // tegn utenfor alfabetet skal ignoreres, ikke skrives inn
  send('keydown', tast('Digit1','1'));
  send('keydown', tast('Minus','-'));
  s7.etterUgyldige=initialer.join('');    // fortsatt 'ÆØÅ'

  // ↑ ↓ skal gå rundt: Å er siste bokstav i alfabetet, ↑ derfra gir A
  send('keydown', tast('ArrowUp','ArrowUp'));
  s7.opp=initialer[2];                    // 'A'
  send('keydown', tast('ArrowDown','ArrowDown'));
  s7.ned=initialer[2];                    // tilbake til 'Å'
  // autorepeat SKAL virke på piltastene — det er praktisk å holde ↑ nede
  send('keydown', tast('ArrowUp','ArrowUp',true));
  s7.oppRepeat=initialer[2];              // 'A'

  // ENTER som autorepeat skal IKKE lagre: ellers ville det å holde ENTER
  // inne etter forrige runde lagret rekorden med de foreslåtte initialene
  // før spilleren rakk å skrive sine egne.
  send('keydown', tast('Enter','Enter',true));
  s7.statusEtterEnterRepeat=state;        // fortsatt 'initialer'
  s7.listeEtterEnterRepeat=listeFor(MODUS).length;   // fortsatt 1

  // Backspace på første plass skal stå stille, ikke gi negativ posisjon
  send('keydown', tast('ArrowRight','ArrowRight')); // 2 -> 0
  send('keydown', tast('Backspace','Backspace'));
  s7.posEtterBackspacePaaFoerste=initialPos;         // 0

  // sett YAS og bekreft for ekte
  send('keydown', tast('KeyY','y'));
  send('keydown', tast('KeyA','a'));
  send('keydown', tast('KeyS','s'));
  s7.bekreftet=initialer.join('');        // 'YAS'
  send('keydown', tast('Enter','Enter'));
  s7.statusEtterEnter=state;              // 'gameover'
  s7.plassering=nyPlassering;             // 1 — havner bak TOP:50000
  s7.liste=listeFor(MODUS).map(function(r){ return r.i+':'+r.s; }).join(' ');
  s7.lagretBolge=listeFor(MODUS)[1].b;    // 7 — bølgen følger med rekorden
  s7.husketPaaDisk=JSON.parse(localStorage._data[NOKKEL]).initialer;  // 'YAS'

  // ENTER igjen starter ny runde, og plasseringsmerket må nullstilles så
  // «★ 2. PLASS ★» ikke henger igjen inn i neste game over
  send('keydown', tast('Enter','Enter'));
  s7.statusNyRunde=state;                 // 'playing'
  s7.plasseringNyRunde=nyPlassering;      // -1

  // 0 poeng kvalifiserer ikke: da skal man rett til gameover, uten å få
  // skrive initialer inn på en liste man ikke kommer med på
  for(var i=0;i<4;i++) killShip();
  s7.statusUtenPoeng=state;               // 'gameover'
  s7.listeUtenPoeng=listeFor(MODUS).length;  // fortsatt 2
} catch(e){ s7.feil=String(e); }

// ── Tester ──────────────────────────────────────────────────────────────────
function test12Resultater(){
  const poeng=s1_liste.map(function(r){ return r.s; });
  const synkende=poeng.every(function(p,i){ return i===0 || poeng[i-1]>=p; });
  const forventet=[12000,11000,10000,9000,8000,7000,6000,5000,4000,3000];
  const riktigeTall=poeng.length===10 && poeng.every(function(p,i){ return p===forventet[i]; });
  const lagretAntall=s1_lagret.lister.STANDARD.length;
  return {
    noekkel:LAGER_NOKKEL+(s1_noekkelStemmer?' (som dokumentert)':' AVVIK fra testens nøkkel'),
    startetTom:s1_startListeTom&&s1_besteTom,
    lagtInn:12, beholdt:poeng.length, lagretPaaDisk:lagretAntall,
    rekkefolge:poeng.join(' '),
    synkende:synkende,
    besteIHud:s1_beste,
    lagretVersjon:s1_lagret.v,
    ok: s1_noekkelStemmer && s1_startListeTom && s1_besteTom && riktigeTall &&
        synkende && lagretAntall===10 && s1_beste===12000 && s1_lagret.v===1,
  };
}

function testBlokkertLagring(){
  return {
    kastet:s2_feil||'nei',
    statusEtterStart:s2_statusEtter,
    poengEtter120Steg:s2_poengEtter,
    ok: s2_feil===null && s2_statusEtter==='playing' && typeof s2_poengEtter==='number',
  };
}

function testUgyldigJson(){
  return {
    kastet:s3_feil||'nei', listeLengde:s3_listeLengde, status:s3_status,
    ok: s3_feil===null && s3_listeLengde===0 && s3_status==='menu',
  };
}

function testFeilVersjon(){
  return {
    kastet:s4_feil||'nei', listeLengde:s4_listeLengde, beste:s4_beste,
    ok: s4_feil===null && s4_listeLengde===0 && s4_beste===0,
  };
}

function testOdelagteRader(){
  const beholdt=s5_liste?s5_liste.map(function(r){ return r.i+':'+r.s; }).join(' '):'';
  return {
    kastet:s5_feil||'nei',
    beholdt:beholdt,
    antall:s5_liste?s5_liste.length:-1,
    initialerHusket:s5_initialer,
    // bare de to gyldige radene skal overleve, sortert synkende
    ok: s5_feil===null && s5_liste && s5_liste.length===2 &&
        s5_liste[0].i==='CCC' && s5_liste[1].i==='AAA' && s5_initialer==='YAS',
  };
}

function testManglendeNokkel(){
  return { kastet:s6_feil||'nei', listeLengde:s6_listeLengde, ok: s6_feil===null && s6_listeLengde===0 };
}

function testInitialSkjerm(){
  return {
    kastet:s7.feil||'nei',
    'status ved kvalifiserende død':s7.status,
    foreslåtteInitialer:s7.foreslaatt,
    skrevetInn:s7.skrevet,
    posEtterTreTegn:s7.posEtterTreTegn,
    'Æ Ø Å via e.key':s7.norske,
    etterUgyldigeTegn:s7.etterUgyldige,
    ok: s7.feil===null && s7.status==='initialer' && s7.foreslaatt==='OLD' &&
        s7.skrevet==='YAS' && s7.posEtterTreTegn===2 &&
        s7.norske==='ÆØÅ' && s7.etterUgyldige==='ÆØÅ',
  };
}

function testInitialNavigasjon(){
  return {
    kastet:s7.feil||'nei',
    'pil opp fra Å':s7.opp,
    'pil ned tilbake':s7.ned,
    'autorepeat på pil virker':s7.oppRepeat,
    'backspace på første plass':s7.posEtterBackspacePaaFoerste,
    ok: s7.feil===null && s7.opp==='A' && s7.ned==='Å' && s7.oppRepeat==='A' &&
        s7.posEtterBackspacePaaFoerste===0,
  };
}

function testInitialLagring(){
  return {
    kastet:s7.feil||'nei',
    'ENTER som autorepeat: status':s7.statusEtterEnterRepeat,
    'ENTER som autorepeat: antall rader':s7.listeEtterEnterRepeat,
    bekreftetMed:s7.bekreftet,
    statusEtterEnter:s7.statusEtterEnter,
    plassering:s7.plassering,
    liste:s7.liste,
    lagretBolge:s7.lagretBolge,
    husketPaaDisk:s7.husketPaaDisk,
    statusNyRunde:s7.statusNyRunde,
    plasseringNyRunde:s7.plasseringNyRunde,
    'uten poeng: status':s7.statusUtenPoeng,
    'uten poeng: antall rader':s7.listeUtenPoeng,
    ok: s7.feil===null &&
        s7.statusEtterEnterRepeat==='initialer' && s7.listeEtterEnterRepeat===1 &&
        s7.bekreftet==='YAS' && s7.statusEtterEnter==='gameover' &&
        s7.plassering===1 && s7.liste==='TOP:50000 YAS:12345' &&
        s7.lagretBolge===7 && s7.husketPaaDisk==='YAS' &&
        s7.statusNyRunde==='playing' && s7.plasseringNyRunde===-1 &&
        s7.statusUtenPoeng==='gameover' && s7.listeUtenPoeng===2,
  };
}

function testKontrast(){
  // Fargene FØR dette steget, hentet fra git-historikken, mot de nye.
  const foer=[
    ['#1e293b','BEST, BØLGE, ESC Katalog, kontrollhjelp'],
    ['#334155','poengsum når spillet ikke pågår'],
    ['#475569','ENTER for å prøve igjen'],
    ['#64748b','Poeng: N · Bølge: N'],
  ];
  const naa=[
    ['TEKST_HOVED',TEKST_HOVED],['TEKST_INFO',TEKST_INFO],['TEKST_CTA',TEKST_CTA],
    ['TEKST_AKSENT',TEKST_AKSENT],['TEKST_VARSEL',TEKST_VARSEL],['TEKST_DOED',TEKST_DOED],
  ];
  let linjer='\n';
  linjer+='          FØR:\n';
  foer.forEach(function(f){
    linjer+='            '+f[0]+'  '+contrastRatio(f[0],BG_HEX).toFixed(2)+':1  '+f[1]+'\n';
  });
  linjer+='          ETTER:\n';
  let alleOver=true;
  naa.forEach(function(f){
    const v=contrastRatio(f[1],BG_HEX);
    if(v<4.5) alleOver=false;
    linjer+='            '+f[1]+'  '+v.toFixed(2)+':1  '+f[0]+'\n';
  });
  return { maalinger:linjer, ok:alleOver };
}

// Toast-meldingene («BØLGE 3», «EKSTRA LIV!», «+200») får farge per kall og
// går derfor utenom TEKST_*-konstantene. Fargene hentes rett ut av filen, så
// en ny toast med for mørk farge blir fanget uten at testen må endres.
function testToastKontrast(){
  const treff=__raa.match(/toast\([^)]*?'(#[0-9a-fA-F]{6})'/g)||[];
  const fraToast=treff.map(function(s){ return s.slice(-8,-1); });
  // cfg.clr sendes inn som toast-farge når en power-up aktiveres
  const fraPowerups=(__raa.match(/clr:'(#[0-9a-fA-F]{6})'/g)||[])
    .map(function(s){ return s.slice(-8,-1); });
  const alle=fraToast.concat(fraPowerups).filter(function(f,i,a){ return a.indexOf(f)===i; });
  let linjer='\n', forLave=[];
  alle.forEach(function(f){
    const v=contrastRatio(f,BG_HEX);
    if(v<4.5) forLave.push(f+' ('+v.toFixed(2)+':1)');
    linjer+='            '+f+'  '+v.toFixed(2)+':1\n';
  });
  return {
    antallFarger:alle.length,
    maalinger:linjer,
    forLave:forLave.length?forLave.join(', '):'ingen',
    ok: alle.length>0 && forLave.length===0,
  };
}

function testTekststorrelser(){
  // «Ingen tekst under 9 px»: les alle font-strengene rett ut av filen.
  const treff=__raa.match(/(\d+(?:\.\d+)?)px Courier New/g)||[];
  const stoerrelser=treff.map(function(s){ return parseFloat(s); });
  let minste=Infinity;
  stoerrelser.forEach(function(s){ if(s<minste) minste=s; });
  const forSmaa=stoerrelser.filter(function(s){ return s<9; });
  return {
    antallFontStrenger:stoerrelser.length,
    minste:minste,
    underNiPx:forSmaa.length?forSmaa.join(', '):'ingen',
    ok: forSmaa.length===0,
  };
}

function run(argv){
  const t=[
    ['12 resultater inn, bare 10 beste beholdes i riktig rekkefølge', test12Resultater()],
    ['localStorage kaster ved både lesing og skriving', testBlokkertLagring()],
    ['nøkkelen inneholder ugyldig JSON', testUgyldigJson()],
    ['lagret data har feil versjon', testFeilVersjon()],
    ['enkelte rader er ødelagte, resten beholdes', testOdelagteRader()],
    ['nøkkelen mangler helt', testManglendeNokkel()],
    ['initial-skjermen: skriving, inkludert Æ Ø Å', testInitialSkjerm()],
    ['initial-skjermen: piltaster og backspace', testInitialNavigasjon()],
    ['initial-skjermen: ENTER lagrer på riktig plass', testInitialLagring()],
    ['WCAG-kontrast for all lesetekst', testKontrast()],
    ['WCAG-kontrast for toast-meldingene', testToastKontrast()],
    ['ingen tekst under 9 px', testTekststorrelser()],
  ];
  let out='ASTEROIDER topp 10 og kontrast — headless test\n';
  let alle=true;
  t.forEach(function(p){
    const r=p[1];
    if(!r.ok) alle=false;
    out+='  ['+(r.ok?'OK  ':'FEIL')+'] '+p[0]+'\n';
    for(const k in r) if(k!=='ok') out+='          '+k+': '+r[k]+'\n';
  });
  out += alle ? 'RESULTAT: PASS\n' : 'RESULTAT: FAIL\n';
  console.log(out);
  return alle ? 'PASS' : 'FAIL';
}
