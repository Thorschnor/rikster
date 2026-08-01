/* ============================================================
   RIKSTER – Eigene Karten erstellen
   ------------------------------------------------------------
   Songs sammeln (Suche, Spotify-Links, Playlist), Jahr ermitteln,
   Design wählen und als A4-Druckbogen ausgeben:
   5 × 5 cm Karten, 4 × 5 = 20 pro Seite, Rückseiten spalten-
   gespiegelt, damit beim beidseitigen Druck Vorder- und Rückseite
   zusammenpassen.
   ============================================================ */

'use strict';

var DECK_KEY = 'rikster_deck';

/* Jahresfarben von alt nach neu (aus der Vorlage übernommen) */
var HITSTER_COLORS = ['#7C3AAD', '#E01A76', '#FF7FA8', '#F5A02D', '#FCDF4F', '#86CFE3', '#4166D5'];
var NEON = ['#FF2E63', '#33B1FF', '#3DDC84', '#FFE14D', '#B388FF', '#FF8A65'];

var DESIGN_STD = {
  frame: 'rings',
  qrBg: '#0B0E14',
  qrSize: 46,
  qrBorder: '#FFFFFF',
  qrBorderW: 3,
  label: '',
  hitster: true,
  solBg: '#FFFFFF',
  artistColor: '#FFFFFF', artistOn: false, artistOutline: '#0B0E14',
  yearColor: '#FFFFFF', yearOn: false, yearOutline: '#0B0E14',
  titleColor: '#FFFFFF', titleOn: false, titleOutline: '#0B0E14',
  borders: true
};

var deck = { songs: [], design: {} };
Object.keys(DESIGN_STD).forEach(function (k) { deck.design[k] = DESIGN_STD[k]; });
var deckImage = null;   /* Hintergrundbild als Data-URL, liegt in IndexedDB */

/* ============================================================
   SPEICHER
   ============================================================ */
function deckSave() {
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify({ songs: deck.songs, design: deck.design }));
  } catch (e) { toast('Speicher voll \u2013 Liste konnte nicht gesichert werden'); }
}
function deckLoad() {
  try {
    var d = JSON.parse(localStorage.getItem(DECK_KEY) || 'null');
    if (d) {
      if (d.songs) deck.songs = d.songs;
      if (d.design) Object.keys(d.design).forEach(function (k) {
        if (k in DESIGN_STD) deck.design[k] = d.design[k];
      });
    }
  } catch (e) { /* egal */ }
  return imgLoad();
}

