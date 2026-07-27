/* ============================================================
   RIKSTER – Party-Modus
   ------------------------------------------------------------
   Eigenständiges Modul, wird nach app.js geladen und klinkt
   sich über die dort vorbereiteten Haken ein:
     openModeScreen()    – Modus-Wahl nach "Spielen"
     partyOnScanned()    – übernimmt Scans im Party-Modus
     partyGoHub()        – zurück zur Zug-Übersicht
     partyOnWeiter()     – "Einordnen" auf dem Player-Screen
     partyOnRevealBack() – zurück von den Song-Details

   Regeln (an Hitster angelehnt):
   - Jeder Spieler scannt zu Beginn seine offene Startkarte.
   - Am Zug: Karte scannen, Song hören, in der eigenen
     Zeitleiste einordnen (die App wertet automatisch aus).
   - Falsch eingeordnete Karten können abgeworfen oder einem
     Mitspieler gegeben werden (der sie richtig erraten hat) –
     sie landen dann automatisch an der richtigen Stelle.
   - "Karte kaufen" (3 Chips, Chips bleiben physisch am Tisch):
     nächste Karte wandert direkt an die richtige Position.
   - Wer zuerst das Kartenziel erreicht, bekommt Platz 1 –
     gespielt wird weiter, bis alle Plätze vergeben sind.
   ============================================================ */

'use strict';

var PARTY_COLORS = ['#FF2E63', '#33B1FF', '#3DDC84', '#FFE14D', '#F7A928', '#B388FF', '#FF8A65', '#4DD0E1'];
var party = null;        /* laufender Spielstand */
var setupDraft = null;   /* Zustand des Einrichtungs-Screens */
var placeBusy = false;   /* Doppel-Tipps beim Einordnen abfangen */
var winDone = null;      /* Callback nach der Platzierungs-Animation */

/* ---------- Speichern & Laden ---------- */
function partySave() {
  try { localStorage.setItem(LS.party, JSON.stringify(party)); } catch (e) { /* egal */ }
}
function partyLoad() {
  try {
    var p = JSON.parse(localStorage.getItem(LS.party) || 'null');
    return (p && p.players && p.players.length >= 2) ? p : null;
  } catch (e) { return null; }
}
function partyClear() {
  try { localStorage.removeItem(LS.party); } catch (e) { /* egal */ }
  party = null;
}

function curPlayer() { return party.players[party.turnIdx]; }
function unfinished() {
  return party.players.filter(function (p) { return p.place === null; });
}
function medal(pl) {
  return pl === 1 ? '\ud83e\udd47' : pl === 2 ? '\ud83e\udd48' : pl === 3 ? '\ud83e\udd49' : pl + '.';
}

/* ============================================================
   MODUS-WAHL
   ============================================================ */
function openModeScreen() {
  var saved = partyLoad();
  var btn = $('#btnModeResume');
  if (saved && !saved.ended) {
    var names = saved.players.map(function (p) { return p.name; });
    var label = names.slice(0, 3).join(', ') + (names.length > 3 ? ' \u2026' : '');
    btn.textContent = 'Party fortsetzen (' + label + ')';
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }
  showScreen('screen-mode');
}

function startNormalMode() {
  state.gameMode = 'normal';
  document.body.classList.remove('party-guess');
  restoreWeiterButton();
  startScanner();
}

/* ============================================================
   PARTY EINRICHTEN
   ============================================================ */
function openPartySetup() {
  var saved = partyLoad();
  setupDraft = {
    names: saved ? saved.players.map(function (p) { return p.name; }) : ['', ''],
    target: saved ? saved.goal : 10
  };
  if (setupDraft.names.length < 2) setupDraft.names = ['', ''];
  renderSetup();
  showScreen('screen-party-setup');
}

function miniBtn(txt, label, fn) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'mini-btn';
  b.textContent = txt;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', fn);
  return b;
}

