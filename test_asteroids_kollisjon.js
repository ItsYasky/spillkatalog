// ============================================================================
// Headless test for STEG C: rettferdig kollisjon mot steinenes faktiske form.
//
// Kjør fra spillkatalog-mappen:
//   osascript -l JavaScript test_asteroids_kollisjon.js
//
// Laster hele spill-scriptet fra asteroids.html i et stub-miljø og tester den
// ekte hitsRock() — ikke en kopi. Math.random() byttes ut med en liten
// deterministisk generator FØR eval, slik at makeShape() gir nøyaktig samme
// steinformer hver gang testen kjøres.
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
var document={
  hidden:false, addEventListener:function(){},
  getElementById:function(){ return { width:480, height:600, getContext:lagFalskCtx }; },
  createElement:function(){ return { width:0, height:0, getContext:lagFalskCtx }; },
};
var window={ addEventListener:function(){}, location:{ href:'' } };
function requestAnimationFrame(cb){}
var performance={ now:function(){ return 0; } };

// deterministisk generator, så steinformene er identiske mellom kjøringer
var __seed=123456789;
function detRandom(){ __seed=(__seed*1103515245+12345)&0x7fffffff; return __seed/0x7fffffff; }
Math.random=detRandom;

function hentScript(html){
  const a=html.indexOf('<script>'), b=html.lastIndexOf('<\/script>');
  if(a<0||b<a) throw new Error('Fant ikke <script>-blokken i asteroids.html');
  const src=html.slice(a+'<script>'.length, b);
  // let/const i en eval() blir ikke synlige utenfor eval-scopet; toppnivå-
  // deklarasjonene (de som står helt til venstre) gjøres om til var.
  // Deklarasjoner inne i funksjoner er indenterte og røres ikke.
  return src.replace(/^(let|const)\s/gm,'var ');
}
// Filen kan overstyres med ASTEROIDS_FILE=... for å kjøre testen mot en kopi
// (brukes til å bekrefte at testen faktisk fanger feil den skal fange).
var __fil = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('ASTEROIDS_FILE')) || 'asteroids.html';
eval(hentScript(readFile(__fil)));

// Den GAMLE sjekken, for sammenligning: sirkel med full radius.
function gammelTreffSkudd(rock,x,y){ return dist(x,y,rock.x,rock.y) < rock.r; }

// ── Stein med ett bevisst dypt innhakk ved vinkel 0 ──────────────────
// 12 hjørner på full radius, bortsett fra hjørne 0 som er trukket inn til
// 72% (det laveste makeShape kan gi). Da ligger det et tydelig tomrom
// mellom polygonkanten og sirkelen med full radius, nøyaktig der den gamle
// sjekken ga urettferdige treff.
function lagInnhakkStein(rot){
  const r=42, n=12, pts=[];
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2;
    const rad=r*(i===0?0.72:1.0);
    pts.push([Math.cos(a)*rad, Math.sin(a)*rad]);
  }
  return { x:240, y:300, r:r, rot:rot||0, shape:pts };
}

function punktPaa(rock,vinkel,avstand){
  return { x:rock.x+Math.cos(vinkel)*avstand, y:rock.y+Math.sin(vinkel)*avstand };
}

function testInnhakk(){
  const rock=lagInnhakkStein(0);
  // 85% av radius, rett inn i innhakket: innenfor den gamle sirkelen,
  // men tydelig utenfor formen spilleren ser
  const utenfor=punktPaa(rock,0,42*0.85);
  const gammel=gammelTreffSkudd(rock,utenfor.x,utenfor.y);
  const ny=hitsRock(rock,utenfor.x,utenfor.y,0);
  return {
    gammelSjekk:gammel?'TREFF (urettferdig)':'bom',
    nySjekk:ny?'treff':'bom (riktig)',
    ok: gammel===true && ny===false,
  };
}

function testLikeInnenforKanten(){
  const rock=lagInnhakkStein(0);
  // 29px ute langs vinkel 0, altså like innenfor innhakkets hjørne (30.24px)
  const innenfor=punktPaa(rock,0,29);
  const ny=hitsRock(rock,innenfor.x,innenfor.y,0);
  return { nySjekk:ny?'treff (riktig)':'bom', ok: ny===true };
}

function testRotasjon(){
  // Roterer vi både steinen og punktet like mye, må svaret bli det samme.
  // Dette fanger fortegnsfeil i tilbake-rotasjonen, som ellers ville gitt
  // en treffflate som ligger forskjøvet fra formen man ser.
  let avvik=0;
  for(let k=0;k<24;k++){
    const rot=(k/24)*Math.PI*2;
    const flat=lagInnhakkStein(0), vridd=lagInnhakkStein(rot);
    for(let m=0;m<60;m++){
      const v=(m/60)*Math.PI*2, d=10+(m%4)*10;
      const pFlat=punktPaa(flat,v,d);
      const pVridd=punktPaa(vridd,v+rot,d);
      if(hitsRock(flat,pFlat.x,pFlat.y,0)!==hitsRock(vridd,pVridd.x,pVridd.y,0)) avvik++;
    }
  }
  return { avvik:avvik, ok: avvik===0 };
}

