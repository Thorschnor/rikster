/* ============================================================
   RIKSTER – App-Logik (v2)
   ------------------------------------------------------------
   Ablauf:  Spielen → QR scannen → Song läuft (nur Schallplatte
   sichtbar) → "Weiter" (stoppen + neue Karte), optional
   "Hinweis" (3 Hinweise pro Lied) und "Auflösung".

   Unterstützte Karten:
   1) Eigene Karten aus dem hitster-card-generator
      (QR = Spotify-Track-Link)
   2) Offizielle Hitster-Karten (QR = hitstergame.com/…) –
      Zuordnung über die Community-Datenbank des SongSeeker-
      Projekts (github.com/andygruber/songseeker-hitster-playlists),
      danach Suche des Songs über die Spotify-API.

   Wiedergabe – zwei Modi, automatisch gewählt:
   1) "sdk"    – Spotify Web Playback SDK (Ton direkt in der App)
   2) "remote" – Fallback: Rikster steuert die Spotify-App im
                 Hintergrund fern (zuverlässig auf iOS).
   ============================================================ */

'use strict';

/* ---------- Konfiguration ---------- */
var CFG = window.RIKSTER_CONFIG || {};
var CLIENT_ID = String(CFG.SPOTIFY_CLIENT_ID || '').trim();
var REDIRECT_URI = location.origin + location.pathname.replace(/index\.html$/, '');
var SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative';
var API_BASE = 'https://api.spotify.com/v1';
var HITSTER_DB = 'https://raw.githubusercontent.com/andygruber/songseeker-hitster-playlists/main/';
var CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url=',
  'https://api.codetabs.com/v1/proxy/?quest='
];
var LS = {
  access: 'rikster_access',
  refresh: 'rikster_refresh',
  expires: 'rikster_expires',
  verifier: 'rikster_verifier',
  assists: 'rikster_assists',
  fixes: 'rikster_fixes',
  controls: 'rikster_controls',
  party: 'rikster_party'
};

/* ---------- Zustand ---------- */
var state = {
  mode: null,
  sdkPlayer: null,
  sdkDeviceId: null,
  sdkReady: false,
  currentTrackId: null,
  cardMeta: null,          /* bei offiziellen Karten: {artist,title,year} */
  trackInfo: null,
  infoPromise: null,
  scanning: false,
  playing: false,
  camStream: null,
  wakeLock: null,
  assists: true,
  controls: false,
  gameMode: 'normal',
  hints: { list: null, idx: -1, promise: null }
};

/* ---------- Kleine Helfer ---------- */
function $(sel) { return document.querySelector(sel); }

function showScreen(id) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) {
    screens[i].classList.toggle('active', screens[i].id === id);
  }
}

var toastTimer = null;
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3400);
}

function openModal(opts) {
  var m = $('#modal');
  $('#modalTitle').textContent = opts.title || '';
  $('#modalText').textContent = opts.text || '';
  var inp = $('#modalInput');
  if (opts.input) {
    inp.hidden = false;
    inp.value = opts.input.value || '';
    inp.placeholder = opts.input.placeholder || '';
    inp.inputMode = opts.input.numeric ? 'numeric' : 'text';
  } else {
    inp.hidden = true;
    inp.value = '';
  }
  var ch = $('#modalChoices');
  ch.innerHTML = '';
  if (opts.choices && opts.choices.length) {
    ch.hidden = false;
    opts.choices.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.label;
      b.addEventListener('click', function () { closeModal(); if (o.onPick) o.onPick(); });
      ch.appendChild(b);
    });
  } else {
    ch.hidden = true;
  }
  var p = $('#modalPrimary');
  var s = $('#modalSecondary');
  p.textContent = opts.primary || 'OK';
  p.onclick = function () {
    var val = opts.input ? inp.value.trim() : undefined;
    closeModal();
    if (opts.onPrimary) opts.onPrimary(val);
  };
  if (opts.secondary) {
    s.hidden = false;
    s.textContent = opts.secondary;
    s.onclick = function () { closeModal(); if (opts.onSecondary) opts.onSecondary(); };
  } else {
    s.hidden = true;
  }
  m.hidden = false;
  requestAnimationFrame(function () { m.classList.add('open'); });
}
function closeModal() {
  var m = $('#modal');
  m.classList.remove('open');
  setTimeout(function () { m.hidden = true; }, 180);
}

function formatNumber(n) { return new Intl.NumberFormat('de-DE').format(n); }
function formatDuration(ms) {
  var s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min';
}
function formatRelease(release, precision) {
  if (!release) return null;
  try {
    if (precision === 'day') {
      var d = new Date(release + 'T00:00:00');
      return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    }
    if (precision === 'month') {
      var parts = release.split('-');
      var dm = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
      return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(dm);
    }
  } catch (e) { /* dann nur Jahr */ }
  return release.slice(0, 4);
}
/* Liest Status + Klartext-Grund aus einer Spotify-Fehlerantwort */
function readApiError(res) {
  return safeJson(res).then(function (j) {
    var msg = j && j.error && (j.error.message || j.error.reason);
    return 'HTTP ' + res.status + (msg ? ' \u2013 ' + msg : '');
  });
}

function safeJson(res) {
  return res.json().then(function (j) { return j; }, function () { return null; });
}
function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
/* Anzeigetitel fuer die Karte: Gastmusiker-Zusaetze raus, weil die
   Interpreten ohnehin darueber stehen. Alles andere bleibt erhalten. */
function displayTitle(t) {
  var s = String(t || '');
  var out = s
    .replace(/\s*[\(\[]\s*(feat|ft|featuring|with)\.?\s[^\)\]]*[\)\]]/ig, '')
    .replace(/\s*[-\u2013]\s*(feat|ft|featuring)\.?\s.*$/i, '')
    .replace(/\s+(feat|ft|featuring)\.\s.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || s;
}

function cleanTitle(t) {
  return String(t || '')
    .replace(/\s*[-\u2013]\s*(remaster|single|radio|live|version|edit|mono|stereo|from)[^]*$/i, '')
    .replace(/\s*\((feat|with|from|remaster|live|radio|deluxe|bonus)[^)]*\)/ig, '')
    .trim();
}
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* n zufällige Elemente ziehen, ohne Wiederholung */
function pickN(arr, n) {
  if (!arr || !arr.length) return [];
  var a = arr.slice();
  var out = [];
  while (a.length && out.length < n) {
    out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
  }
  return out;
}
function fetchWithTimeout(url, ms, opts) {
  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
  var o = opts || {};
  if (ctrl) o.signal = ctrl.signal;
  return fetch(url, o).finally(function () { if (timer) clearTimeout(timer); });
}
function countryNameDe(iso) {
  if (!iso) return null;
  try {
    var dn = new Intl.DisplayNames(['de'], { type: 'region' });
    return dn.of(iso) || iso;
  } catch (e) { return iso; }
}

/* ============================================================
   SPOTIFY-LOGIN (Authorization Code + PKCE, ohne Client-Secret)
   ============================================================ */
function randomString(len) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var vals = crypto.getRandomValues(new Uint8Array(len));
  var out = '';
  for (var i = 0; i < vals.length; i++) out += chars[vals[i] % chars.length];
  return out;
}
function pkceChallenge(verifier) {
  var data = new TextEncoder().encode(verifier);
  return crypto.subtle.digest('SHA-256', data).then(function (digest) {
    var bin = '';
    var bytes = new Uint8Array(digest);
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
}

function login() {
  var verifier = randomString(64);
  localStorage.setItem(LS.verifier, verifier);
  pkceChallenge(verifier).then(function (challenge) {
    var params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge
    });
    location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
  });
}

function saveTokens(data) {
  if (data.scope) { try { localStorage.setItem('rikster_scopes', data.scope); } catch (e) { /* egal */ } }
  if (data.access_token) localStorage.setItem(LS.access, data.access_token);
  if (data.refresh_token) localStorage.setItem(LS.refresh, data.refresh_token);
  var ttl = (data.expires_in || 3600) - 60;
  localStorage.setItem(LS.expires, String(Date.now() + ttl * 1000));
}

function tokenRequest(params) {
  return fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) { throw new Error('Token-Fehler ' + res.status + ': ' + t); });
    }
    return res.json().then(function (data) { saveTokens(data); return data; });
  });
}

function exchangeCode(code) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: localStorage.getItem(LS.verifier) || ''
  });
}

var refreshing = null;
function refreshTokens() {
  if (refreshing) return refreshing;
  var rt = localStorage.getItem(LS.refresh);
  if (!rt) return Promise.reject(new Error('not-logged-in'));
  refreshing = tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: rt,
    client_id: CLIENT_ID
  }).finally(function () { refreshing = null; });
  return refreshing;
}

function ensureToken() {
  var token = localStorage.getItem(LS.access);
  var exp = Number(localStorage.getItem(LS.expires)) || 0;
  if (token && Date.now() < exp) return Promise.resolve(token);
  if (localStorage.getItem(LS.refresh)) {
    return refreshTokens().then(function () {
      return localStorage.getItem(LS.access);
    }).catch(function (e) {
      logout();
      throw e;
    });
  }
  return Promise.reject(new Error('not-logged-in'));
}

/* Ein aufgefrischtes Token behält die alten Berechtigungen. Für neue
   Rechte - etwa zum Lesen von Playlists - ist eine komplett neue
   Anmeldung nötig. */
function hasPlaylistScope() {
  var s = '';
  try { s = localStorage.getItem('rikster_scopes') || ''; } catch (e) { /* egal */ }
  return s.indexOf('playlist-read-private') !== -1;
}

function reauthorize() {
  localStorage.removeItem(LS.access);
  localStorage.removeItem(LS.refresh);
  localStorage.removeItem(LS.expires);
  try { localStorage.removeItem('rikster_scopes'); } catch (e) { /* egal */ }
  login();
}

function isLoggedIn() {
  return Boolean(localStorage.getItem(LS.access) || localStorage.getItem(LS.refresh));
}

function logout() {
  localStorage.removeItem(LS.access);
  localStorage.removeItem(LS.refresh);
  localStorage.removeItem(LS.expires);
  localStorage.removeItem(LS.verifier);
  try { if (state.sdkPlayer) state.sdkPlayer.disconnect(); } catch (e) { /* egal */ }
  state.sdkPlayer = null;
  state.sdkReady = false;
  state.mode = null;
  showScreen('screen-auth');
}

/* Web-API-Helfer: hängt Token an, wiederholt einmal nach 401 */
function api(path, opts) {
  opts = opts || {};
  function doFetch(token) {
    var headers = { Authorization: 'Bearer ' + token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API_BASE + path, { method: opts.method || 'GET', headers: headers, body: opts.body });
  }
  return ensureToken().then(function (token) {
    return doFetch(token).then(function (res) {
      if (res.status !== 401) return res;
      return refreshTokens().then(function () {
        return doFetch(localStorage.getItem(LS.access));
      });
    });
  });
}

/* ============================================================
   WIEDERGABE
   ============================================================ */
var sdkLoadPromise = null;
function loadSdkScript() {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise(function (resolve) {
    window.onSpotifyWebPlaybackSDKReady = function () { resolve('ok'); };
    var s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.onerror = function () { resolve('error'); };
    document.head.appendChild(s);
    setTimeout(function () { resolve('timeout'); }, 12000);
  });
  return sdkLoadPromise;
}

var initPromise = null;
function initPlayback() {
  if (state.mode) return Promise.resolve(state.mode);
  if (initPromise) return initPromise;
  setModeBadge('Wiedergabe wird verbunden \u2026');

  initPromise = loadSdkScript().then(function (r) {
    if (r !== 'ok' || !window.Spotify) return false;
    return new Promise(function (resolve) {
      var done = false;
      function finish(ok) { if (!done) { done = true; resolve(ok); } }
      var timer = setTimeout(function () { finish(false); }, 12000);

      var player = new Spotify.Player({
        name: 'Rikster',
        getOAuthToken: function (cb) {
          ensureToken().then(cb).catch(function () { cb(''); });
        },
        volume: 1.0
      });
      state.sdkPlayer = player;

      player.addListener('ready', function (ev) {
        clearTimeout(timer);
        state.sdkDeviceId = ev.device_id;
        state.sdkReady = true;
        try { if (player.activateElement) player.activateElement(); } catch (e) { /* egal */ }
        finish(true);
      });
      player.addListener('not_ready', function () { state.sdkReady = false; });
      ['initialization_error', 'authentication_error', 'account_error'].forEach(function (evName) {
        player.addListener(evName, function (ev) {
          console.warn('SDK', evName, ev && ev.message);
          clearTimeout(timer);
          finish(false);
        });
      });
      player.addListener('playback_error', function (ev) {
        console.warn('SDK playback_error', ev && ev.message);
      });
      player.addListener('player_state_changed', function (st) {
        if (st) maskMediaSession();
      });

      player.connect();
    });
  }).then(function (ok) {
    if (ok) {
      state.mode = 'sdk';
      setModeBadge('Wiedergabe direkt in der App');
    } else {
      if (state.sdkPlayer) { try { state.sdkPlayer.disconnect(); } catch (e) { /* egal */ } }
      state.sdkPlayer = null;
      state.mode = 'remote';
      setModeBadge('Wiedergabe \u00fcber deine Spotify-App');
    }
    return state.mode;
  });
  return initPromise;
}