function renderSetup() {
  var list = $('#setupPlayers');
  list.innerHTML = '';
  setupDraft.names.forEach(function (name, i) {
    var row = document.createElement('div');
    row.className = 'setup-row';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 14;
    input.placeholder = 'Spieler ' + (i + 1);
    input.value = name;
    input.setAttribute('aria-label', 'Name von Spieler ' + (i + 1));
    input.addEventListener('input', function () { setupDraft.names[i] = input.value; });
    var up = miniBtn('\u25b2', 'Nach oben', function () { swapNames(i, i - 1); });
    var down = miniBtn('\u25bc', 'Nach unten', function () { swapNames(i, i + 1); });
    up.disabled = (i === 0);
    down.disabled = (i === setupDraft.names.length - 1);
    var del = miniBtn('\u2715', 'Spieler entfernen', function () {
      if (setupDraft.names.length <= 2) { toast('Mindestens zwei Spieler'); return; }
      setupDraft.names.splice(i, 1);
      renderSetup();
    });
    row.appendChild(input);
    row.appendChild(up);
    row.appendChild(down);
    row.appendChild(del);
    list.appendChild(row);
  });
  $('#targetVal').textContent = String(setupDraft.target);
}

function swapNames(a, b) {
  if (b < 0 || b >= setupDraft.names.length) return;
  var t = setupDraft.names[a];
  setupDraft.names[a] = setupDraft.names[b];
  setupDraft.names[b] = t;
  renderSetup();
}

function makePlayer(name, i) {
  return {
    name: name,
    color: PARTY_COLORS[i % PARTY_COLORS.length],
    timeline: [],   /* [{year, artist, title}], nach Jahr sortiert */
    att: [],        /* Versuche: {correct, bought, year, decade, genre} */
    hadStart: false,
    bought: 0, received: 0, given: 0, dropped: 0,
    place: null
  };
}

function startParty() {
  var players = setupDraft.names.map(function (n, i) {
    return makePlayer((n || '').trim() || ('Spieler ' + (i + 1)), i);
  });
  party = {
    goal: setupDraft.target,
    players: players,
    turnIdx: 0,
    nextPlace: 1,
    ended: false,
    purpose: null,   /* 'start' | 'guess' | 'buy' */
    pending: null,   /* falsch eingeordnete Karte, Schicksal offen */
    last: null       /* letztes Ergebnis fürs Ergebnis-Sheet */
  };
  state.gameMode = 'party';
  partySave();
  partyGoHub();
}

function resumeParty() {
  var saved = partyLoad();
  if (!saved) { toast('Keine gespeicherte Party gefunden'); return; }
  party = saved;
  if (party.pending) { curPlayer().dropped++; party.pending = null; } /* offene Karte sauber abwerfen */
  party.purpose = null;
  state.gameMode = 'party';
  partySave();
  partyGoHub();
}

/* ============================================================
   ZUG-ÜBERSICHT (Hub)
   ============================================================ */
function partyGoHub() {
  if (!party) {
    state.gameMode = 'normal';
    showScreen('screen-home');
    return;
  }
  document.body.classList.remove('party-guess');
  restoreWeiterButton();
  party.purpose = null;
  partySave();
  renderHub();
  showScreen('screen-party-turn');
}

function renderHub() {
  var p = curPlayer();
  $('#turnBadge').textContent = 'Am Zug \u00b7 Ziel: ' + party.goal + ' Karten';
  var nameEl = $('#turnName');
  nameEl.textContent = p.name;
  nameEl.style.color = p.color;
  var left = Math.max(0, party.goal - p.timeline.length);
  $('#turnProgress').textContent = p.place !== null
    ? ('\ud83c\udf89 Platz ' + p.place + ' \u2013 geschafft!')
    : (left === 0
      ? 'Ziel erreicht!'
      : ('Noch ' + left + (left === 1 ? ' Karte' : ' Karten') + ' bis zum Sieg'));
  renderTimeline($('#turnTimeline'), p);
  $('#btnTurnScan').textContent = p.hadStart ? 'Karte scannen' : 'Startkarte scannen';
  $('#btnTurnBuy').disabled = !p.hadStart;
  renderStandings();
}

function tlCardEl(card) {
  var d = document.createElement('div');
  d.className = 'tl-card';
  var a = document.createElement('div'); a.className = 'tl-a'; a.textContent = card.artist;
  var y = document.createElement('div'); y.className = 'tl-y'; y.textContent = card.year;
  var t = document.createElement('div'); t.className = 'tl-t'; t.textContent = card.title;
  d.appendChild(a); d.appendChild(y); d.appendChild(t);
  return d;
}

