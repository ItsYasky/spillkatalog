// ============================================================================
// Banetema-test for RUNDE 4 i vintage_f1.html.
//
//   osascript -l JavaScript tester/test_banetema.js
//   osascript -l JavaScript tester/test_banetema.js --html /tmp/annen.html
//   osascript -l JavaScript tester/test_banetema.js --ut rapport.txt
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
    ' get ASPHALT_BASE(){ return ASPHALT_BASE; }, get TOD(){ return TOD; },' +
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

// ── døgnoverlegget, komponert slik lerretet gjør det ───────────────────────
// Nattoverlegget males som et fylt rektangel OVER hele den ferdige scenen, og
// det er ÅPENBART for øyet men ikke for en måling på de rå temafargene: en
// palett kan holde 3:1 ved dag og ligge på 1,8:1 under overlegget. Testen må
// derfor regne på de KOMPONERTE tonene, ellers måler den en scene spilleren
// aldri ser.
function parseRgba(s){
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(String(s||''));
  if(!m) return null;
  return [ +m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4] ];
}
// source-over: ut = a·overlegg + (1−a)·under. Samme formel lerretet bruker med
// standard globalCompositeOperation, så tallet her er tallet på skjermen.
function komponer(hex, ov){
  const h = hex.replace('#','');
  const c = [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  if(!ov) return '#' + h.toLowerCase();
  return '#' + c.map(function(v,i){
    const u = Math.max(0, Math.min(255, Math.round(ov[3]*ov[i] + (1-ov[3])*v)));
    return (u < 16 ? '0' : '') + u.toString(16);
  }).join('');
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

  // 16. ARDENNEs trær var praktisk talt usynlige (SENERE.md): verste
  //     kombinasjon av gammel treeTint mot bakken målte 1,00:1. Sjekken er
  //     bevisst avgrenset til ARDENNE og ikke en generell regel for alle
  //     tretten banene — de andre har samme svake palettmønster (målt til
  //     1,0–1,3:1 hver), men det er et eget, ikke bestilt punkt (se
  //     SENERE.md) og skal ikke stoppe denne testen. Denne ene sjekken låser
  //     bare ARDENNEs fiks, så tonene ikke kan glide tilbake under 3:1 uten
  //     at testen merker det.
  (function(){
    const t = TRACKS.filter(function(tr){ return tr.name === 'ARDENNE'; })[0];
    if(!t){ sjekk('ARDENNE treeTint mot bakken', false, 'fant ikke banen ARDENNE'); return; }
    const tree = t.theme.treeTint, ground = (t.theme.ground || []).filter(erHex);
    if(!(Array.isArray(tree) && tree.every(erHex) && ground.length)){
      sjekk('ARDENNE treeTint mot bakken', false, 'treeTint eller ground mangler/ugyldig');
      return;
    }
    let verst = Infinity;
    tree.forEach(function(tt){ ground.forEach(function(gg){ verst = Math.min(verst, game.contrastRatio(tt, gg)); }); });
    sjekk('ARDENNE treeTint mot bakken', verst >= 3,
      'verste kombinasjon måler ' + verst.toFixed(2) + ':1, under 3:1-kravet');
  })();

  // 17. Trekontrast for ALLE baner som faktisk tegner trær (SENERE.md,
  //     rettet etter ARDENNE). Bare mountain/forest/parkland-terreng kaller
  //     dTree() — city/arid/volcanic/hedge bruker andre tegnefunksjoner
  //     (dBush/dBuilding/dLavaRock/dHedge) som ikke leser treeTint i det
  //     hele tatt, så en bane utenfor disse tre terrengtypene er ikke med.
  //     Kravet speiler bil-lakkeringenes «enten base eller acc»-regel: enten
  //     en treeTint-tone ELLER treeHi (den lyse toppen dTree() legger på når
  //     den finnes) må nå ~2,5:1 mot banens VERSTE bakketone. ARDENNE og
  //     ESSE klarer dette med treeTint alene (sjekk 16 og måling i
  //     CLAUDE.md); de fire andre trenger treeHi.
  const TREE_TERRAIN = ['mountain','forest','parkland'];
  const TREE_MIN = 2.5;
  TRACKS.forEach(function(t){
    if(TREE_TERRAIN.indexOf(t.terrain) < 0) return;
    const tree = (t.theme.treeTint || []).filter(erHex);
    const ground = (t.theme.ground || []).filter(erHex);
    if(!tree.length || !ground.length){
      sjekk('trekontrast: ' + t.name, false,
        'treeTint eller ground mangler/ugyldig på en bane med terrain=' + t.terrain);
      return;
    }
    // Beste treeTint-tone: for hver tone, dens VERSTE kontrast mot de ulike
    // bakketonene — deretter den beste av disse (den ene tonen som best kan
    // bære kravet alene, akkurat som «acc» kan bære det en «base» ikke gjør).
    let besteTree = -Infinity;
    tree.forEach(function(tt){
      let verstMotGround = Infinity;
      ground.forEach(function(gg){ verstMotGround = Math.min(verstMotGround, game.contrastRatio(tt, gg)); });
      besteTree = Math.max(besteTree, verstMotGround);
    });
    let besteHi = -Infinity;
    if(t.theme.treeHi != null){
      if(!erHex(t.theme.treeHi)){
        sjekk('trekontrast: ' + t.name, false, 'treeHi er ikke gyldig hex (' + t.theme.treeHi + ')');
        return;
      }
      // treeHi sin VERSTE kontrast mot de ulike bakketonene.
      besteHi = Infinity;
      ground.forEach(function(gg){ besteHi = Math.min(besteHi, game.contrastRatio(t.theme.treeHi, gg)); });
    }
    const best = Math.max(besteTree, besteHi);
    sjekk('trekontrast: ' + t.name, best >= TREE_MIN,
      'beste av treeTint (' + besteTree.toFixed(2) + ':1) og treeHi (' +
      (besteHi === -Infinity ? 'ingen' : besteHi.toFixed(2) + ':1') + ') når ikke ' + TREE_MIN + ':1');
  });

  // 18. Et tema som legger BYKVARTALER må ha en tone å tenne vinduet med.
  //     dBuildingGrid leser `pal.glod || pal.vindu` og bruker den både til den
  //     bakte flaten og til fargen på nattgløden. Mangler begge, blir `tent`
  //     undefined — og `fillStyle = undefined` kaster ikke, den BEHOLDER
  //     forrige farge. Det tente vinduet ville da blitt malt i takets teglrødt
  //     uten at noe som helst stoppet opp, og nattlyset hadde fått `undefined`
  //     som farge. Sjekken leser groundLayer-kilden etter `s.kvartal(`, samme
  //     grep som sjekk 14 bruker for å finne temaene som tegner noe eget.
  TRACKS.forEach(function(t){
    const gl = t.theme.groundLayer;
    if(!gl || String(gl).indexOf('s.kvartal(') < 0) return;
    const pal = t.theme.lagPal || {};
    const tent = pal.glod || pal.vindu;
    sjekk('kvartalslys: ' + t.name, erHex(tent),
      'bykvartaler uten lagPal.glod/vindu — tent vindu og nattlys får ingen farge');
  });

  // 19. Et bykvartal må lese som HUS i alle tre døgntidene, ikke bare ved dag.
  //     Dette er sjekken som gjør at en bypalett ikke kan bli dag-only igjen:
  //     den leser spillets EGEN TOD-liste (ikke en kopi av alfaverdiene, for da
  //     kunne et endret overlegg gått umålt forbi), komponerer hver tone under
  //     hvert overlegg og krever to ting i HVER tid:
  //       a) tak mot fasade ≥ 3:1 — det er taket som skiller et hus fra en
  //          flate. Faller det bort, står kvartalet igjen som en brikke med
  //          prikker: nøyaktig dominobrikkene som ble målt i steg C2.
  //       b) kvartalet mot den verste bakketonen ≥ 3:1 — og her er det nok at
  //          ÉN av flatene (tak eller fasade) bærer det, samme regel som
  //          lakkeringenes base/acc: kvartalet er synlig mot bakken så lenge
  //          noe i det er synlig.
  //     GULVET ER LAVERE OM NATTA, og det er en måling som sier det. Under et
  //     flatt overlegg er den STØRST MULIGE kontrasten mellom to farger
  //     bestemt av overlegget alene — hvitt mot svart, komponert — og den
  //     måles her i `taket` under. Ved dag er taket 21:1 og 3 er 14 % av det;
  //     om natta er taket 5,45:1 og 3 er 55 % av alt som finnes. Å kreve de
  //     siste prosentene har en pris, og den prisen er METNING: brøken er
  //     blind for kulør, så den ser ingen forskjell på et cyan vindu i en grå
  //     vegg og en grå flekk i samme vegg — mens øyet ser en nattby i det ene
  //     og ingenting i det andre. Et målt 3:1-krav om natta ble prøvd i steg
  //     C2 og FORKASTET: alle tall ble bedre, alle bilder ble verre.
  //     Gulvet er derfor navngitt per døgntid, og en ny tid MÅ legges inn her
  //     (ellers stryker sjekken) — en umålt døgntid skal ikke kunne gli forbi.
  const KVART_GULV = { 'DAG': 3, 'SOLNEDGANG': 3, 'NATT': 2.5 };
  const todListe = (game.TOD || []).map(function(t){
    return { navn: t.name, ov: parseRgba(t.overlay) };
  });
  TRACKS.forEach(function(t){
    const gl = t.theme.groundLayer;
    if(!gl || String(gl).indexOf('s.kvartal(') < 0) return;
    const pal = t.theme.lagPal || {};
    const fasader = ['husA','husB','husC'].map(function(k){ return pal[k]; });
    const ground = (t.theme.ground || []).filter(erHex);
    if(!erHex(pal.tak) || !fasader.every(erHex) || !ground.length){
      sjekk('kvartal i døgnet: ' + t.name, false,
        'lagPal mangler tak/husA/husB/husC, eller temaet har ingen bakketoner');
      return;
    }
    // Verste måles som MARGIN til tidens eget gulv, ikke som rå brøk — ellers
    // ville natta alltid vært «verst» og dag/solnedgang aldri blitt rapportert.
    let verstMargin = Infinity, verstTekst = '', alleOk = true;
    todListe.forEach(function(tid){
      const gulv = KVART_GULV[tid.navn];
      const tak = komponer(pal.tak, tid.ov);
      const hus = fasader.map(function(f){ return komponer(f, tid.ov); });
      const bak = ground.map(function(g){ return komponer(g, tid.ov); });
      // Taket måles mot den fasaden det har MINST å gå på mot.
      let tMin = Infinity;
      hus.forEach(function(h){ tMin = Math.min(tMin, game.contrastRatio(tak, h)); });
      // Mot bakken: beste flate, men hver flate mot sin verste bakketone.
      let beste = 0;
      [tak].concat(hus).forEach(function(f){
        let mot = Infinity;
        bak.forEach(function(g){ mot = Math.min(mot, game.contrastRatio(f, g)); });
        if(mot > beste) beste = mot;
      });
      if(gulv == null){
        alleOk = false;
        verstMargin = -Infinity;
        verstTekst = 'døgntiden ' + tid.navn + ' har ingen oppføring i KVART_GULV — ' +
          'legg den inn med et MÅLT krav før den tas i bruk';
        return;
      }
      const margin = Math.min(tMin, beste) - gulv;
      if(tMin < gulv || beste < gulv) alleOk = false;
      if(margin < verstMargin){
        verstMargin = margin;
        verstTekst = 'trangest i ' + tid.navn + ' — tak/fasade ' + tMin.toFixed(2) + ':1, kvartal/bakke ' +
          beste.toFixed(2) + ':1, gulvet er ' + gulv + ':1 (tidens eget tak er ' +
          game.contrastRatio(komponer('#ffffff', tid.ov), komponer('#000000', tid.ov)).toFixed(1) + ':1)';
      }
    });
    sjekk('kvartal i døgnet: ' + t.name, alleOk, verstTekst);
  });

  // 20. Vinduene måles også under hvert overlegg, men med et ANNET krav enn
  //     kvartalet — og det er en måling som bestemmer hvilket, ikke en smakssak:
  //
  //     Det TENTE vinduet kan ikke nå 3:1 mot fasaden i NOEN døgntid. Målt mot
  //     husC er det 1,15:1 ved dag og 1,11:1 om natta, og det er ikke en svak
  //     palett: et tent vindu MÅ være lysere enn veggen, og veggen ligger alt
  //     på L≈0,9 fordi det er den som bærer takets 3:1. Over den finnes det
  //     ikke luminans igjen å ta av. Det tente vinduet leses derfor av at det
  //     er LYSERE enn veggen pluss GLØDEN som legges oppå (steg D1), ikke av en
  //     kontrastbrøk. Kravet her er altså RETNING med margin.
  //
  //     HVILKEN VEI den bakte ruta skal gå er en egenskap ved byen, og den står
  //     som DATA og ikke som et banenavn i testen: har temaet `lagMot.vindu`,
  //     er ruta en mørk ÅPNING som måles mot fasaden (LABIRINTO — skodder og
  //     skygge i en middelhavsby ved dag). Mangler oppføringen, er ruta TENT og
  //     måles mot bakken av sjekk 14 som alle andre flater (SERPENTINA og
  //     VISTANOTTE, der lyset er på). Sjekken under måler bare at retningen er
  //     den temaet har meldt — en palett kan altså ikke snu ruta uten samtidig
  //     å flytte `lagMot`, og da er det en synlig endring og ikke et uhell.
  //
  //     Åpningens nattgulv er 2,25:1, målt: LABIRINTO ligger på 2,33 om natta.
  //     Å presse den til 3 krever en åpning så mørk at den måler 1,00:1 mot
  //     sitt eget tak, altså å betale med den ene distinksjonen som finnes, for
  //     en brøk på en flate som er 2,4 × 3,2 px oppå en fasade som ALT består.
  //     Dagkravet på 3:1 står derimot urørt fra steg C — det er ved dag åpningen
  //     faktisk skal lese som en åpning.
  const APNING_DAG_MIN = 3;    // steg C sitt krav, uendret
  const APNING_GULV = 2.25;    // nattgulv; målt verste er 2,33 (LABIRINTO)
  const TENT_MARGIN = 1.10;    // tent rute over husC i luminans; målt 1,11–1,26
  TRACKS.forEach(function(t){
    const gl = t.theme.groundLayer;
    if(!gl || String(gl).indexOf('s.kvartal(') < 0) return;
    const pal = t.theme.lagPal || {};
    const fasader = ['husA','husB','husC'].map(function(k){ return pal[k]; });
    if(!erHex(pal.vindu) || !fasader.every(erHex)) return; // dekket av sjekk 18/19
    const tent = pal.glod || pal.vindu;
    // Temaets egen melding om hvilken vei ruta går.
    const erApning = ((t.theme.lagMot || {}).vindu) != null;
    let apningDag = Infinity, apningVerst = Infinity, tentVerst = Infinity;
    let ruteVerst = Infinity, retningOk = true, hvor = '';
    todListe.forEach(function(tid){
      const hus = fasader.map(function(f){ return komponer(f, tid.ov); });
      const v = komponer(pal.vindu, tid.ov), g = komponer(tent, tid.ov);
      // Retningen må holde i ALLE tre tider. En åpning som blir lysere enn
      // veggen leser som tent midt på dagen, og en tent rute som faller under
      // veggen er en flekk og ikke lys — og overlegget kan snu begge, for det
      // klemmer mørkt og lyst ulikt mye sammen.
      if(erApning){
        // Åpningen måles mot den MØRKESTE fasaden (husA) — der er den trangest.
        const kv = game.contrastRatio(v, hus[0]);
        if(tid.ov == null) apningDag = Math.min(apningDag, kv);
        apningVerst = Math.min(apningVerst, kv);
        if(game.relLuminance(v) >= game.relLuminance(hus[0])){
          retningOk = false; hvor = 'åpningen er lysere enn husA i ' + tid.navn;
        }
      } else {
        // Den tente ruta måles mot den LYSESTE fasaden (husC) — der er den
        // trangest, og det er den fasaden ruta oftest står i.
        const forhold = (game.relLuminance(v) + 0.0001) / (game.relLuminance(hus[2]) + 0.0001);
        ruteVerst = Math.min(ruteVerst, forhold);
        if(forhold <= 1){
          retningOk = false; hvor = 'den tente ruta er mørkere enn husC i ' + tid.navn;
        }
      }
      // GLØDEN fra D1 er `glod`, og den må være lysere enn veggen uansett
      // hvilken vei den bakte ruta går — en glød som ikke er lysere enn flaten
      // under gjør bildet mørkere, ikke lysere (se steg B4 om blending).
      tentVerst = Math.min(tentVerst,
        (game.relLuminance(g) + 0.0001) / (game.relLuminance(hus[2]) + 0.0001));
    });
    sjekk('vindusretning: ' + t.name, retningOk, hvor);
    if(erApning){
      sjekk('åpning mot fasade: ' + t.name,
        apningDag >= APNING_DAG_MIN && apningVerst >= APNING_GULV,
        'åpning/husA ' + apningDag.toFixed(2) + ':1 ved dag (krav ' + APNING_DAG_MIN +
        ':1), verst ' + apningVerst.toFixed(2) + ':1 under overlegg (gulv ' + APNING_GULV + ':1)');
    } else {
      sjekk('tent rute over fasade: ' + t.name, ruteVerst >= TENT_MARGIN,
        'den bakte ruta er bare ×' + ruteVerst.toFixed(3) + ' husC sin luminans i verste ' +
        'døgntid, kravet er ×' + TENT_MARGIN);
    }
    sjekk('glød over fasade: ' + t.name, tentVerst >= TENT_MARGIN,
      'lagPal.glod er bare ×' + tentVerst.toFixed(3) + ' husC sin luminans i verste døgntid, ' +
      'kravet er ×' + TENT_MARGIN + ' — under det slutter D1-gløden å lese som lys i en vegg');
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