function setModeBadge(txt) {
  var b = $('#modeBadge');
  if (b) b.textContent = txt;
}

function activateAudio() {
  try {
    if (state.sdkPlayer && state.sdkPlayer.activateElement) state.sdkPlayer.activateElement();
  } catch (e) { /* egal */ }
}

function maskMediaSession() {
  try {
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Rikster',
        artist: 'Welcher Song ist das?',
        album: '',
        artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
      });
    }
  } catch (e) { /* egal */ }
}

function playTrack(trackId, positionMs) {
  var body = JSON.stringify({ uris: ['spotify:track:' + trackId], position_ms: Math.max(0, Math.round(positionMs || 0)) });
  return initPlayback().then(function (mode) {
    if (mode === 'sdk' && state.sdkReady && state.sdkDeviceId) {
      return api('/me/player/play?device_id=' + state.sdkDeviceId, { method: 'PUT', body: body })
        .then(function (res) {
          if (res.ok || res.status === 204) { verifySdkAudio(body); return true; }
          return playRemote(body, state.sdkDeviceId);
        });
    }
    return playRemote(body);
  });
}

function playRemote(body, excludeId) {
  return api('/me/player/devices').then(function (res) {
    if (!res.ok) {
      return readApiError(res).then(function (d) {
        throw { code: 'NO_DEVICE', why: 'Ger\u00e4te-Abfrage: ' + d };
      });
    }
    return safeJson(res);
  }).then(function (data) {
    var devices = ((data && data.devices) || []).filter(function (d) {
      return !d.is_restricted && (!excludeId || d.id !== excludeId);
    });
    if (!devices.length) throw { code: 'NO_DEVICE', why: 'Spotify meldet keine aktiven Ger\u00e4te' };
    var dev = null;
    for (var i = 0; i < devices.length; i++) { if (devices[i].is_active) { dev = devices[i]; break; } }
    if (!dev) dev = devices[0];
    return api('/me/player/play?device_id=' + dev.id, { method: 'PUT', body: body });
  }).then(function (res) {
    if (res === true || res.ok || res.status === 204) return true;
    if (res.status === 404) throw { code: 'NO_DEVICE' };
    if (res.status === 403) throw { code: 'PREMIUM' };
    return safeJson(res).then(function (j) {
      throw { code: 'PLAY_FAILED', detail: (j && j.error && j.error.message) || ('HTTP ' + res.status) };
    });
  });
}

/* Browser blockieren In-App-Audio ohne frische Nutzer-Geste. Bleibt der
   SDK-Player nach dem Start nachweislich stumm, übernimmt dauerhaft die
   Fernsteuerung der Spotify-App – da ist der Ton garantiert. */
function verifySdkAudio(body) {
  setTimeout(function () {
    if (!state.playing || state.mode !== 'sdk' || !state.sdkPlayer) return;
    state.sdkPlayer.getCurrentState().then(function (st) {
      if (st && !st.paused) return; /* spielt hörbar */
      console.warn('In-App-Player stumm \u2013 wechsle auf Fernsteuerung');
      var silent = state.sdkPlayer;
      var silentId = state.sdkDeviceId;
      state.mode = 'remote';
      state.sdkReady = false;
      state.sdkPlayer = null;
      try { silent.disconnect(); } catch (e) { /* egal */ }
      setModeBadge('Wiedergabe \u00fcber deine Spotify-App');
      playRemote(body, silentId).then(function () {
        setPlayerStatus('L\u00e4uft');
      }).catch(handlePlayError);
    }).catch(function () { /* egal */ });
  }, 2500);
}

function stopPlayback() {
  state.playing = false;
  stopPlaybackUi();
  setVinylSpinning(false);
  releaseWakeLock();
  if (state.mode === 'sdk' && state.sdkPlayer) {
    state.sdkPlayer.pause().catch(function () { /* egal */ });
    return;
  }
  api('/me/player/pause', { method: 'PUT' }).catch(function () { /* egal */ });
}

/* ============================================================
   OFFIZIELLE HITSTER-KARTEN
   ------------------------------------------------------------
   QR-Inhalt: https://www.hitstergame.com/{edition}/{nummer}
   z. B. …/de/00123 oder …/de-aaaa0012/237
   Die Community-CSV liefert Interpret/Titel/Jahr zur Nummer,
   danach suchen wir den Song über die Spotify-API.
   ============================================================ */
var csvMemCache = {};

function parseScan(text) {
  if (!text) return null;
  var s = String(text).trim().replace(/[?#].*$/, '');
  var m = s.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/i);
  if (m) return { kind: 'spotify', id: m[1] };
  m = s.match(/hitstergame\.com\/(.+?)\/(\d{1,6})\/?$/i);
  if (m) return { kind: 'hitster', lang: m[1].toLowerCase().replace(/\//g, '-'), num: parseInt(m[2], 10) };
  m = s.match(/app\.hitsternordics\.com\/resources\/songs\/(\d{1,6})\/?$/i);
  if (m) return { kind: 'hitster', lang: 'nordics', num: parseInt(m[1], 10) };
  return null;
}

function parseCsv(text) {
  var rows = [], row = [], field = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { q = false; }
      } else { field += c; }
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Achtung: Jede Edition hat eine ANDERE Spaltenreihenfolge
   (mal Artist vor Title, mal umgekehrt, Card# teils in der Mitte).
   Deshalb werden die Spalten immer aus der Kopfzeile bestimmt. */
function buildCardMap(text, lang) {
  var rows = parseCsv(text);
  var map = {};
  if (!rows.length) return map;
  var head = rows[0].map(function (h) {
    return String(h || '').replace(/^\ufeff/, '').trim().toLowerCase();
  });
  function col() {
    for (var a = 0; a < arguments.length; a++) {
      var idx = head.indexOf(arguments[a]);
      if (idx !== -1) return idx;
    }
    return -1;
  }
  var iNum = col('card#', 'card #', 'card', 'nummer', 'nr');
  var iArt = col('artist', 'interpret', 'k\u00fcnstler');
  var iTit = col('title', 'titel');
  var iYear = col('year', 'jahr', '\u00e9v', 'rok');
  var iUrl = col('url', 'youtube-url', 'link');
  var iIsrc = col('isrc');
  /* Notfall: keine erkennbare Kopfzeile -> alte Annahme */
  if (iNum === -1 || iArt === -1 || iTit === -1) {
    iNum = 0; iArt = 1; iTit = 2; iUrl = 3; iYear = head.length - 1; iIsrc = -1;
  }
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length < 3) continue;
    var num = parseInt(r[iNum], 10);
    if (!isFinite(num)) continue;
    var year = (iYear !== -1) ? parseInt(r[iYear], 10) : NaN;
    map[num] = {
      artist: (r[iArt] || '').trim(),
      title: (r[iTit] || '').trim(),
      yt: (iUrl !== -1 ? (r[iUrl] || '').trim() : ''),
      isrc: (iIsrc !== -1 ? (r[iIsrc] || '').trim() : ''),
      year: isFinite(year) ? year : null
    };
  }
if (lang) csvMemCache[lang] = map;
return map;
}



function loadHitsterCsv(lang) {
  if (csvMemCache[lang]) return Promise.resolve(csvMemCache[lang]);
  var lsKey = 'rikster_hitcsv_' + lang;
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(lsKey) || 'null'); } catch (e) { cached = null; }
  var fresh = cached && (Date.now() - cached.t < 7 * 24 * 3600 * 1000);

  function build(text) { return buildCardMap(text, lang); }

  if (fresh) return Promise.resolve(build(cached.text));

  function fetchCsv(url) {
    return fetchWithTimeout(url, 12000).then(function (res) {
      if (!res.ok) throw { code: (res.status === 404) ? 'CSV_MISSING' : 'CSV_NETWORK' };
      return res.text();
    });
  }

  /* Erst die stets aktuelle Online-Datenbank, sonst die mitgelieferte
     Sicherungskopie im Ordner data/ */
  return fetchCsv(HITSTER_DB + 'hitster-' + lang + '.csv')
    .catch(function (e1) {
      console.warn('Online-Kartendatenbank nicht verf\u00fcgbar (' + ((e1 && e1.code) || e1) + ') \u2013 nutze lokales Backup');
      return fetchCsv('data/hitster-' + lang + '.csv');
    })
    .then(function (text) {
      try { localStorage.setItem(lsKey, JSON.stringify({ t: Date.now(), text: text })); } catch (e) { /* Quota egal */ }
      return build(text);
    })
    .catch(function (err) {
      if (cached && cached.text) return build(cached.text); /* alter Cache besser als nichts */
      throw (err && err.code) ? err : { code: 'CSV_NETWORK' };
    });
}

/* Markt für die Suche: echtes Länderkürzel aus dem Profil (gecacht) –
   "from_token" akzeptiert die Such-Schnittstelle nicht zuverlässig. */
function searchMarket() {
  try {
    var c = localStorage.getItem('rikster_country');
    if (c && /^[A-Z]{2}$/.test(c)) return '&market=' + c;
  } catch (e) { /* egal */ }
  return '';
}

var lastSearchDiag = null; /* letzter Such-Fehlerstatus für Fehlermeldungen */

function searchTracks(q, limit, offset) {
  /* Seit Februar 2026 erlaubt Spotify bei der Suche höchstens limit=10 */
  var lim = Math.min(limit || 10, 10);
  var url = '/search?type=track&limit=' + lim +
    (offset ? '&offset=' + offset : '') +
    searchMarket() +
    '&q=' + encodeURIComponent(q);
  return api(url).then(function (res) {
    if (!res.ok) {
      return readApiError(res).then(function (d) {
        lastSearchDiag = d;
        console.warn('Spotify-Suche fehlgeschlagen', d, q);
        return [];
      });
    }
    return res.json().then(function (j) {
      return (j && j.tracks && j.tracks.items) || [];
    });
  });
}

/* Hauptinterpret aus CSV-Angaben wie "A feat. B", "A & B", "A x B" */
function mainArtist(artist) {
  var s = String(artist || '');
  var parts = s.split(/\s+(?:feat\.?|ft\.?|featuring|vs\.?)\s+|\s*&\s*|\s+x\s+/i);
  return ((parts[0] || s).trim()) || s;
}

function searchSpotifyTrack(meta) {
  /* Die ISRC ist die eindeutige Kennung einer Aufnahme - wenn die
     Edition sie mitliefert, ist die Zuordnung damit exakt. */
  if (meta.isrc && /^[A-Za-z0-9]{12}$/.test(meta.isrc)) {
    return searchTracks('isrc:' + meta.isrc, 5).then(function (items) {
      if (items.length) return items[0].id;
      return searchByNameAndArtist(meta);
    }).catch(function () { return searchByNameAndArtist(meta); });
  }
  return searchByNameAndArtist(meta);
}

function searchByNameAndArtist(meta) {
  var title = cleanTitle(meta.title);
  var main = mainArtist(meta.artist);
  var queries = [
    'track:"' + title.replace(/"/g, '') + '" artist:"' + main.replace(/"/g, '') + '"',
    title + ' ' + main
  ];
  if (normalize(main) !== normalize(meta.artist)) queries.push(title + ' ' + meta.artist);
  queries.push(title); /* letzte Rettung: nur der Titel */

  var nt = normalize(title);
  var candidates = String(meta.artist)
    .split(/\s+(?:feat\.?|ft\.?|featuring|vs\.?)\s+|\s*[&,+\/]\s*|\s+x\s+/i)
    .map(normalize)
    .filter(function (x) { return x.length >= 2; });
  candidates.push(normalize(meta.artist));

  function artistMatches(t) {
    return (t.artists || []).some(function (a) {
      var n = normalize(a.name);
      if (!n) return false;
      return candidates.some(function (c) {
        return n === c || n.indexOf(c) !== -1 || c.indexOf(n) !== -1;
      });
    });
  }
  function titleSim(t) {
    var ct = normalize(cleanTitle(t.name));
    if (!ct) return 0;
    if (ct === nt) return 2;
    if (ct.indexOf(nt) !== -1 || nt.indexOf(ct) !== -1) return 1;
    return 0;
  }
  function yearScore(t) {
    var y = parseInt(String((t.album && t.album.release_date) || '').slice(0, 4), 10);
    if (!meta.year || !isFinite(y)) return 0;
    var yd = Math.abs(y - meta.year);
    if (yd === 0) return 3;
    if (yd <= 1) return 2;
    if (yd <= 3) return 1;
    if (yd >= 15) return -1;
    return 0;
  }

  /* Suchstufen nacheinander, bis eine Treffer liefert */
  lastSearchDiag = null;
  var step = Promise.resolve([]);
  queries.forEach(function (q) {
    step = step.then(function (items) {
      if (items.length) return items;
      return searchTracks(q, 10);
    });
  });

  return step.then(function (items) {
    if (!items.length) throw { code: 'NO_MATCH', diag: lastSearchDiag };
    var best = null, bestScore = -Infinity;
    items.forEach(function (t) {
      var am = artistMatches(t);
      var ts = titleSim(t);
      if (!am && !ts) return; /* weder Interpret noch Titel passen */
      var s = (am ? 4 : 0) + ts * 2 + yearScore(t) + (t.popularity || 0) / 100;
      if (s > bestScore) { bestScore = s; best = t; }
    });
    if (!best) throw { code: 'NO_MATCH', diag: lastSearchDiag };
    return best.id;
  });
}