function renderTimeline(el, p) {
  el.innerHTML = '';
  if (!p.timeline.length) {
    var e = document.createElement('p');
    e.className = 'tl-empty';
    e.textContent = 'Noch keine Karten \u2013 zuerst die Startkarte scannen.';
    el.appendChild(e);
    return;
  }
  p.timeline.forEach(function (c) { el.appendChild(tlCardEl(c)); });
}

function renderStandings() {
  var list = $('#standList');
  list.innerHTML = '';
  party.players.forEach(function (p, i) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'stand-row' + (i === party.turnIdx ? ' active' : '');
    var n = document.createElement('span');
    n.className = 'stand-name';
    n.textContent = (p.place !== null ? medal(p.place) + ' ' : (i + 1) + '. ') + p.name;
    n.style.color = p.color;
    var c = document.createElement('span');
    c.className = 'stand-count';
    c.textContent = p.timeline.length + ' / ' + party.goal;
    row.appendChild(n);
    row.appendChild(c);
    row.addEventListener('click', function () { openStats(p); });
    list.appendChild(row);
  });
}

/* ============================================================
   SCANNEN IM PARTY-MODUS
   ============================================================ */
function partyScan(purpose) {
  party.purpose = purpose;
  partySave();
  startScanner();
}

function partyOnScanned(scan) {
  if (navigator.vibrate) navigator.vibrate(60);
  stopScanner();
  if (!party) {
    state.gameMode = 'normal';
    showScreen('screen-home');
    return;
  }
  if (party.purpose === 'guess') { partyGuessScan(scan); return; }
  partyUtilityScan(scan, party.purpose || 'start');
}

/* --- Rate-Karte: läuft wie im Normal-Modus, nur mit "Einordnen" --- */
function partyGuessScan(scan) {
  document.body.classList.add('party-guess');
  var w = $('#btnWeiter');
  w.textContent = 'Einordnen';
  w.classList.remove('btn-ghost');
  w.classList.add('btn-amber');
  showScreen('screen-player');
  setVinylSpinning(true);
  requestWakeLock();
  if (scan.kind === 'spotify') {
    startTrack(scan.id, null);
    return;
  }
  setPlayerStatus('Karte wird zugeordnet \u2026');
  resolveHitsterCard(scan).then(function (r) {
    startTrack(r.id, r.meta);
  }).catch(function (err) {
    handleResolveError(err, scan);
  });
}

function restoreWeiterButton() {
  var w = $('#btnWeiter');
  if (!w) return;
  w.textContent = 'Weiter';
  w.classList.add('btn-ghost');
  w.classList.remove('btn-amber');
}

/* --- Start- und Kauf-Karten: ohne Musik, direkt auswerten --- */
function partyUtilityScan(scan, purpose) {
  renderHub();
  showScreen('screen-party-turn');
  toast(purpose === 'start' ? 'Startkarte wird gelesen \u2026' : 'Karte wird gelesen \u2026');
  resolveScanToTrack(scan).then(function (r) {
    return fetchTrackInfo(r.id, r.meta || null).then(function (info) {
      state.currentTrackId = r.id;
      state.cardMeta = r.meta || null;
      state.trackInfo = info;
      state.infoPromise = Promise.resolve(info);
      resetHints();
      applyUtilityCard(purpose, info);
    });
  }).catch(function (err) {
    utilityError(err, scan, purpose);
  });
}

function resolveScanToTrack(scan) {
  if (scan.kind === 'spotify') return Promise.resolve({ id: scan.id, meta: null });
  return resolveHitsterCard(scan);
}

function makeCard(info) {
  return {
    year: parseInt(info.year, 10),
    artist: (state.cardMeta && state.cardMeta.artist) || info.artists.join(', '),
    title: (state.cardMeta && state.cardMeta.title) || info.name
  };
}

function applyUtilityCard(purpose, info) {
  var p = curPlayer();
  var card = makeCard(info);
  if (!isFinite(card.year)) {
    openModal({
      title: 'Jahr unbekannt',
      text: 'F\u00fcr diese Karte lie\u00df sich kein Jahr ermitteln \u2013 bitte nimm eine andere.',
      primary: 'OK'
    });
    return;
  }
  if (purpose === 'start') {
    insertCard(p, card);
    p.hadStart = true;
    party.last = { kind: 'start', card: card };
    partySave();
    renderHub();
    showPartyResult();
    return;
  }
  /* Kauf: automatisch an die richtige Position */
  insertCard(p, card);
  p.bought++;
  var att = { correct: true, bought: true, year: card.year, decade: Math.floor(card.year / 10) * 10, genre: null };
  p.att.push(att);
  patchGenreLater(att, info);
  party.last = { kind: 'buy', card: card };
  partySave();
  renderHub();
  checkWin(p, function () { showPartyResult(); });
}