/* Große Bilder passen nicht in den normalen Speicher – dafür IndexedDB */
function idb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('rikster', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
function imgSave(dataUrl) {
  return idb().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(dataUrl, 'cardImage');
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function imgLoad() {
  return idb().then(function (db) {
    return new Promise(function (res) {
      var tx = db.transaction('kv', 'readonly');
      var q = tx.objectStore('kv').get('cardImage');
      q.onsuccess = function () { deckImage = q.result || null; res(); };
      q.onerror = function () { res(); };
    });
  }).catch(function () { /* egal */ });
}
function imgClear() {
  deckImage = null;
  return idb().then(function (db) {
    var tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete('cardImage');
  }).catch(function () { /* egal */ });
}

/* ============================================================
   RAHMEN-DESIGNS
   ============================================================ */
var FRAMES = [
  { id: 'none', name: 'Ohne Rahmen' },
  { id: 'rings', name: 'Neon-Ringe' },
  { id: 'circles', name: 'Volle Kreise' },
  { id: 'squares', name: 'Quadrate' },
  { id: 'diamond', name: 'Rauten' },
  { id: 'hexagon', name: 'Sechsecke' },
  { id: 'corners', name: 'Eckwinkel' },
  { id: 'notes', name: 'Notenköpfe' },
  { id: 'clef', name: 'Notenschlüssel' },
  { id: 'vinyl', name: 'Schallplatte' },
  { id: 'equalizer', name: 'Equalizer' },
  { id: 'wave', name: 'Schallwelle' },
  { id: 'dots', name: 'Punktekranz' },
  { id: 'rays', name: 'Strahlen' },
  { id: 'cassette', name: 'Kassette' },
  { id: 'piano', name: 'Klaviertasten' },
  { id: 'star', name: 'Sternenkranz' },
  { id: 'speaker', name: 'Lautsprecher' }
];

function saat(text) {
  var h = 0;
  for (var i = 0; i < String(text).length; i++) h = (h * 31 + String(text).charCodeAt(i)) >>> 0;
  return h;
}
function farbe(i, s) { return NEON[(i + s) % NEON.length]; }

function bogen(cx, cy, r, a1, a2) {
  function p(a) { var rad = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; }
  var s = p(a1), e = p(a2), gross = (a2 - a1) > 180 ? 1 : 0;
  return 'M ' + s[0].toFixed(2) + ' ' + s[1].toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + gross + ' 1 ' + e[0].toFixed(2) + ' ' + e[1].toFixed(2);
}
function polygon(cx, cy, r, n, dreh) {
  var p = [];
  for (var i = 0; i < n; i++) {
    var a = (i * 360 / n + (dreh || 0) - 90) * Math.PI / 180;
    p.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
  }
  return p.join(' ');
}

/* Liefert den Innenteil eines 100x100-SVG */
function frameInner(kind, s) {
  var g = [], i, a, r;
  switch (kind) {
    case 'rings':
      for (i = 0; i < 6; i++) {
        r = 48 - i * 3.4;
        a = (s + i * 47) % 360;
        g.push('<path d="' + bogen(50, 50, r, a, a + 250 - i * 12) + '" stroke="' + farbe(i, s) + '"/>');
      }
      break;
    case 'circles':
      for (i = 0; i < 5; i++) g.push('<circle cx="50" cy="50" r="' + (48 - i * 3.6) + '" stroke="' + farbe(i, s) + '"/>');
      break;
    case 'squares':
      for (i = 0; i < 5; i++) {
        var d = 4 + i * 3.4;
        g.push('<rect x="' + d + '" y="' + d + '" width="' + (100 - 2 * d) + '" height="' + (100 - 2 * d) + '" rx="3" stroke="' + farbe(i, s) + '"/>');
      }
      break;
    case 'diamond':
      for (i = 0; i < 4; i++) g.push('<polygon points="' + polygon(50, 50, 48 - i * 4, 4, 0) + '" stroke="' + farbe(i, s) + '"/>');
      break;
    case 'hexagon':
      for (i = 0; i < 4; i++) g.push('<polygon points="' + polygon(50, 50, 48 - i * 4, 6, i * 8) + '" stroke="' + farbe(i, s) + '"/>');
      break;
    case 'corners':
      [[6, 6, 1, 1], [94, 6, -1, 1], [6, 94, 1, -1], [94, 94, -1, -1]].forEach(function (c, k) {
        g.push('<path d="M ' + (c[0] + 22 * c[2]) + ' ' + c[1] + ' L ' + c[0] + ' ' + c[1] + ' L ' + c[0] + ' ' + (c[1] + 22 * c[3]) + '" stroke="' + farbe(k, s) + '" stroke-width="3"/>');
      });
      break;
    case 'notes':
      for (i = 0; i < 8; i++) {
        a = (i * 45 + s % 40) * Math.PI / 180;
        var nx = 50 + 42 * Math.cos(a), ny = 50 + 42 * Math.sin(a);
        g.push('<g stroke="' + farbe(i, s) + '" fill="' + farbe(i, s) + '"><ellipse cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" rx="3.4" ry="2.6" transform="rotate(-20 ' + nx.toFixed(1) + ' ' + ny.toFixed(1) + ')"/><path d="M ' + (nx + 3.2).toFixed(1) + ' ' + ny.toFixed(1) + ' L ' + (nx + 3.2).toFixed(1) + ' ' + (ny - 10).toFixed(1) + '" stroke-width="1.4" fill="none"/></g>');
      }
      break;
    case 'clef':
      g.push('<g stroke="' + farbe(0, s) + '" stroke-width="2"><path d="M20 78 C 8 62, 20 44, 30 52 C 38 58, 30 74, 20 70 C 12 66, 14 50, 26 34 C 32 26, 34 18, 30 12"/></g>');
      g.push('<g stroke="' + farbe(2, s) + '" stroke-width="2"><path d="M80 78 C 92 62, 80 44, 70 52 C 62 58, 70 74, 80 70 C 88 66, 86 50, 74 34 C 68 26, 66 18, 70 12"/></g>');
      for (i = 0; i < 4; i++) g.push('<line x1="8" y1="' + (86 + i * 3) + '" x2="92" y2="' + (86 + i * 3) + '" stroke="' + farbe(i, s) + '" stroke-width="0.8"/>');
      break;
    case 'vinyl':
      for (i = 0; i < 9; i++) g.push('<circle cx="50" cy="50" r="' + (49 - i * 2.1) + '" stroke="' + (i % 3 === 0 ? farbe(i, s) : 'rgba(255,255,255,.22)') + '" stroke-width="' + (i % 3 === 0 ? 1.6 : 0.7) + '"/>');
      break;
    case 'equalizer':
      for (i = 0; i < 18; i++) {
        var hh = 6 + ((saat('eq' + i + s) % 22));
        g.push('<line x1="' + (7 + i * 5).toFixed(1) + '" y1="96" x2="' + (7 + i * 5).toFixed(1) + '" y2="' + (96 - hh) + '" stroke="' + farbe(i, s) + '" stroke-width="2.6"/>');
        g.push('<line x1="' + (7 + i * 5).toFixed(1) + '" y1="4" x2="' + (7 + i * 5).toFixed(1) + '" y2="' + (4 + hh * 0.7) + '" stroke="' + farbe(i + 2, s) + '" stroke-width="2.6"/>');
      }
      break;
    case 'wave':
      for (var k = 0; k < 3; k++) {
        var d = 'M 2 ' + (50 + k * 0) + ' ';
        var amp = 12 - k * 3;
        for (i = 0; i <= 24; i++) {
          var x = 2 + i * 4, y = 50 + Math.sin((i / 24) * Math.PI * 4 + k) * amp;
          d += (i === 0 ? 'M ' : 'L ') + x + ' ' + y.toFixed(1) + ' ';
        }
        g.push('<path d="' + d + '" stroke="' + farbe(k, s) + '" opacity="' + (0.9 - k * 0.25) + '"/>');
      }
      break;
    case 'dots':
      for (i = 0; i < 36; i++) {
        a = i * 10 * Math.PI / 180;
        g.push('<circle cx="' + (50 + 46 * Math.cos(a)).toFixed(1) + '" cy="' + (50 + 46 * Math.sin(a)).toFixed(1) + '" r="1.5" fill="' + farbe(i, s) + '" stroke="none"/>');
      }
      for (i = 0; i < 24; i++) {
        a = i * 15 * Math.PI / 180;
        g.push('<circle cx="' + (50 + 39 * Math.cos(a)).toFixed(1) + '" cy="' + (50 + 39 * Math.sin(a)).toFixed(1) + '" r="1" fill="' + farbe(i + 3, s) + '" stroke="none"/>');
      }
      break;
    case 'rays':
      for (i = 0; i < 24; i++) {
        a = (i * 15 + s % 15) * Math.PI / 180;
        var r1 = 36, r2 = 48 - (i % 3) * 4;
        g.push('<line x1="' + (50 + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (50 + r1 * Math.sin(a)).toFixed(1) +
          '" x2="' + (50 + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (50 + r2 * Math.sin(a)).toFixed(1) + '" stroke="' + farbe(i, s) + '" stroke-width="2"/>');
      }
      break;
    case 'cassette':
      g.push('<rect x="6" y="18" width="88" height="64" rx="5" stroke="' + farbe(0, s) + '" stroke-width="2"/>');
      g.push('<circle cx="32" cy="50" r="12" stroke="' + farbe(1, s) + '" stroke-width="2"/>');
      g.push('<circle cx="68" cy="50" r="12" stroke="' + farbe(2, s) + '" stroke-width="2"/>');
      g.push('<circle cx="32" cy="50" r="4" stroke="' + farbe(3, s) + '"/><circle cx="68" cy="50" r="4" stroke="' + farbe(3, s) + '"/>');
      g.push('<rect x="26" y="70" width="48" height="8" rx="2" stroke="' + farbe(4, s) + '"/>');
      break;
    case 'piano':
      for (i = 0; i < 14; i++) {
        g.push('<rect x="' + (2 + i * 7) + '" y="2" width="6" height="12" stroke="' + farbe(i, s) + '" stroke-width="1"/>');
        g.push('<rect x="' + (2 + i * 7) + '" y="86" width="6" height="12" stroke="' + farbe(i + 1, s) + '" stroke-width="1"/>');
        if (i % 7 !== 2 && i % 7 !== 6) {
          g.push('<rect x="' + (6.5 + i * 7) + '" y="2" width="3" height="7" fill="' + farbe(i, s) + '" stroke="none" opacity=".85"/>');
          g.push('<rect x="' + (6.5 + i * 7) + '" y="86" width="3" height="7" fill="' + farbe(i + 1, s) + '" stroke="none" opacity=".85"/>');
        }
      }
      break;
    case 'star':
      for (i = 0; i < 3; i++) {
        var punkte = [];
        for (var j = 0; j < 20; j++) {
          var rr = (j % 2 === 0 ? 48 : 38) - i * 4;
          var aa = (j * 18 + i * 9 + s % 18 - 90) * Math.PI / 180;
          punkte.push((50 + rr * Math.cos(aa)).toFixed(1) + ',' + (50 + rr * Math.sin(aa)).toFixed(1));
        }
        g.push('<polygon points="' + punkte.join(' ') + '" stroke="' + farbe(i, s) + '" opacity="' + (0.95 - i * 0.25) + '"/>');
      }
      break;
    case 'speaker':
      g.push('<circle cx="50" cy="50" r="47" stroke="' + farbe(0, s) + '" stroke-width="2.4"/>');
      g.push('<circle cx="50" cy="50" r="40" stroke="' + farbe(1, s) + '" stroke-width="1.2"/>');
      for (i = 0; i < 3; i++) {
        g.push('<path d="' + bogen(50, 50, 44 - i * 3, 300, 420) + '" stroke="' + farbe(i + 2, s) + '" stroke-width="2"/>');
        g.push('<path d="' + bogen(50, 50, 44 - i * 3, 120, 240) + '" stroke="' + farbe(i + 2, s) + '" stroke-width="2"/>');
      }
      break;
    default:
      return '';
  }
  return g.join('');
}

function frameSvg(kind, s) {
  if (kind === 'none') return '';
  return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" ' +
    'style="position:absolute;inset:0;width:100%;height:100%"><g fill="none" stroke-width="1.6" ' +
    'stroke-linecap="round">' + frameInner(kind, s) + '</g></svg>';
}

/* ============================================================
   QR
   ============================================================ */
function qrSvg(text, dunkel, hell) {
  var qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  var n = qr.getModuleCount(), teile = [];
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) if (qr.isDark(r, c)) teile.push('<rect x="' + c + '" y="' + r + '" width="1" height="1"/>');
  }
  return '<svg viewBox="0 0 ' + n + ' ' + n + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" ' +
    'width="100%" height="100%"><rect width="' + n + '" height="' + n + '" fill="' + hell + '"/>' +
    '<g fill="' + dunkel + '">' + teile.join('') + '</g></svg>';
}

/* ============================================================
   KARTENSEITEN
   ============================================================ */
function kartenVorderseite(song, px) {
  var d = deck.design;
  var el = document.createElement('div');
  el.className = 'pcard pcard-front';
  /* Im Druckbogen MUSS die Karte absolut liegen - sonst fließen alle
     Karten hintereinander statt ins Raster. */
  el.style.position = px ? 'relative' : 'absolute';
  el.style.background = d.qrBg;
  if (px) { el.style.width = px + 'px'; el.style.height = px + 'px'; }
  if (deckImage) {
    el.style.backgroundImage = 'url(' + deckImage + ')';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  }

  var s = saat(song.id || song.link || song.title);
  var rahmen = frameSvg(d.frame, s);
  if (rahmen) el.insertAdjacentHTML('beforeend', rahmen);

  var box = document.createElement('div');
  box.style.position = 'relative';
  box.style.width = d.qrSize + '%';
  box.style.height = d.qrSize + '%';
  box.style.background = '#FFFFFF';
  box.style.borderRadius = px ? '4px' : '1.2mm';
  box.style.overflow = 'hidden';
  if (d.qrBorderW > 0) {
    box.style.boxShadow = '0 0 0 ' + (px ? (d.qrBorderW * 0.5) + 'px' : (d.qrBorderW * 0.25) + 'mm') + ' ' + d.qrBorder;
  }
  box.innerHTML = qrSvg(song.link, '#000000', '#FFFFFF');
  el.appendChild(box);

  if (d.label) {
    var lab = document.createElement('div');
    lab.className = 'plabel';
    lab.style.color = d.qrBorder;
    lab.textContent = d.label;
    if (px) lab.style.cssText += ';position:absolute;bottom:5px;left:0;right:0;text-align:center;font-size:7px;letter-spacing:.08em';
    el.appendChild(lab);
  }
  return el;
}

function jahresFarbe(jahr, jahre) {
  if (!deck.design.hitster || !jahr) return deck.design.solBg;
  var min = Math.min.apply(null, jahre), max = Math.max.apply(null, jahre);
  var t = (max > min) ? (jahr - min) / (max - min) : 0.5;
  var pos = t * (HITSTER_COLORS.length - 1);
  var i = Math.min(HITSTER_COLORS.length - 2, Math.floor(pos));
  var f = pos - i;
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  var a = hex(HITSTER_COLORS[i]), b = hex(HITSTER_COLORS[i + 1]);
  var c = [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); });
  return 'rgb(' + c.join(',') + ')';
}