/* Plan B ohne Spotify-Suche: der YouTube-Link aus der Community-Datenbank
   wird über die freie Odesli-API (song.link) in einen Spotify-Track übersetzt.
   Funktioniert auch, wenn Spotify die Suche verweigert (z. B. HTTP 403). */
function resolveViaOdesli(ytUrl) {
  if (!ytUrl || !/^https?:\/\//i.test(ytUrl)) return Promise.reject(new Error('kein Link'));
  var url = 'https://api.song.link/v1-alpha.1/links?userCountry=DE&url=' + encodeURIComponent(ytUrl);
  return fetchWithTimeout(url, 9000).then(function (r) {
    if (!r.ok) throw new Error('odesli ' + r.status);
    return r.json();
  }).then(function (j) {
    var sp = j && j.linksByPlatform && j.linksByPlatform.spotify && j.linksByPlatform.spotify.url;
    var m = sp && sp.match(/track\/([A-Za-z0-9]{22})/);
    if (!m) throw new Error('kein Spotify-Link');
    return m[1];
  });
}

function resolveHitsterCard(scan) {
  return loadHitsterCsv(scan.lang).then(function (map) {
    var meta = map[scan.num];
    if (!meta || !meta.title) throw { code: 'CARD_UNKNOWN' };
    return searchSpotifyTrack(meta).catch(function (err) {
      var diag = (err && err.diag) || null;
      return resolveViaOdesli(meta.yt).catch(function (e2) {
        console.warn('Odesli-Fallback', e2);
        throw { code: 'NO_MATCH', meta: meta, diag: diag };
      });
    }).then(function (id) {
      return { id: id, meta: meta };
    });
  });
}

/* ============================================================
   SONG-INFOS für die Auflösung
   ============================================================ */

/* ============================================================
   JAHRESPRÜFUNG ÜBER MEHRERE QUELLEN
   ------------------------------------------------------------
   Spotify nennt oft das Jahr einer Neuveröffentlichung. Deshalb
   wird gegengeprüft, in dieser Reihenfolge:
   1) Hitster-Kartendatenbank (von Menschen geprüft, offline)
   2) Deutsche und englische Wikipedia (Songartikel)
   3) Früheste Fassung bei Spotify
   Die kleinste plausible Jahreszahl gewinnt, sofern sie durch
   mindestens eine verlässliche Quelle gedeckt ist.
   ============================================================ */
var jahrIndex = null;        /* Nachschlagewerk aus allen Editionen */
var jahrIndexJob = null;

function baueJahrIndex() {
  if (jahrIndex) return Promise.resolve(jahrIndex);
  if (jahrIndexJob) return jahrIndexJob;
  var editionen = ['de', 'de-aaaa0007', 'de-aaaa0012', 'de-aaaa0015', 'de-aaaa0019',
    'de-aaaa0025', 'de-aaaa0026', 'de-aaaa0039', 'de-aaaa0040', 'de-aaaa0042',
    'de-aaaa0054', 'fr', 'fr-aaaa0031', 'nl', 'nordics', 'pl-aaae0001',
    'pl-aaae0004', 'hu-aaae0003', 'ca-aaad0001'];
  jahrIndexJob = Promise.all(editionen.map(function (lang) {
    return loadHitsterCsv(lang).catch(function () { return null; });
  })).then(function (teile) {
    var idx = {};
    teile.forEach(function (map) {
      if (!map) return;
      Object.keys(map).forEach(function (num) {
        var m = map[num];
        if (!m || !m.year || !m.artist || !m.title) return;
        var k = normalize(mainArtist(m.artist)) + '|' + normalize(cleanTitle(m.title));
        if (!idx[k] || m.year < idx[k]) idx[k] = m.year;
      });
    });
    jahrIndex = idx;
    return idx;
  });
  return jahrIndexJob;
}

/* 1) Kartendatenbank */
function jahrAusDatenbank(artist, title) {
  return baueJahrIndex().then(function (idx) {
    var k = normalize(mainArtist(artist)) + '|' + normalize(cleanTitle(title));
    return idx[k] || null;
  }).catch(function () { return null; });
}

/* 2) Wikipedia: Erscheinungsjahr aus dem Songartikel */
function jahrAusWikipedia(artist, title) {
  var t = cleanTitle(title);
  var a = mainArtist(artist);

  function suche(lang) {
    var q = '"' + t.replace(/"/g, '') + '" ' + a + (lang === 'de' ? ' Lied' : ' song');
    var url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&formatversion=2&origin=*&srlimit=4&srsearch=' +
      encodeURIComponent(q);
    return fetchWithTimeout(url, 9000).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      var hits = (j && j.query && j.query.search) || [];
      var nt = normalize(t), na = normalize(a);
      for (var i = 0; i < hits.length; i++) {
        var n = normalize(hits[i].title);
        if (n.indexOf(nt) !== -1 && n !== na) return { lang: lang, titel: hits[i].title };
      }
      return null;
    }).catch(function () { return null; });
  }

  function auswerten(treffer) {
    if (!treffer) return null;
    var url = 'https://' + treffer.lang + '.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&redirects=1&format=json&formatversion=2&origin=*&titles=' +
      encodeURIComponent(treffer.titel);
    return fetchWithTimeout(url, 9000).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      var p = j && j.query && j.query.pages && j.query.pages[0];
      var text = (p && p.extract) || '';
      if (!text) return null;
      /* Interpret muss vorkommen, sonst ist es der falsche Artikel */
      if (normalize(text).indexOf(normalize(a)) === -1) return null;
      var jahre = [];
      var re = /\b(19[0-9]{2}|20[0-2][0-9])\b/g, m;
      while ((m = re.exec(text.slice(0, 1200))) !== null) jahre.push(parseInt(m[1], 10));
      if (!jahre.length) return null;
      jahre.sort(function (x, y) { return x - y; });
      return jahre[0];
    }).catch(function () { return null; });
  }

  return suche('de').then(function (tr) {
    if (tr) return auswerten(tr);
    return suche('en').then(auswerten);
  }).catch(function () { return null; });
}

/* Alles zusammenführen */
/* ---------- MusicBrainz: erste Veröffentlichung einer Aufnahme ----------
   MusicBrainz führt zu jeder Aufnahme das Datum der ERSTEN
   Veröffentlichung. Remaster, Neuauflagen und Compilations ändern
   daran nichts - genau das brauchen wir fürs Spiel.
   MusicBrainz bittet um höchstens eine Anfrage pro Sekunde,
   deshalb laufen alle Abfragen durch eine Warteschlange. */
var mbWarteschlange = Promise.resolve();
var MB_ABSTAND = 1100;

function mbAnfrage(url) {
  var ergebnis = mbWarteschlange.then(function () {
    return fetchWithTimeout(url, 12000).then(function (r) {
      if (r.status === 503) {                       /* zu schnell - einmal nachfassen */
        return new Promise(function (res) { setTimeout(res, 2500); })
          .then(function () { return fetchWithTimeout(url, 12000); });
      }
      return r;
    }).then(function (r) {
      if (!r.ok) throw new Error('mb ' + r.status);
      return r.json();
    });
  });
  /* Nächste Anfrage erst nach der Wartezeit starten */
  mbWarteschlange = ergebnis.catch(function () { /* egal */ }).then(function () {
    return new Promise(function (res) { setTimeout(res, MB_ABSTAND); });
  });
  return ergebnis;
}

function jahrAusMusicBrainz(artist, title) {
  var t = cleanTitle(title);
  var a = mainArtist(artist);
  if (!t || !a) return Promise.resolve(null);

  var q = 'recording:"' + t.replace(/"/g, '') + '" AND artist:"' + a.replace(/"/g, '') + '"';
  var url = 'https://musicbrainz.org/ws/2/recording/?fmt=json&limit=25&query=' + encodeURIComponent(q);

  return mbAnfrage(url).then(function (j) {
    var treffer = (j && j.recordings) || [];
    var nt = normalize(t), na = normalize(a);
    var jahre = [];

    treffer.forEach(function (rec) {
      if (rec.score && rec.score < 85) return;
      /* Titel muss übereinstimmen - sonst erwischen wir ein anderes Stück */
      var rt = normalize(cleanTitle(rec.title));
      if (rt !== nt && rt.indexOf(nt) === -1 && nt.indexOf(rt) === -1) return;
      /* Interpret muss übereinstimmen */
      var passt = (rec['artist-credit'] || []).some(function (ac) {
        var n = normalize(ac.artist && ac.artist.name);
        return n === na || n.indexOf(na) !== -1 || na.indexOf(n) !== -1;
      });
      if (!passt) return;

      function merke(datum) {
        var y = parseInt(String(datum || '').slice(0, 4), 10);
        if (isFinite(y) && y >= 1900 && y <= 2100) jahre.push(y);
      }
      merke(rec['first-release-date']);
      (rec.releases || []).forEach(function (rel) {
        merke(rel.date);
        if (rel['release-group']) merke(rel['release-group']['first-release-date']);
      });
    });

    if (!jahre.length) return null;
    jahre.sort(function (x, y) { return x - y; });
    return jahre[0];
  }).catch(function () { return null; });
}

/* ---------- Gemerkte Ergebnisse ---------- */
function jahrCacheKey(artist, title) {
  return normalize(mainArtist(artist)) + '|' + normalize(cleanTitle(title));
}
function jahrCacheLies(artist, title) {
  try {
    var c = JSON.parse(localStorage.getItem('rikster_jahre') || '{}');
    return c[jahrCacheKey(artist, title)] || null;
  } catch (e) { return null; }
}
function jahrCacheSchreib(artist, title, wert) {
  try {
    var c = JSON.parse(localStorage.getItem('rikster_jahre') || '{}');
    var schluessel = Object.keys(c);
    if (schluessel.length > 3000) delete c[schluessel[0]];     /* nicht endlos wachsen lassen */
    c[jahrCacheKey(artist, title)] = wert;
    localStorage.setItem('rikster_jahre', JSON.stringify(c));
  } catch (e) { /* egal */ }
}

/* ---------- Alle Quellen zusammenführen ----------
   Reihenfolge nach Verlässlichkeit:
   1. Hitster-Kartendatenbank - von Menschen abgetippte Originaljahre
   2. MusicBrainz - Datum der ersten Veröffentlichung der Aufnahme
   3. Wikipedia - Erscheinungsjahr aus dem Songartikel
   4. Spotify - nur als letzter Ausweg, nennt oft Remaster-Jahre */
function pruefeJahr(artist, title, spotifyJahr) {
  var gemerkt = jahrCacheLies(artist, title);
  if (gemerkt && gemerkt.jahr) return Promise.resolve(gemerkt);

  return jahrAusDatenbank(artist, title).then(function (db) {
    if (db) return { jahr: db, quelle: 'Kartendatenbank' };

    return jahrAusMusicBrainz(artist, title).then(function (mb) {
      return jahrAusWikipedia(artist, title).then(function (wiki) {
        /* MusicBrainz und Wikipedia gegeneinander prüfen: Liegt
           Wikipedia früher, ist das meist die Erstveröffentlichung
           (Single vor Album) - dann gewinnt der frühere Wert. */
        if (mb && wiki) {
          var jahr = Math.min(mb, wiki);
          return { jahr: jahr, quelle: (jahr === mb ? 'MusicBrainz' : 'Wikipedia') };
        }
        if (mb) return { jahr: mb, quelle: 'MusicBrainz' };
        if (wiki) return { jahr: wiki, quelle: 'Wikipedia' };

        return findOriginalYear(artist, title).catch(function () { return null; })
          .then(function (spot) {
            if (spot) return { jahr: spot, quelle: 'Spotify' };
            return null;
          });
      });
    });
  }).then(function (r) {
    if (!r || !r.jahr || r.jahr < 1900 || r.jahr > 2100) return null;
    jahrCacheSchreib(artist, title, r);
    return r;
  }).catch(function () { return null; });
}

/* ---------- Jahresangaben ----------
   Spotify liefert das Datum des ALBUMS, auf dem der Titel liegt. Bei
   alten Songs ist das oft ein Remaster oder eine Compilation - dann
   stimmt das Jahr nicht. Zwei Gegenmittel:
   1) Liegt der Karte kein Jahr bei, suchen wir die frueheste Fassung.
   2) Eigene Korrekturen ueberschreiben alles und bleiben gespeichert. */
function fixAll() {
  var raw = {};
  try { raw = JSON.parse(localStorage.getItem(LS.fixes) || 'null') || {}; } catch (e) { raw = {}; }
  if (!Object.keys(raw).length) {
    /* frueheres Format: nur Jahreszahlen unter altem Schluessel */
    try {
      var alt = JSON.parse(localStorage.getItem('rikster_yearfix') || 'null') || {};
      Object.keys(alt).forEach(function (k) {
        if (typeof alt[k] === 'number') raw[k] = { year: alt[k] };
        else if (alt[k]) raw[k] = alt[k];
      });
    } catch (e) { /* egal */ }
  }
  return raw;
}
function fixGet(trackId) {
  var f = fixAll()[trackId];
  return (f && typeof f === 'object') ? f : null;
}
function fixSet(trackId, feld, wert) {
  var all = fixAll();
  var eintrag = all[trackId] || {};
  if (wert === null) delete eintrag[feld]; else eintrag[feld] = wert;
  if (Object.keys(eintrag).length) all[trackId] = eintrag; else delete all[trackId];
  try { localStorage.setItem(LS.fixes, JSON.stringify(all)); } catch (e) { toast('Konnte nicht gespeichert werden'); }
}
function fixClear(trackId) {
  var all = fixAll();
  delete all[trackId];
  try { localStorage.setItem(LS.fixes, JSON.stringify(all)); } catch (e) { /* egal */ }
}