function utilityError(err, scan, purpose) {
  console.warn('party utility', err);
  var code = err && err.code;
  if (code === 'CARD_UNKNOWN' || code === 'CSV_MISSING') {
    openModal({
      title: 'Karte nicht in der Datenbank',
      text: 'Diese Edition (\u201e' + scan.lang + '\u201c, Karte ' + scan.num + ') ist in der Community-Datenbank noch nicht erfasst. Nimm bitte eine andere Karte.',
      primary: 'OK'
    });
    return;
  }
  if (code === 'NO_MATCH') {
    var m = err.meta || {};
    openModal({
      title: 'Song nicht gefunden',
      text: 'Die Karte wurde erkannt (' + (m.artist || '?') + ' \u2013 \u201e' + (m.title || '?') + '\u201c), aber bei Spotify wurde kein passender Song gefunden. Nimm bitte eine andere Karte.',
      primary: 'OK'
    });
    return;
  }
  openModal({
    title: 'Karte konnte nicht gelesen werden',
    text: 'Pr\u00fcfe deine Internetverbindung und versuche es erneut.',
    primary: 'Nochmal scannen',
    onPrimary: function () { partyScan(purpose); },
    secondary: 'Abbrechen'
  });
}

/* ============================================================
   EINORDNEN & AUSWERTEN
   ============================================================ */
function partyOnWeiter() {
  openPlaceScreen();
}

function openPlaceScreen() {
  var p = curPlayer();
  var strip = $('#placeStrip');
  strip.innerHTML = '';
  var n = p.timeline.length;
  for (var i = 0; i <= n; i++) {
    strip.appendChild(slotEl(i));
    if (i < n) strip.appendChild(tlCardEl(p.timeline[i]));
  }
  placeBusy = false;
  showScreen('screen-party-place');
}

function slotEl(idx) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'place-slot';
  b.textContent = '+';
  b.setAttribute('aria-label', 'Hier einordnen');
  b.addEventListener('click', function () { onSlotPick(idx); });
  return b;
}

function onSlotPick(idx) {
  if (placeBusy) return;
  placeBusy = true;
  if (!state.trackInfo) toast('Einen Moment \u2013 Song-Infos werden geladen \u2026');
  var infoP = state.trackInfo ? Promise.resolve(state.trackInfo) : (state.infoPromise || Promise.resolve(null));
  infoP.then(function (info) {
    if (!party || party.purpose !== 'guess') { placeBusy = false; return; }
    if (!info) {
      placeBusy = false;
      openModal({
        title: 'Keine Song-Infos',
        text: 'Zu dieser Karte konnten keine Infos geladen werden. Pr\u00fcfe deine Internetverbindung.',
        primary: 'Nochmal versuchen',
        onPrimary: function () { onSlotPick(idx); },
        secondary: 'Song verwerfen',
        onSecondary: function () { stopPlayback(); partyGoHub(); }
      });
      return;
    }
    evaluatePlacement(idx, info);
  });
}

function evaluatePlacement(idx, info) {
  var p = curPlayer();
  var y = parseInt(info.year, 10);
  if (!isFinite(y)) {
    placeBusy = false;
    stopPlayback();
    openModal({
      title: 'Jahr unbekannt',
      text: 'F\u00fcr diesen Song lie\u00df sich kein Jahr ermitteln \u2013 die Karte wird nicht gewertet.',
      primary: 'Neue Karte scannen',
      onPrimary: function () { partyScan('guess'); },
      secondary: 'Zur \u00dcbersicht',
      onSecondary: partyGoHub
    });
    return;
  }
  var card = makeCard(info);
  var Y = p.timeline.map(function (c) { return c.year; });
  var ok = (idx === 0 || Y[idx - 1] <= y) && (idx === Y.length || y <= Y[idx]);
  var att = { correct: ok, bought: false, year: y, decade: Math.floor(y / 10) * 10, genre: null };
  p.att.push(att);
  patchGenreLater(att, info);
  stopPlayback();
  placeBusy = false;
  if (ok) {
    insertCard(p, card);
    party.last = { kind: 'ok', card: card };
    partySave();
    checkWin(p, function () { showPartyResult(); });
  } else {
    party.pending = card;
    party.last = { kind: 'bad', card: card, desc: describeCorrect(y, Y) };
    partySave();
    showPartyResult();
  }
}