function kontur(an, farbe2, dickeMm) {
  if (!an) return '';
  var d = dickeMm;
  return 'text-shadow:' + [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.4], [0, 1.4], [-1.4, 0], [1.4, 0]]
    .map(function (o) { return (o[0] * d) + 'mm ' + (o[1] * d) + 'mm 0 ' + farbe2; }).join(',') + ';';
}

function kartenRueckseite(song, jahre, px) {
  var d = deck.design;
  var el = document.createElement('div');
  el.className = 'pcard pcard-back';
  el.style.position = px ? 'relative' : 'absolute';
  el.style.background = jahresFarbe(song.year, jahre.length ? jahre : [song.year || 2000]);
  if (px) {
    el.style.cssText += ';width:' + px + 'px;height:' + px + 'px;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;padding:8px;text-align:center';
  }
  var kd = px ? 0.12 : 0.28;
  var a = document.createElement('div');
  a.className = 'pa';
  a.textContent = song.artist;
  a.style.cssText = 'color:' + d.artistColor + ';' + kontur(d.artistOn, d.artistOutline, kd) +
    (px ? 'font-family:var(--display);font-weight:800;font-size:9px;line-height:1.15' : '');
  var y = document.createElement('div');
  y.className = 'py';
  y.textContent = song.year || '?';
  y.style.cssText = 'color:' + d.yearColor + ';' + kontur(d.yearOn, d.yearOutline, kd * 1.6) +
    (px ? 'font-family:var(--display);font-weight:900;font-size:34px;line-height:1' : '');
  var t = document.createElement('div');
  t.className = 'pt';
  t.textContent = song.title;
  t.style.cssText = 'color:' + d.titleColor + ';' + kontur(d.titleOn, d.titleOutline, kd) +
    (px ? 'font-family:var(--display);font-weight:800;font-size:9px;line-height:1.15;margin-top:2px' : '');
  el.appendChild(a); el.appendChild(y); el.appendChild(t);
  if (d.label) {
    var lab = document.createElement('div');
    lab.className = 'plabel2';
    lab.style.color = d.titleColor;
    lab.textContent = d.label;
    if (px) lab.style.cssText += ';position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:6px;opacity:.7';
    el.appendChild(lab);
  }
  return el;
}

/* ============================================================
   LISTE & SONGS
   ============================================================ */
function openCards() {
  deckLoad().then(function () {
    renderDeck();
    applyDesignInputs();
    showScreen('screen-cards');
  });
}

function renderDeck() {
  var liste = $('#cardList');
  liste.innerHTML = '';
  $('#cardsCount').textContent = String(deck.songs.length);
  $('#cardsHint').hidden = deck.songs.length > 0;

  deck.songs.forEach(function (s, i) {
    var row = document.createElement('div');
    row.className = 'cl-item';
    var main = document.createElement('div');
    main.className = 'cl-main';
    var t = document.createElement('div'); t.className = 'cl-t'; t.textContent = s.title;
    var a = document.createElement('div'); a.className = 'cl-a'; a.textContent = s.artist;
    main.appendChild(t); main.appendChild(a);

    var jahr = document.createElement('input');
    jahr.className = 'cl-year';
    jahr.type = 'text'; jahr.inputMode = 'numeric'; jahr.maxLength = 4;
    jahr.value = s.year || '';
    jahr.setAttribute('aria-label', 'Jahr von ' + s.title);
    jahr.addEventListener('change', function () {
      var y = parseInt(String(jahr.value).replace(/\D/g, ''), 10);
      if (isFinite(y) && y >= 1900 && y <= 2100) { s.year = y; deckSave(); renderDesignPreview(); }
      else { jahr.value = s.year || ''; toast('Bitte eine Jahreszahl zwischen 1900 und 2100'); }
    });

    var del = document.createElement('button');
    del.className = 'cl-del';
    del.textContent = '\u2715';
    del.setAttribute('aria-label', s.title + ' entfernen');
    del.addEventListener('click', function () { deck.songs.splice(i, 1); deckSave(); renderDeck(); });

    row.appendChild(main); row.appendChild(jahr); row.appendChild(del);
    liste.appendChild(row);
  });
  renderDesignPreview();
}

function addSong(t, jahrPruefen) {
  if (!t || !t.id) return Promise.resolve(false);
  if (deck.songs.some(function (s) { return s.id === t.id; })) { toast('Der Song ist schon in der Liste'); return Promise.resolve(false); }
  var eintrag = {
    id: t.id,
    artist: (t.artists || []).map(function (a) { return a.name; }).join(', '),
    title: t.name,
    year: parseInt(String((t.album && t.album.release_date) || '').slice(0, 4), 10) || null,
    link: 'https://open.spotify.com/track/' + t.id
  };
  deck.songs.push(eintrag);
  deckSave(); renderDeck();
  if (jahrPruefen === false) return Promise.resolve(true);
  return verfeinereJahr(eintrag).then(function () { return true; });
}

function verfeinereJahr(eintrag) {
  if (typeof findOriginalYear !== 'function') return Promise.resolve();
  return findOriginalYear(eintrag.artist, eintrag.title).then(function (y) {
    if (y && (!eintrag.year || y < eintrag.year)) { eintrag.year = y; deckSave(); renderDeck(); }
  }).catch(function () { /* egal */ });
}

/* Song kurz ab der Mitte anspielen, um ihn wiederzuerkennen */
function anspielen(t) {
  var mitte = Math.round((t.duration_ms || 180000) / 2);
  activateAudio();
  playTrack(t.id, mitte).catch(function () { toast('Anspielen hat nicht geklappt'); });
}

var auswahl = [];   /* aktuell angehakte Suchtreffer */

function auswahlAnzeigen() {
  $('#srCount').textContent = auswahl.length === 1 ? '1 ausgewählt' : auswahl.length + ' ausgewählt';
  $('#btnAddSelected').disabled = auswahl.length === 0;
}

function suchListeSchliessen() {
  stopPlayback();
  auswahl = [];
  $('#searchResults').hidden = true;
  $('#srActions').hidden = true;
}

