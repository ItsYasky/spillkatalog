// ============================================================================
// Lag- og lakktest for vintage_f1.html.
//
//   osascript -l JavaScript tester/test_lag.js
//   osascript -l JavaScript tester/test_lag.js --html /tmp/annen.html
//   osascript -l JavaScript tester/test_lag.js --ut rapport.txt
//
// HVORFOR DENNE FINNES
// Et lag er nå DATA: navn, sponsorer, en vanlig lakk og en liste spesiallakker.
// Å legge til en lakk skal koste ett objekt og ingenting annet — og nettopp
// derfor finnes det ingen kompilator som sier fra når objektet er feil. En
// glemt `dark`, en `pat` som ikke står i PATTERNS, to lakker med samme `id`
// (de ville delt sprite) eller et banenavn med skrivefeil (lakken ville aldri
// blitt vist) gir alle en bil som ser rar ut eller aldri dukker opp, uten en
// eneste feilmelding.
//
// Det samme gjelder kontrasten. En bil er 28 px uten kontur og uten tekst: er
// den ikke å skille fra asfalten, forsvinner den. Etter runde 4 har hver bane
// sin EGEN asfalt, så det holder ikke å måle mot ett dekke — og en spesiallakk
// som bare kjøres på én bane må måles mot NETTOPP den banen, ikke mot alle
// tretten. Dette er med vilje: en hjemmelakk er valgt for sitt eget dekke, og
// et krav om kontrast mot tolv baner den aldri kan vises på ville forbudt
// lakker som er helt i orden der de faktisk kjører.
//
// Målingene går gjennom spillets EGEN contrastRatio(), ikke en kopi — ellers
// kunne testen hatt nøyaktig samme feil som koden den skal bevise.
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

// Samme no-op-proxy som de andre JSC-testene: her leses lag og lakker som DATA,
// så ingen tegnekall trenger å gjøre noe som helst.
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
    'return { get TEAMS(){ return TEAMS; }, get TRACKS(){ return TRACKS; },' +
    ' get PATTERNS(){ return PATTERNS; }, get TOD(){ return TOD; },' +
    ' get NUM_CARS(){ return NUM_CARS; }, get DRIVERS_PER_TEAM(){ return DRIVERS_PER_TEAM; },' +
    ' get COCKPIT_BG(){ return COCKPIT_BG; },' +
    ' lagLakker: lagLakker, aktivLakk: aktivLakk, lagFaktor: lagFaktor,' +
    ' contrastRatio: contrastRatio, teamInk: teamInk, podiumInk: podiumInk };\n})');
  return factory(documentStub, windowStub, function(){}, { now: function(){ return 0; } }, localStorageStub);
}

// ── små hjelpere ────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;
function erHex(v){ return typeof v === 'string' && HEX.test(v); }
function erTekst(v){ return typeof v === 'string' && v.length > 0; }

// Fargefeltene på en lakk. `spc` er med fordi sponsorflatene tegnes i den og
// den ikke lenger arver `hel` for lagenes lakker — den står eksplisitt.
const FARGEFELT = ['base','acc','dark','hel','spc'];
const PROFILNOKLER = ['toppfart','sving','akselerasjon','aggresjon'];

