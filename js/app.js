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
var SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
var API_BASE = 'https://api.spotify.com/v1';
var HITSTER_DB = 'https://raw.githubusercontent.com/andygruber/songseeker-hitster-playlists/main/';
var CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url='
];
var LS = {
  access: 'rikster_access',
  refresh: 'rikster_refresh',
  expires: 'rikster_expires',
  verifier: 'rikster_verifier',
  assists: 'rikster_assists',
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
  var p = $('#modalPrimary');
  var s = $('#modalSecondary');
  p.textContent = opts.primary || 'OK';
  p.onclick = function () { closeModal(); if (opts.onPrimary) opts.onPrimary(); };
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
function cleanTitle(t) {
  return String(t || '')
    .replace(/\s*[-\u2013]\s*(remaster|single|radio|live|version|edit|mono|stereo|from)[^]*$/i, '')
    .replace(/\s*\((feat|with|from|remaster|live|radio|deluxe|bonus)[^)]*\)/ig, '')
    .trim();
}
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
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

function playTrack(trackId) {
  var body = JSON.stringify({ uris: ['spotify:track:' + trackId], position_ms: 0 });
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

function loadHitsterCsv(lang) {
  if (csvMemCache[lang]) return Promise.resolve(csvMemCache[lang]);
  var lsKey = 'rikster_hitcsv_' + lang;
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(lsKey) || 'null'); } catch (e) { cached = null; }
  var fresh = cached && (Date.now() - cached.t < 7 * 24 * 3600 * 1000);

  function build(text) {
    var rows = parseCsv(text);
    var map = {};
    for (var i = 1; i < rows.length; i++) { /* Zeile 0 = Kopf */
      var r = rows[i];
      if (!r || r.length < 3) continue;
      var num = parseInt(r[0], 10);
      if (!isFinite(num)) continue;
      map[num] = {
        artist: (r[1] || '').trim(),
        title: (r[2] || '').trim(),
        yt: (r[3] || '').trim(), /* YouTube-Link – Plan B für die Zuordnung */
        year: parseInt(r[r.length - 1], 10) || null /* letzte Spalte = Jahr */
      };
    }
    csvMemCache[lang] = map;
    return map;
  }

  if (fresh) return Promise.resolve(build(cached.text));

  return fetchWithTimeout(HITSTER_DB + 'hitster-' + lang + '.csv', 12000)
    .then(function (res) {
      if (!res.ok) throw { code: 'CSV_MISSING' };
      return res.text();
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
    if (cardMeta) {
      info.cardArtist = cardMeta.artist;
      if (cardMeta.year) {
        var sy = parseInt(info.year, 10);
        info.year = String(cardMeta.year);
        if (isFinite(sy) && sy !== cardMeta.year) { info.release = null; info.precision = null; }
      }
    }
    info.extras = fetchExtras(info);
    return info;
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

  /* Deutsche Wikipedia (Song-Artikel): Charts, Auszeichnungen, Verkäufe
     + Wikidata: Sprache des Songs */
  jobs.push(fetchSongArticleData(info).catch(function () { /* egal */ }));

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

/* ---------- Deutsche Wikipedia: Song-Artikel finden & auswerten ---------- */
function findDeSongArticle(info) {
  var q = '"' + cleanTitle(info.name) + '" ' + info.artists[0];
  var url = 'https://de.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=' +
    encodeURIComponent(q);
  return fetchWithTimeout(url, 9000).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (j) {
    var hits = (j && j.query && j.query.search) || [];
    var nt = normalize(cleanTitle(info.name));
    var best = null;
    for (var i = 0; i < hits.length; i++) {
      var ti = hits[i].title;
      var n = normalize(ti);
      if (n.indexOf(nt) === -1) continue;
      /* Lied-Artikel bevorzugen, Alben/Interpreten-Seiten meiden */
      if (/\((.*lied.*|.*song.*)\)/i.test(ti)) return ti;
      if (!best && n !== normalize(info.artists[0])) best = ti;
    }
    return best;
  });
}

function fetchSongArticleData(info) {
  return findDeSongArticle(info).then(function (title) {
    var qidJob = null;
    if (title) {
      qidJob = fetch('https://de.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && j.wikibase_item; })
        .catch(function () { return null; });
    } else {
      qidJob = findSongQidViaEnwiki(info);
    }

    var htmlJob = title
      ? fetchWithTimeout('https://de.wikipedia.org/api/rest_v1/page/html/' + encodeURIComponent(title.replace(/ /g, '_')), 12000)
          .then(function (r) { return r.ok ? r.text() : null; })
          .catch(function () { return null; })
      : Promise.resolve(null);

    return Promise.all([htmlJob, qidJob]).then(function (res) {
      var html = res[0], qid = res[1];
      if (html) {
        try { parseDeSongHtml(html, info); } catch (e) { /* egal */ }
      }
      if (qid) return applyWikidata(qid, info);
      return null;
    });
  });
}

function parseDeSongHtml(html, info) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var artistOk = normalize(doc.body.textContent).indexOf(normalize(info.artists[0])) !== -1;
  if (!artistOk) return; /* falscher Artikel – lieber nichts anzeigen */

  /* Chartplatzierungen: Tabellenzeilen wie  DE | 4 | … (26 Wo.) */
  var rows = doc.querySelectorAll('tr');
  var charts = [];
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i].querySelectorAll('td,th');
    if (cells.length < 2) continue;
    var c0 = (cells[0].textContent || '').trim();
    var cm = c0.match(/^([A-Z]{2})\b/);
    if (!cm || ['DE', 'AT', 'CH', 'UK', 'US'].indexOf(cm[1]) === -1) continue;
    var rowText = rows[i].textContent || '';
    var peak = null;
    for (var k = 1; k < cells.length; k++) {
      var pm = (cells[k].textContent || '').trim().match(/^(\d{1,3})\b/);
      if (pm) { peak = parseInt(pm[1], 10); break; }
    }
    if (peak === null || peak < 1 || peak > 150) continue;
    var wm = rowText.match(/(\d{1,3})\s*Wo/);
    charts.push({ region: cm[1], peak: peak, weeks: wm ? parseInt(wm[1], 10) : null });
  }
  if (charts.length) {
    var best = charts[0];
    for (var b = 1; b < charts.length; b++) { if (charts[b].peak < best.peak) best = charts[b]; }
    info.chartPeak = { pos: best.peak, region: best.region };
    var de = null;
    for (var d = 0; d < charts.length; d++) { if (charts[d].region === 'DE' && charts[d].weeks) { de = charts[d]; break; } }
    var wsrc = de || (best.weeks ? best : null);
    if (!wsrc) {
      for (var w = 0; w < charts.length; w++) { if (charts[w].weeks) { wsrc = charts[w]; break; } }
    }
    if (wsrc && wsrc.weeks) info.chartWeeks = { n: wsrc.weeks, region: wsrc.region };
  }

  /* Auszeichnungen für Musikverkäufe + Verkaufszahlen */
  var tables = doc.querySelectorAll('table');
  for (var t = 0; t < tables.length; t++) {
    var txt = tables[t].textContent || '';
    if (txt.indexOf('Auszeichnungen f\u00fcr Musikverk\u00e4ufe') === -1) continue;
    var totals = { Gold: 0, Platin: 0, Diamant: 0 };
    var re = /(?:(\d+)\s*[\u00d7x]\s*)?\b(Gold|Platin|Diamant)\b/g;
    var mm;
    while ((mm = re.exec(txt)) !== null) {
      totals[mm[2]] += mm[1] ? parseInt(mm[1], 10) : 1;
    }
    var parts = [];
    ['Diamant', 'Platin', 'Gold'].forEach(function (k) {
      if (totals[k] > 0) parts.push(totals[k] + '\u00d7 ' + k);
    });
    if (parts.length) info.awards = parts.join(' \u00b7 ');
    var sm = txt.match(/Insgesamt[^0-9]{0,40}([\d.][\d.\s]*\d)/);
    if (sm) {
      var salesNum = parseInt(sm[1].replace(/[^\d]/g, ''), 10);
      if (isFinite(salesNum) && salesNum > 1000) info.sales = formatNumber(salesNum);
    }
    break;
  }
}

