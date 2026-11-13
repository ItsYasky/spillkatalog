// ============================================================================
// Kontrast-/tekststørrelsessjekk av de fem nye menyskjermene (GRAND PRIX-
// menyer, steg D): hovedmeny, lagoversikt, banevalg, innstillinger, pausemeny
// og resultatskjerm.
//
//   osascript -l JavaScript tester/test_meny_kontrast.js
//   osascript -l JavaScript tester/test_meny_kontrast.js --html /tmp/annen.html
//
// Målet er å gjøre det samme som contrastReport() allerede gjør for
// billakkeringer, men for menytekst: bruke spillets EGEN contrastRatio()
// (ikke en kopi av den, ellers kunne testen hatt samme feil som koden) mot
// den FAKTISKE bakgrunnen hver tekst males over — inkludert korttonene
// (rgba-tint over bunnfargen på LAGOVERSIKT/BANEVALG) og verste-fall for de
// to halvtransparente overleggene (pausemeny, resultatskjerm), som er
// komponert mot hvitt i stedet for mot selve løpsscenen, siden scenen alltid
// er mørkere enn hvitt og derfor aldri gir LAVERE kontrast enn verste-fall.
//
// Terskelen følger WCAG 2.1: 4,5:1 for vanlig tekst, 3:1 for stor tekst
// (fet ≥ 18,66 px, eller ikke-fet ≥ 24 px). Rent dekorative elementer (det
// bevisst utonede rangtallet på podiet, "···"-skilletegnet i resultatlista)
// er IKKE med i lista under — de bærer ingen informasjon alene.
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
function makeStorage(){
  const mem = {};
  return {
    getItem: function(k){ return Object.prototype.hasOwnProperty.call(mem,k) ? mem[k] : null; },
    setItem: function(k,v){ mem[k] = String(v); },
    removeItem: function(k){ delete mem[k]; }
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
  windowStub.localStorage = makeStorage();
  const factory = eval('(function(document, window, requestAnimationFrame, performance, localStorage){\n' + src + '\n' +
    'return {\n' +
    '  get contrastRatio(){ return contrastRatio; },\n' +
    '  get teamInk(){ return teamInk; },\n' +
    '  get podiumInk(){ return podiumInk; },\n' +
    '  get TEAMS(){ return TEAMS; },\n' +
    '  get GHOST_COL(){ return GHOST_COL; },\n' +
    '  get GHOST_TXT_DIM(){ return GHOST_TXT_DIM; }\n' +
    '};\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, windowStub.localStorage);
}

// ── fargekomposisjon: samme alfa-blanding en canvas gjør når et halv-
// transparent fillRect males over en bakgrunn ──────────────────────────────
function parseColor(c){
  if(c[0]==='#'){
    const h=c.slice(1);
    return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16), a:1};
  }
  const m=c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if(!m) throw new Error('Kan ikke tolke fargen: '+c);
  return {r:+m[1], g:+m[2], b:+m[3], a:m[4]!==undefined?+m[4]:1};
}
function toHex(n){ return Math.round(Math.max(0,Math.min(255,n))).toString(16).padStart(2,'0'); }
function compositeOver(bgHex, overlayStr){
  const bg=parseColor(bgHex), fg=parseColor(overlayStr);
  if(fg.a>=1) return '#'+toHex(fg.r)+toHex(fg.g)+toHex(fg.b);
  const r=fg.a*fg.r+(1-fg.a)*bg.r, g=fg.a*fg.g+(1-fg.a)*bg.g, b=fg.a*fg.b+(1-fg.a)*bg.b;
  return '#'+toHex(r)+toHex(g)+toHex(b);
}
function isLarge(px,bold){ return bold ? px>=18.66 : px>=24; }

const results = [];
// MIN_PX er den andre halvdelen av kravet og ikke pynt: en tekst kan ha 20:1
// kontrast og fortsatt være uleselig fordi den er 7 px. Gulvet håndheves her,
// så en ny rad ikke kan bestå på kontrast alene.
const MIN_PX = 9;
function check(screen, element, fg, bg, px, bold){
  const cr = GAME.contrastRatio(fg,bg);
  const need = isLarge(px,bold)?3:4.5;
  const stor = px>=MIN_PX;
  results.push({ screen, element, fg, bg, px, bold, cr, need,
                 ok: cr>=need && stor, forLiten: !stor });
}