function insertCard(p, card) {
  var i = 0;
  while (i < p.timeline.length && p.timeline[i].year <= card.year) i++;
  p.timeline.splice(i, 0, card);
}

function describeCorrect(y, Y) {
  if (!Y.length) return 'irgendwo \u2013 die Zeitleiste war leer';
  if (y < Y[0]) return 'vor ' + Y[0];
  if (y > Y[Y.length - 1]) return 'nach ' + Y[Y.length - 1];
  var lo = null, hi = null;
  for (var i = 0; i < Y.length; i++) {
    if (Y[i] <= y) lo = Y[i];
    if (Y[i] >= y && hi === null) hi = Y[i];
  }
  if (lo === y || hi === y) return 'direkt neben ' + y;
  return 'zwischen ' + lo + ' und ' + hi;
}

function patchGenreLater(att, info) {
  if (info.genres && info.genres[0]) { att.genre = info.genres[0]; return; }
  if (info.extras && info.extras.then) {
    info.extras.then(function () {
      if (info.genres && info.genres[0]) {
        att.genre = info.genres[0];
        partySave();
      }
    }).catch(function () { /* egal */ });
  }
}

/* ============================================================
   ERGEBNIS-SHEET
   ============================================================ */
function showPartyResult() {
  var res = party.last;
  if (!res) { partyGoHub(); return; }
  var badge = $('#prBadge');
  badge.className = 'pr-badge ' + (res.kind === 'ok' ? 'ok' : res.kind === 'bad' ? 'bad' : 'neutral');
  badge.textContent = res.kind === 'ok' ? 'RICHTIG!'
    : res.kind === 'bad' ? 'LEIDER FALSCH'
    : res.kind === 'buy' ? 'KARTE GEKAUFT'
    : 'STARTKARTE';
  $('#prArtist').textContent = res.card.artist;
  $('#prYear').textContent = res.card.year;
  $('#prTitle').textContent = res.card.title;
  $('#prText').textContent = resultText(res);
  renderResultActions();
  openPartySheet();
}

function resultText(res) {
  var p = curPlayer();
  var left = Math.max(0, party.goal - p.timeline.length);
  var leftTxt = left === 0 ? 'Ziel erreicht!' : ('Noch ' + left + (left === 1 ? ' Karte' : ' Karten') + ' bis zum Sieg.');
  if (res.kind === 'ok') return 'Die Karte geh\u00f6rt dir! ' + leftTxt;
  if (res.kind === 'bad') {
    return 'Richtig gewesen w\u00e4re: ' + res.desc + '. Was passiert mit der Karte? Hat ein Mitspieler richtig dazwischengerufen, bekommt er sie \u2013 sonst weg damit.';
  }
  if (res.kind === 'buy') return 'F\u00fcr 3 Chips gekauft und automatisch richtig eingeordnet. ' + leftTxt;
  return 'Deine Zeitleiste beginnt mit ' + res.card.year + '. Jetzt eine Karte zum Raten scannen!';
}

function actionBtn(txt, cls, fn) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = txt;
  b.addEventListener('click', fn);
  return b;
}

function renderResultActions() {
  var box = $('#prActions');
  box.innerHTML = '';
  var res = party.last;
  if (res && res.kind === 'bad' && party.pending) {
    box.appendChild(actionBtn('Einem Mitspieler geben', 'btn btn-amber', fateGiveMenu));
    box.appendChild(actionBtn('Karte abwerfen', 'btn btn-ghost', fateDrop));
    box.appendChild(actionBtn('Details zum Song', 'btn btn-ghost', showDetails));
    return;
  }
  box.appendChild(actionBtn('Details zum Song', 'btn btn-ghost', showDetails));
  box.appendChild(actionBtn('Weiter', 'btn btn-amber', closeResultToHub));
}