function testSkipSkraper(){
  // Skipet er en sirkel (SHIP_HIT_R), ikke et punkt: et sentrum like utenfor
  // en kant skal treffe, mens samme punkt som rent skudd skal bomme.
  const rock=lagInnhakkStein(0);
  // vinkel midt mellom to hjørner på full radius, 3px utenfor kanten
  const v=(1.5/12)*Math.PI*2;
  const kantAvstand=42*Math.cos(Math.PI/12); // avstand til kantens midtpunkt
  const p=punktPaa(rock,v,kantAvstand+3);
  const somSkudd=hitsRock(rock,p.x,p.y,0);
  const somSkip=hitsRock(rock,p.x,p.y,SHIP_HIT_R);
  return {
    somSkudd:somSkudd?'treff':'bom (riktig)',
    somSkip:somSkip?'treff (riktig)':'bom',
    skipHitR:SHIP_HIT_R,
    ok: somSkudd===false && somSkip===true,
  };
}

function testTilfeldigePunkter(){
  // 10 000 tilfeldige punkter mot ekte makeShape-steiner. Vi klassifiserer
  // hver uenighet mellom gammel sirkel og ny form, og sjekker HVOR den
  // ligger i forhold til radiusen.
  const ANTALL=10000;
  const steiner=[];
  ['LARGE','MEDIUM','SMALL'].forEach(function(st,i){
    const cfg=SIZES[st];
    steiner.push({ x:240, y:300, r:cfg.r, rot:i*0.7, shape:makeShape(cfg.r), navn:st });
  });

  let nyIkkeGammel=0, gammelIkkeNy=0, enige=0;
  let maksRatioNyIkkeGammel=0, minRatioNyIkkeGammel=Infinity;
  let maksRatioGammelIkkeNy=0;

  for(let i=0;i<ANTALL;i++){
    const rock=steiner[i%steiner.length];
    const vinkel=detRandom()*Math.PI*2;
    const avstand=detRandom()*rock.r*1.3; // dekker både innsiden og utenfor 108%
    const x=rock.x+Math.cos(vinkel)*avstand, y=rock.y+Math.sin(vinkel)*avstand;
    const ny=hitsRock(rock,x,y,0);
    const gammel=gammelTreffSkudd(rock,x,y);
    const ratio=avstand/rock.r;
    if(ny===gammel){ enige++; }
    else if(ny && !gammel){
      nyIkkeGammel++;
      if(ratio>maksRatioNyIkkeGammel) maksRatioNyIkkeGammel=ratio;
      if(ratio<minRatioNyIkkeGammel) minRatioNyIkkeGammel=ratio;
    } else {
      gammelIkkeNy++;
      if(ratio>maksRatioGammelIkkeNy) maksRatioGammelIkkeNy=ratio;
    }
  }

  // Den nye sjekken treffer utenfor den gamle sirkelen BARE der polygonet
  // faktisk buler ut forbi full radius (makeShape går opp til 108%), aldri
  // lenger ute enn det. Det er riktig: en bule spilleren ser SKAL kunne
  // treffes. Den gamle sirkelen bommet på de.
  const buleneForklarer = nyIkkeGammel===0 ||
    (minRatioNyIkkeGammel>1.0 && maksRatioNyIkkeGammel<=1.08);
  // og den gamle sjekken traff en god del tomrom som nå er borte
  const urettferdigeTreffFjernet = gammelIkkeNy>0 && maksRatioGammelIkkeNy<1.0;

  return {
    punkter:ANTALL,
    enige:enige,
    'ny treffer, gammel bommet':nyIkkeGammel+(nyIkkeGammel?' (alle i buler, radius '+minRatioNyIkkeGammel.toFixed(3)+'-'+maksRatioNyIkkeGammel.toFixed(3)+'x r)':''),
    'gammel traff tomrom, ny bommer':gammelIkkeNy+(gammelIkkeNy?' (alle innenfor radius, opp til '+maksRatioGammelIkkeNy.toFixed(3)+'x r)':''),
    ok: buleneForklarer && urettferdigeTreffFjernet,
  };
}

function run(argv){
  const t=[
    ['Punkt i innhakk: gammel traff, ny bommer', testInnhakk()],
    ['Punkt like innenfor kanten treffer', testLikeInnenforKanten()],
    ['Rotasjon: form og treffflate ligger likt (1440 punkter)', testRotasjon()],
    ['Skipet skraper kanten der et skudd bommer', testSkipSkraper()],
    ['10 000 tilfeldige punkter mot ekte steinformer', testTilfeldigePunkter()],
  ];
  let out='ASTEROIDER kollisjon — headless test\n';
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