/* Gespeicherte Korrekturen auf einen Song anwenden */
function applyFixes(info) {
  var f = fixGet(info.id);
  if (!f) return;
  if (f.artist) info.artists = String(f.artist).split(/\s*,\s*/).filter(Boolean);
  if (f.title) info.name = f.title;
  if (f.year) applyYear(info, f.year);
}

function applyYear(info, y) {
  var sy = parseInt(info.year, 10);
  info.year = String(y);
  if (!isFinite(sy) || sy !== y) { info.release = null; info.precision = null; }
}

/* Frueheste Veroeffentlichung desselben Songs bei Spotify finden */
function findOriginalYear(artist, title) {
  var t = cleanTitle(title);
  var a = mainArtist(artist);
  return searchTracks('track:"' + t.replace(/"/g, '') + '" artist:"' + a.replace(/"/g, '') + '"', 10)
    .then(function (items) {
      if (!items.length) return searchTracks(t + ' ' + a, 10);
      return items;
    })
    .then(function (items) {
      var nt = normalize(t);
      var na = normalize(a);
      var best = null;
      items.forEach(function (it) {
        var ct = normalize(cleanTitle(it.name));
        if (ct !== nt && ct.indexOf(nt) === -1 && nt.indexOf(ct) === -1) return;
        var passt = (it.artists || []).some(function (ar) {
          var n = normalize(ar.name);
          return n === na || n.indexOf(na) !== -1 || na.indexOf(n) !== -1;
        });
        if (!passt) return;
        var y = parseInt(String((it.album && it.album.release_date) || '').slice(0, 4), 10);
        if (!isFinite(y) || y < 1900) return;
        if (best === null || y < best) best = y;
      });
      return best;
    })
    .catch(function () { return null; });
}

function fetchTrackInfo(trackId, cardMeta) {
  return api('/tracks/' + trackId).then(function (res) {
    if (!res.ok) {
      return readApiError(res).then(function (d) { throw { code: 'INFO', detail: d }; });
    }
    return res.json();
  }).then(function (t) {
    var album = t.album || {};
    var info = {
      id: trackId,
      name: t.name,
      artists: (t.artists || []).map(function (a) { return a.name; }),
      artistId: t.artists && t.artists[0] && t.artists[0].id,
      album: album.name,
      albumId: album.id,
      images: album.images || [],
      release: album.release_date,
      precision: album.release_date_precision,
      year: String(album.release_date || '').slice(0, 4),
      duration: t.duration_ms,
      popularity: t.popularity
    };
    /* Bei offiziellen Karten gilt das Jahr der Karte – Spotify listet
       oft Remaster/Compilations mit späterem Datum. */
    var korrektur = fixGet(trackId) || {};
    var schritt = Promise.resolve();
    if (cardMeta) {
      info.cardArtist = cardMeta.artist;
      if (cardMeta.year) {
        applyYear(info, cardMeta.year);
      } else if (!korrektur.year) {
        /* Karte ohne Jahresangabe: über mehrere Quellen gegenprüfen.
           Bei eigener Jahreskorrektur entfällt die Suche komplett. */
        schritt = pruefeJahr(
          korrektur.artist || cardMeta.artist || info.artists[0],
          korrektur.title || cardMeta.title || info.name,
          parseInt(info.year, 10)
        ).then(function (r) {
          var sy = parseInt(info.year, 10);
          if (r && r.jahr && (!isFinite(sy) || r.jahr !== sy)) {
            applyYear(info, r.jahr);
            info.jahrQuelle = r.quelle;
          }
        }).catch(function () { /* egal */ });
      }
    }
    return schritt.then(function () {
      applyFixes(info);            /* eigene Korrekturen haben Vorrang */
      info.extras = fetchExtras(info);
      return info;
    });
  });
}

/* Zusatzinfos aus mehreren Quellen – alles best-effort und parallel */
function fetchExtras(info) {
  var jobs = [];

  /* Spotify: Genres + Follower des Interpreten */
  if (info.artistId) {
    jobs.push(api('/artists/' + info.artistId).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (a) {
      if (a) {
        if (a.genres && a.genres.length) info.genres = a.genres;
        info.followers = a.followers && a.followers.total;
      }
    }).catch(function () { /* egal */ }));
  }

  /* Spotify: Label */
  if (info.albumId) {
    jobs.push(api('/albums/' + info.albumId).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (al) {
      if (al) info.label = al.label;
    }).catch(function () { /* egal */ }));
  }

  /* Wikipedia: Kurzporträt des Interpreten */
  if (info.artists[0]) {
    jobs.push(fetchWiki(info.artists[0]).then(function (w) { info.wiki = w; }).catch(function () { /* egal */ }));
  }

  /* MusicBrainz: Herkunftsland des Interpreten */
  if (info.artists[0]) {
    jobs.push(fetchArtistCountry(info.artists[0]).then(function (c) {
      if (c) info.country = c;
    }).catch(function () { /* egal */ }));
  }

  /* Wikipedia (Song-Artikel): Charts, Auszeichnungen, Verkäufe
     + Wikidata: Sprache des Songs */
  info._articleJob = fetchSongArticleData(info).catch(function () { /* egal */ });
  jobs.push(info._articleJob);

  /* Jahres-Kontext: 5 weitere Lieder + 5 Ereignisse desselben Jahres */
  jobs.push(fetchYearContext(info).catch(function () { /* egal */ }));

  /* Songfacts: erster Fact, übersetzt */
  jobs.push(fetchSongfact(info).then(function (sf) {
    if (sf) info.songfact = sf;
  }).catch(function () { /* egal */ }));

  return Promise.all(jobs).then(function () { return info; });
}

function fetchWiki(artist) {
  var langs = ['de', 'en'];
  var chain = Promise.resolve(null);
  langs.forEach(function (lang) {
    chain = chain.then(function (found) {
      if (found) return found;
      return fetch('https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(artist))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || (j.type && j.type.indexOf('disambiguation') !== -1)) return null;
          if (j.extract && j.extract.length > 40) {
            return {
              text: j.extract,
              lang: lang,
              url: j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page
            };
          }
          return null;
        })
        .catch(function () { return null; });
    });
  });
  return chain;
}

function fetchArtistCountry(artistName) {
  var url = 'https://musicbrainz.org/ws/2/artist/?fmt=json&limit=1&query=artist:%22' +
    encodeURIComponent(artistName.replace(/"/g, '')) + '%22';
  return fetchWithTimeout(url, 9000).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (j) {
    var a = j && j.artists && j.artists[0];
    if (!a || (a.score && a.score < 90)) return null;
    if (a.country) return countryNameDe(a.country);
    if (a.area && a.area.name) return a.area.name;
    return null;
  });
}

/* ---------- Wikipedia: Song-Artikel finden & auswerten ----------
   Wichtig: Die Chart-Tabellen der deutschen Wikipedia bestehen aus
   Vorlagen, deren Zellen beim Rendern praktisch leer bleiben (Flaggen
   statt Text) - auslesen laesst sich das nur aus dem Fliesstext.
   Zusaetzlich werten wir den englischen Artikel aus, dessen Tabellen
   echte Textzellen haben. Beide Quellen werden zusammengefuehrt. */

var DE_NUM = {
  'ein': 1, 'eine': 1, 'eins': 1, 'zwei': 2, 'drei': 3, 'vier': 4,
  'f\u00fcnf': 5, 'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10,
  'elf': 11, 'zw\u00f6lf': 12, 'dreizehn': 13, 'vierzehn': 14, 'f\u00fcnfzehn': 15,
  'sechzehn': 16, 'siebzehn': 17, 'achtzehn': 18, 'neunzehn': 19, 'zwanzig': 20
};
function deWordNum(w) {
  if (!w) return null;
  var s = String(w).trim();
  if (/^\d{1,3}$/.test(s)) return parseInt(s, 10);
  var n = DE_NUM[s.toLowerCase()];
  return (n === undefined) ? null : n;
}

var DE_REGIONS = [
  { re: /Deutschland|deutschen (Single)?charts|deutschen Charts/i, code: 'DE' },
  { re: /\u00d6sterreich|\u00f6sterreichischen/i, code: 'AT' },
  { re: /Schweiz|Schweizer Hitparade/i, code: 'CH' },
  { re: /Vereinigten K\u00f6nigreich|britischen|Gro\u00dfbritannien/i, code: 'UK' },
  { re: /Vereinigten Staaten|US-amerikanischen|Billboard/i, code: 'US' }
];
var EN_REGIONS = [
  { re: /^Germany\b/i, code: 'DE' },
  { re: /^Austria\b/i, code: 'AT' },
  { re: /^Switzerland\b/i, code: 'CH' },
  { re: /^UK\b|^United Kingdom\b/i, code: 'UK' },
  { re: /^US\b|^United States\b/i, code: 'US' }
];

/* Zahl aus deutschen Verkaufsangaben: "1,15 Millionen" / "300.000" / "eine Million" */
function deSalesNum(numStr, unit) {
  if (!numStr) return null;
  var s = String(numStr).trim();
  var n;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = parseInt(s.replace(/\./g, ''), 10);
  else n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n)) return null;
  if (unit && /Million/i.test(unit)) n = n * 1000000;
  if (n < 1000) return null;
  return Math.round(n);
}

/* Ergebnisse aus mehreren Quellen zusammenfuehren */
function mergeChartData(info, charts, awards, sales) {
  (charts || []).forEach(function (c) {
    if (c.peak !== null && c.peak !== undefined && c.peak >= 1 && c.peak <= 150) {
      if (!info.chartPeak || c.peak < info.chartPeak.pos) info.chartPeak = { pos: c.peak, region: c.region };
    }
    if (c.weeks && c.weeks >= 1 && c.weeks <= 900) {
      var better = !info.chartWeeks ||
        (c.region === 'DE' && info.chartWeeks.region !== 'DE') ||
        (c.region === info.chartWeeks.region && c.weeks > info.chartWeeks.n);
      if (better) info.chartWeeks = { n: c.weeks, region: c.region };
    }
  });
  if (awards) {
    if (!info._aw) info._aw = { Gold: 0, Platin: 0, Diamant: 0 };
    ['Gold', 'Platin', 'Diamant'].forEach(function (k) {
      if (awards[k] > info._aw[k]) info._aw[k] = awards[k];
    });
    var parts = [];
    ['Diamant', 'Platin', 'Gold'].forEach(function (k) {
      if (info._aw[k] > 0) parts.push(info._aw[k] + '\u00d7 ' + k);
    });
    if (parts.length) info.awards = parts.join(' \u00b7 ');
  }
  if (sales && (!info._sales || sales > info._sales)) {
    info._sales = sales;
    info.sales = formatNumber(sales);
  }
}

/* ---- Deutscher Artikel: Fliesstext auswerten ---- */
function parseDeSongText(text, info) {
  if (!text) return;
  var art = normalize(mainArtist(info.artists[0]));
  if (art && normalize(text).indexOf(art) === -1) return; /* falscher Artikel */

  var charts = [];
  var lastReg = null;
  var parts = text.split(/(?:\.|\n)\s+/);
  parts.forEach(function (s) {
    if (/Jahrescharts|Jahreshitparade|Dekaden|Jahrgangs/i.test(s)) return; /* keine Wochencharts */
    var reg = null;
    for (var i = 0; i < DE_REGIONS.length; i++) {
      if (DE_REGIONS[i].re.test(s)) { reg = DE_REGIONS[i].code; break; }
    }
    if (reg) lastReg = reg; else reg = lastReg;
    if (!reg) return;

    var peak = null;
    if (/Chartspitze|Nummer[- ]eins|Spitzenposition|H\u00f6chstposition erreich/i.test(s)) peak = 1;
    var m = s.match(/(?:Rang|Platz|Position)\s+([A-Za-z\u00e4\u00f6\u00fc]+|\d{1,3})/i);
    if (m) {
      var n = deWordNum(m[1]);
      if (n !== null) peak = (peak === null) ? n : Math.min(peak, n);
    }
    var w = s.match(/(\d{1,3})\s*Wochen\s+in\s+(?:den|der)\s+(?:Singlecharts|Charts|Hitparade)/i);
    var weeks = w ? parseInt(w[1], 10) : null;
    if (peak !== null || weeks !== null) charts.push({ region: reg, peak: peak, weeks: weeks });
  });

  /* Auszeichnungen */
  var aw = { Gold: 0, Platin: 0, Diamant: 0 };
  function bump(kind, n) {
    var k = /Diamant/i.test(kind) ? 'Diamant' : (/Platin/i.test(kind) ? 'Platin' : 'Gold');
    if (n > aw[k]) aw[k] = n;
  }
  var re1 = /(\d{1,2})[\s-]?fach[\s-]?(Gold|Platin|Diamant)/gi, mm;
  while ((mm = re1.exec(text)) !== null) bump(mm[2], parseInt(mm[1], 10));
  var re2 = /([A-Za-z\u00e4\u00f6\u00fc]+|\d{1,2})\s*[Mm]al\s+mit\s+(Gold|Platin|Diamant)/g;
  while ((mm = re2.exec(text)) !== null) {
    var n2 = deWordNum(mm[1]);
    if (n2) bump(mm[2], n2);
  }
  var re3 = /einmal\s+mit\s+(Gold|Platin|Diamant)/gi;
  while ((mm = re3.exec(text)) !== null) bump(mm[1], 1);
  var re4 = /(Goldene[nr]?|Platin|Diamantene[nr]?)[\s-]?Schallplatte/gi;
  while ((mm = re4.exec(text)) !== null) bump(mm[1], 1);

  /* Verkaufszahlen */
  var sales = null;
  var s1 = text.match(/verkaufte sich (?:mehr als |\u00fcber )?([\d.,]+)\s*(Millionen|Million)?\s*(?:Mal|mal)/i);
  if (s1) sales = deSalesNum(s1[1], s1[2]);
  if (!sales && /verkaufte sich (?:mehr als |\u00fcber )?eine Million/i.test(text)) sales = 1000000;
  var s2 = text.match(/f\u00fcr (?:\u00fcber |mehr als )?([\d.,]+)\s*(Millionen|Million)?\s*verkaufte[nr]? Einheiten/i);
  if (s2) {
    var v2 = deSalesNum(s2[1], s2[2]);
    if (v2 && (!sales || v2 > sales)) sales = v2;
  }
  if (!sales && /f\u00fcr (?:\u00fcber |mehr als )?eine Million verkaufte[nr]? Einheiten/i.test(text)) sales = 1000000;

  mergeChartData(info, charts, aw, sales);
}