function openPartySheet() {
  var s = $('#partySheet');
  s.classList.add('open');
  s.setAttribute('aria-hidden', 'false');
}
function hidePartySheet() {
  var s = $('#partySheet');
  s.classList.remove('open');
  s.setAttribute('aria-hidden', 'true');
}

function closeResultToHub() {
  hidePartySheet();
  party.last = null;
  partySave();
  if (party.ended) { showStandings(); return; }
  partyGoHub();
}

/* --- Schicksal einer falsch eingeordneten Karte --- */
function fateDrop() {
  curPlayer().dropped++;
  party.pending = null;
  partySave();
  toast('Karte ist raus');
  renderResultActions();
}

function fateGiveMenu() {
  var box = $('#prActions');
  box.innerHTML = '';
  var others = party.players.filter(function (pl) {
    return pl !== curPlayer() && pl.place === null;
  });
  if (!others.length) {
    toast('Kein Mitspieler kann die Karte nehmen');
    renderResultActions();
    return;
  }
  others.forEach(function (pl) {
    var b = actionBtn(pl.name + ' (' + pl.timeline.length + '/' + party.goal + ')', 'btn btn-ghost', function () { fateGiveTo(pl); });
    b.style.borderColor = pl.color;
    box.appendChild(b);
  });
  box.appendChild(actionBtn('Zur\u00fcck', 'btn btn-amber', renderResultActions));
}

function fateGiveTo(pl) {
  var card = party.pending;
  if (!card) { renderResultActions(); return; }
  insertCard(pl, card);
  pl.received++;
  curPlayer().given++;
  party.pending = null;
  partySave();
  toast(pl.name + ' erh\u00e4lt \u201e' + card.title + '\u201c');
  checkWin(pl, function () { renderResultActions(); });
}

/* --- Volle Auflösung des Songs aus dem Ergebnis heraus --- */
function showDetails() {
  hidePartySheet();
  showReveal(true);
}
function partyOnRevealBack() {
  hideReveal();
  if (party && party.last) { openPartySheet(); return; }
  partyGoHub();
}

/* ============================================================
   SIEG, PLATZIERUNGEN & ENDSTAND
   ============================================================ */
function checkWin(p, done) {
  if (p.place === null && p.timeline.length >= party.goal) {
    p.place = party.nextPlace++;
    var rest = unfinished();
    if (rest.length === 1) {
      rest[0].place = party.nextPlace++;
      party.ended = true;
    }
    partySave();
    showWinPop(p, done);
    return;
  }
  done();
}

function showWinPop(p, done) {
  $('#winMedal').textContent = p.place === 1 ? '\ud83e\udd47' : p.place === 2 ? '\ud83e\udd48' : p.place === 3 ? '\ud83e\udd49' : '\ud83c\udfc5';
  $('#winPlace').textContent = p.place + '. PLATZ';
  $('#winName').textContent = p.name;
  var pop = $('#winPop');
  winDone = done;
  pop.hidden = false;
  requestAnimationFrame(function () { pop.classList.add('open'); });
}

function onWinClose() {
  var pop = $('#winPop');
  pop.classList.remove('open');
  setTimeout(function () { pop.hidden = true; }, 260);
  var cb = winDone;
  winDone = null;
  if (cb) cb();
}

function nextPlayer() {
  var p = curPlayer();
  if (!p.hadStart && p.place === null) { toast('Zuerst die Startkarte scannen'); return; }
  advanceTurn();
}

function advanceTurn() {
  if (party.ended) { showStandings(); return; }
  var n = party.players.length;
  for (var s = 1; s <= n; s++) {
    var idx = (party.turnIdx + s) % n;
    if (party.players[idx].place === null) { party.turnIdx = idx; break; }
  }
  partySave();
  partyGoHub();
}

function showStandings() {
  document.body.classList.remove('party-guess');
  restoreWeiterButton();
  var list = $('#endList');
  list.innerHTML = '';
  var sorted = party.players.slice().sort(function (a, b) {
    return (a.place || 99) - (b.place || 99);
  });
  sorted.forEach(function (p, i) {
    var row = document.createElement('div');
    row.className = 'end-row';
    row.style.animationDelay = (i * 0.12) + 's';
    var m = document.createElement('span'); m.className = 'end-medal'; m.textContent = p.place !== null ? medal(p.place) : '\u2013';
    var n = document.createElement('span'); n.className = 'end-name'; n.textContent = p.name; n.style.color = p.color;
    var c = document.createElement('span'); c.className = 'end-count'; c.textContent = p.timeline.length + ' Karten';
    row.appendChild(m); row.appendChild(n); row.appendChild(c);
    row.addEventListener('click', function () { openStats(p); });
    list.appendChild(row);
  });
  showScreen('screen-party-end');
}

