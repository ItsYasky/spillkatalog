// ============================================================================
// Banetema-test for RUNDE 4 i vintage_f1.html.
//
//   osascript -l JavaScript test_banetema.js
//   osascript -l JavaScript test_banetema.js --html /tmp/annen.html
//   osascript -l JavaScript test_banetema.js --ut rapport.txt
//
// HVORFOR DENNE FINNES
// Kommentaren over THEMES lover at asfalttonene er MÅLT og ikke valgt med
// øyemål, og peker på denne filen som beviset. Før runde 4 hadde alle baner
// samme dekke (#33333e), og hele lakkeringspaletten fra runde 2 ble valgt mot
// nettopp den ene fargen. Nå har hver bane sin egen asfalt — og da er
// `contrastCheck()` i spillet plutselig ikke lenger en garanti, for den måler
// fortsatt mot ASPHALT_BASE alene.
//
// Det farlige er at dette ikke synes: en bil som er 28 px og mangler både
// kontur og tekst forsvinner stille inn i dekket på ÉN av tretten baner, og
// bare om natta på den banen. Testen regner derfor ut hele krysstabellen —
// hver lakkering mot hver banes faktiske asfalt — i stedet for å stole på at
// ±8 %-regelen holder.
//
// MERK at ±8 % måles i HSL-lyshet ((maks+min)/2), ikke i WCAG-luminans.
// Det er med vilje: tallet 0,2216 i kommentaren over THEMES er HSL-lysheten
// til #33333e, og toleransen må måles i samme enhet som den ble satt i.
// Luminansen er det kontrastkravene under bruker, og de regnes med spillets
// egen contrastRatio.
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