function onSearch() {
  var q = $('#cardSearch').value.trim();
  if (q.length < 2) { toast('Bitte etwas mehr eintippen'); return; }
  auswahl = [];
  var box = $('#searchResults');
  box.hidden = false;
  $('#srActions').hidden = true;
  box.innerHTML = '<p class="cards-hint">Wird gesucht \u2026</p>';

  searchTracks(q, 10).then(function (items) {
    box.innerHTML = '';
    if (!items.length) { box.innerHTML = '<p class="cards-hint">Nichts gefunden.</p>'; return; }
    items.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'sr-item';

      var play = document.createElement('button');
      play.className = 'sr-play';
      play.setAttribute('aria-label', t.name + ' anspielen');
      play.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 4l13 8-13 8z"/></svg>';
      play.addEventListener('click', function (e) { e.stopPropagation(); anspielen(t); });

      var main = document.createElement('button');
      main.className = 'sr-main';
      main.setAttribute('aria-pressed', 'false');
      var tt = document.createElement('div'); tt.className = 'cl-t'; tt.textContent = t.name;
      var aa = document.createElement('div'); aa.className = 'cl-a';
      aa.textContent = (t.artists || []).map(function (a) { return a.name; }).join(', ') +
        ' \u00b7 ' + String((t.album && t.album.release_date) || '').slice(0, 4);
      main.appendChild(tt); main.appendChild(aa);

      var haken = document.createElement('span');
      haken.className = 'sr-check';
      haken.textContent = '\u2713';

      /* Antippen hakt an oder ab - die Liste bleibt offen */
      main.addEventListener('click', function () {
        var i = auswahl.indexOf(t);
        if (i === -1) { auswahl.push(t); row.classList.add('selected'); main.setAttribute('aria-pressed', 'true'); }
        else { auswahl.splice(i, 1); row.classList.remove('selected'); main.setAttribute('aria-pressed', 'false'); }
        $('#srActions').hidden = false;
        auswahlAnzeigen();
      });

      row.appendChild(play); row.appendChild(main); row.appendChild(haken);
      box.appendChild(row);
    });
    $('#srActions').hidden = false;
    auswahlAnzeigen();
  }).catch(function () { box.innerHTML = '<p class="cards-hint">Die Suche hat nicht geklappt.</p>'; });
}

function ausgewaehlteHinzufuegen() {
  if (!auswahl.length) return;
  stopPlayback();                 /* angespielten Song beenden */
  var liste = auswahl.slice();
  liste.forEach(function (t) { addSong(t, false); });
  toast(liste.length === 1 ? 'Song hinzugefügt \u2013 Jahr wird geprüft \u2026'
                           : liste.length + ' Songs hinzugefügt \u2013 Jahre werden geprüft \u2026');
  suchListeSchliessen();
  $('#cardSearch').value = '';
  jahreNachziehen();
}

function trackIdsAus(text) {
  var out = [], re = /track[\/:]([A-Za-z0-9]{22})/g, m;
  while ((m = re.exec(String(text || ''))) !== null) if (out.indexOf(m[1]) === -1) out.push(m[1]);
  return out;
}
function playlistIdAus(text) {
  var m = String(text || '').match(/playlist[\/:]([A-Za-z0-9]{22})/);
  return m ? m[1] : null;
}

function onAddLinks() {
  var text = $('#cardLinks').value;
  var ids = trackIdsAus(text);
  if (ids.length) { ladeTracks(ids); $('#cardLinks').value = ''; return; }
  var pid = playlistIdAus(text);
  if (pid) { ladePlaylist(pid); return; }
  toast('Keine Spotify-Links erkannt');
}

function ladeTracks(ids) {
  toast(ids.length + (ids.length === 1 ? ' Song wird geladen \u2026' : ' Songs werden geladen \u2026'));
  var alle = [];
  function block(i) {
    if (i >= ids.length) return Promise.resolve();
    return api('/tracks?ids=' + ids.slice(i, i + 50).join(',')).then(function (res) {
      if (!res.ok) return readApiError(res).then(function (d) { throw new Error(d); });
      return res.json();
    }).then(function (j) {
      (j.tracks || []).forEach(function (t) { if (t && t.id) alle.push(t); });
      return block(i + 50);
    });
  }
  return block(0).then(function () {
    alle.forEach(function (t) { addSong(t, false); });
    toast(alle.length + ' hinzugefügt \u2013 Jahre werden geprüft \u2026');
    return jahreNachziehen();
  }).catch(function (e) {
    openModal({ title: 'Songs konnten nicht geladen werden',
      text: 'Bitte Verbindung prüfen.' + (e && e.message ? '\n\nTechnik: ' + e.message : ''), primary: 'OK' });
  });
}

function jahreNachziehen() {
  var offen = deck.songs.filter(function (s) { return !s.geprueft; });
  function naechster(i) {
    if (i >= offen.length) { toast('Fertig \u2013 Jahre geprüft'); return Promise.resolve(); }
    var s = offen[i];
    return verfeinereJahr(s).then(function () {
      s.geprueft = true; deckSave();
      return new Promise(function (r) { setTimeout(r, 120); }).then(function () { return naechster(i + 1); });
    });
  }
  return naechster(0);
}

function ladePlaylist(pid) {
  toast('Playlist wird gelesen \u2026');
  var alle = [];
  function seite(off, art) {
    return api('/playlists/' + pid + '/' + art + '?limit=50&offset=' + off).then(function (res) {
      if (!res.ok) return readApiError(res).then(function (d) { throw { detail: d }; });
      return res.json();
    }).then(function (j) {
      var items = (j && j.items) || [];
      items.forEach(function (it) { var t = it && (it.track || it.item); if (t && t.id) alle.push(t); });
      if (items.length === 50 && alle.length < 1000) return seite(off + 50, art);
      return alle;
    });
  }
  seite(0, 'items').catch(function () { return seite(0, 'tracks'); }).then(function (liste) {
    if (!liste.length) throw { detail: 'Playlist leer oder nicht lesbar' };
    liste.forEach(function (t) { addSong(t, false); });
    $('#cardLinks').value = '';
    toast(liste.length + ' Songs übernommen \u2013 Jahre werden geprüft \u2026');
    return jahreNachziehen();
  }).catch(function (e) {
    openModal({
      title: 'Playlist nicht lesbar',
      text: 'Spotify hat den Zugriff auf die Playlist abgelehnt.' + (e && e.detail ? '\n\nTechnik: ' + e.detail : '') +
        '\n\nAusweg: In der Spotify-App alle Titel markieren, kopieren und hier einfügen \u2013 einzelne Song-Links gehen immer.',
      primary: 'OK'
    });
  });
}


/* ============================================================
   FARBWÄHLER – eigene Palette statt des Systemdialogs
   ------------------------------------------------------------
   Alle Farbtöne mit voller Sättigung, dazu je eine hellere und
   eine dunklere Reihe sowie Grautöne von Weiß bis Schwarz.
   ============================================================ */
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  var k = function (n) { return (n + h / 30) % 12; };
  var a = s * Math.min(l, 1 - l);
  var f = function (n) {
    var v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

function palette() {
  var toene = [0, 16, 32, 45, 60, 90, 120, 150, 170, 190, 210, 230, 260, 285, 310, 330, 345];
  var out = ['#FFFFFF', '#E4E8F0', '#B9C0CC', '#8A93A3', '#5A6172', '#2A2F3A', '#0B0E14'];
  toene.forEach(function (t) { out.push(hslHex(t, 100, 72)); });   /* hell */
  toene.forEach(function (t) { out.push(hslHex(t, 100, 52)); });   /* voll */
  toene.forEach(function (t) { out.push(hslHex(t, 100, 34)); });   /* dunkel */
  return out;
}

var farbZiel = null;   /* { id, key } */

function openColorSheet(id, key, titel) {
  farbZiel = { id: id, key: key };
  $('#colorTitle').textContent = titel || 'Farbe wählen';
  var grid = $('#colorGrid');
  grid.innerHTML = '';
  var aktuell = String(deck.design[key] || '').toUpperCase();
  palette().forEach(function (f) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-swatch' + (f.toUpperCase() === aktuell ? ' on' : '');
    b.style.background = f;
    b.setAttribute('aria-label', 'Farbe ' + f);
    b.addEventListener('click', function () {
      setzeDesign(key, f);
      var knopf = $('#' + id);
      if (knopf) knopf.style.background = f;
      closeColorSheet();
    });
    grid.appendChild(b);
  });
  var s = $('#colorSheet');
  s.classList.add('open');
  s.setAttribute('aria-hidden', 'false');
}