function partyAgain() {
  party.players.forEach(function (p) {
    p.timeline = []; p.att = []; p.hadStart = false;
    p.bought = 0; p.received = 0; p.given = 0; p.dropped = 0;
    p.place = null;
  });
  party.turnIdx = 0;
  party.nextPlace = 1;
  party.ended = false;
  party.pending = null;
  party.last = null;
  party.purpose = null;
  partySave();
  partyGoHub();
}

function partyHome() {
  partyClear();
  state.gameMode = 'normal';
  document.body.classList.remove('party-guess');
  restoreWeiterButton();
  showScreen('screen-home');
}

function partyExitMenu() {
  openModal({
    title: 'Party verlassen?',
    text: 'Der Spielstand bleibt gespeichert \u2013 \u00fcber \u201eSpielen \u2192 Party fortsetzen\u201c geht es sp\u00e4ter weiter.',
    primary: 'Zum Men\u00fc',
    onPrimary: function () {
      state.gameMode = 'normal';
      document.body.classList.remove('party-guess');
      restoreWeiterButton();
      showScreen('screen-home');
    },
    secondary: 'Party l\u00f6schen',
    onSecondary: partyHome
  });
}

/* ============================================================
   STATISTIK
   ============================================================ */
function openStats(p) {
  var nameEl = $('#statsName');
  nameEl.textContent = p.name;
  nameEl.style.color = p.color;
  var list = $('#statsList');
  list.innerHTML = '';
  computeStats(p).forEach(function (r) {
    var d = document.createElement('div'); d.className = 'stat-row';
    var k = document.createElement('span'); k.className = 'stat-k'; k.textContent = r[0];
    var v = document.createElement('span'); v.className = 'stat-v'; v.textContent = r[1];
    d.appendChild(k); d.appendChild(v);
    list.appendChild(d);
  });
  var s = $('#statsSheet');
  s.classList.add('open');
  s.setAttribute('aria-hidden', 'false');
}

function closeStats() {
  var s = $('#statsSheet');
  s.classList.remove('open');
  s.setAttribute('aria-hidden', 'true');
}

function streak(gs, current) {
  var best = 0, run = 0;
  for (var i = 0; i < gs.length; i++) {
    if (gs[i].correct) { run++; if (run > best) best = run; }
    else { run = 0; }
  }
  return current ? run : best;
}

function decadeLabel(d) {
  return d < 2000 ? String(d).slice(2) + 'er' : d + 'er';
}

function bestWorst(gs, key) {
  var groups = {};
  gs.forEach(function (a) {
    var raw = a[key];
    if (raw === null || raw === undefined) return;
    var label = (key === 'decade') ? decadeLabel(raw) : String(raw);
    if (!groups[label]) groups[label] = { r: 0, n: 0 };
    groups[label].n++;
    if (a.correct) groups[label].r++;
  });
  var best = null, worst = null;
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    if (g.n < 2) return; /* mindestens zwei Versuche, sonst Zufall */
    var rate = g.r / g.n;
    if (!best || rate > best.rate || (rate === best.rate && g.n > best.n)) best = { k: k, rate: rate, r: g.r, n: g.n };
    if (!worst || rate < worst.rate || (rate === worst.rate && g.n > worst.n)) worst = { k: k, rate: rate, r: g.r, n: g.n };
  });
  function fmt(x) { return x ? (x.k + ' (' + x.r + '/' + x.n + ')') : 'Noch zu wenig Daten'; }
  return { best: fmt(best), worst: fmt(worst) };
}