// Samme no-op-proxy som geometrilåsen bruker: temaene leses som TALL og
// FARGER her, så ingen tegnekall trenger å gjøre noe som helst.
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
  // Getterne gjør at `const`-ene leses FRA spillets eget scope når de kalles,
  // ikke kopieres ut i det øyeblikket fabrikken returnerer.
  const factory = eval('(function(document, window, requestAnimationFrame, performance, localStorage){\n' + src + '\n' +
    'return { get TRACKS(){ return TRACKS; }, get THEMES(){ return THEMES; },' +
    ' get SKINS(){ return SKINS; }, get TEAMS(){ return TEAMS; },' +
    ' get ASPHALT_BASE(){ return ASPHALT_BASE; },' +
    ' makeTheme: makeTheme, skinLivery: skinLivery,' +
    ' contrastRatio: contrastRatio, relLuminance: relLuminance };\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

// ── små hjelpere ────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;
function erHex(v){ return typeof v === 'string' && HEX.test(v); }

// HSL-lyshet. Se filhodet for hvorfor det er denne og ikke WCAG-luminansen.
function hslL(hex){
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return (Math.max(r,g,b) + Math.min(r,g,b)) / 2 / 255;
}

// Kjente speckle-nøkler. 'grass' er else-grenen i buildTrackBg og står derfor
// ikke i noen ===-sammenligning i spillet — den må skrives inn her for hånd.
// En ukjent nøkkel er ikke en feilmelding i spillet: den faller stille til
// gress, og en ørkenbane får gressprikker uten at noe klager.
const SPECKLE_OK = ['grass','arid','ash','autumn','dry','dune','snow'];

const RUNOFF_OK = ['grus','asfalt'];

// ── testene ─────────────────────────────────────────────────────────────────
function kjør(game){
  const res = [];
  function sjekk(navn, ok, detalj){ res.push({ navn: navn, ok: !!ok, detalj: detalj || '' }); }

  const TRACKS = game.TRACKS;
  const THEMES = game.THEMES;
  const baneNavn = TRACKS.map(function(t){ return t.name; });

  // 1. Hver bane må ha sitt eget tema. makeTheme faller stille til standard
  //    skog-grønt for en bane som mangler, så en glemt bane ser ut som en
  //    bane som «bare ble grønn» — ikke som en feil.
  baneNavn.forEach(function(n){
    sjekk('tema finnes: ' + n, Object.prototype.hasOwnProperty.call(THEMES, n),
      'ingen THEMES-nøkkel — banen faller til standardtemaet');
  });

  // 2. Motsatt vei: en THEMES-nøkkel som ikke treffer et banenavn er en
  //    skrivefeil som ALDRI blir lest. Uten denne sjekken kan et tema være
  //    nøye gjennomarbeidet og likevel aldri vises.
  Object.keys(THEMES).forEach(function(k){
    sjekk('tema brukes: ' + k, baneNavn.indexOf(k) >= 0,
      'ingen bane heter dette — temaet blir aldri lest');
  });

  // 3. Asfaltlysheten innenfor ±8 % av det gamle felles dekket.
  const refL = hslL(game.ASPHALT_BASE);
  const lo = refL * 0.92, hi = refL * 1.08;
  TRACKS.forEach(function(t){
    const a = t.theme.asphalt;
    if(!erHex(a)){ sjekk('asfalt er hex: ' + t.name, false, String(a)); return; }
    const L = hslL(a);
    sjekk('asfaltlyshet: ' + t.name, L >= lo && L <= hi,
      a + ' har L=' + L.toFixed(4) + ', utenfor [' + lo.toFixed(4) + ', ' + hi.toFixed(4) + ']');
  });

  // 4. DEN SOM FAKTISK BETYR NOE: hver lakkering mot HVER banes asfalt.
  //    Kravet er det samme som contrastCheck bruker — base ELLER acc må nå
  //    3:1 — men her måles det mot alle tretten dekkene, ikke bare mot
  //    ASPHALT_BASE.
  const lakk = [];
  game.SKINS.forEach(function(s){ if(s.base) lakk.push({ navn: 'LAKK ' + s.name, lv: game.skinLivery(s) }); });
  game.TEAMS.forEach(function(t){ lakk.push({ navn: 'LAG ' + t.name, lv: game.skinLivery(t) }); });

  let verste = { v: Infinity, hvor: '' };
  TRACKS.forEach(function(t){
    const asf = t.theme.asphalt;
    if(!erHex(asf)) return;
    const stryker = [];
    lakk.forEach(function(l){
      const v = Math.max(game.contrastRatio(l.lv.base, asf), game.contrastRatio(l.lv.acc, asf));
      if(v < verste.v){ verste = { v: v, hvor: l.navn + ' mot ' + t.name }; }
      if(v < 3) stryker.push(l.navn + ' (' + v.toFixed(2) + ':1)');
    });
    sjekk('lakkontrast mot ' + t.name, stryker.length === 0,
      stryker.length + ' lakkering(er) under 3:1 — ' + stryker.join(', '));
  });

  // 5. Bakketonene: 2–3 gyldige hex. Antallet er ikke pirk — flekkene blandes
  //    ved å dele støyintervallet [0,1) på (antall-1), så ÉN tone gir en
  //    divisjon på null, og fire eller flere gir bånd som er for smale til å
  //    leses som landskap.
  TRACKS.forEach(function(t){
    const g = t.theme.ground;
    const ok = Array.isArray(g) && g.length >= 2 && g.length <= 3 && g.every(erHex);
    sjekk('bakketoner: ' + t.name, ok, 'forventet 2–3 gyldige hex, fikk ' + JSON.stringify(g));
  });

  // 6. Kerb: nøyaktig to gyldige farger, og de må kunne skilles fra hverandre.
  //    En kerb er et vekselmønster — to toner som måler likt er ikke en kerb,
  //    det er en ensfarget stripe.
  TRACKS.forEach(function(t){
    const c = t.theme.curb;
    if(!(Array.isArray(c) && c.length === 2 && c.every(erHex))){
      sjekk('kerb: ' + t.name, false, 'forventet to gyldige hex, fikk ' + JSON.stringify(c));
      return;
    }
    const v = game.contrastRatio(c[0], c[1]);
    sjekk('kerb: ' + t.name, v >= 3,
      'de to kerbtonene måler bare ' + v.toFixed(2) + ':1 mot hverandre — mønsteret forsvinner');
  });

  // 7. Utkjøringssonen: kjent type og gyldig farge.
  TRACKS.forEach(function(t){
    const r = t.theme.runoff;
    const ok = r && RUNOFF_OK.indexOf(r.type) >= 0 && erHex(r.clr);
    sjekk('utkjøring: ' + t.name, ok, 'forventet {type:grus|asfalt, clr:#rrggbb}, fikk ' + JSON.stringify(r));
  });

  // 8. Speckle-nøkkel som faktisk finnes i buildTrackBg.
  TRACKS.forEach(function(t){
    sjekk('speckle: ' + t.name, SPECKLE_OK.indexOf(t.theme.speckle) >= 0,
      '«' + t.theme.speckle + '» er ingen kjent nøkkel — faller stille til gress');
  });

  // 9. Klyngeterskelen må ligge i [0,1], for den sammenlignes rett mot
  //    støyverdien. Utenfor blir det enten vegetasjon overalt eller ingen.
  TRACKS.forEach(function(t){
    const c = t.theme.cluster;
    sjekk('klyngeterskel: ' + t.name, typeof c === 'number' && c >= 0 && c <= 1,
      'cluster=' + c + ' er utenfor [0,1]');
  });

  // 10. Fasadepaletten. cityColour() plukker en tone med p[rnd()*p.length], så
  //     en palett oppgitt som STRENG ville plukket ut ett enkelt tegn («#»)
  //     og malt bygget i en ugyldig farge. Formen håndheves her i stedet for
  //     med en gren i tegnekoden — se kommentaren over cityColour.
  TRACKS.forEach(function(t){
    const p = t.theme.cityPal;
    if(p == null) return;  // ingen palett er lovlig: dBuilding har egen standard
    sjekk('fasadepalett: ' + t.name,
      Array.isArray(p) && p.length >= 2 && p.every(erHex),
      'forventet en array med minst 2 gyldige hex, fikk ' + JSON.stringify(p));
  });

  // 11. En BYBANE uten palett er ikke en feil som kaster — cityColour gir null
  //     og dBuilding faller til sin ene standardtone. Resultatet er en by der
  //     hvert hus har samme fasade, altså nøyaktig den kulissen runde 4 skulle
  //     vekk fra, og det er usynlig i koden. Derfor kreves paletten her.
  TRACKS.forEach(function(t){
    if(t.terrain !== 'city') return;
    sjekk('bybane har palett: ' + t.name, Array.isArray(t.theme.cityPal),
      'terrain:city uten cityPal — alle byggene blir samme farge');
  });

  // 12. HELE POENGET med runde 4: to baner skal ikke være til å forveksle på
  //     et skjermbilde. Signaturen er det man ser aller først — dekket,
  //     bakketonene og utkjøringen. Er den identisk for to baner, er de to
  //     banene fortsatt bygget av samme byggeklosser.
  const sett = {};
  TRACKS.forEach(function(t){
    const sig = t.theme.asphalt + '|' + (t.theme.ground || []).join(',') + '|' +
      (t.theme.runoff ? t.theme.runoff.clr : '-');
    if(sett[sig]){
      sjekk('egen signatur: ' + t.name, false, 'identisk dekke/bakke/utkjøring som ' + sett[sig]);
    } else {
      sett[sig] = t.name;
      sjekk('egen signatur: ' + t.name, true, '');
    }
  });

  // 13. Landemerkepaletten mot bakken. Et landemerke er den STØRSTE flaten på
  //     bildet etter asfalten og bakken, så 3:1 er kravet — samme bar som for
  //     bilene. Målt mot den VERSTE av banens bakketoner, for flekkene blandes
  //     og bygget kan havne på hvilken som helst av dem.
  //
  //     `lagMot` navngir unntakene: noen toner står aldri mot bakken, men mot
  //     en annen tone i samme landemerke (et tak ligger på en vegg, ikke i
  //     gresset). Unntaket må finnes som DATA og ikke som en utelatelse, ellers
  //     er forskjellen mellom «måles mot noe annet» og «måles ikke» usynlig.
  let versteLag = { v: Infinity, hvor: '' };
  TRACKS.forEach(function(t){
    const P = t.theme.lagPal;
    if(P == null) return;
    const mot = t.theme.lagMot || {};
    const g = (t.theme.ground || []).filter(erHex);
    if(!g.length){ sjekk('lagpalett: ' + t.name, false, 'ingen gyldige bakketoner å måle mot'); return; }
    const stryker = [];
    Object.keys(P).forEach(function(k){
      const tone = P[k];
      if(!erHex(tone)){ stryker.push(k + ' er ikke hex (' + tone + ')'); return; }
      let v, hvor;
      if(mot[k] != null){
        const ref = P[mot[k]];
        if(!erHex(ref)){ stryker.push(k + ' skal måles mot «' + mot[k] + '», som ikke finnes i paletten'); return; }
        v = game.contrastRatio(tone, ref);
        hvor = k + ' mot ' + mot[k];
      } else {
        v = Infinity;
        g.forEach(function(gt){ v = Math.min(v, game.contrastRatio(tone, gt)); });
        hvor = k + ' mot bakken';
      }
      if(v < versteLag.v) versteLag = { v: v, hvor: t.name + ' ' + hvor };
      if(v < 3) stryker.push(hvor + ' (' + v.toFixed(2) + ':1)');
    });
    sjekk('lagpalett: ' + t.name, stryker.length === 0, stryker.join(', '));
  });

  // 14. Et tema som TEGNER noe eget må oppgi tonene som data. Står fargene som
  //     bokstavelige hex inne i tegnefunksjonen, kommer testen over aldri til
  //     dem, og et usynlig landemerke blir bare rapportert som «alt består».
  TRACKS.forEach(function(t){
    if(!t.theme.landmark && !t.theme.groundLayer) return;
    sjekk('lagpalett finnes: ' + t.name,
      t.theme.lagPal != null && typeof t.theme.lagPal === 'object',
      'tegner landemerke/bakkelag uten lagPal — tonene kan ikke måles');
  });

  // 15. `landmarkT` er en rundeposisjon og brukes to steder: den plasserer
  //     bygget langs banen, og den er dessuten der harnessen setter kameraet
  //     når skjermbildet tas. Utenfor [0,1) peker begge på ingenting.
  TRACKS.forEach(function(t){
    if(!t.theme.landmark) return;
    const T = t.theme.landmarkT;
    sjekk('landmarkT: ' + t.name, typeof T === 'number' && T >= 0 && T < 1,
      'landmarkT=' + T + ' er ikke et tall i [0,1)');
  });

  return { res: res, verste: verste, versteLag: versteLag, refL: refL, lakkAntall: lakk.length };
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
  const ut = kjør(game);

  const feil = ut.res.filter(function(r){ return !r.ok; });
  const linjer = [];
  linjer.push('BANETEMA — ' + htmlPath);
  linjer.push('baner: ' + game.TRACKS.length + '   lakkeringer: ' + ut.lakkAntall +
    '   asfaltreferanse: ' + game.ASPHALT_BASE + ' (L=' + ut.refL.toFixed(4) + ')');
  linjer.push('');

  if(feil.length){
    linjer.push('STRYKER:');
    feil.forEach(function(r){ linjer.push('  ' + r.navn + ' — ' + r.detalj); });
    linjer.push('');
  }

  // Asfalttabellen skrives ut selv når alt består: marginen er interessant i
  // seg selv, for en tone som ligger helt på grensa stryker ved neste lille
  // justering.
  linjer.push('ASFALT PER BANE');
  game.TRACKS.forEach(function(t){
    const L = hslL(t.theme.asphalt);
    const avvik = (L / ut.refL - 1) * 100;
    linjer.push('  ' + t.name.padEnd(13) + t.theme.asphalt +
      '  L=' + L.toFixed(4) +
      '  ' + (avvik >= 0 ? '+' : '') + avvik.toFixed(1) + ' %');
  });
  linjer.push('');
  linjer.push('svakeste lakkontrast noe sted: ' + ut.verste.v.toFixed(2) + ':1 (' + ut.verste.hvor + ')');
  linjer.push('svakeste landemerketone:        ' + (isFinite(ut.versteLag.v)
    ? ut.versteLag.v.toFixed(2) + ':1 (' + ut.versteLag.hvor + ')'
    : 'ingen lagPal målt ennå'));
  linjer.push('');
  linjer.push('RESULTAT: ' + (ut.res.length - feil.length) + '/' + ut.res.length +
    (feil.length ? '  — ' + feil.length + ' sjekk(er) stryker' : '  — alt består'));

  const tekst = linjer.join('\n');
  if(a.ut){ writeFile(a.ut, tekst + '\n'); console.log('skrevet: ' + a.ut); }
  console.log(tekst);
})();