let GAME;
function main(argv){
  const t0 = Date.now();
  let html = 'vintage_f1.html';
  for(let i=0;i<argv.length;i++) if(argv[i] === '--html' && argv[i+1]) html = argv[i+1];
  console.log('KONTRASTSJEKK — alle fem menyskjermer (GRAND PRIX-menyer, steg D) — ' + html);

  GAME = loadGame(html);

  const BG_MENU='#05070a', BG_SETTINGS='#07090d', ROW_BOX='#161b24', BTN_KJOR='#e10600';
  const CARD_MINE   = compositeOver(BG_MENU,'rgba(225,6,0,.10)');
  const CARD_OTHER  = compositeOver(BG_MENU,'rgba(255,255,255,.03)');
  const CARD_SEL    = compositeOver(BG_MENU,'rgba(225,6,0,.12)');
  const CARD_UNSEL  = CARD_OTHER; // samme rgba-verdi som banevalgets uvalgte kort
  // Verste-fall-bakgrunn for pausemeny/resultatskjerm: rgba(5,7,10,.88) over
  // hvitt. Den virkelige scenen bak er alltid mørkere enn hvitt, så dette er
  // en TRYGG undergrense for kontrasten — består testen her, består den i spillet.
  const OVERLAY_WORST = compositeOver('#ffffff','rgba(5,7,10,.88)');

  // ── HOVEDMENY (bg #05070a) ──────────────────────────────────────────────
  check('HOVEDMENY','GRAND PRIX-tittel (CASUAL)','#e10600',BG_MENU,42,true);
  check('HOVEDMENY','GRAND PRIX-tittel (REALISTISK)','#f59e0b',BG_MENU,42,true);
  check('HOVEDMENY','oppsummeringslinje','#c3cad4',BG_MENU,10,true);
  check('HOVEDMENY','valgt rad','#f1f5f9',ROW_BOX,16,true);
  check('HOVEDMENY','uvalgt rad','#9aa4b2',BG_MENU,16,false);
  check('HOVEDMENY','kontrollhjelp (kjøring)','#9aa4b2',BG_MENU,9,false);
  check('HOVEDMENY','kontrollhjelp (navigasjon)','#9aa4b2',BG_MENU,9,false);

  // ── LAGOVERSIKT (bg #05070a + korttint) ─────────────────────────────────
  // Steg C i runde 5 bygget skjermen om fra ti kort til navneliste + panel, så
  // bakgrunnene er nå tre: markert rad (CARD_SEL), eget lag (CARD_MINE) og alt
  // annet (CARD_OTHER). Hele detaljpanelet står på CARD_OTHER.
  check('LAGOVERSIKT','tittel','#f1f5f9',BG_MENU,18,true);
  check('LAGOVERSIKT','undertekst','#9aa4b2',BG_MENU,9,false);
  check('LAGOVERSIKT','bunnlinje','#9aa4b2',BG_MENU,9,false);
  // navnelista til venstre
  check('LAGOVERSIKT','lagnavn i lista (markert)','#f1f5f9',CARD_SEL,11,true);
  check('LAGOVERSIKT','lagnavn i lista (eget lag)','#9aa4b2',CARD_MINE,11,false);
  check('LAGOVERSIKT','lagnavn i lista (umarkert)','#9aa4b2',CARD_OTHER,11,false);
  // detaljpanelet til høyre
  check('LAGOVERSIKT','hjemsted-linje','#cbd5e1',CARD_OTHER,10,false);
  check('LAGOVERSIKT','type-linje','#cbd5e1',CARD_OTHER,9,false);
  check('LAGOVERSIKT','"Tittelsponsor:" + "Sponsorer:"','#9aa4b2',CARD_OTHER,9,false);
  check('LAGOVERSIKT','lakknavn (stort)','#f1f5f9',CARD_OTHER,13,true);
  check('LAGOVERSIKT','lakkens omfang (bane/tid)','#cbd5e1',CARD_OTHER,9,false);
  check('LAGOVERSIKT','lakkteller "LAKK 1 / 3"','#9aa4b2',CARD_OTHER,9,false);
  check('LAGOVERSIKT','"ALLE LAKKER"-etikett','#9aa4b2',CARD_OTHER,9,false);
  check('LAGOVERSIKT','lakkliste-rad (peker)','#f1f5f9',CARD_OTHER,9,true);
  check('LAGOVERSIKT','lakkliste-rad (øvrige)','#9aa4b2',CARD_OTHER,9,false);
  GAME.TEAMS.forEach(t=>{
    check('LAGOVERSIKT','lagnavn i panelet "'+t.name+'"',GAME.teamInk(t.color),CARD_OTHER,16,true);
  });

  // ── BANEVALG (bg #05070a + korttint) ────────────────────────────────────
  check('BANEVALG','tittel','#f1f5f9',BG_MENU,20,true);
  check('BANEVALG','undertekst','#9aa4b2',BG_MENU,9,false);
  check('BANEVALG','banenavn (valgt)','#f1f5f9',CARD_SEL,13,true);
  check('BANEVALG','banenavn (uvalgt)','#9aa4b2',CARD_UNSEL,13,true);
  check('BANEVALG','baneinfo (valgt kort)','#9aa4b2',CARD_SEL,9,false);
  check('BANEVALG','baneinfo (uvalgt kort)','#9aa4b2',CARD_UNSEL,9,false);
  check('BANEVALG','innstillingsboks (sammendrag)','#c3cad4',BG_MENU,11,true);
  check('BANEVALG','innstillingsboks ("Spesiallakk: ...")','#9aa4b2',BG_MENU,9,false);
  check('BANEVALG','innstillingsboks ("↓ endre")','#9aa4b2',BG_MENU,9,false);
  check('BANEVALG','KJØR-knapp','#f1f5f9',BTN_KJOR,16,true);
  check('BANEVALG','bunnhjelp','#9aa4b2',BG_MENU,9,false);

  // ── INNSTILLINGER (bg #07090d) ──────────────────────────────────────────
  check('INNSTILLINGER','tittel','#f1f5f9',BG_SETTINGS,20,true);
  check('INNSTILLINGER','undertekst','#94a3b8',BG_SETTINGS,9,false);
  check('INNSTILLINGER','radetikett (valgt)','#f1f5f9',BG_SETTINGS,12,true);
  check('INNSTILLINGER','radetikett (uvalgt)','#94a3b8',BG_SETTINGS,12,false);
  check('INNSTILLINGER','MODUS-verdi (CASUAL)','#38bdf8',BG_SETTINGS,12,true);
  check('INNSTILLINGER','MODUS-verdi (REALISTISK)','#f59e0b',BG_SETTINGS,12,true);
  ['#4ade80','#38bdf8','#f97316','#ef4444'].forEach(c=>check('INNSTILLINGER','AI-NIVÅ-verdi',c,BG_SETTINGS,12,true));
  check('INNSTILLINGER','AI-NIVÅ-forklaring','#94a3b8',BG_SETTINGS,9,false);
  check('INNSTILLINGER','DISTANSE-verdi','#facc15',BG_SETTINGS,12,true);
  ['#facc15','#fb923c','#818cf8','#94a3b8'].forEach(c=>check('INNSTILLINGER','TID PÅ DØGNET-verdi',c,BG_SETTINGS,12,true));
  check('INNSTILLINGER','"Banens egen tid"-undertekst','#94a3b8',BG_SETTINGS,9,false);
  check('INNSTILLINGER','DITT LAG-verdi (TILFELDIG)','#94a3b8',BG_SETTINGS,12,true);
  GAME.TEAMS.forEach(t=>check('INNSTILLINGER','DITT LAG-verdi ('+t.name+')',GAME.teamInk(t.color),BG_SETTINGS,12,true));
  check('INNSTILLINGER','SPESIALLAKK AUTO','#38bdf8',BG_SETTINGS,12,true);
  check('INNSTILLINGER','SPESIALLAKK AV','#94a3b8',BG_SETTINGS,12,true);
  check('INNSTILLINGER','SPESIALLAKK-forklaring','#94a3b8',BG_SETTINGS,9,false);
  check('INNSTILLINGER','SPØKELSE PÅ',GAME.GHOST_COL,BG_SETTINGS,12,true);
  check('INNSTILLINGER','SPØKELSE AV',GAME.GHOST_TXT_DIM,BG_SETTINGS,12,true);
  check('INNSTILLINGER','bunnhjelp ("ESC tilbake")','#94a3b8',BG_SETTINGS,9,false);

  // ── RESULTATSKJERM (verste-fall-bakgrunn for det halvtransparente overlegget) ──
  check('RESULTATSKJERM','"SEIER!"','#4ade80',OVERLAY_WORST,28,true);
  check('RESULTATSKJERM','"FERDIG!"','#94a3b8',OVERLAY_WORST,28,true);
  GAME.TEAMS.forEach(t=>{
    check('RESULTATSKJERM','sjåførmerke under podieblokk ('+t.name+')',GAME.podiumInk(t.color),OVERLAY_WORST,9,true);
    check('RESULTATSKJERM','vinnerens fulle navn ('+t.name+')',GAME.podiumInk(t.color),OVERLAY_WORST,11,true);
    check('RESULTATSKJERM','resultatliste-rad ('+t.name+')',GAME.podiumInk(t.color),OVERLAY_WORST,9,false);
  });
  check('RESULTATSKJERM','plassering/totaltid','#9aa4b2',OVERLAY_WORST,12,false);
  check('RESULTATSKJERM','straffetid-linje','#f87171',OVERLAY_WORST,10,false);
  check('RESULTATSKJERM','beste runde-linje','#9aa4b2',OVERLAY_WORST,10,false);
  check('RESULTATSKJERM','meny (valgt)','#f1f5f9',ROW_BOX,13,true);
  check('RESULTATSKJERM','meny (uvalgt)','#9aa4b2',OVERLAY_WORST,13,false);
  check('RESULTATSKJERM','bunnhjelp','#9aa4b2',OVERLAY_WORST,9,false);

  // ── PAUSEMENY (verste-fall-bakgrunn) ────────────────────────────────────
  check('PAUSEMENY','"PAUSE"','#f1f5f9',OVERLAY_WORST,22,true);
  check('PAUSEMENY','rad (valgt)','#f1f5f9',ROW_BOX,15,true);
  check('PAUSEMENY','rad (uvalgt)','#9aa4b2',OVERLAY_WORST,15,false);
  check('PAUSEMENY','bunnhjelp','#9aa4b2',OVERLAY_WORST,9,false);

  console.log('');
  console.log('── Resultat ───────────────────────────────────────────');
  let feil = 0;
  const bySkjerm = {};
  results.forEach(r=>{ (bySkjerm[r.screen]=bySkjerm[r.screen]||[]).push(r); });
  Object.keys(bySkjerm).forEach(skjerm=>{
    console.log('  ' + skjerm + ':');
    bySkjerm[skjerm].forEach(r=>{
      if(!r.ok) feil++;
      console.log('    ' + (r.ok?'OK  ':'FEIL') + '  ' + r.element + '  ' +
        r.fg + ' mot ' + r.bg + '  →  ' + r.cr.toFixed(2) + ':1 (krav ' + r.need + ':1)' +
        '  ' + r.px + ' px' + (r.forLiten?' ← UNDER 9 px':''));
    });
  });
  console.log('  ' + (results.length - feil) + '/' + results.length + ' sjekker bestått');
  console.log('');
  console.log('Ferdig på ' + ((Date.now()-t0)/1000).toFixed(1) + ' s');
  return feil === 0 ? 'ALLE SJEKKER BESTÅTT' : (feil + ' SJEKK(ER) FEILET');
}

main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