function closeColorSheet() {
  var s = $('#colorSheet');
  s.classList.remove('open');
  s.setAttribute('aria-hidden', 'true');
  farbZiel = null;
}

/* Farbknopf mit seiner Einstellung verbinden */
function bindeFarbe(id, key, titel) {
  var knopf = $('#' + id);
  if (!knopf) return;
  knopf.style.background = deck.design[key];
  knopf.addEventListener('click', function () { openColorSheet(id, key, titel); });
}

/* ============================================================
   DESIGN-BEDIENUNG
   ============================================================ */
function applyDesignInputs() {
  var d = deck.design;
  var sel = $('#dsFrame');
  if (!sel.options.length) {
    FRAMES.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      sel.appendChild(o);
    });
  }
  sel.value = d.frame;
  $('#dsQrBg').style.background = d.qrBg;
  $('#dsQrSize').value = d.qrSize;
  $('#dsQrSizeVal').textContent = d.qrSize + '%';
  $('#dsQrBorder').style.background = d.qrBorder;
  $('#dsQrBorderW').value = d.qrBorderW;
  $('#dsQrBorderWVal').textContent = String(d.qrBorderW);
  $('#dsLabel').value = d.label || '';
  $('#dsHitster').setAttribute('aria-checked', d.hitster ? 'true' : 'false');
  $('#dsSolBg').style.background = d.solBg;
  $('#rowSolBg').style.display = d.hitster ? 'none' : '';
  ['artist', 'year', 'title'].forEach(function (k) {
    var gross = k.charAt(0).toUpperCase() + k.slice(1);
    $('#ds' + gross + 'Color').style.background = d[k + 'Color'];
    $('#ds' + gross + 'On').setAttribute('aria-checked', d[k + 'On'] ? 'true' : 'false');
    $('#ds' + gross + 'Outline').style.background = d[k + 'Outline'];
  });
  $('#dsBorders').setAttribute('aria-checked', d.borders ? 'true' : 'false');
  $('#dsImageName').textContent = deckImage ? 'Eigenes Bild aktiv' : '';
  renderDesignPreview();
}

