/* ============================================================
   RIKSTER – App-Logik
   ------------------------------------------------------------
   Ablauf:  Spielen → QR scannen → Song läuft (nur Schallplatte
   sichtbar) → "Weiter" (stoppen + neue Karte) oder "Auflösung"
   (Karte + Zusatzinfos, Zurück-Button unten).

   Wiedergabe – zwei Modi, automatisch gewählt:
   1) "sdk"    – Spotify Web Playback SDK: der Ton kommt direkt
                 aus der Rikster-App (funktioniert v. a. auf
                 Android/Chrome zuverlässig).
   2) "remote" – Fallback über die Spotify-Connect-API: Rikster
                 steuert die Spotify-App im Hintergrund fern.
                 Man bleibt trotzdem die ganze Zeit in Rikster
                 und sieht nichts vom Lied. (Zuverlässig auf iOS.)
   ============================================================ */

'use strict';

/* ---------- Konfiguration ---------- */
var CFG = window.RIKSTER_CONFIG || {};
var CLIENT_ID = String(CFG.SPOTIFY_CLIENT_ID || '').trim();
var REDIRECT_URI = location.origin + location.pathname.replace(/index\.html$/, '');
var SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
var API_BASE = 'https://api.spotify.com/v1';
var LS = {
  access: 'rikster_access',
  refresh: 'rikster_refresh',
  expires: 'rikster_expires',
  verifier: 'rikster_verifier'
};

/* ---------- Zustand ---------- */
var state = {
  mode: null,            /* 'sdk' | 'remote' | null (noch unbekannt) */
  sdkPlayer: null,
  sdkDeviceId: null,
  sdkReady: false,
  currentTrackId: null,
  trackInfo: null,
  infoPromise: null,
  scanning: false,
  playing: false,
  camStream: null,
  wakeLock: null
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
  if (!release) return '\u2013';
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
  } catch (e) { /* egal, dann nur Jahr */ }
  return release.slice(0, 4);
}
function safeJson(res) {
  return res.json().then(function (j) { return j; }, function () { return null; });
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

/* Auf iOS/Android braucht Audio eine Nutzer-Geste – bei jedem
   Button-Tipp einmal "aktivieren", dann darf danach automatisch
   abgespielt werden. */
function activateAudio() {
  try {
    if (state.sdkPlayer && state.sdkPlayer.activateElement) state.sdkPlayer.activateElement();
  } catch (e) { /* egal */ }
}

/* Sperrbildschirm/Benachrichtigung soll den Songtitel nicht
   verraten – bestmöglich mit neutralen Infos überschreiben. */
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
    /* Modus 1: direkt in der App über das SDK */
    if (mode === 'sdk' && state.sdkReady && state.sdkDeviceId) {
      return api('/me/player/play?device_id=' + state.sdkDeviceId, { method: 'PUT', body: body })
        .then(function (res) {
          if (res.ok || res.status === 204) return true;
          return playRemote(body); /* falls das SDK-Gerät zickt: Fallback */
        });
    }
    /* Modus 2: Spotify-App fernsteuern */
    return playRemote(body);
  });
}

function playRemote(body) {
  return api('/me/player/devices').then(function (res) {
    return res.ok ? safeJson(res) : { devices: [] };
  }).then(function (data) {
    var devices = ((data && data.devices) || []).filter(function (d) { return !d.is_restricted; });
    if (!devices.length) throw { code: 'NO_DEVICE' };
    var dev = null;
    for (var i = 0; i < devices.length; i++) { if (devices[i].is_active) { dev = devices[i]; break; } }
    if (!dev) dev = devices[0];
    return api('/me/player/play?device_id=' + dev.id, { method: 'PUT', body: body });
  }).then(function (res) {
    if (res === true || res.ok || res.status === 204) return true;
    if (res.status === 404) throw { code: 'NO_DEVICE' };
    if (res.status === 403) throw { code: 'PREMIUM' };
    return safeJson(res).then(function (j) {
      throw { code: 'PLAY_FAILED', detail: j && j.error && j.error.message };
    });
  });
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
   SONG-INFOS für die Auflösung
   ============================================================ */
function fetchTrackInfo(trackId) {
  return api('/tracks/' + trackId).then(function (res) {
    if (!res.ok) throw new Error('track ' + res.status);
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
    /* Zusatzinfos parallel und fehlertolerant nachladen */
    var jobs = [];
    if (info.artistId) {
      jobs.push(api('/artists/' + info.artistId).then(function (r) {
        return r.ok ? r.json() : null;
      }).then(function (a) {
        if (a) {
          info.genres = a.genres || [];
          info.followers = a.followers && a.followers.total;
        }
      }).catch(function () { /* egal */ }));
    }
    if (info.albumId) {
      jobs.push(api('/albums/' + info.albumId).then(function (r) {
        return r.ok ? r.json() : null;
      }).then(function (al) {
        if (al) {
          info.label = al.label;
          info.albumTracks = al.total_tracks;
        }
      }).catch(function () { /* egal */ }));
    }
    if (info.artists[0]) {
      jobs.push(fetchWiki(info.artists[0]).then(function (w) { info.wiki = w; }).catch(function () { /* egal */ }));
    }
    return Promise.all(jobs).then(function () { return info; });
  });
}

/* Wikipedia-Kurzporträt des Interpreten (erst deutsch, dann englisch) */
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

/* ============================================================
   QR-SCANNER
   ============================================================ */
var detector = null;
try {
  if ('BarcodeDetector' in window) detector = new BarcodeDetector({ formats: ['qr_code'] });
} catch (e) { detector = null; }

/* Die Karten aus dem Generator enthalten Spotify-Track-Links,
   z. B. https://open.spotify.com/track/4PTG…?si=… – auch
   spotify:track:… und intl-de-Links werden erkannt. */
function parseTrackId(text) {
  if (!text) return null;
  var m = String(text).match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/i);
  return m ? m[1] : null;
}