/* ---- Englischer Artikel: Tabellen auswerten ---- */
function parseEnSongHtml(html, info) {
  if (!html) return;
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var body = doc.body ? doc.body.textContent : '';
  var art = normalize(mainArtist(info.artists[0]));
  if (art && normalize(body).indexOf(art) === -1) return;

  var charts = [], aw = { Gold: 0, Platin: 0, Diamant: 0 }, sales = null;
  var rows = doc.querySelectorAll('tr');
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i].querySelectorAll('td,th');
    if (cells.length < 2) continue;
    var c0 = (cells[0].textContent || '').trim();
    var reg = null;
    for (var r = 0; r < EN_REGIONS.length; r++) {
      if (EN_REGIONS[r].re.test(c0)) { reg = EN_REGIONS[r].code; break; }
    }
    if (!reg) continue;
    var c1 = (cells[1].textContent || '').replace(/\[[^\]]*\]/g, '').trim();
    var cert = c1.match(/^(?:(\d{1,2})\s*[\u00d7x]\s*)?(Gold|Platinum|Diamond)\b/i);
    if (cert) {
      var kind = /Diamond/i.test(cert[2]) ? 'Diamant' : (/Platinum/i.test(cert[2]) ? 'Platin' : 'Gold');
      var cnt = cert[1] ? parseInt(cert[1], 10) : 1;
      if (cnt > aw[kind]) aw[kind] = cnt;
      if (cells.length > 2) {
        var sTxt = (cells[2].textContent || '').replace(/[^\d,\.]/g, '');
        var sNum = parseInt(sTxt.replace(/[.,]/g, ''), 10);
        if (isFinite(sNum) && sNum > 1000 && (!sales || sNum > sales)) sales = sNum;
      }
      continue;
    }
    var pm = c1.match(/^(\d{1,3})\b/);
    if (pm) charts.push({ region: reg, peak: parseInt(pm[1], 10), weeks: null });
  }
  mergeChartData(info, charts, aw, sales);
}

/* ---- Artikelsuche ---- */
function findWikiArticle(lang, info) {
  var title = cleanTitle(info.name);
  var art = mainArtist(info.artists[0]);
  var q = '"' + title.replace(/"/g, '') + '" ' + art + (lang === 'de' ? ' Lied' : ' song');
  var url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&formatversion=2&origin=*&srlimit=6&srsearch=' +
    encodeURIComponent(q);
  return fetchWithTimeout(url, 9000).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (j) {
    var hits = (j && j.query && j.query.search) || [];
    var nt = normalize(title);
    var na = normalize(art);
    var best = null, bestScore = 0;
    hits.forEach(function (h) {
      var t = h.title;
      var n = normalize(t);
      if (!nt || n.indexOf(nt) === -1) return;
      if (n === na) return;                       /* Interpreten-Seite */
      if (/\((album|studioalbum)\)/i.test(t)) return;
      var sc = 1;
      if (/\((lied|song|single)\)/i.test(t)) sc += 3;
      if (n === nt) sc += 2;
      if (sc > bestScore) { bestScore = sc; best = t; }
    });
    return best;
  }).catch(function () { return null; });
}

function fetchPlainExtract(lang, title) {
  var url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&origin=*&titles=' +
    encodeURIComponent(title);
  return fetchWithTimeout(url, 12000).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (j) {
    var p = j && j.query && j.query.pages && j.query.pages[0];
    return (p && p.extract) || null;
  }).catch(function () { return null; });
}

function fetchArticleHtml(lang, title) {
  return fetchWithTimeout('https://' + lang + '.wikipedia.org/api/rest_v1/page/html/' +
    encodeURIComponent(title.replace(/ /g, '_')), 12000)
    .then(function (r) { return r.ok ? r.text() : null; })
    .catch(function () { return null; });
}

function fetchQid(lang, title) {
  return fetch('https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { return j && j.wikibase_item; })
    .catch(function () { return null; });
}

function fetchSongArticleData(info) {
  var deJob = findWikiArticle('de', info).then(function (t) {
    if (!t) return null;
    info.deArticle = t;
    return fetchPlainExtract('de', t).then(function (txt) {
      parseDeSongText(txt, info);
      return t;
    });
  }).catch(function () { return null; });

  var enJob = findWikiArticle('en', info).then(function (t) {
    if (!t) return null;
    info.enArticle = t;
    return fetchArticleHtml('en', t).then(function (html) {
      parseEnSongHtml(html, info);
      return t;
    });
  }).catch(function () { return null; });

  return Promise.all([deJob, enJob]).then(function (res) {
    var lang = res[0] ? 'de' : (res[1] ? 'en' : null);
    var title = res[0] || res[1];
    if (!title) return null;
    return fetchQid(lang, title).then(function (qid) {
      return qid ? applyWikidata(qid, info) : null;
    });
  });
}

/* Wikidata: Sprache des Songs (P407), Verkaufszahlen (P2664) als Fallback */
function applyWikidata(qid, info) {
  return fetchWithTimeout('https://www.wikidata.org/wiki/Special:EntityData/' + qid + '.json', 9000)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var ent = j && j.entities && j.entities[qid];
      if (!ent || !ent.claims) return null;
      var claims = ent.claims;
      var langClaim = claims.P407 && claims.P407[0] && claims.P407[0].mainsnak &&
        claims.P407[0].mainsnak.datavalue && claims.P407[0].mainsnak.datavalue.value;
      var salesClaim = claims.P2664 && claims.P2664[0] && claims.P2664[0].mainsnak &&
        claims.P2664[0].mainsnak.datavalue && claims.P2664[0].mainsnak.datavalue.value;
      if (salesClaim && salesClaim.amount && !info.sales) {
        var amt = parseInt(String(salesClaim.amount).replace('+', ''), 10);
        if (isFinite(amt) && amt > 1000) info.sales = formatNumber(amt);
      }
      if (langClaim && langClaim.id) {
        return fetchWithTimeout('https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=de%7Cen&format=json&origin=*&ids=' + langClaim.id, 9000)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (lj) {
            var le = lj && lj.entities && lj.entities[langClaim.id];
            var lab = le && le.labels && (le.labels.de || le.labels.en);
            if (lab && lab.value) info.language = lab.value;
          })
          .catch(function () { /* egal */ });
      }
      return null;
    });
}

/* ---------- "Ueber den Song": Songfacts, sonst Wikipedia ----------
   Songfacts erlaubt keine direkten Browser-Abfragen, deshalb laufen die
   Anfragen ueber oeffentliche CORS-Proxys. Findet sich dort nichts,
   nehmen wir die Einleitung des englischen Wikipedia-Artikels - so ist
   die Box fast immer gefuellt. */
function songfactsSlug(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function proxyFetch(url) {
  var chain = Promise.reject(new Error('start'));
  CORS_PROXIES.forEach(function (proxy) {
    chain = chain.catch(function () {
      return fetchWithTimeout(proxy + encodeURIComponent(url), 9000).then(function (r) {
        if (!r.ok) throw new Error('proxy ' + r.status);
        return r.text();
      });
    });
  });
  return chain;
}

function translateToGerman(text) {
  var gtx = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=de&dt=t&q=' + encodeURIComponent(text);
  return fetchWithTimeout(gtx, 9000).then(function (r) {
    if (!r.ok) throw new Error('gtx ' + r.status);
    return r.json();
  }).then(function (j) {
    var out = '';
    if (j && j[0]) {
      for (var i = 0; i < j[0].length; i++) { if (j[0][i] && j[0][i][0]) out += j[0][i][0]; }
    }
    if (out.length < 10) throw new Error('leer');
    return { text: out, translated: true };
  }).catch(function () {
    var short = text.slice(0, 450);
    return fetchWithTimeout('https://api.mymemory.translated.net/get?langpair=en%7Cde&q=' + encodeURIComponent(short), 9000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var tr = j && j.responseData && j.responseData.translatedText;
        if (tr && tr.length > 10 && !/MYMEMORY/i.test(tr)) return { text: tr, translated: true };
        return { text: text, translated: false };
      })
      .catch(function () { return { text: text, translated: false }; });
  });
}

function tidyFact(t) {
  var f = String(t || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  if (f.length > 900) f = f.slice(0, 900).replace(/\s+\S*$/, '') + ' \u2026';
  return f;
}

/* Erster echter Fakt aus einer Songfacts-Seite */
function extractSongfact(html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var lis = doc.querySelectorAll('li');
  for (var i = 0; i < lis.length; i++) {
    var li = lis[i];
    var txt = (li.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt.length < 60 || txt.length > 1500) continue;
    if (li.querySelectorAll('a').length > 5) continue;          /* Navigation */
    if (/^(browse|sign in|newsletter|more songfacts|songplay|home)/i.test(txt)) continue;
    if (!/[.!?]/.test(txt)) continue;                            /* kein Satz */
    return tidyFact(txt);
  }
  return null;
}

function songfactUrls(info) {
  var artist = info.cardArtist || info.artists[0];
  var titles = [cleanTitle(info.name), info.name];
  var artists = [mainArtist(artist), artist];
  var stripThe = function (s) { return String(s).replace(/^the\s+/i, ''); };
  artists = artists.concat(artists.map(stripThe));
  var out = [];
  artists.forEach(function (a) {
    titles.forEach(function (t) {
      var u = 'https://www.songfacts.com/facts/' + songfactsSlug(a) + '/' + songfactsSlug(t);
      if (u.indexOf('//') !== -1 && out.indexOf(u) === -1) out.push(u);
    });
  });
  return out.slice(0, 5);
}

function fetchSongfact(info) {
  var urls = songfactUrls(info);
  var chain = Promise.resolve(null);
  urls.forEach(function (u) {
    chain = chain.then(function (found) {
      if (found) return found;
      return proxyFetch(u).then(function (html) {
        var f = extractSongfact(html);
        return f ? { raw: f, url: u, source: 'songfacts' } : null;
      }).catch(function () { return null; });
    });
  });

  return chain.then(function (hit) {
    if (hit) return hit;
    /* Plan B: Einleitung des englischen Wikipedia-Artikels */
    return (info._articleJob || Promise.resolve()).then(function () {
    if (!info.enArticle) return null;
    return fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(info.enArticle.replace(/ /g, '_')))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.extract || j.extract.length < 60) return null;
        return {
          raw: tidyFact(j.extract),
          url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) ||
            ('https://en.wikipedia.org/wiki/' + encodeURIComponent(info.enArticle.replace(/ /g, '_'))),
          source: 'wikipedia'
        };
      })
      .catch(function () { return null; });
    });
  }).then(function (hit) {
    if (!hit) return null;
    return translateToGerman(hit.raw).then(function (tr) {
      return { text: tr.text, translated: tr.translated, url: hit.url, source: hit.source };
    });
  }).catch(function () { return null; });
}

/* ---------- Jahres-Kontext für die Auflösung ---------- */
function fetchYearContext(info) {
  var year = parseInt(info.year, 10);
  if (!isFinite(year)) return Promise.resolve(null);
  var songsJob = fetchYearSongs(info, year).then(function (list) {
    if (list && list.length) info.yearSongs = list;
  }).catch(function () { /* egal */ });
  var eventsJob = loadYearEvents(year).then(function (pool) {
    var picks = pickN(pool, 5);
    if (picks.length) info.yearEvents = picks;
  }).catch(function () { /* egal */ });
  return Promise.all([songsJob, eventsJob]);
}