function computeStats(p) {
  var guesses = p.att.filter(function (a) { return !a.bought; });
  var right = guesses.filter(function (a) { return a.correct; }).length;
  var wrong = guesses.length - right;
  var rows = [];
  rows.push(['Karten in der Zeitleiste', p.timeline.length + ' / ' + party.goal + (p.place !== null ? ' \u00b7 ' + medal(p.place) : '')]);
  rows.push(['Rate-Versuche', String(guesses.length)]);
  rows.push(['Richtig eingeordnet', String(right)]);
  rows.push(['Falsch eingeordnet', String(wrong)]);
  rows.push(['Trefferquote', guesses.length ? (Math.round(right / guesses.length * 100) + ' %') : '\u2013']);
  rows.push(['Aktuelle Serie', String(streak(guesses, true))]);
  rows.push(['L\u00e4ngste Serie', String(streak(guesses, false))]);
  var g = bestWorst(guesses, 'genre');
  rows.push(['Bestes Genre', g.best]);
  rows.push(['Schw\u00e4chstes Genre', g.worst]);
  var d = bestWorst(guesses, 'decade');
  rows.push(['Bestes Jahrzehnt', d.best]);
  rows.push(['Schw\u00e4chstes Jahrzehnt', d.worst]);
  rows.push(['Gekaufte Karten', String(p.bought)]);
  rows.push(['Geschenkt bekommen', String(p.received)]);
  rows.push(['Verschenkt', String(p.given)]);
  rows.push(['Abgeworfen', String(p.dropped)]);
  if (p.timeline.length) {
    var first = p.timeline[0];
    var last = p.timeline[p.timeline.length - 1];
    rows.push(['\u00c4ltester Song', first.year + ' \u00b7 ' + first.artist]);
    rows.push(['Neuester Song', last.year + ' \u00b7 ' + last.artist]);
    var sum = 0;
    p.timeline.forEach(function (c) { sum += c.year; });
    rows.push(['\u00d8-Jahr der Sammlung', String(Math.round(sum / p.timeline.length))]);
  }
  return rows;
}

/* ============================================================
   PARTY-MODUS: SONG TAUSCHEN (1 Chip)
   ============================================================ */
function onSkipSong() {
  if (state.gameMode !== 'party' || !party || party.purpose !== 'guess') return;
  stopPlayback();
  resetHints();
  toast('Song getauscht \u2013 1 Chip in die Mitte!');
  startScanner();
}

/* ============================================================
   EVENTS
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  $('#btnModeNormal').addEventListener('click', startNormalMode);
  $('#btnModeParty').addEventListener('click', openPartySetup);
  $('#btnModeResume').addEventListener('click', resumeParty);
  $('#btnModeBack').addEventListener('click', function () { showScreen('screen-home'); });

  $('#btnAddPlayer').addEventListener('click', function () {
    if (setupDraft.names.length >= 8) { toast('Maximal acht Spieler'); return; }
    setupDraft.names.push('');
    renderSetup();
  });
  $('#btnTargetMinus').addEventListener('click', function () {
    if (setupDraft.target > 3) { setupDraft.target--; renderSetup(); }
  });
  $('#btnTargetPlus').addEventListener('click', function () {
    if (setupDraft.target < 20) { setupDraft.target++; renderSetup(); }
  });
  $('#btnPartyStart').addEventListener('click', startParty);
  $('#btnSetupBack').addEventListener('click', function () { showScreen('screen-mode'); });

  $('#btnTurnScan').addEventListener('click', function () {
    var p = curPlayer();
    if (p.place !== null) { toast('Du bist schon fertig \u2013 N\u00e4chster Spieler!'); return; }
    partyScan(p.hadStart ? 'guess' : 'start');
  });
  $('#btnTurnBuy').addEventListener('click', function () {
    var p = curPlayer();
    if (!p.hadStart) { toast('Zuerst die Startkarte scannen'); return; }
    if (p.place !== null) { toast('Du bist schon fertig'); return; }
    toast('Kaufen kostet 3 Chips \u2013 ab in die Mitte!');
    partyScan('buy');
  });
  $('#btnTurnNext').addEventListener('click', nextPlayer);
  $('#btnTurnStats').addEventListener('click', function () { openStats(curPlayer()); });
  $('#btnPartyExit').addEventListener('click', partyExitMenu);

  $('#btnPlaceCancel').addEventListener('click', function () { showScreen('screen-player'); });
  $('#btnStatsClose').addEventListener('click', closeStats);
  $('#btnWinClose').addEventListener('click', onWinClose);
  $('#btnPartyAgain').addEventListener('click', partyAgain);
  $('#btnPartyHome').addEventListener('click', partyHome);
  $('#btnSkipSong').addEventListener('click', onSkipSong);
});