// ── testene ─────────────────────────────────────────────────────────────────
function kjør(game){
  const res = [];
  function sjekk(navn, ok, detalj){ res.push({ navn: navn, ok: !!ok, detalj: detalj || '' }); }

  const TEAMS = game.TEAMS;
  const TRACKS = game.TRACKS;
  const baneNavn = TRACKS.map(function(t){ return t.name; });
  const todNavn = game.TOD.map(function(t){ return t.name; });

  // Alle lakker i spillet, flatet ut, med laget og rollen sin med seg.
  const alle = [];
  TEAMS.forEach(function(t){
    alle.push({ lag: t, lv: t.lakk.vanlig, rolle: 'vanlig', navn: t.name + ' ' + t.lakk.vanlig.navn });
    t.lakk.spesial.forEach(function(lv){
      alle.push({ lag: t, lv: lv, rolle: 'spesial', navn: t.name + ' ' + lv.navn });
    });
  });

  // ── 1. laget selv ─────────────────────────────────────────────────────────
  TEAMS.forEach(function(t){
    const ok = erTekst(t.name) && erTekst(t.short) && t.short.length === 3 &&
               erTekst(t.hjem) && erTekst(t.type) &&
               erTekst(t.sponsor) && Array.isArray(t.sponsors) && t.sponsors.length >= 1 &&
               t.sponsors.every(erTekst);
    sjekk('lagfelt: ' + t.name, ok,
      'name/short(3 tegn)/hjem/type/sponsor/sponsors må alle finnes — fikk ' +
      JSON.stringify({ short: t.short, hjem: t.hjem, type: t.type,
                       sponsor: t.sponsor, sponsors: t.sponsors }));
  });

  // Lagnavn og tre-bokstavskode må være unike: koden er det ENESTE som skiller
  // lagene i den trange resultatlista (108 px), og navnet er nøkkelen DITT LAG
  // lagres med i localStorage.
  ['name','short'].forEach(function(felt){
    const sett = {}, dubl = [];
    TEAMS.forEach(function(t){
      if(sett[t[felt]]) dubl.push(t[felt]); else sett[t[felt]] = true;
    });
    sjekk('unike lag-' + felt, dubl.length === 0, 'dublett: ' + dubl.join(', '));
  });

  // ── 2. aliasene ───────────────────────────────────────────────────────────
  // color/accent/dark leses av minimap, HUD-stripa, menyene og resultatlista.
  // Kommer de i utakt med den vanlige lakken, viser menyen én farge og bilen en
  // annen — og det er ikke til å se i noen av dem alene.
  TEAMS.forEach(function(t){
    const v = t.lakk.vanlig;
    sjekk('aliaser i takt: ' + t.name,
      t.color === v.base && t.accent === v.acc && t.dark === v.dark,
      'color/accent/dark (' + t.color + '/' + t.accent + '/' + t.dark +
      ') skal speile den vanlige lakken (' + v.base + '/' + v.acc + '/' + v.dark + ')');
  });

  // teamInk/podiumInk lysner lagfargen for menyene ved å regne om via HSL, og
  // regnestykket kan produsere en UGYLDIG hex (et kanal under null gir f.eks.
  // «#e4-1b36»). Canvas forkaster en slik verdi STILLE og beholder forrige
  // fillStyle, så lagnavnet dukker opp i en vilkårlig annen farge — det ser ut
  // som et designvalg, ikke som en feil. Kontrastmålingen fanger det ikke
  // engang: den tolker «-1» som et tall og rapporterer en pen verdi. Derfor
  // måles FORMEN her, før noen måler kontrasten.
  TEAMS.forEach(function(t){
    [['teamInk', game.teamInk(t.color)], ['podiumInk', game.podiumInk(t.color)]].forEach(function(p){
      sjekk(p[0] + ' gir gyldig hex: ' + t.name, erHex(p[1]),
        p[0] + '(' + t.color + ') ga ' + JSON.stringify(p[1]) +
        ' — ikke #rrggbb, så canvas ignorerer den uten å si fra');
    });
  });

  // ── 3. profilen (plassen til egenskapene, ikke i bruk) ────────────────────
  TEAMS.forEach(function(t){
    const p = t.profil || {};
    const ok = PROFILNOKLER.every(function(k){ return typeof p[k] === 'number' && isFinite(p[k]); });
    sjekk('profil finnes: ' + t.name, ok,
      'forventet tall for ' + PROFILNOKLER.join('/') + ', fikk ' + JSON.stringify(p));
  });
  // lagFaktor skal returnere 1 for ALT i denne runden. Står den ikke fast på 1,
  // har noen begynt å bruke profilen uten å balansere den mot
  // vanskelighetsgradene først — se CLAUDE.md, «Lagenes egenskaper».
  (function(){
    const avvik = [];
    TEAMS.forEach(function(t){
      PROFILNOKLER.concat(['finnesIkke']).forEach(function(k){
        const f = game.lagFaktor(t, k);
        if(f !== 1) avvik.push(t.name + '.' + k + '=' + f);
      });
    });
    sjekk('lagFaktor er nøytral (alltid 1)', avvik.length === 0, avvik.join(', '));
  })();

  // ── 4. hver lakks felt ────────────────────────────────────────────────────
  alle.forEach(function(l){
    const lv = l.lv;
    const manglerFarge = FARGEFELT.filter(function(f){ return !erHex(lv[f]); });
    sjekk('lakkfelt: ' + l.navn,
      erTekst(lv.id) && erTekst(lv.navn) && manglerFarge.length === 0,
      (manglerFarge.length ? 'ugyldig/manglende hex: ' + manglerFarge.map(function(f){
        return f + '=' + lv[f];
      }).join(', ') + '. ' : '') + 'id=' + lv.id + ' navn=' + lv.navn);
    sjekk('mønsteret finnes: ' + l.navn,
      Object.prototype.hasOwnProperty.call(game.PATTERNS, lv.pat),
      'pat=' + JSON.stringify(lv.pat) + ' står ikke i PATTERNS (' +
      Object.keys(game.PATTERNS).join('/') + ')');
  });

  // Unike id-er. Sprite-bufferet er nøklet på id: to lakker med samme id ville
  // delt sprite, altså vist den FØRSTE lakkens farger på den andres bil.
  (function(){
    const sett = {}, dubl = [];
    alle.forEach(function(l){
      if(sett[l.lv.id]) dubl.push(l.lv.id + ' (' + sett[l.lv.id] + ' og ' + l.navn + ')');
      else sett[l.lv.id] = l.navn;
    });
    sjekk('unike lakk-id', dubl.length === 0, 'dublett: ' + dubl.join(', '));
  })();

  // ── 5. spesiallakkenes bane og tid ────────────────────────────────────────
  alle.forEach(function(l){
    if(l.rolle !== 'spesial') return;
    // En lakk uten både bane og tid ville ligget foran den vanlige på HVER bane
    // til HVER tid — altså ville den vanlige lakken aldri blitt vist. Det er
    // ikke en spesiallakk, det er en erstatning for den vanlige.
    sjekk('spesiallakk har bane eller tid: ' + l.navn,
      l.lv.bane !== undefined || l.lv.tid !== undefined,
      'verken bane eller tid — da vinner den over den vanlige overalt');
    if(l.lv.bane !== undefined){
      sjekk('bane finnes: ' + l.navn, baneNavn.indexOf(l.lv.bane) >= 0,
        JSON.stringify(l.lv.bane) + ' er ikke et banenavn i TRACKS — lakken vises aldri');
    }
    if(l.lv.tid !== undefined){
      sjekk('tid finnes: ' + l.navn, todNavn.indexOf(l.lv.tid) >= 0,
        JSON.stringify(l.lv.tid) + ' er ikke et navn i TOD (' + todNavn.join('/') + ')');
    }
  });

  // En vanlig lakk skal ikke ha bane eller tid: den er fallbacken, og et felt
  // der ville vært dødkode som ser ut som en regel.
  TEAMS.forEach(function(t){
    const v = t.lakk.vanlig;
    sjekk('vanlig lakk uten bane/tid: ' + t.name,
      v.bane === undefined && v.tid === undefined,
      'bane=' + v.bane + ' tid=' + v.tid + ' — den vanlige lakken er fallbacken og gjelder overalt');
  });

  // ── 6. kontrast mot asfalten på de banene lakken faktisk kjører på ────────
  // Baner lakken kan vises på: en spesiallakk med `bane` bare DEN banen, alt
  // annet (vanlig lakk, og en spesiallakk som bare har `tid`) alle tretten.
  // Se filhodet for hvorfor avgrensningen er riktig og ikke en utvanning.
  function baneneFor(l){
    return (l.rolle === 'spesial' && l.lv.bane !== undefined) ? [l.lv.bane] : baneNavn;
  }
  const verste = { v: Infinity, hvor: '' };
  const perLakk = [];
  alle.forEach(function(l){
    const baner = baneneFor(l);
    const stryker = [];
    let min = Infinity, minBane = '';
    baner.forEach(function(bn){
      const tr = TRACKS[baneNavn.indexOf(bn)];
      if(!tr || !erHex(tr.theme.asphalt)) return;
      const asf = tr.theme.asphalt;
      // base ELLER acc: det er nok at ÉN av de to bærer bilen mot dekket,
      // samme regel som contrastCheck() i spillet bruker.
      const v = Math.max(game.contrastRatio(l.lv.base, asf), game.contrastRatio(l.lv.acc, asf));
      if(v < min){ min = v; minBane = bn; }
      if(v < 3) stryker.push(bn + ' (' + v.toFixed(2) + ':1)');
    });
    if(min < verste.v){ verste.v = min; verste.hvor = l.navn + ' mot ' + minBane; }
    perLakk.push({ navn: l.navn, min: min, bane: minBane, antall: baner.length });
    sjekk('asfaltkontrast: ' + l.navn, stryker.length === 0,
      'under 3:1 på ' + stryker.length + ' av ' + baner.length + ' bane(r) — ' + stryker.join(', '));
  });

  // ── 7. hjelm mot cockpiten, aksent mot grunnfargen ───────────────────────
  alle.forEach(function(l){
    const v = game.contrastRatio(l.lv.hel, game.COCKPIT_BG);
    sjekk('hjelm mot cockpit: ' + l.navn, v >= 3,
      l.lv.hel + ' mot ' + game.COCKPIT_BG + ' → ' + v.toFixed(2) + ':1 (krav 3:1)');
  });
  alle.forEach(function(l){
    const v = game.contrastRatio(l.lv.acc, l.lv.base);
    // bevisstLavKontrast er fritaket: en lakk kan MED VILJE bruke to farger med
    // samme lyshet (en tone-i-tone-lakk), og da er lavt tall valget, ikke en feil.
    if(l.lv.bevisstLavKontrast){
      sjekk('aksent mot grunnfarge: ' + l.navn + ' (fritatt)', true,
        'bevisstLavKontrast — ' + v.toFixed(2) + ':1 er valgt, ikke en feil');
    } else {
      sjekk('aksent mot grunnfarge: ' + l.navn, v >= 3,
        l.lv.acc + ' mot ' + l.lv.base + ' → ' + v.toFixed(2) + ':1 (krav 3:1, ' +
        'eller bevisstLavKontrast:true om det er med vilje)');
    }
  });

  // ── 8. aktivLakk velger som avtalt ────────────────────────────────────────
  // Regelen er hele grunnen til at spesiallakkene virker, og den er umulig å se
  // i et skjermbilde av én bane: hver lakk sjekkes her mot banen og tiden den
  // SELV sier den hører til, og mot en bane den ikke hører til.
  alle.forEach(function(l){
    if(l.rolle !== 'spesial') return;
    const bn = l.lv.bane !== undefined ? l.lv.bane : baneNavn[0];
    const tid = l.lv.tid !== undefined ? l.lv.tid : todNavn[0];
    const valgt = game.aktivLakk(l.lag, bn, tid, 'AUTO');
    // Hver spesiallakk må være NÅBAR: spør man om nøyaktig den banen og tiden
    // lakken selv oppgir, skal den komme ut. Det eneste lovlige unntaket er at
    // en lakk LENGER FRAM i lista oppgir samme bane og tid — da er den foran
    // med vilje prioritert, og det er en datasak, ikke en feil i regelen.
    const sp = l.lag.lakk.spesial;
    const skygget = sp.slice(0, sp.indexOf(l.lv)).some(function(f){
      return f.bane === l.lv.bane && f.tid === l.lv.tid;
    });
    sjekk('aktivLakk velger: ' + l.navn, valgt === l.lv || skygget,
      'på ' + bn + '/' + tid + ' ble ' + valgt.navn + ' valgt i stedet, og ingen lakk' +
      ' foran i lista oppgir samme bane og tid');
    // AV skal alltid gi den vanlige, uansett bane og tid.
    sjekk('aktivLakk AV gir vanlig: ' + l.navn,
      game.aktivLakk(l.lag, bn, tid, 'AV') === l.lag.lakk.vanlig,
      'fikk ' + game.aktivLakk(l.lag, bn, tid, 'AV').navn);
  });
  // Et banenavn ingen lakk hører til skal gi den vanlige. '(ingen bane)' kan
  // ikke treffe noe `bane`-felt, siden sjekk 5 krever at alle er ekte banenavn.
  // Lag med en spesiallakk som bare har `tid` hoppes over: deres lakk gjelder
  // med vilje på alle baner, så det finnes ingen bane der de faller tilbake.
  TEAMS.forEach(function(t){
    const harTidLakk = t.lakk.spesial.some(function(s){ return s.bane === undefined; });
    if(harTidLakk) return;
    sjekk('aktivLakk faller til vanlig: ' + t.name,
      game.aktivLakk(t, '(ingen bane)', todNavn[0], 'AUTO') === t.lakk.vanlig,
      'fikk ' + game.aktivLakk(t, '(ingen bane)', todNavn[0], 'AUTO').navn);
  });

  // En lakk uten `bane` hører til en TID og ikke et sted, så den skal gjelde på
  // ALLE baner den tiden — og på ingen av de andre tidene. Måles på hver enkelt
  // bane, ikke bare én, for det er nettopp «alle baner» som er regelen.
  alle.forEach(function(l){
    if(l.rolle !== 'spesial' || l.lv.bane !== undefined) return;
    const feilPaa = [], feilTid = [];
    baneNavn.forEach(function(bn){
      if(game.aktivLakk(l.lag, bn, l.lv.tid, 'AUTO') !== l.lv) feilPaa.push(bn);
      todNavn.forEach(function(td){
        if(td === l.lv.tid) return;
        if(game.aktivLakk(l.lag, bn, td, 'AUTO') === l.lv) feilTid.push(bn + '/' + td);
      });
    });
    sjekk('tidslakk gjelder alle baner: ' + l.navn, feilPaa.length === 0,
      'ble ikke valgt på ' + feilPaa.length + ' av ' + baneNavn.length + ' baner: ' + feilPaa.join(', '));
    sjekk('tidslakk bare på sin egen tid: ' + l.navn, feilTid.length === 0,
      'ble valgt på ' + feilTid.length + ' feil tidspunkt: ' + feilTid.join(', '));
  });

  // Når to lakker passer samtidig, skal den som peker på BANEN vinne over den
  // som bare peker på tida. Ingen av de ti lagene har begge i dag, så regelen
  // ville vært udekket av dataene — den måles derfor på et oppdiktet lag, slik
  // at den er bevist FØR et lag får bruk for den.
  (function(){
    const stedslakk = { id:'X-sted', navn:'Sted', bane:baneNavn[0], tid:todNavn[0],
                        base:'#ffffff', acc:'#000000', dark:'#000000', hel:'#ffffff', spc:'#ffffff', pat:'spine' };
    const tidslakk  = { id:'X-tid', navn:'Tid', tid:todNavn[0],
                        base:'#ffffff', acc:'#000000', dark:'#000000', hel:'#ffffff', spc:'#ffffff', pat:'spine' };
    const vanlig    = { id:'X-vanlig', navn:'Vanlig',
                        base:'#ffffff', acc:'#000000', dark:'#000000', hel:'#ffffff', spc:'#ffffff', pat:'spine' };
    // Tidslakken står FØRST i lista, så rekkefølgen kan ikke være grunnen til at
    // stedslakken vinner — bare regelen kan.
    const lag = { name:'TESTLAG', lakk:{ vanlig:vanlig, spesial:[tidslakk, stedslakk] } };
    sjekk('bane slår tid på sin egen bane',
      game.aktivLakk(lag, baneNavn[0], todNavn[0], 'AUTO') === stedslakk,
      'fikk ' + game.aktivLakk(lag, baneNavn[0], todNavn[0], 'AUTO').navn);
    sjekk('tid gjelder på de andre banene',
      game.aktivLakk(lag, baneNavn[1], todNavn[0], 'AUTO') === tidslakk,
      'fikk ' + game.aktivLakk(lag, baneNavn[1], todNavn[0], 'AUTO').navn);
    sjekk('ingen av dem på feil tid',
      game.aktivLakk(lag, baneNavn[0], todNavn[1], 'AUTO') === vanlig,
      'fikk ' + game.aktivLakk(lag, baneNavn[0], todNavn[1], 'AUTO').navn);
  })();

  // ── 9. griden ─────────────────────────────────────────────────────────────
  // Antall lag × sjåfører per lag ER antall biler. Legges det til et ellevte lag
  // uten at griden følger med, står to biler uten plass — og det dukker opp som
  // en bil som mangler, ikke som en feil.
  sjekk('lag × sjåfører = biler på griden',
    TEAMS.length * game.DRIVERS_PER_TEAM === game.NUM_CARS,
    TEAMS.length + ' lag × ' + game.DRIVERS_PER_TEAM + ' = ' +
    (TEAMS.length * game.DRIVERS_PER_TEAM) + ', men NUM_CARS er ' + game.NUM_CARS);

  return { res: res, alle: alle, verste: verste, perLakk: perLakk };
}