function fetchYearSongs(info, year) {
  var offset = pickRandom([0, 10, 20]);
  function search(off) {
    return searchTracks('year:' + year, 10, off);
  }
  return search(offset).then(function (items) {
    if (!items.length && offset > 0) return search(0);
    return items;
  }).then(function (items) {
    var ownArtists = info.artists.map(normalize);
    var ownName = normalize(cleanTitle(info.name));
    var pool = items.filter(function (t) {
      if (t.id === info.id) return false;
      if (normalize(cleanTitle(t.name)) === ownName) return false;
      var a0 = normalize(t.artists && t.artists[0] && t.artists[0].name);
      return ownArtists.indexOf(a0) === -1;
    });
    pool.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
    var shuffled = pickN(pool.slice(0, 25), 25);
    var out = [];
    var seen = {};
    for (var i = 0; i < shuffled.length && out.length < 5; i++) {
      var t = shuffled[i];
      var a = t.artists && t.artists[0] && t.artists[0].name;
      var key = normalize(a);
      if (seen[key]) continue; /* pro Interpret nur ein Lied */
      seen[key] = true;
      out.push({ name: t.name, artist: a });
    }
    return out;
  });
}

/* ============================================================
   HINWEISE (3 pro Lied: 1× Song aus demselben Jahr,
   2× historisches Ereignis desselben Jahres)
   ============================================================ */
function resetHints() {
  state.hints = { list: null, idx: -1, promise: null };
  hideHint();
}

function prepareHints(info) {
  var year = parseInt(info.year, 10);
  if (!isFinite(year)) { state.hints.promise = Promise.resolve([]); return state.hints.promise; }
  if (state.hints.promise) return state.hints.promise;

  state.hints.promise = Promise.all([
    hintSameYearSong(info, year).catch(function () { return null; }),
    loadYearEvents(year).catch(function () { return []; })
  ]).then(function (res) {
    var songHint = res[0];
    var pool = res[1] || [];
    /* Zusammensetzung pro Runde auslosen: mit 50 % Chance ist EIN
       Lied-Hinweis dabei (höchstens einer, Position zufällig),
       alle übrigen Plätze sind zufällige Ereignisse – es können
       also auch drei Ereignisse sein. */
    var useSong = Boolean(songHint) && Math.random() < 0.5;
    var list = pickN(pool, useSong ? 2 : 3);
    if (useSong) {
      var pos = Math.floor(Math.random() * (list.length + 1));
      list.splice(pos, 0, songHint);
    }
    /* Fallback: gibt es keine Ereignisse, wenigstens den Lied-Hinweis zeigen */
    if (!list.length && songHint) list = [songHint];
    state.hints.list = list;
    return list;
  });
  return state.hints.promise;
}

function hintSameYearSong(info, year) {
  var offset = pickRandom([0, 10, 20, 30]);
  function search(off) {
    return searchTracks('year:' + year, 10, off);
  }
  return search(offset).then(function (items) {
    if (!items.length && offset > 0) return search(0);
    return items;
  }).then(function (items) {
    var ownArtists = info.artists.map(normalize);
    var pool = items.filter(function (t) {
      if (t.id === info.id) return false;
      var a0 = normalize(t.artists && t.artists[0] && t.artists[0].name);
      if (ownArtists.indexOf(a0) !== -1) return false;
      return true;
    });
    if (!pool.length) return null;
    pool.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
    var top = pool.slice(0, Math.min(15, pool.length));
    var pick = pickRandom(top);
    return 'Aus demselben Jahr stammt auch \u201e' + pick.name + '\u201c von ' + pick.artists[0].name + '.';
  });
}

function loadYearEvents(year) {
  var pool = (typeof hintsForYear === 'function') ? hintsForYear(year) : [];
  return Promise.resolve(pool);
}

function onHintButton() {
  if (!state.assists) return;
  var pop = $('#hintPop');
  if (!state.hints.promise) {
    /* Jahr evtl. noch nicht geladen */
    if (state.trackInfo) {
      prepareHints(state.trackInfo);
    } else if (state.infoPromise) {
      pop.hidden = false;
      $('#hintLabel').textContent = 'Hinweis';
      $('#hintText').textContent = 'Wird geladen \u2026';
      state.infoPromise.then(function (info) {
        if (!info) { hideHint(); toast('Gerade keine Hinweise verf\u00fcgbar'); return; }
        prepareHints(info).then(function () { if (!pop.hidden) advanceHint(); });
      });
      return;
    } else {
      toast('Gerade keine Hinweise verf\u00fcgbar');
      return;
    }
  }
  if (state.hints.list) { advanceHint(); return; }
  pop.hidden = false;
  $('#hintLabel').textContent = 'Hinweis';
  $('#hintText').textContent = 'Wird geladen \u2026';
  state.hints.promise.then(function () {
    if (!pop.hidden) advanceHint();
  });
}

function advanceHint() {
  var list = state.hints.list || [];
  if (!list.length) {
    hideHint();
    toast('F\u00fcr dieses Lied sind gerade keine Hinweise verf\u00fcgbar');
    return;
  }
  state.hints.idx = (state.hints.idx + 1) % list.length;
  var pop = $('#hintPop');
  pop.hidden = false;
  $('#hintLabel').textContent = 'Hinweis ' + (state.hints.idx + 1) + '/' + list.length;
  $('#hintText').textContent = list[state.hints.idx];
}

function hideHint() {
  var pop = $('#hintPop');
  if (pop) pop.hidden = true;
}

/* ============================================================
   QR-SCANNER
   ============================================================ */
var detector = null;
try {
  if ('BarcodeDetector' in window) detector = new BarcodeDetector({ formats: ['qr_code'] });
} catch (e) { detector = null; }

function startScanner() {
  hideReveal();
  hideHint();
  showScreen('screen-scanner');
  state.scanning = true;
  var hint = $('#scanHint');
  hint.classList.remove('warn');
  hint.textContent = 'Halte den QR-Code in den Rahmen';

  var constraints = {
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }
  };
  navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
    if (!state.scanning) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    state.camStream = stream;
    var video = $('#camVideo');
    video.srcObject = stream;
    return video.play().then(function () { scanLoop(video); });
  }).catch(function (err) {
    console.warn('Kamera', err);
    state.scanning = false;
    showScreen('screen-home');
    openModal({
      title: 'Kein Kamerazugriff',
      text: 'Rikster braucht die Kamera, um Karten zu scannen. Erlaube den Zugriff in den Einstellungen deines Browsers bzw. der App und versuche es erneut.',
      primary: 'OK'
    });
  });
}

function stopScanner() {
  state.scanning = false;
  if (state.camStream) {
    state.camStream.getTracks().forEach(function (t) { t.stop(); });
    state.camStream = null;
  }
  var video = $('#camVideo');
  if (video) video.srcObject = null;
}

/* Kamera haengt sich gelegentlich auf - kompletter Neustart des Streams */
function restartCamera() {
  if (!state.scanning) { startScanner(); return; }
  toast('Kamera wird neu gestartet \u2026');
  stopScanner();
  setTimeout(function () { startScanner(); }, 400);
}

var hintTimer = null;
function flashHint(msg) {
  var hint = $('#scanHint');
  hint.textContent = msg;
  hint.classList.add('warn');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(function () {
    hint.classList.remove('warn');
    hint.textContent = 'Halte den QR-Code in den Rahmen';
  }, 2200);
}

function scanLoop(video) {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var last = 0;

  function handleText(text) {
    var scan = parseScan(text);
    if (scan) { onScanned(scan); return true; }
    flashHint('Das ist keine Hitster- oder Spotify-Karte');
    return false;
  }

  function tick(ts) {
    if (!state.scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && ts - last > 130) {
      last = ts;

      if (detector) {
        detector.detect(video).then(function (codes) {
          if (state.scanning && codes && codes.length && codes[0].rawValue) {
            handleText(codes[0].rawValue);
          }
        }).catch(function () { detector = null; });
      } else if (window.jsQR) {
        var size = Math.min(video.videoWidth, video.videoHeight, 720);
        if (size > 0) {
          canvas.width = size;
          canvas.height = size;
          var sx = (video.videoWidth - size) / 2;
          var sy = (video.videoHeight - size) / 2;
          ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
          var img = ctx.getImageData(0, 0, size, size);
          var code = window.jsQR(img.data, size, size, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) handleText(code.data);
        }
      }
    }
    if (state.scanning) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ============================================================
   SPIELFLUSS
   ============================================================ */
function onScanned(scan) {
  if (state.gameMode === 'party' && window.partyOnScanned) { partyOnScanned(scan); return; }
  if (navigator.vibrate) navigator.vibrate(60);
  stopScanner();
  showScreen('screen-player');
  setVinylSpinning(true);
  requestWakeLock();

  if (scan.kind === 'spotify') {
    startTrack(scan.id, null);
    return;
  }
  /* Offizielle Hitster-Karte: erst zuordnen */
  setPlayerStatus('Karte wird zugeordnet \u2026');
  resolveHitsterCard(scan).then(function (r) {
    startTrack(r.id, r.meta);
  }).catch(function (err) {
    handleResolveError(err, scan);
  });
}

function startTrack(trackId, cardMeta) {
  state.currentTrackId = trackId;
  state.cardMeta = cardMeta || null;
  state.trackInfo = null;
  state.infoError = null;
  resetHints();

  state.infoPromise = fetchTrackInfo(trackId, state.cardMeta).then(function (info) {
    state.trackInfo = info;
    if (state.assists) prepareHints(info);
    return info;
  }).catch(function (e) {
    state.infoError = (e && e.detail) || (e && e.message) || 'unbekannter Fehler';
    console.warn('Song-Infos', e);
    return null;
  });

  setPlayerStatus('Wird gestartet \u2026');
  setVinylSpinning(true);

  playTrack(trackId).then(function () {
    state.playing = true;
    setPlayerStatus('L\u00e4uft');
    maskMediaSession();
    startPlaybackUi();
  }).catch(handlePlayError);
}

function handleResolveError(err, scan) {
  console.warn('resolve', err);
  setVinylSpinning(false);
  setPlayerStatus('Pausiert');
  var code = err && err.code;
  if (code === 'CARD_UNKNOWN' || code === 'CSV_MISSING') {
    openModal({
      title: 'Karte nicht in der Datenbank',
      text: 'Diese Edition (\u201e' + scan.lang + '\u201c, Karte ' + scan.num + ') ist in der Kartendatenbank nicht erfasst. Deine selbst erstellten Karten funktionieren nat\u00fcrlich weiterhin.',
      primary: 'Neue Karte',
      onPrimary: goScan
    });
    return;
  }
  if (code === 'NO_MATCH') {
    var meta = err.meta || {};
    openModal({
      title: 'Song nicht gefunden',
      text: 'Die Karte wurde erkannt (' + (meta.artist || '?') + ' \u2013 \u201e' + (meta.title || '?') + '\u201c), aber bei Spotify wurde kein passender Song gefunden.' + (err.diag ? ' (Technik: Suche meldete ' + err.diag + ')' : ' (Suche lieferte 0 Treffer)'),
      primary: 'Neue Karte',
      onPrimary: goScan
    });
    return;
  }
  if (err && err.message === 'not-logged-in') { showScreen('screen-auth'); return; }
  openModal({
    title: 'Zuordnung fehlgeschlagen',
    text: 'Die Karten-Datenbank konnte nicht geladen werden.' +
      (err && err.detail ? '\n\nTechnik: ' + err.detail : ' Pr\u00fcfe deine Internetverbindung.'),
    primary: 'Erneut versuchen',
    onPrimary: function () { onScanned(scan); },
    secondary: 'Neue Karte',
    onSecondary: goScan
  });
}

function handlePlayError(err) {
  console.warn('play', err);
  setVinylSpinning(false);
  setPlayerStatus('Pausiert');
  if (err && err.message === 'not-logged-in') { showScreen('screen-auth'); return; }
  var code = err && err.code;
  if (code === 'NO_DEVICE') {
    openModal({
      title: 'Kein Wiedergabe-Ger\u00e4t gefunden',
      text: 'Rikster steuert gerade deine Spotify-App fern, findet aber kein aktives Ger\u00e4t. \u00d6ffne kurz die Spotify-App, spiele irgendein Lied an, pausiere es und komm hierher zur\u00fcck.' + (err && err.why ? ' (Technik: ' + err.why + ')' : ''),
      primary: 'Erneut versuchen',
      onPrimary: retryPlay,
      secondary: 'Neue Karte',
      onSecondary: goScan
    });
    return;
  }
  if (code === 'PREMIUM') {
    openModal({
      title: 'Premium ben\u00f6tigt',
      text: 'F\u00fcr die Wiedergabe braucht dein Spotify-Konto Premium.',
      primary: 'OK',
      onPrimary: goScan
    });
    return;
  }
  openModal({
    title: 'Wiedergabe fehlgeschlagen',
    text: (err && err.detail) || 'Das Lied konnte nicht gestartet werden. Pr\u00fcfe deine Internetverbindung.',
    primary: 'Erneut versuchen',
    onPrimary: retryPlay,
    secondary: 'Neue Karte',
    onSecondary: goScan
  });
}

function retryPlay() {
  if (!state.currentTrackId) { goScan(); return; }
  setPlayerStatus('Wird gestartet \u2026');
  setVinylSpinning(true);
  playTrack(state.currentTrackId).then(function () {
    state.playing = true;
    setPlayerStatus('L\u00e4uft');
    maskMediaSession();
  }).catch(handlePlayError);
}

function goScan() {
  stopPlayback();
  hideReveal();
  hideHint();
  startScanner();
}

function setPlayerStatus(txt) { $('#playerStatus').textContent = txt; }

function setVinylSpinning(on) {
  $('#vinylWrap').classList.toggle('playing', on);
  $('#eq').classList.toggle('playing', on);
}

/* ---------- Bildschirm anlassen, solange gespielt wird ---------- */
function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(function (lock) {
        state.wakeLock = lock;
      }).catch(function () { /* egal */ });
    }
  } catch (e) { /* egal */ }
}
function releaseWakeLock() {
  try { if (state.wakeLock) state.wakeLock.release(); } catch (e) { /* egal */ }
  state.wakeLock = null;
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && state.playing) requestWakeLock();
});