function startScanner() {
  hideReveal();
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
    var id = parseTrackId(text);
    if (id) { onScanned(id); return true; }
    flashHint('Das ist kein Spotify-Code');
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
          /* attemptBoth: die Generator-Codes sind invertiert (weiß auf schwarz) */
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
function onScanned(trackId) {
  if (navigator.vibrate) navigator.vibrate(60);
  stopScanner();

  state.currentTrackId = trackId;
  state.trackInfo = null;
  /* Infos schon im Hintergrund laden, damit die Auflösung sofort da ist */
  state.infoPromise = fetchTrackInfo(trackId).then(function (info) {
    state.trackInfo = info;
    return info;
  }).catch(function () { return null; });

  showScreen('screen-player');
  setPlayerStatus('Wird gestartet \u2026');
  setVinylSpinning(true);
  requestWakeLock();

  playTrack(trackId).then(function () {
    state.playing = true;
    setPlayerStatus('L\u00e4uft');
    maskMediaSession();
  }).catch(handlePlayError);
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
      text: 'Rikster steuert gerade deine Spotify-App fern, findet aber kein aktives Ger\u00e4t. \u00d6ffne kurz die Spotify-App, spiele irgendein Lied an, pausiere es und komm hierher zur\u00fcck.',
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

/* "Weiter": Lied stoppen und die nächste Karte scannen */
function goScan() {
  stopPlayback();
  hideReveal();
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
function showReveal() {
  var sheet = $('#revealSheet');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  renderRevealLoading();
  var p = state.trackInfo ? Promise.resolve(state.trackInfo) : (state.infoPromise || Promise.resolve(null));
  p.then(function (info) {
    if (!sheet.classList.contains('open')) return;
    renderReveal(info);
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
  $('#revWiki').hidden = true;
  $('#revError').hidden = true;
}

function addChip(container, label, value, wide) {
  if (value === undefined || value === null || value === '' ) return;
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
  addChip(chips, 'Spotify-Beliebtheit', (typeof info.popularity === 'number') ? info.popularity + ' / 100' : null);
  addChip(chips, 'Label', info.label);
  addChip(chips, 'Follower (Interpret)', info.followers ? formatNumber(info.followers) : null);
  if (info.genres && info.genres.length) {
    addChip(chips, 'Genres', info.genres.slice(0, 3).join(', '), true);
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
   START & EVENTS
   ============================================================ */
function hydrateProfile() {
  api('/me').then(function (r) {
    if (!r.ok) return null;
    return r.json();
  }).then(function (me) {
    if (!me) return;
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
    hydrateProfile();
    initPlayback(); /* Modus schon mal im Hintergrund ermitteln */
  });
}

function bindEvents() {
  $('#btnLogin').addEventListener('click', login);
  $('#btnLogout').addEventListener('click', function () {
    stopPlayback();
    logout();
  });
  $('#btnPlay').addEventListener('click', function () {
    activateAudio();      /* Nutzer-Geste für Audio nutzen */
    initPlayback();
    startScanner();
  });
  $('#btnCancelScan').addEventListener('click', function () {
    stopScanner();
    showScreen('screen-home');
  });
  $('#btnWeiter').addEventListener('click', function () {
    activateAudio();
    goScan();
  });
  $('#btnReveal').addEventListener('click', showReveal);
  $('#btnBack').addEventListener('click', hideReveal);
}

document.addEventListener('DOMContentLoaded', function () {
  bindEvents();
  boot();
});