function renderDesignPreview() {
  var beispiel = deck.songs[0] || { id: 'demo', artist: 'Interpret', title: 'Songtitel', year: 1984,
                                    link: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' };
  var jahre = deck.songs.map(function (s) { return s.year; }).filter(function (y) { return !!y; });

  function fuelle(id, karte, px) {
    var box = $(id);
    if (!box) return;
    box.innerHTML = '';
    var h = document.createElement('div');
    h.className = 'prev';
    h.appendChild(karte(beispiel, jahre, px));
    box.appendChild(h);
  }
  /* Große Einzelvorschau direkt unter den jeweiligen Einstellungen */
  fuelle('#dsPreviewFront', function (s, j, px) { return kartenVorderseite(s, px); }, 190);
  fuelle('#dsPreviewBack', function (s, j, px) { return kartenRueckseite(s, j, px); }, 190);

  /* Unten beide Seiten klein nebeneinander */
  var box = $('#dsPreview');
  if (!box) return;
  box.innerHTML = '';
  var v = document.createElement('div'); v.className = 'prev'; v.appendChild(kartenVorderseite(beispiel, 120));
  var r = document.createElement('div'); r.className = 'prev'; r.appendChild(kartenRueckseite(beispiel, jahre, 120));
  box.appendChild(v); box.appendChild(r);
}

function setzeDesign(schluessel, wert) {
  deck.design[schluessel] = wert;
  deckSave();
  renderDesignPreview();
}

/* ============================================================
   DRUCKBOGEN – A4, 5x5 cm, 4x5 = 20 Karten je Seite
   ============================================================ */
var SEITE = { spalten: 4, zeilen: 5, karte: 50, randX: 5, randY: 23.5 };

function platziere(el, spalte, zeile) {
  el.style.left = (SEITE.randX + spalte * SEITE.karte) + 'mm';
  el.style.top = (SEITE.randY + zeile * SEITE.karte) + 'mm';
  if (deck.design.borders) el.classList.add('cut');
}

var DRUCK_HINWEIS = 'rikster_druckhinweis';

function baueDruck() {
  if (!deck.songs.length) { toast('Noch keine Karten in der Liste'); return; }
  var gesehen = false;
  try { gesehen = localStorage.getItem(DRUCK_HINWEIS) === '1'; } catch (e) { /* egal */ }
  if (!gesehen) {
    openModal({
      title: 'Kurz vor dem Drucken',
      text: 'Stell im Druckdialog bitte ein:\n\n' +
        '\u2022 Ränder: keine\n' +
        '\u2022 Skalierung: 100 % (nicht "an Seite anpassen")\n' +
        '\u2022 Hintergrundgrafiken drucken: an\n\n' +
        'Sonst verrutschen die Karten oder bleiben weiß. Zum Speichern als PDF wählst du dort "Als PDF speichern".',
      primary: 'Weiter',
      onPrimary: function () {
        try { localStorage.setItem(DRUCK_HINWEIS, '1'); } catch (e) { /* egal */ }
        pruefeJahre();
      },
      secondary: 'Abbrechen'
    });
    return;
  }
  pruefeJahre();
}

function pruefeJahre() {
  var fehlend = deck.songs.filter(function (s) { return !s.year; });
  if (fehlend.length) {
    openModal({
      title: 'Jahre fehlen',
      text: fehlend.length + ' Karten haben noch kein Jahr. Trage es in der Liste nach \u2013 sonst steht auf der R\u00fcckseite ein Fragezeichen.',
      primary: 'Trotzdem drucken', onPrimary: druckStarten, secondary: 'Zur\u00fcck'
    });
    return;
  }
  druckStarten();
}

function druckStarten() {
  var root = $('#printRoot');
  root.innerHTML = '';
  var jahre = deck.songs.map(function (s) { return s.year; }).filter(function (y) { return !!y; });
  var proSeite = SEITE.spalten * SEITE.zeilen;

  for (var i = 0; i < deck.songs.length; i += proSeite) {
    var teil = deck.songs.slice(i, i + proSeite);

    var vorn = document.createElement('div');
    vorn.className = 'sheet-page';
    vorn.style.cssText = 'position:relative;width:210mm;height:297mm;overflow:hidden;' +
      'page-break-after:always;break-after:page;background:' + deck.design.qrBg + ';';
    teil.forEach(function (s, idx) {
      var k = kartenVorderseite(s);
      platziere(k, idx % SEITE.spalten, Math.floor(idx / SEITE.spalten));
      vorn.appendChild(k);
    });
    root.appendChild(vorn);

    var hinten = document.createElement('div');
    hinten.className = 'sheet-page';
    hinten.style.cssText = 'position:relative;width:210mm;height:297mm;overflow:hidden;' +
      'page-break-after:always;break-after:page;background:#FFFFFF;';
    teil.forEach(function (s, idx) {
      var k = kartenRueckseite(s, jahre);
      /* Spalten spiegeln, damit die Lösung hinter der richtigen Karte landet */
      platziere(k, (SEITE.spalten - 1) - (idx % SEITE.spalten), Math.floor(idx / SEITE.spalten));
      hinten.appendChild(k);
    });
    root.appendChild(hinten);
  }

  var seiten = root.querySelectorAll('.sheet-page');
  if (seiten.length) {
    var letzte = seiten[seiten.length - 1];
    letzte.style.pageBreakAfter = 'auto';
    letzte.style.breakAfter = 'auto';
  }

  root.hidden = false;
  setTimeout(function () {
    window.print();
    setTimeout(function () { root.hidden = true; root.innerHTML = ''; }, 1000);
  }, 120);
}


/* ============================================================
   ECHTE PDF-DATEI ERZEUGEN
   ------------------------------------------------------------
   Ohne Druckdialog: Die Seiten werden direkt als PDF gebaut und
   heruntergeladen. Alles vektorbasiert (Rahmen, QR, Schrift),
   dadurch gestochen scharf und millimetergenau.
   ============================================================ */
function ladeSkript(src) {
  return new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { res(); };
    s.onerror = function () { rej(new Error(src + ' konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
}

/* Bibliothek und Schrift erst beim ersten Export nachladen */
function pdfBereit() {
  var jobs = [];
  if (!window.jspdf) jobs.push(ladeSkript('js/jspdf.js'));
  if (!window.MONTSERRAT_BOLD) jobs.push(ladeSkript('js/font-montserrat.js'));
  return Promise.all(jobs);
}

function hexRgb(hex) {
  var h = String(hex || '#000000').trim();
  if (h.charAt(0) === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}
function rgbStr(farbe) {
  var m = String(farbe).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return hexRgb(farbe);
}

/* ---------- Rahmen als Vektorzeichnung ---------- */
function rahmenPdf(doc, kind, x, y, s, seed) {
  if (kind === 'none') return;
  var p = function (a, b) { return [x + (a / 100) * s, y + (b / 100) * s]; };
  var linie = function (a1, b1, a2, b2) {
    var A = p(a1, b1), B = p(a2, b2);
    doc.line(A[0], A[1], B[0], B[1]);
  };
  var kreis = function (cx, cy, r) {
    var C = p(cx, cy);
    doc.circle(C[0], C[1], (r / 100) * s, 'S');
  };
  var bogenLinie = function (cx, cy, r, a1, a2) {
    var n = Math.max(8, Math.round(Math.abs(a2 - a1) / 8));
    var vor = null;
    for (var i = 0; i <= n; i++) {
      var a = (a1 + (a2 - a1) * i / n - 90) * Math.PI / 180;
      var pkt = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      if (vor) linie(vor[0], vor[1], pkt[0], pkt[1]);
      vor = pkt;
    }
  };
  var vieleck = function (cx, cy, r, n, dreh) {
    var pk = [];
    for (var i = 0; i < n; i++) {
      var a = (i * 360 / n + (dreh || 0) - 90) * Math.PI / 180;
      pk.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (var k = 0; k < pk.length; k++) {
      var q = pk[(k + 1) % pk.length];
      linie(pk[k][0], pk[k][1], q[0], q[1]);
    }
  };
  var setz = function (i, dicke) {
    var c = hexRgb(farbe(i, seed));
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(((dicke || 1.6) / 100) * s);
  };

  var i, r;
  switch (kind) {
    case 'rings':
      for (i = 0; i < 6; i++) {
        setz(i, 1.4);
        var a0 = (seed + i * 47) % 360;
        bogenLinie(50, 50, 48 - i * 3.4, a0, a0 + 250 - i * 12);
      }
      break;
    case 'circles':
      for (i = 0; i < 5; i++) { setz(i, 1.5); kreis(50, 50, 48 - i * 3.6); }
      break;
    case 'squares':
      for (i = 0; i < 5; i++) {
        setz(i, 1.5);
        var d = 4 + i * 3.4, A = p(d, d);
        doc.roundedRect(A[0], A[1], ((100 - 2 * d) / 100) * s, ((100 - 2 * d) / 100) * s, s * 0.03, s * 0.03, 'S');
      }
      break;
    case 'diamond':
      for (i = 0; i < 4; i++) { setz(i, 1.6); vieleck(50, 50, 48 - i * 4, 4, 0); }
      break;
    case 'hexagon':
      for (i = 0; i < 4; i++) { setz(i, 1.6); vieleck(50, 50, 48 - i * 4, 6, i * 8); }
      break;
    case 'corners':
      [[6, 6, 1, 1], [94, 6, -1, 1], [6, 94, 1, -1], [94, 94, -1, -1]].forEach(function (c, k) {
        setz(k, 3);
        linie(c[0] + 22 * c[2], c[1], c[0], c[1]);
        linie(c[0], c[1], c[0], c[1] + 22 * c[3]);
      });
      break;
    case 'notes':
      for (i = 0; i < 8; i++) {
        setz(i, 1.4);
        var aa = (i * 45 + seed % 40) * Math.PI / 180;
        var nx = 50 + 42 * Math.cos(aa), ny = 50 + 42 * Math.sin(aa);
        var C = p(nx, ny);
        doc.ellipse(C[0], C[1], (3.4 / 100) * s, (2.6 / 100) * s, 'S');
        linie(nx + 3.2, ny, nx + 3.2, ny - 10);
      }
      break;
    case 'clef':
      setz(0, 2);
      bogenLinie(34, 62, 14, 200, 380);
      linie(30, 12, 26, 46);
      linie(26, 46, 22, 70);
      setz(2, 2);
      bogenLinie(66, 62, 14, 160, 340);
      linie(70, 12, 74, 46);
      linie(74, 46, 78, 70);
      for (i = 0; i < 4; i++) { setz(i, 0.8); linie(8, 86 + i * 3, 92, 86 + i * 3); }
      break;
    case 'vinyl':
      for (i = 0; i < 9; i++) { setz(i, i % 3 === 0 ? 1.6 : 0.7); kreis(50, 50, 49 - i * 2.1); }
      break;
    case 'equalizer':
      for (i = 0; i < 18; i++) {
        var hh = 6 + (saat('eq' + i + seed) % 22);
        setz(i, 2.6); linie(7 + i * 5, 96, 7 + i * 5, 96 - hh);
        setz(i + 2, 2.6); linie(7 + i * 5, 4, 7 + i * 5, 4 + hh * 0.7);
      }
      break;
    case 'wave':
      for (var w = 0; w < 3; w++) {
        setz(w, 1.6);
        var amp = 12 - w * 3, vor = null;
        for (i = 0; i <= 24; i++) {
          var pk2 = [2 + i * 4, 50 + Math.sin((i / 24) * Math.PI * 4 + w) * amp];
          if (vor) linie(vor[0], vor[1], pk2[0], pk2[1]);
          vor = pk2;
        }
      }
      break;
    case 'dots':
      for (i = 0; i < 36; i++) {
        var ad = i * 10 * Math.PI / 180, D = p(50 + 46 * Math.cos(ad), 50 + 46 * Math.sin(ad));
        var cd = hexRgb(farbe(i, seed));
        doc.setFillColor(cd[0], cd[1], cd[2]);
        doc.circle(D[0], D[1], (1.5 / 100) * s, 'F');
      }
      for (i = 0; i < 24; i++) {
        var ae = i * 15 * Math.PI / 180, E = p(50 + 39 * Math.cos(ae), 50 + 39 * Math.sin(ae));
        var ce = hexRgb(farbe(i + 3, seed));
        doc.setFillColor(ce[0], ce[1], ce[2]);
        doc.circle(E[0], E[1], (1 / 100) * s, 'F');
      }
      break;
    case 'rays':
      for (i = 0; i < 24; i++) {
        setz(i, 2);
        var ar = (i * 15 + seed % 15) * Math.PI / 180, r2 = 48 - (i % 3) * 4;
        linie(50 + 36 * Math.cos(ar), 50 + 36 * Math.sin(ar), 50 + r2 * Math.cos(ar), 50 + r2 * Math.sin(ar));
      }
      break;
    case 'cassette':
      setz(0, 2);
      var K = p(6, 18);
      doc.roundedRect(K[0], K[1], (88 / 100) * s, (64 / 100) * s, s * 0.05, s * 0.05, 'S');
      setz(1, 2); kreis(32, 50, 12);
      setz(2, 2); kreis(68, 50, 12);
      setz(3, 1.6); kreis(32, 50, 4); kreis(68, 50, 4);
      setz(4, 1.6);
      var L = p(26, 70);
      doc.roundedRect(L[0], L[1], (48 / 100) * s, (8 / 100) * s, s * 0.02, s * 0.02, 'S');
      break;
    case 'piano':
      for (i = 0; i < 14; i++) {
        setz(i, 1);
        var T = p(2 + i * 7, 2), U = p(2 + i * 7, 86);
        doc.rect(T[0], T[1], (6 / 100) * s, (12 / 100) * s, 'S');
        doc.rect(U[0], U[1], (6 / 100) * s, (12 / 100) * s, 'S');
        if (i % 7 !== 2 && i % 7 !== 6) {
          var cf = hexRgb(farbe(i, seed));
          doc.setFillColor(cf[0], cf[1], cf[2]);
          var V = p(6.5 + i * 7, 2), W = p(6.5 + i * 7, 86);
          doc.rect(V[0], V[1], (3 / 100) * s, (7 / 100) * s, 'F');
          doc.rect(W[0], W[1], (3 / 100) * s, (7 / 100) * s, 'F');
        }
      }
      break;
    case 'star':
      for (i = 0; i < 3; i++) {
        setz(i, 1.6);
        var vorS = null, ersteS = null;
        for (var j = 0; j < 20; j++) {
          var rr = (j % 2 === 0 ? 48 : 38) - i * 4;
          var as = (j * 18 + i * 9 + seed % 18 - 90) * Math.PI / 180;
          var ps = [50 + rr * Math.cos(as), 50 + rr * Math.sin(as)];
          if (vorS) linie(vorS[0], vorS[1], ps[0], ps[1]); else ersteS = ps;
          vorS = ps;
        }
        if (vorS && ersteS) linie(vorS[0], vorS[1], ersteS[0], ersteS[1]);
      }
      break;
    case 'speaker':
      setz(0, 2.4); kreis(50, 50, 47);
      setz(1, 1.2); kreis(50, 50, 40);
      for (i = 0; i < 3; i++) {
        setz(i + 2, 2);
        bogenLinie(50, 50, 44 - i * 3, 300, 420);
        bogenLinie(50, 50, 44 - i * 3, 120, 240);
      }
      break;
  }
}

/* ---------- QR als Vektor, waagerecht zusammengefasst ---------- */
function qrPdf(doc, doc_text, x, y, groesse) {
  var qr = qrcode(0, 'M');
  qr.addData(doc_text);
  qr.make();
  var n = qr.getModuleCount();
  var m = groesse / n;
  doc.setFillColor(0, 0, 0);
  for (var r = 0; r < n; r++) {
    var start = -1;
    for (var c = 0; c <= n; c++) {
      var dunkel = (c < n) && qr.isDark(r, c);
      if (dunkel && start === -1) start = c;
      if (!dunkel && start !== -1) {
        doc.rect(x + start * m, y + r * m, (c - start) * m, m, 'F');
        start = -1;
      }
    }
  }
}

/* ---------- Maße aus der Vorschau übernehmen ----------
   In der Vorschau ist die Karte VORSCHAU_PX breit und steht für 50 mm.
   mmAus() rechnet Vorschau-Pixel in Millimeter um, ptAus() zusätzlich
   in Punkt - denn jsPDF erwartet Schriftgrößen in Punkt, nicht in mm.
   Genau das war vorher falsch: Die Schrift kam um Faktor 2,83 zu klein. */
var VORSCHAU_PX = 120;
function mmAus(vorschauPx, kartenGroesseMm) { return vorschauPx / VORSCHAU_PX * kartenGroesseMm; }
function ptAus(vorschauPx, kartenGroesseMm) { return mmAus(vorschauPx, kartenGroesseMm) * 72 / 25.4; }

/* ---------- Kartenseiten in die PDF ---------- */
function karteVornPdf(doc, song, x, y, s) {
  var d = deck.design;
  var bg = rgbStr(d.qrBg);
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.rect(x, y, s, s, 'F');

  rahmenPdf(doc, d.frame, x, y, s, saat(song.id || song.link || song.title));

  var qs = (d.qrSize / 100) * s;
  var qx = x + (s - qs) / 2, qy = y + (s - qs) / 2;
  if (d.qrBorderW > 0) {
    var bc = rgbStr(d.qrBorder);
    var dick = (d.qrBorderW * 0.25);
    doc.setFillColor(bc[0], bc[1], bc[2]);
    doc.roundedRect(qx - dick, qy - dick, qs + 2 * dick, qs + 2 * dick, 1, 1, 'F');
  }
  doc.setFillColor(255, 255, 255);
  doc.rect(qx, qy, qs, qs, 'F');
  var rand = qs * 0.06;
  qrPdf(doc, song.link, qx + rand, qy + rand, qs - 2 * rand);

  if (d.label) {
    var lc = rgbStr(d.qrBorder);
    doc.setTextColor(lc[0], lc[1], lc[2]);
    doc.setFont('Montserrat', 'bold');
    doc.setFontSize(ptAus(7, s));
    doc.text(String(d.label), x + s / 2, y + s - mmAus(6, s), { align: 'center' });
  }
}

function textMitKontur(doc, zeilen, cx, y, groesse, farbeText, konturAn, farbeKontur, zeilenhoehe) {
  var ft = rgbStr(farbeText);
  doc.setFontSize(groesse);
  if (konturAn) {
    var fk = rgbStr(farbeKontur);
    doc.setDrawColor(fk[0], fk[1], fk[2]);
    doc.setLineWidth(groesse * 25.4 / 72 * 0.05);   /* Punkt -> mm */
    doc.setTextColor(ft[0], ft[1], ft[2]);
    zeilen.forEach(function (z, i) {
      doc.text(z, cx, y + i * zeilenhoehe, { align: 'center', renderingMode: 'fillThenStroke' });
    });
    return;
  }
  doc.setTextColor(ft[0], ft[1], ft[2]);
  zeilen.forEach(function (z, i) { doc.text(z, cx, y + i * zeilenhoehe, { align: 'center' }); });
}

function karteHintenPdf(doc, song, x, y, s, jahre) {
  var d = deck.design;
  var bg = rgbStr(jahresFarbe(song.year, jahre.length ? jahre : [song.year || 2000]));
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.rect(x, y, s, s, 'F');
  doc.setFont('Montserrat', 'bold');

  /* Größen 1:1 aus der Vorschau: Interpret/Titel 9 px, Jahr 34 px */
  var ptText = ptAus(9, s);
  var ptJahr = ptAus(34, s);
  var zhText = mmAus(9 * 1.15, s);       /* Zeilenhöhe = Schriftgröße x 1.15 */
  var breite = s - mmAus(16, s);

  doc.setFontSize(ptText);
  var aZeilen = doc.splitTextToSize(String(song.artist || ''), breite).slice(0, 2);
  var tZeilen = doc.splitTextToSize(String(song.title || ''), breite).slice(0, 2);

  /* Senkrecht mittig wie in der Vorschau (Flexbox, zentriert) */
  var hJahr = mmAus(34, s);
  var abstand = mmAus(2, s);
  var gesamt = aZeilen.length * zhText + hJahr + tZeilen.length * zhText + 2 * abstand;
  var oben = y + (s - gesamt) / 2;

  var cx = x + s / 2;
  var yA = oben + zhText * 0.78;
  textMitKontur(doc, aZeilen, cx, yA, ptText, d.artistColor, d.artistOn, d.artistOutline, zhText);

  var yJ = oben + aZeilen.length * zhText + abstand + hJahr * 0.78;
  textMitKontur(doc, [String(song.year || '?')], cx, yJ, ptJahr, d.yearColor, d.yearOn, d.yearOutline, 0);

  var yT = oben + aZeilen.length * zhText + abstand + hJahr + abstand + zhText * 0.78;
  textMitKontur(doc, tZeilen, cx, yT, ptText, d.titleColor, d.titleOn, d.titleOutline, zhText);

  if (d.label) {
    var lc = rgbStr(d.titleColor);
    doc.setTextColor(lc[0], lc[1], lc[2]);
    doc.setFontSize(ptAus(6, s));
    doc.text(String(d.label), cx, y + s - mmAus(5, s), { align: 'center' });
  }
}

/* ---------- Gesamtdokument ---------- */
function baueDokument(jsPDF) {
  var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Montserrat-Bold.ttf', MONTSERRAT_BOLD);
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');
  doc.setFont('Montserrat', 'bold');

  var jahre = deck.songs.map(function (s) { return s.year; }).filter(function (y) { return !!y; });
  var proSeite = SEITE.spalten * SEITE.zeilen;
  var erste = true;

  for (var i = 0; i < deck.songs.length; i += proSeite) {
    var teil = deck.songs.slice(i, i + proSeite);

    if (!erste) doc.addPage();
    erste = false;
    /* Kein flächiger Seitenhintergrund - nur die Karten werden gefüllt.
       Das spart beim Ausdrucken erheblich Tinte. */
    teil.forEach(function (song, idx) {
      var sp = idx % SEITE.spalten, ze = Math.floor(idx / SEITE.spalten);
      karteVornPdf(doc, song, SEITE.randX + sp * SEITE.karte, SEITE.randY + ze * SEITE.karte, SEITE.karte);
    });
    if (deck.design.borders) schnittlinien(doc, teil.length);

    doc.addPage();
    teil.forEach(function (song, idx) {
      var sp = (SEITE.spalten - 1) - (idx % SEITE.spalten), ze = Math.floor(idx / SEITE.spalten);
      karteHintenPdf(doc, song, SEITE.randX + sp * SEITE.karte, SEITE.randY + ze * SEITE.karte, SEITE.karte, jahre);
    });
    if (deck.design.borders) schnittlinien(doc, teil.length);
  }
  return doc;
}

/* Feine Hilfslinien zum Ausschneiden */
function schnittlinien(doc, anzahl) {
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.1);
  var zeilen = Math.ceil(anzahl / SEITE.spalten);
  var letzteZeile = anzahl - (zeilen - 1) * SEITE.spalten;   /* Karten in der letzten Zeile */

  /* Senkrechte Linien: in der letzten Zeile nur so weit, wie Karten liegen */
  for (var c = 0; c <= SEITE.spalten; c++) {
    var x = SEITE.randX + c * SEITE.karte;
    var bis = (c <= letzteZeile) ? zeilen : (zeilen - 1);
    if (bis <= 0) continue;
    doc.line(x, SEITE.randY, x, SEITE.randY + bis * SEITE.karte);
  }
  /* Waagerechte Linien */
  for (var r = 0; r <= zeilen; r++) {
    var y = SEITE.randY + r * SEITE.karte;
    var spalten = (r >= zeilen) ? letzteZeile : SEITE.spalten;
    doc.line(SEITE.randX, y, SEITE.randX + spalten * SEITE.karte, y);
  }
}

function pdfErzeugen() {
  if (!deck.songs.length) { toast('Noch keine Karten in der Liste'); return; }
  var fehlend = deck.songs.filter(function (s) { return !s.year; });
  if (fehlend.length) {
    openModal({
      title: 'Jahre fehlen',
      text: fehlend.length + ' Karten haben noch kein Jahr. Trage es in der Liste nach \u2013 sonst steht auf der R\u00fcckseite ein Fragezeichen.',
      primary: 'Trotzdem erstellen', onPrimary: pdfStarten, secondary: 'Zur\u00fcck'
    });
    return;
  }
  pdfStarten();
}

function pdfStarten() {
  toast('PDF wird erstellt \u2026');
  pdfBereit().then(function () {
    var doc = baueDokument(window.jspdf.jsPDF);
    var name = 'rikster-karten-' + deck.songs.length + '.pdf';
    doc.save(name);
    toast(Math.ceil(deck.songs.length / 20) * 2 + ' Seiten fertig');
  }).catch(function (e) {
    openModal({
      title: 'PDF konnte nicht erstellt werden',
      text: (e && e.message) ? e.message : 'Unbekannter Fehler.',
      primary: 'OK'
    });
  });
}

/* ============================================================
   EVENTS
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  $('#btnCards').addEventListener('click', openCards);
  $('#btnCardsBack').addEventListener('click', function () { stopPlayback(); showScreen('screen-home'); });
  $('#btnCardSearch').addEventListener('click', onSearch);
  $('#cardSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') onSearch(); });
  $('#cardLinks').addEventListener('keydown', function (e) { if (e.key === 'Enter') onAddLinks(); });
  $('#btnCardLinks').addEventListener('click', onAddLinks);
  $('#btnAddSelected').addEventListener('click', ausgewaehlteHinzufuegen);
  $('#btnSearchClose').addEventListener('click', function () { suchListeSchliessen(); });
  $('#btnCardsPrint').addEventListener('click', pdfErzeugen);
  $('#btnCardsClear').addEventListener('click', function () {
    if (!deck.songs.length) return;
    openModal({
      title: 'Alle Karten löschen?',
      text: 'Die Liste mit ' + deck.songs.length + ' Songs wird geleert. Das Design bleibt erhalten.',
      primary: 'Löschen', onPrimary: function () { deck.songs = []; deckSave(); renderDeck(); },
      secondary: 'Abbrechen'
    });
  });

  $('#btnCardsDesign').addEventListener('click', function () {
    applyDesignInputs();
    var s = $('#designSheet');
    s.classList.add('open');
    s.setAttribute('aria-hidden', 'false');
  });
  $('#btnColorClose').addEventListener('click', closeColorSheet);
  $('#btnDesignClose').addEventListener('click', function () {
    var s = $('#designSheet');
    s.classList.remove('open');
    s.setAttribute('aria-hidden', 'true');
  });

  $('#dsFrame').addEventListener('change', function () { setzeDesign('frame', this.value); });
  bindeFarbe('dsQrBg', 'qrBg', 'Hintergrund der QR-Seite');
  $('#dsQrSize').addEventListener('input', function () {
    $('#dsQrSizeVal').textContent = this.value + '%';
    setzeDesign('qrSize', parseInt(this.value, 10));
  });
  bindeFarbe('dsQrBorder', 'qrBorder', 'Kontur um den QR-Code');
  $('#dsQrBorderW').addEventListener('input', function () {
    $('#dsQrBorderWVal').textContent = this.value;
    setzeDesign('qrBorderW', parseInt(this.value, 10));
  });
  $('#dsLabel').addEventListener('input', function () { setzeDesign('label', this.value); });

  $('#dsHitster').addEventListener('click', function () {
    var an = !deck.design.hitster;
    this.setAttribute('aria-checked', an ? 'true' : 'false');
    $('#rowSolBg').style.display = an ? 'none' : '';
    setzeDesign('hitster', an);
  });
  bindeFarbe('dsSolBg', 'solBg', 'Hintergrund der Lösungsseite');

  ['artist', 'year', 'title'].forEach(function (k) {
    var gross = k.charAt(0).toUpperCase() + k.slice(1);
    var bez = { artist: 'Interpret', year: 'Jahr', title: 'Titel' }[k];
    bindeFarbe('ds' + gross + 'Color', k + 'Color', 'Schriftfarbe: ' + bez);
    bindeFarbe('ds' + gross + 'Outline', k + 'Outline', 'Konturfarbe: ' + bez);
    $('#ds' + gross + 'On').addEventListener('click', function () {
      var an = !deck.design[k + 'On'];
      this.setAttribute('aria-checked', an ? 'true' : 'false');
      setzeDesign(k + 'On', an);
    });
  });

  $('#dsBorders').addEventListener('click', function () {
    var an = !deck.design.borders;
    this.setAttribute('aria-checked', an ? 'true' : 'false');
    setzeDesign('borders', an);
  });

  $('#dsImage').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast('Bild ist größer als 50 MB'); return; }
    toast('Bild wird geladen \u2026');
    var r = new FileReader();
    r.onload = function () {
      deckImage = r.result;
      imgSave(r.result).catch(function () { toast('Bild konnte nicht dauerhaft gespeichert werden'); });
      $('#dsImageName').textContent = f.name;
      renderDesignPreview();
    };
    r.readAsDataURL(f);
  });
  $('#dsImageClear').addEventListener('click', function () {
    imgClear();
    $('#dsImage').value = '';
    $('#dsImageName').textContent = '';
    renderDesignPreview();
  });
});