/* ============================================================
   AUFLÖSUNG
   ============================================================ */
function showReveal(force) {
  if (!force && !state.assists) return;
  hideHint();
  var sheet = $('#revealSheet');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  /* Immer oben beginnen, egal wie weit zuletzt gescrollt wurde */
  scrolleNachOben(sheet);
  renderRevealLoading();
  var p = state.trackInfo ? Promise.resolve(state.trackInfo) : (state.infoPromise || Promise.resolve(null));
  p.then(function (info) {
    if (!sheet.classList.contains('open')) return;
    renderReveal(info);
    if (info && info.extras) {
      info.extras.then(function () {
        if (sheet.classList.contains('open')) renderReveal(info);
      });
    }
  });
}

/* Setzt ein Blatt und seinen scrollbaren Inhalt auf den Anfang zurück */
function scrolleNachOben(sheet) {
  if (!sheet) return;
  function hoch() {
    sheet.scrollTop = 0;
    var inner = sheet.querySelector('.sheet-scroll');
    if (inner) inner.scrollTop = 0;
  }
  hoch();
  requestAnimationFrame(hoch);   /* nochmal, sobald das Blatt sichtbar ist */
}

function hideReveal() {
  var sheet = $('#revealSheet');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
}

function renderRevealLoading() {
  $('#revArtist').textContent = 'Einen Moment \u2026';
  $('#revYear').textContent = '\u2026';
  $('#revTitle').textContent = '\u00a0';
  $('#revCover').hidden = true;
  $('#revChips').innerHTML = '';
  $('#btnFix').hidden = true;
  $('#revSong').hidden = true;
  $('#revYearSongs').hidden = true;
  $('#revYearEvents').hidden = true;
  $('#revWiki').hidden = true;
  $('#revError').hidden = true;
}

function addChip(container, label, value, wide) {
  if (value === undefined || value === null || value === '') return;
  var chip = document.createElement('div');
  chip.className = wide ? 'chip wide' : 'chip';
  var k = document.createElement('span');
  k.className = 'k';
  k.textContent = label;
  var v = document.createElement('span');
  v.className = 'v';
  v.textContent = String(value);
  chip.appendChild(k);
  chip.appendChild(v);
  container.appendChild(chip);
}

/* Bleibt am Ende eine halbe Zeile übrig, wird die letzte kleine Kachel
   auf volle Breite gezogen - dann gibt es nirgends eine Lücke. */
function balanceChips(container) {
  var all = container.querySelectorAll('.chip');
  var small = [];
  for (var i = 0; i < all.length; i++) {
    all[i].classList.remove('stretch');
    if (!all[i].classList.contains('wide')) small.push(all[i]);
  }
  if (small.length % 2 === 1) small[small.length - 1].classList.add('stretch');
}

function renderReveal(info) {
  if (!info) {
    $('#revArtist').textContent = 'Hoppla';
    $('#revYear').textContent = '?';
    $('#revTitle').textContent = '\u00a0';
    $('#revError').textContent = 'Die Song-Infos konnten nicht geladen werden.' +
      (state.infoError ? ' (Technik: ' + state.infoError + ')' : ' Pr\u00fcfe deine Internetverbindung.');
    $('#revError').hidden = false;
    return;
  }
  $('#revError').hidden = true;
  $('#btnFix').hidden = false;
  $('#revArtist').textContent = info.artists.join(', ');
  $('#revYear').textContent = info.year || '?';
  $('#revTitle').textContent = displayTitle(info.name);

  var cover = $('#revCover');
  var img = info.images[1] || info.images[0];
  if (img && img.url) {
    cover.src = img.url;
    cover.hidden = false;
  } else {
    cover.hidden = true;
  }

  var chips = $('#revChips');
  chips.innerHTML = '';
  addChip(chips, 'Album', info.album);
  addChip(chips, 'Erschienen', formatRelease(info.release, info.precision));
  addChip(chips, 'L\u00e4nge', info.duration ? formatDuration(info.duration) : null);
  addChip(chips, 'Herkunftsland', info.country);
  addChip(chips, 'Sprache', info.language);
  addChip(chips, 'H\u00f6chste Chartplatzierung', info.chartPeak ? ('Nr. ' + info.chartPeak.pos + ' (' + info.chartPeak.region + ')') : null);
  addChip(chips, 'Wochen in den Charts', info.chartWeeks ? (info.chartWeeks.n + ' (' + info.chartWeeks.region + ')') : null);
  addChip(chips, 'Auszeichnungen', info.awards, true);
  addChip(chips, 'Verk\u00e4ufe', info.sales ? (info.sales + ' Einheiten') : null);
  addChip(chips, 'Spotify-Beliebtheit', (typeof info.popularity === 'number') ? info.popularity + ' / 100' : null);
  addChip(chips, 'Label', info.label);
  addChip(chips, 'Follower (Interpret)', info.followers ? formatNumber(info.followers) : null);
  if (info.genres && info.genres.length) {
    addChip(chips, 'Musikgenre', info.genres.slice(0, 3).join(', '), true);
  }
  balanceChips(chips);

  var songBox = $('#revSong');
  if (info.songfact && info.songfact.text) {
    var noteTxt = info.songfact.translated ? '' : ' (Original auf Englisch)';
    $('#songfactText').textContent = info.songfact.text + noteTxt;
    var sl = $('#songfactLink');
    sl.href = info.songfact.url;
    sl.textContent = (info.songfact.source === 'wikipedia' ? 'Quelle: Wikipedia' : 'Quelle: Songfacts') + '\u00a0\u2197';
    songBox.hidden = false;
  } else {
    songBox.hidden = true;
  }

  var ysBox = $('#revYearSongs');
  if (info.yearSongs && info.yearSongs.length) {
    $('#yearSongsTitle').textContent = 'Weitere Lieder aus ' + info.year;
    var ysList = $('#yearSongsList');
    ysList.innerHTML = '';
    info.yearSongs.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = '\u201e' + s.name + '\u201c \u2013 ' + s.artist;
      ysList.appendChild(li);
    });
    ysBox.hidden = false;
  } else {
    ysBox.hidden = true;
  }

  var yeBox = $('#revYearEvents');
  if (info.yearEvents && info.yearEvents.length) {
    $('#yearEventsTitle').textContent = 'Das geschah ' + info.year;
    var yeList = $('#yearEventsList');
    yeList.innerHTML = '';
    info.yearEvents.forEach(function (ev) {
      var li = document.createElement('li');
      li.textContent = ev;
      yeList.appendChild(li);
    });
    yeBox.hidden = false;
  } else {
    yeBox.hidden = true;
  }

  var wikiBox = $('#revWiki');
  if (info.wiki && info.wiki.text) {
    $('#wikiTitle').textContent = '\u00dcber ' + info.artists[0];
    $('#wikiText').textContent = info.wiki.text;
    var link = $('#wikiLink');
    if (info.wiki.url) { link.href = info.wiki.url; link.hidden = false; } else { link.hidden = true; }
    wikiBox.hidden = false;
  } else {
    wikiBox.hidden = true;
  }
}

function onFix() {
  var info = state.trackInfo;
  if (!info) { toast('Song-Infos sind noch nicht geladen'); return; }
  var f = fixGet(info.id) || {};
  var choices = [
    { label: 'Jahr korrigieren' + (f.year ? '  \u2713' : ''), onPick: function () { fixField('year'); } },
    { label: 'Interpret korrigieren' + (f.artist ? '  \u2713' : ''), onPick: function () { fixField('artist'); } },
    { label: 'Titel korrigieren' + (f.title ? '  \u2713' : ''), onPick: function () { fixField('title'); } }
  ];
  if (Object.keys(f).length) {
    choices.push({
      label: 'Alle Korrekturen zu diesem Song entfernen',
      onPick: function () {
        fixClear(info.id);
        toast('Korrekturen entfernt \u2013 gilt ab dem n\u00e4chsten Scan');
      }
    });
  }
  openModal({
    title: 'Fehler gefunden',
    text: info.artists.join(', ') + ' \u2013 \u201e' + info.name + '\u201c (' + (info.year || '?') + ')\n\nWas stimmt nicht?',
    choices: choices,
    primary: 'Abbrechen'
  });
}

function fixField(feld) {
  var info = state.trackInfo;
  if (!info) return;
  var gespeichert = (fixGet(info.id) || {})[feld];
  var titel = feld === 'year' ? 'Jahr korrigieren' : (feld === 'artist' ? 'Interpret korrigieren' : 'Titel korrigieren');
  var frage = feld === 'year' ? 'Welches Jahr steht auf der Karte?'
    : (feld === 'artist' ? 'Wie hei\u00dft der Interpret richtig? Mehrere durch Komma trennen.'
      : 'Wie hei\u00dft der Titel richtig?');
  var wert = feld === 'year' ? (info.year || '') : (feld === 'artist' ? info.artists.join(', ') : info.name);
  openModal({
    title: titel,
    text: frage,
    input: { value: wert, numeric: feld === 'year', placeholder: feld === 'year' ? 'z.\u202fB. 1984' : '' },
    primary: 'Speichern',
    onPrimary: function (val) {
      var eingabe = String(val || '').trim();
      if (feld === 'year') {
        var y = parseInt(eingabe.replace(/\D/g, ''), 10);
        if (!isFinite(y) || y < 1900 || y > 2100) { toast('Bitte eine Jahreszahl zwischen 1900 und 2100'); return; }
        fixSet(info.id, 'year', y);
        setCorrectedYear(info, y);
      } else {
        if (eingabe.length < 2) { toast('Bitte etwas mehr eintippen'); return; }
        fixSet(info.id, feld, eingabe);
        if (feld === 'artist') info.artists = eingabe.split(/\s*,\s*/).filter(Boolean);
        else info.name = eingabe;
        refreshExtras(info);
      }
      toast('Gespeichert \u2013 gilt ab jetzt auch beim n\u00e4chsten Scan');
      if (state.gameMode === 'party' && window.partyOnFixApplied) partyOnFixApplied(feld, info);
    },
    secondary: gespeichert !== undefined ? 'Korrektur entfernen' : null,
    onSecondary: gespeichert !== undefined ? function () {
      fixSet(info.id, feld, null);
      toast('Korrektur entfernt \u2013 beim n\u00e4chsten Scan gilt wieder die Angabe von Spotify');
    } : null
  });
}

/* Nach Korrektur von Interpret oder Titel: Zusatzinfos neu holen */
function refreshExtras(info) {
  ['genres', 'followers', 'label', 'wiki', 'country', 'language', 'chartPeak', 'chartWeeks',
   'awards', 'sales', 'songfact', 'deArticle', 'enArticle', '_aw', '_sales'].forEach(function (k) {
    delete info[k];
  });
  renderReveal(info);
  info.extras = fetchExtras(info);
  info.extras.then(function () {
    if ($('#revealSheet').classList.contains('open')) renderReveal(info);
  }).catch(function () { /* egal */ });
}

/* Korrigiertes Jahr sofort ueberall anwenden */
function setCorrectedYear(info, y) {
  applyYear(info, y);
  info.yearSongs = null;
  info.yearEvents = null;
  resetHints();
  if (state.assists) prepareHints(info);
  renderReveal(info);
  fetchYearContext(info).then(function () {
    if ($('#revealSheet').classList.contains('open')) renderReveal(info);
  }).catch(function () { /* egal */ });
}


/* ============================================================
   WIEDERGABESTEUERUNG (nur wenn der Schalter an ist)
   ------------------------------------------------------------
   Die Position wird lokal mitgezaehlt und nur ab und zu mit
   Spotify abgeglichen - das spart Anfragen und laeuft fluessig.
   ============================================================ */
var pb = { tick: null, sync: null, posMs: 0, durMs: 0, paused: false, basis: 0, dragging: false };