function findSongQidViaEnwiki(info) {
  var q = '"' + cleanTitle(info.name) + '" ' + info.artists[0] + ' song';
  var url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=3&srsearch=' +
    encodeURIComponent(q);
  return fetchWithTimeout(url, 9000).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (j) {
    var hits = (j && j.query && j.query.search) || [];
    var nt = normalize(cleanTitle(info.name));
    for (var i = 0; i < hits.length; i++) {
      if (normalize(hits[i].title).indexOf(nt) !== -1) {
        return fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(hits[i].title.replace(/ /g, '_')))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (s) { return s && s.wikibase_item; })
          .catch(function () { return null; });
      }
    }
    return null;
  }).catch(function () { return null; });
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

/* ---------- Songfacts: erster Fact, ins Deutsche übersetzt ---------- */
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

function fetchSongfact(info) {
  var artist = info.cardArtist || info.artists[0];
  var url = 'https://www.songfacts.com/facts/' + songfactsSlug(artist) + '/' + songfactsSlug(cleanTitle(info.name));
  return proxyFetch(url).then(function (html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var heads = doc.querySelectorAll('h1,h2,h3,h4,h5');
    var fact = null;
    for (var i = 0; i < heads.length; i++) {
      var ht = (heads[i].textContent || '').trim();
      if (!/songfacts/i.test(ht) || /more songfacts/i.test(ht)) continue;
      var el = heads[i].nextElementSibling;
      var hops = 0;
      while (el && hops < 4) {
        if (el.tagName === 'UL' || el.tagName === 'OL') {
          var li = el.querySelector('li');
          if (li) fact = li.textContent;
          break;
        }
        el = el.nextElementSibling;
        hops++;
      }
      if (fact) break;
    }
    if (!fact) return null;
    fact = fact.replace(/\s+/g, ' ').trim();
    if (fact.length < 30) return null;
    if (fact.length > 900) fact = fact.slice(0, 900).replace(/\s+\S*$/, '') + ' \u2026';
    return translateToGerman(fact).then(function (tr) {
      return { text: tr.text, translated: tr.translated, url: url };
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
    var list = pickN(pool, useSong ? 2 : 3).map(function (ev) {
      return 'Im selben Jahr \u2013 ' + ev;
    });
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

function cleanWikitext(s) {
  var out = String(s || '');
  out = out.replace(/<ref[^>]*\/>/g, '');
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  for (var i = 0; i < 3; i++) out = out.replace(/\{\{[^{}]*\}\}/g, '');
  out = out.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1');
  out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');
  out = out.replace(/'{2,}/g, '');
  out = out.replace(/<[^>]+>/g, '');
  out = out.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function pickN(arr, n) {
  if (!arr || !arr.length) return [];
  var a = arr.slice();
  var out = [];
  while (a.length && out.length < n) {
    var i = Math.floor(Math.random() * a.length);
    out.push(a.splice(i, 1)[0]);
  }
  return out;
}

/* Liefert den (gecachten) Ereignis-Pool eines Jahres – die konkrete
   Auswahl daraus wird bei jedem Aufruf neu zufällig gezogen. */
function loadYearEvents(year) {
  var lsKey = 'rikster_events_' + year;
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(lsKey) || 'null'); } catch (e) { cached = null; }
  if (cached && cached.length) return Promise.resolve(cached);

  var base = 'https://de.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&action=parse&page=' + year;
  return fetchWithTimeout(base + '&prop=sections', 9000).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (j) {
    var secs = (j && j.parse && j.parse.sections) || [];
    var idx = null;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].line === 'Ereignisse' || secs[i].anchor === 'Ereignisse') { idx = secs[i].index; break; }
    }
    if (idx === null) throw new Error('keine Ereignisse');
    return fetchWithTimeout(base + '&prop=wikitext&section=' + idx, 12000);
  }).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (j) {
    var wt = j && j.parse && j.parse.wikitext;
    if (!wt) return [];
    var lines = wt.split('\n');
    var events = [];
    var months = '(Januar|Februar|M\u00e4rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)';
    var dateRe = new RegExp('^\\d{1,2}\\.\\s?' + months + '\\s*:');
    for (var i = 0; i < lines.length && events.length < 60; i++) {
      var line = lines[i];
      if (!/^\*+\s*/.test(line)) continue;
      var clean = cleanWikitext(line.replace(/^\*+\s*/, ''));
      if (!dateRe.test(clean)) continue;
      if (clean.indexOf(String(year)) !== -1) continue; /* Jahr nicht verraten! */
      if (clean.length < 30 || clean.length > 240) continue;
      if (/[{}\[\]]/.test(clean)) continue;
      events.push(clean);
    }
    try { if (events.length) localStorage.setItem(lsKey, JSON.stringify(events)); } catch (e) { /* egal */ }
    return events;
  });
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
      text: 'Diese Edition (\u201e' + scan.lang + '\u201c, Karte ' + scan.num + ') ist in der Community-Datenbank noch nicht erfasst. Deine selbst erstellten Karten funktionieren nat\u00fcrlich weiterhin.',
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
    text: 'Die Karten-Datenbank konnte nicht geladen werden. Pr\u00fcfe deine Internetverbindung.',
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
  $('#revArtist').textContent = info.artists.join(', ');
  $('#revYear').textContent = info.year || '?';
  $('#revTitle').textContent = info.name;

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

  var songBox = $('#revSong');
  if (info.songfact && info.songfact.text) {
    var noteTxt = info.songfact.translated ? '' : ' (Original auf Englisch)';
    $('#songfactText').textContent = info.songfact.text + noteTxt;
    var sl = $('#songfactLink');
    sl.href = info.songfact.url;
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
    if (window.openModeScreen) { openModeScreen(); } else { startScanner(); }
  });
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
  $('#btnDiag').addEventListener('click', runDiagnose);
  $('#toggleAssists').addEventListener('click', function () {
    applyAssists(!state.assists, true);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  bindEvents();
  boot();
});
