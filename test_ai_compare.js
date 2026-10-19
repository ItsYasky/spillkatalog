#!/usr/bin/env osascript -l JavaScript
// Sammenligner to målefiler fra test_ai_sim.js og skriver ut en tabell med
// FØR- og ETTER-tall side om side.
//
// HVORFOR dette ligger i en egen fil: måle-matrisen tar rundt 12 minutter å
// kjøre, så «før» og «etter» kan ikke kjøres i samme prosess. Tallene lagres
// som JSON, og denne filen er det som faktisk svarer på spørsmålet «ble det
// bedre eller verre?» — uten at man må lese 52 linjer tall to ganger.
//
// Bruk:
//   osascript -l JavaScript test_ai_compare.js ai_baseline_before.json ai_baseline_after_A.json
//   ... --only MIDDELS      bare én vanskelighetsgrad
//   ... --worse             bare radene der noe ble verre

ObjC.import('Foundation');

function readJSON(path){
  const s = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, null);
  if(!s) throw new Error('fant ikke ' + path);
  return JSON.parse(ObjC.unwrap(s));
}

function pad(s, n){ s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padL(s, n){ s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }
function num(v, d){ return (v === null || v === undefined) ? '-' : v.toFixed(d === undefined ? 3 : d); }

function key(r){ return r.trackIdx + '|' + r.mode + '|' + r.diff; }

function main(argv){
  const files = argv.filter(function(a){ return a.indexOf('--') !== 0; });
  let only = null, worseOnly = false;
  for(let i=0;i<argv.length;i++){
    if(argv[i] === '--only') only = argv[i+1];
    else if(argv[i] === '--worse') worseOnly = true;
  }
  if(files.length < 2){ console.log('bruk: test_ai_compare.js FOER.json ETTER.json'); return; }

  const A = readJSON(files[0]), B = readJSON(files[1]);
  const bmap = new Map();
  B.results.forEach(function(r){ bmap.set(key(r), r); });

  console.log('FOER: ' + files[0] + '  (' + A.laps + ' runder, ' + A.trials + ' forsoek)');
  console.log('ETTER: ' + files[1] + '  (' + B.laps + ' runder, ' + B.trials + ' forsoek)');
  console.log('');
  console.log(pad('BANE',12) + pad('MODUS',11) + pad('NIVAA',10) +
    padL('L1 foer',9) + padL('etter',8) + padL('L4 foer',9) + padL('etter',8) +
    padL('L8 foer',9) + padL('etter',8) + padL('vegg f',8) + padL('e',7) +
    padL('utenf f',9) + padL('e',8) + padL('brudd',7));

  // Aggregater: det er disse tallene steg G skal dømmes på — ingen bane får ha
  // flere veggtreff eller mer tid utenfor banen enn før.
  let worseWall = [], worseOff = [], sumL8a = 0, sumL8b = 0, n = 0, maxL8b = 0, maxL8bRow = null;

  A.results.forEach(function(a){
    const b = bmap.get(key(a));
    if(!b) return;
    if(only && a.diff !== only) return;
    const wallWorse = (b.wallHitsPerCar || 0) > (a.wallHitsPerCar || 0) + 1e-9;
    const offWorse  = (b.offFracPerCar || 0) > (a.offFracPerCar || 0) + 1e-9;
    if(wallWorse) worseWall.push(a.track + '/' + a.mode + '/' + a.diff +
      ' ' + num(a.wallHitsPerCar) + ' -> ' + num(b.wallHitsPerCar));
    if(offWorse) worseOff.push(a.track + '/' + a.mode + '/' + a.diff +
      ' ' + num(a.offFracPerCar,5) + ' -> ' + num(b.offFracPerCar,5));
    if(a.spreadLap8 !== null && b.spreadLap8 !== null){
      sumL8a += a.spreadLap8; sumL8b += b.spreadLap8; n++;
      if(b.spreadLap8 > maxL8b){ maxL8b = b.spreadLap8; maxL8bRow = b; }
    }
    if(worseOnly && !wallWorse && !offWorse) return;
    console.log(pad(a.track,12) + pad(a.mode,11) + pad(a.diff,10) +
      padL(num(a.spreadLap1),9) + padL(num(b.spreadLap1),8) +
      padL(num(a.spreadLap4),9) + padL(num(b.spreadLap4),8) +
      padL(num(a.spreadLap8),9) + padL(num(b.spreadLap8),8) +
      padL(num(a.wallHitsPerCar,2),8) + padL(num(b.wallHitsPerCar,2),7) +
      padL(num(a.offFracPerCar,5),9) + padL(num(b.offFracPerCar,5),8) +
      padL(num(b.violPerCar,2),7));
  });

  console.log('');
  console.log('Snitt spredning etter 8 runder: foer ' + (sumL8a/n).toFixed(3) +
    ' -> etter ' + (sumL8b/n).toFixed(3) + ' runder  (' + n + ' konfigurasjoner)');
  if(maxL8bRow) console.log('Stoerste spredning etter: ' + maxL8b.toFixed(3) + ' runder (' +
    maxL8bRow.track + '/' + maxL8bRow.mode + '/' + maxL8bRow.diff + ')');
  // Grensen fra oppgaven: siste bil skal ikke ligge mer enn én hel runde bak.
  console.log(maxL8b > 1.0 ? 'ADVARSEL: over 1 runde spredning — posFactor maa strammes.'
                           : 'OK: ingen konfigurasjon over 1 runde spredning.');
  console.log(worseWall.length ? 'VERRE veggtreff (' + worseWall.length + '):\n  ' + worseWall.join('\n  ')
                               : 'Ingen bane fikk flere veggtreff.');
  console.log(worseOff.length ? 'VERRE tid utenfor (' + worseOff.length + '):\n  ' + worseOff.join('\n  ')
                              : 'Ingen bane fikk mer tid utenfor banen.');
}

main($.NSProcessInfo.processInfo.arguments.js.slice(4).map(function(a){ return ObjC.unwrap(a); }));