function fmtTime(ms) {
  var s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function pbVisible() { return state.controls && state.currentTrackId; }

function startPlaybackUi() {
  $('#playback').hidden = !pbVisible();
  if (!pbVisible()) { stopPlaybackUi(); return; }
  pb.posMs = 0;
  pb.basis = Date.now();
  pb.paused = false;
  pb.durMs = (state.trackInfo && state.trackInfo.duration) || 0;
  renderPlayback();
  if (pb.tick) clearInterval(pb.tick);
  pb.tick = setInterval(function () {
    if (!pb.dragging && !pb.paused) {
      pb.posMs = Math.min(pb.durMs || 1e9, pb.posMs + (Date.now() - pb.basis));
      pb.basis = Date.now();
    } else {
      pb.basis = Date.now();
    }
    renderPlayback();
  }, 250);
  if (pb.sync) clearInterval(pb.sync);
  pb.sync = setInterval(syncPlayback, 5000);
  syncPlayback();
}

function stopPlaybackUi() {
  if (pb.tick) { clearInterval(pb.tick); pb.tick = null; }
  if (pb.sync) { clearInterval(pb.sync); pb.sync = null; }
  var el = $('#playback');
  if (el) el.hidden = true;
}

/* Stand von Spotify holen - beim In-App-Player kostenlos, sonst per Abfrage */
function syncPlayback() {
  if (!pbVisible() || pb.dragging) return;
  if (state.mode === 'sdk' && state.sdkPlayer) {
    state.sdkPlayer.getCurrentState().then(function (s) {
      if (!s) return;
      pb.posMs = s.position;
      pb.durMs = s.duration || pb.durMs;
      pb.paused = s.paused;
      pb.basis = Date.now();
      renderPlayback();
    }).catch(function () { /* egal */ });
    return;
  }
  api('/me/player').then(function (res) {
    if (!res.ok) return null;
    return safeJson(res);
  }).then(function (j) {
    if (!j || !j.item) return;
    if (j.item.id && state.currentTrackId && j.item.id !== state.currentTrackId) return; /* anderer Song laeuft */
    pb.posMs = j.progress_ms || 0;
    pb.durMs = (j.item && j.item.duration_ms) || pb.durMs;
    pb.paused = !j.is_playing;
    pb.basis = Date.now();
    renderPlayback();
  }).catch(function () { /* egal */ });
}

function renderPlayback() {
  if (!pbVisible()) return;
  var dur = pb.durMs || (state.trackInfo && state.trackInfo.duration) || 0;
  pb.durMs = dur;
  var anteil = dur ? Math.min(1, Math.max(0, pb.posMs / dur)) : 0;
  $('#pbFill').style.width = (anteil * 100) + '%';
  $('#pbKnob').style.left = (anteil * 100) + '%';
  $('#pbCur').textContent = fmtTime(pb.posMs);
  $('#pbTot').textContent = dur ? fmtTime(dur) : '--:--';
  /* SVG-Elemente kennen die hidden-Eigenschaft nicht - Anzeige direkt setzen.
     Läuft der Song: Pause-Symbol. Pausiert: Play-Symbol. */
  $('#icoPause').style.display = pb.paused ? 'none' : '';
  $('#icoPlay').style.display = pb.paused ? '' : 'none';
  $('#btnPlayPause').setAttribute('aria-label', pb.paused ? 'Abspielen' : 'Pause');
  var bar = $('#pbBar');
  bar.setAttribute('aria-valuenow', String(Math.round(pb.posMs / 1000)));
  bar.setAttribute('aria-valuetext', fmtTime(pb.posMs) + ' von ' + (dur ? fmtTime(dur) : 'unbekannt'));
  setVinylSpinning(!pb.paused);
}

function togglePlayPause() {
  if (!pbVisible()) return;
  var willPause = !pb.paused;
  pb.paused = willPause;
  pb.basis = Date.now();
  renderPlayback();
  setPlayerStatus(willPause ? 'Pausiert' : 'L\u00e4uft');
  state.playing = !willPause;
  if (state.mode === 'sdk' && state.sdkPlayer) {
    var p = willPause ? state.sdkPlayer.pause() : state.sdkPlayer.resume();
    p.catch(function () { toast('Wiedergabe reagiert gerade nicht'); });
    return;
  }
  api('/me/player/' + (willPause ? 'pause' : 'play'), { method: 'PUT' }).then(function (res) {
    if (!res.ok && res.status !== 204) toast('Wiedergabe reagiert gerade nicht');
  }).catch(function () { toast('Wiedergabe reagiert gerade nicht'); });
}

function seekTo(ms) {
  if (!pbVisible()) return;
  var ziel = Math.max(0, Math.round(ms));
  if (pb.durMs) ziel = Math.min(ziel, pb.durMs - 500);
  pb.posMs = ziel;
  pb.basis = Date.now();
  renderPlayback();
  if (state.mode === 'sdk' && state.sdkPlayer) {
    state.sdkPlayer.seek(ziel).catch(function () { /* egal */ });
    return;
  }
  api('/me/player/seek?position_ms=' + ziel, { method: 'PUT' }).catch(function () { /* egal */ });
}

function restartTrack() {
  seekTo(0);
  if (pb.paused) togglePlayPause();
}

/* Ziehen und Tippen auf der Fortschrittsleiste */
function bindPlaybackBar() {
  var bar = $('#pbBar');
  function anteilAus(ev) {
    var r = bar.getBoundingClientRect();
    var x = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX);
    return Math.min(1, Math.max(0, (x - r.left) / r.width));
  }
  function start(ev) {
    if (!pbVisible()) return;
    pb.dragging = true;
    bar.classList.add('dragging');
    bewege(ev);
  }
  function bewege(ev) {
    if (!pb.dragging) return;
    if (ev.cancelable) ev.preventDefault();
    var dur = pb.durMs || 0;
    pb.posMs = anteilAus(ev) * dur;
    renderPlayback();
  }
  function ende() {
    if (!pb.dragging) return;
    pb.dragging = false;
    bar.classList.remove('dragging');
    seekTo(pb.posMs);
  }
  bar.addEventListener('touchstart', start, { passive: true });
  bar.addEventListener('touchmove', bewege, { passive: false });
  bar.addEventListener('touchend', ende);
  bar.addEventListener('touchcancel', ende);
  bar.addEventListener('mousedown', function (ev) { start(ev); });
  window.addEventListener('mousemove', bewege);
  window.addEventListener('mouseup', ende);
  bar.addEventListener('keydown', function (ev) {
    if (!pbVisible()) return;
    if (ev.key === 'ArrowLeft') { seekTo(pb.posMs - 5000); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { seekTo(pb.posMs + 5000); ev.preventDefault(); }
    if (ev.key === ' ') { togglePlayPause(); ev.preventDefault(); }
  });
}

function applyControls(on, save) {
  state.controls = on;
  var sw = $('#toggleControls');
  if (sw) sw.setAttribute('aria-checked', on ? 'true' : 'false');
  if (!on) { stopPlaybackUi(); if (state.playing) setVinylSpinning(true); }
  else if (state.currentTrackId && $('#screen-player').classList.contains('active')) startPlaybackUi();
  if (save) { try { localStorage.setItem(LS.controls, on ? '1' : '0'); } catch (e) { /* egal */ } }
}

/* ============================================================
   EINSTELLUNG: Hinweise & Auflösung an/aus
   ============================================================ */
function applyAssists(on, save) {
  state.assists = on;
  document.body.classList.toggle('assists-off', !on);
  var sw = $('#toggleAssists');
  if (sw) sw.setAttribute('aria-checked', on ? 'true' : 'false');
  if (!on) { hideReveal(); hideHint(); }
  if (save) {
    try { localStorage.setItem(LS.assists, on ? '1' : '0'); } catch (e) { /* egal */ }
  }
}

/* ============================================================
   START & EVENTS
   ============================================================ */
function hydrateProfile() {
  api('/me').then(function (r) {
    if (!r.ok) return null;
    return r.json();
  }).then(function (me) {
    if (!me) return;
    if (me.country) { try { localStorage.setItem('rikster_country', me.country); } catch (e) { /* egal */ } }
    $('#userName').textContent = me.display_name || me.id;
    $('#userLine').hidden = false;
    if (me.product && me.product !== 'premium') {
      toast('Hinweis: F\u00fcr die Wiedergabe wird Spotify Premium ben\u00f6tigt.');
    }
  }).catch(function () { /* egal */ });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* egal */ });
  }
}

function boot() {
  registerSW();
  applyAssists(localStorage.getItem(LS.assists) !== '0', false);
  applyControls(localStorage.getItem(LS.controls) === '1', false);

  if (!CLIENT_ID || CLIENT_ID.indexOf('HIER') !== -1) {
    $('#setupRedirect').textContent = REDIRECT_URI;
    showScreen('screen-setup');
    return;
  }

  var params = new URLSearchParams(location.search);
  if (params.get('error')) {
    toast('Spotify-Anmeldung abgebrochen');
    history.replaceState({}, '', REDIRECT_URI);
  }
  var code = params.get('code');
  var start = Promise.resolve();
  if (code) {
    start = exchangeCode(code).catch(function (e) {
      console.warn(e);
      toast('Anmeldung fehlgeschlagen \u2013 bitte nochmal versuchen');
    }).then(function () {
      history.replaceState({}, '', REDIRECT_URI);
    });
  }

  start.then(function () {
    if (!isLoggedIn()) { showScreen('screen-auth'); return; }
    showScreen('screen-home');
    $('#homeLinks').hidden = false;
    hydrateProfile();
    initPlayback();
  });
}

/* Prüft die wichtigsten Spotify-Zugriffe und zeigt das Ergebnis im Modal –
   so lässt sich die Ursache (z. B. HTTP 403) direkt am Handy ablesen. */
function runDiagnose() {
  openModal({ title: 'Verbindungs-Check', text: 'Pr\u00fcfe Spotify-Zugriff \u2026', primary: 'Schlie\u00dfen' });
  var lines = [];
  function check(label, path) {
    return api(path).then(function (res) {
      if (res.ok) { lines.push('\u2705 ' + label); return true; }
      return readApiError(res).then(function (d) { lines.push('\u274c ' + label + ': ' + d); return false; });
    }).catch(function (e) {
      lines.push('\u274c ' + label + ': ' + ((e && e.message) || e));
      return false;
    });
  }
  ensureToken().then(function () {
    lines.push('\u2705 Anmeldung: g\u00fcltiges Token');
    return check('Profil (/me)', '/me')
      .then(function () { return check('Song-Abruf (Testsong)', '/tracks/3n3Ppam7vgaVa1iaRUc9Lp'); })
      .then(function () { return check('Suche', '/search?type=track&limit=5&q=test'); })
      .then(function (ok) {
        if (!hasPlaylistScope()) {
          lines.push('\u26a0\ufe0f Playlist-Berechtigung fehlt \u2013 einmal abmelden und neu anmelden, sonst k\u00f6nnen nur 100 Titel je Playlist gelesen werden.');
        } else {
          lines.push('\u2705 Playlist-Berechtigung erteilt');
        }
        return ok;
      })
      .then(function () {
        return api('/me/player/devices').then(function (res) {
          if (!res.ok) return readApiError(res).then(function (d) { lines.push('\u274c Ger\u00e4te: ' + d); });
          return safeJson(res).then(function (j) {
            var ds = (j && j.devices) || [];
            lines.push(ds.length
              ? ('\u2705 Ger\u00e4te: ' + ds.map(function (d) { return d.name; }).join(', '))
              : '\u26a0\ufe0f Ger\u00e4te: keine gemeldet \u2013 Spotify-App \u00f6ffnen, ein Lied kurz anspielen und pausieren');
          });
        }).catch(function (e) { lines.push('\u274c Ger\u00e4te: ' + ((e && e.message) || e)); });
      });
  }).catch(function () {
    lines.push('\u274c Keine g\u00fcltige Anmeldung \u2013 bitte abmelden und neu anmelden');
  }).then(function () {
    lines.push('');
    lines.push('Steht oben \u201eUser not registered in the Developer Dashboard\u201c: Du bist mit einem anderen Spotify-Konto angemeldet als dem, dem die App im Developer-Dashboard geh\u00f6rt. Dann hier abmelden und mit dem Besitzer-Konto anmelden \u2013 oder dein Konto im Dashboard unter \u201eUser Management\u201c hinzuf\u00fcgen.');
    $('#modalText').textContent = lines.join('\n');
  });
}

function bindEvents() {
  $('#btnLogin').addEventListener('click', login);
  $('#btnLogout').addEventListener('click', function () {
    stopPlayback();
    logout();
  });
    $('#btnPlay').addEventListener('click', function () {
    activateAudio();
    initPlayback();
    if (window.openPlayScreen) { openPlayScreen(); } else { startScanner(); }
  });
  $('#btnScanReset').addEventListener('click', restartCamera);
  $('#btnCancelScan').addEventListener('click', function () {
    stopScanner();
    if (state.gameMode === 'party' && window.partyGoHub) { partyGoHub(); }
    else { showScreen('screen-home'); }
  });
  $('#btnWeiter').addEventListener('click', function () {
    activateAudio();
    if (state.gameMode === 'party' && window.partyOnWeiter) { partyOnWeiter(); return; }
    goScan();
  });
  $('#btnReveal').addEventListener('click', function () { showReveal(false); });
  $('#btnBack').addEventListener('click', function () {
    if (state.gameMode === 'party' && window.partyOnRevealBack) { partyOnRevealBack(); return; }
    hideReveal();
  });
  $('#btnHint').addEventListener('click', onHintButton);
  $('#btnHintClose').addEventListener('click', hideHint);
  $('#btnFix').addEventListener('click', onFix);
  $('#btnDiag').addEventListener('click', runDiagnose);
  $('#toggleAssists').addEventListener('click', function () {
    applyAssists(!state.assists, true);
  });
  $('#toggleControls').addEventListener('click', function () {
    applyControls(!state.controls, true);
  });
  $('#btnPlayPause').addEventListener('click', togglePlayPause);
  $('#btnRestart').addEventListener('click', restartTrack);
  bindPlaybackBar();
}

document.addEventListener('DOMContentLoaded', function () {
  bindEvents();
  boot();
});