// ── kjøring og rapport ──────────────────────────────────────────────────────
(function(){
  const argv = $.NSProcessInfo.processInfo.arguments;
  const args = [];
  for(let i = 0; i < argv.count; i++) args.push(ObjC.unwrap(argv.objectAtIndex(i)));
  function flagg(navn){
    const i = args.indexOf(navn);
    return (i >= 0 && i + 1 < args.length) ? args[i + 1] : null;
  }
  const html = flagg('--html') || 'vintage_f1.html';
  const ut = flagg('--ut');

  const game = loadGame(html);
  const r = kjør(game);
  const feil = r.res.filter(function(s){ return !s.ok; });

  const linjer = [];
  linjer.push('LAG- OG LAKKTEST — ' + html);
  linjer.push('');
  r.res.forEach(function(s){
    linjer.push('  ' + (s.ok ? 'OK  ' : 'FEIL') + '  ' + s.navn + (s.ok ? '' : '\n          ' + s.detalj));
  });
  linjer.push('');

  const antSpesial = r.alle.filter(function(l){ return l.rolle === 'spesial'; }).length;
  linjer.push('OMFANG: ' + game.TEAMS.length + ' lag, ' + r.alle.length + ' lakker (' +
    (r.alle.length - antSpesial) + ' vanlige + ' + antSpesial + ' spesial), ' +
    game.NUM_CARS + ' biler på griden');
  linjer.push('');
  // Hele tabellen og ikke bare det verste tallet: en lakk som ligger rett over
  // 3:1 er den neste som stryker ved en liten justering, og det skal være synlig
  // UTEN å kjøre testen på nytt med andre terskler.
  linjer.push('SVAKESTE ASFALTKONTRAST PER LAKK (base eller acc, krav 3:1)');
  r.perLakk.slice().sort(function(a,b){ return a.min - b.min; }).forEach(function(p){
    linjer.push('  ' + p.navn.padEnd(26) + p.min.toFixed(2) + ':1  mot ' + p.bane +
      '  (målt mot ' + p.antall + ' bane' + (p.antall === 1 ? '' : 'r') + ')');
  });
  linjer.push('');
  linjer.push('svakeste asfaltkontrast noe sted: ' + r.verste.v.toFixed(2) + ':1 (' + r.verste.hvor + ')');
  linjer.push('');
  linjer.push('RESULTAT: ' + (r.res.length - feil.length) + '/' + r.res.length +
    (feil.length ? '  — ' + feil.length + ' sjekk(er) stryker' : '  — alt består'));

  const tekst = linjer.join('\n');
  if(ut){ writeFile(ut, tekst + '\n'); console.log('skrevet: ' + ut); }
  console.log(tekst);
})();
