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
var DECK_IMG = 'rikster_deck_img';

var deck = {
  songs: [],
  design: { theme: 'neon', accent: '#F7A928', label: '', borders: true, gradient: true, image: null }
};

var NEON = ['#FF2E63', '#33B1FF', '#3DDC84', '#FFE14D'];

/* ---------- Laden & Sichern ---------- */
function deckLoad() {
  try {
    var d = JSON.parse(localStorage.getItem(DECK_KEY) || 'null');
    if (d && d.songs) {
      deck.songs = d.songs;
      if (d.design) {
        Object.keys(d.design).forEach(function (k) { deck.design[k] = d.design[k]; });
      }
    }
    deck.design.image = localStorage.getItem(DECK_IMG) || null;
  } catch (e) { /* egal */ }
}
function deckSave() {
  try {
    var kopie = { theme: deck.design.theme, accent: deck.design.accent, label: deck.design.label,
                  borders: deck.design.borders, gradient: deck.design.gradient };
    localStorage.setItem(DECK_KEY, JSON.stringify({ songs: deck.songs, design: kopie }));
  } catch (e) { toast('Speicher voll \u2013 Kartenliste konnte nicht gesichert werden'); }
}

/* ---------- Bildschirm ---------- */
function openCards() {
  deckLoad();
  renderDeck();
  applyDesignInputs();
  showScreen('screen-cards');
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
    jahr.type = 'text';
    jahr.inputMode = 'numeric';
    jahr.maxLength = 4;
    jahr.value = s.year || '';
    jahr.setAttribute('aria-label', 'Jahr von ' + s.title);
    jahr.addEventListener('change', function () {
      var y = parseInt(String(jahr.value).replace(/\D/g, ''), 10);
      if (isFinite(y) && y >= 1900 && y <= 2100) { s.year = y; deckSave(); }
      else { jahr.value = s.year || ''; toast('Bitte eine Jahreszahl zwischen 1900 und 2100'); }
    });

    var del = document.createElement('button');
    del.className = 'cl-del';
    del.textContent = '\u2715';
    del.setAttribute('aria-label', s.title + ' entfernen');
    del.addEventListener('click', function () {
      deck.songs.splice(i, 1);
      deckSave();
      renderDeck();
    });

    row.appendChild(main); row.appendChild(jahr); row.appendChild(del);
    liste.appendChild(row);
  });
}

/* ---------- Songs hinzufügen ---------- */
function addSong(t, jahrPruefen) {
  if (!t || !t.id) return Promise.resolve(false);
  if (deck.songs.some(function (s) { return s.id === t.id; })) {
    toast('Der Song ist schon in der Liste');
    return Promise.resolve(false);
  }
  var eintrag = {
    id: t.id,
    artist: (t.artists || []).map(function (a) { return a.name; }).join(', '),
    title: t.name,
    year: parseInt(String((t.album && t.album.release_date) || '').slice(0, 4), 10) || null,
    link: 'https://open.spotify.com/track/' + t.id
  };
  deck.songs.push(eintrag);
  deckSave();
  renderDeck();
  if (jahrPruefen === false) return Promise.resolve(true);
  return verfeinereJahr(eintrag).then(function () { return true; });
}

/* Spotify nennt oft das Jahr einer Neuveröffentlichung – frühere Fassung suchen */
function verfeinereJahr(eintrag) {
  if (typeof findOriginalYear !== 'function') return Promise.resolve();
  return findOriginalYear(eintrag.artist, eintrag.title).then(function (y) {
    if (y && (!eintrag.year || y < eintrag.year)) {
      eintrag.year = y;
      deckSave();
      renderDeck();
    }
  }).catch(function () { /* egal */ });
}

function onSearch() {
  var q = $('#cardSearch').value.trim();
  if (q.length < 2) { toast('Bitte etwas mehr eintippen'); return; }
  var box = $('#searchResults');
  box.hidden = false;
  box.innerHTML = '<p class="cards-hint">Wird gesucht \u2026</p>';
  searchTracks(q, 10).then(function (items) {
    box.innerHTML = '';
    if (!items.length) { box.innerHTML = '<p class="cards-hint">Nichts gefunden.</p>'; return; }
    items.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sr-item';
      var main = document.createElement('div');
      main.className = 'cl-main';
      var tt = document.createElement('div'); tt.className = 'cl-t'; tt.textContent = t.name;
      var aa = document.createElement('div'); aa.className = 'cl-a';
      aa.textContent = (t.artists || []).map(function (a) { return a.name; }).join(', ') +
        ' \u00b7 ' + String((t.album && t.album.release_date) || '').slice(0, 4);
      main.appendChild(tt); main.appendChild(aa);
      b.appendChild(main);
      b.addEventListener('click', function () {
        addSong(t);
        box.hidden = true;
        $('#cardSearch').value = '';
      });
      box.appendChild(b);
    });
  }).catch(function () {
    box.innerHTML = '<p class="cards-hint">Die Suche hat nicht geklappt.</p>';
  });
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

/* Jahre nacheinander verfeinern, damit Spotify nicht bremst */
function jahreNachziehen() {
  var offen = deck.songs.filter(function (s) { return !s.geprueft; });
  function naechster(i) {
    if (i >= offen.length) { toast('Fertig \u2013 Jahre geprüft'); return Promise.resolve(); }
    var s = offen[i];
    return verfeinereJahr(s).then(function () {
      s.geprueft = true;
      deckSave();
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
      if (!res.ok) return readApiError(res).then(function (d) { throw { code: res.status, detail: d }; });
      return res.json();
    }).then(function (j) {
      var items = (j && j.items) || [];
      items.forEach(function (it) {
        var t = it && (it.track || it.item);
        if (t && t.id) alle.push(t);
      });
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
      text: 'Spotify hat den Zugriff auf die Playlist abgelehnt.' +
        (e && e.detail ? '\n\nTechnik: ' + e.detail : '') +
        '\n\nAusweg: Öffne die Playlist in der Spotify-App, markiere alle Titel, kopiere sie und füge sie hier ein \u2013 einzelne Song-Links funktionieren immer.',
      primary: 'OK'
    });
  });
}

/* ---------- Design ---------- */
function applyDesignInputs() {
  $('#dsTheme').value = deck.design.theme;
  $('#dsAccent').value = deck.design.accent;
  $('#dsLabel').value = deck.design.label || '';
  $('#dsBorders').setAttribute('aria-checked', deck.design.borders ? 'true' : 'false');
  $('#dsGradient').setAttribute('aria-checked', deck.design.gradient ? 'true' : 'false');
  renderDesignPreview();
}

function renderDesignPreview() {
  var box = $('#dsPreview');
  if (!box) return;
  box.innerHTML = '';
  var beispiel = deck.songs[0] || { id: 'demo', artist: 'Interpret', title: 'Songtitel', year: 1984,
                                    link: 'https://open.spotify.com/track/demo' };
  var jahre = deck.songs.map(function (s) { return s.year; }).filter(function (y) { return !!y; });
  var v = document.createElement('div'); v.className = 'prev';
  v.appendChild(kartenVorderseite(beispiel, 118));
  var r = document.createElement('div'); r.className = 'prev';
  r.appendChild(kartenRueckseite(beispiel, jahre, 118));
  box.appendChild(v); box.appendChild(r);
}

/* ---------- QR ---------- */
function qrSvg(text, dunkel, hell) {
  var qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  var n = qr.getModuleCount();
  var teile = [];
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) teile.push('<rect x="' + c + '" y="' + r + '" width="1" height="1"/>');
    }
  }
  return '<svg viewBox="0 0 ' + n + ' ' + n + '" xmlns="http://www.w3.org/2000/svg" ' +
    'shape-rendering="crispEdges" width="100%" height="100%">' +
    '<rect width="' + n + '" height="' + n + '" fill="' + hell + '"/>' +
    '<g fill="' + dunkel + '">' + teile.join('') + '</g></svg>';
}

/* Kleine Zahl aus einem Text – für immer gleiche, aber je Karte andere Ringe */
function saat(text) {
  var h = 0;
  for (var i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) >>> 0; }
  return h;
}

/* ---------- Kartenseiten ---------- */
function kartenVorderseite(song, px) {
  var d = deck.design;
  var hell = d.theme === 'light';
  var el = document.createElement('div');
  el.className = 'pcard pcard-front';
  el.style.background = hell ? '#FFFFFF' : '#0B0E14';
  el.style.position = 'relative';
  if (px) { el.style.width = px + 'px'; el.style.height = px + 'px'; el.style.position = 'relative'; }

  if (d.image && !hell) {
    el.style.backgroundImage = 'url(' + d.image + ')';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  }

  /* Neon-Ringe, je Karte anders gedreht */
  var s = saat(song.id || song.link || song.title);
  var dreh = s % 360;
  var farben = hell ? ['#111111', '#111111', '#111111', '#111111'] : [d.accent].concat(NEON);
  var ringe = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%">' +
    '<g transform="rotate(' + dreh + ' 50 50)" fill="none" stroke-width="2.4" stroke-linecap="round">';
  for (var i = 0; i < 4; i++) {
    var rad = 44 - i * 3.2;
    var start = i * 90 + 6, ende = start + 78;
    ringe += '<path d="' + bogen(50, 50, rad, start, ende) + '" stroke="' + farben[i % farben.length] + '" opacity="' + (hell ? 0.85 : 0.95) + '"/>';
  }
  ringe += '</g></svg>';
  el.insertAdjacentHTML('beforeend', ringe);

  var qrbox = document.createElement('div');
  qrbox.className = 'qrbox';
  qrbox.style.position = 'relative';
  if (px) { qrbox.style.width = Math.round(px * 0.66) + 'px'; qrbox.style.height = Math.round(px * 0.66) + 'px'; }
  qrbox.innerHTML = qrSvg(song.link, hell ? '#000000' : '#0B0E14', '#FFFFFF');
  el.appendChild(qrbox);

  if (d.label) {
    var lab = document.createElement('div');
    lab.className = 'plabel';
    lab.style.color = hell ? '#666' : 'rgba(255,255,255,.72)';
    lab.textContent = d.label;
    el.appendChild(lab);
  }
  return el;
}

function bogen(cx, cy, r, a1, a2) {
  function p(a) {
    var rad = (a - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  var s = p(a1), e = p(a2);
  var gross = (a2 - a1) > 180 ? 1 : 0;
  return 'M ' + s[0].toFixed(2) + ' ' + s[1].toFixed(2) +
    ' A ' + r + ' ' + r + ' 0 ' + gross + ' 1 ' + e[0].toFixed(2) + ' ' + e[1].toFixed(2);
}

/* Farbe der Rückseite nach Jahr (alt -> neu) */
function jahresFarbe(jahr, jahre) {
  if (!deck.design.gradient || !jahr) return { bg: '#FFFFFF', fg: '#0B0E14' };
  var min = Math.min.apply(null, jahre), max = Math.max.apply(null, jahre);
  var t = (max > min) ? (jahr - min) / (max - min) : 0.5;
  var farben = [[124, 58, 237], [219, 39, 119], [247, 169, 40], [51, 177, 255]];
  var pos = t * (farben.length - 1);
  var i = Math.min(farben.length - 2, Math.floor(pos));
  var f = pos - i;
  var c = [0, 1, 2].map(function (k) { return Math.round(farben[i][k] + (farben[i + 1][k] - farben[i][k]) * f); });
  var hell = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 > 150;
  return { bg: 'rgb(' + c.join(',') + ')', fg: hell ? '#0B0E14' : '#FFFFFF' };
}

function kartenRueckseite(song, jahre, px) {
  var d = deck.design;
  var farbe = (d.theme === 'light') ? { bg: '#FFFFFF', fg: '#0B0E14' } : jahresFarbe(song.year, jahre.length ? jahre : [song.year || 2000]);
  var el = document.createElement('div');
  el.className = 'pcard pcard-back';
  el.style.background = farbe.bg;
  el.style.color = farbe.fg;
  el.style.position = 'relative';
  if (px) {
    el.style.width = px + 'px'; el.style.height = px + 'px';
    el.style.display = 'flex'; el.style.flexDirection = 'column';
    el.style.alignItems = 'center'; el.style.justifyContent = 'center';
    el.style.padding = '8px'; el.style.textAlign = 'center';
  }
  var a = document.createElement('div'); a.className = 'pa'; a.textContent = song.artist;
  var y = document.createElement('div'); y.className = 'py'; y.textContent = song.year || '?';
  var t = document.createElement('div'); t.className = 'pt'; t.textContent = song.title;
  if (px) {
    a.style.cssText = 'font-family:var(--display);font-weight:800;font-size:9px;line-height:1.15';
    y.style.cssText = 'font-family:var(--display);font-weight:900;font-size:34px;line-height:1';
    t.style.cssText = 'font-family:var(--display);font-weight:800;font-size:9px;line-height:1.15;margin-top:2px';
  }
  el.appendChild(a); el.appendChild(y); el.appendChild(t);
  if (d.label) {
    var lab = document.createElement('div');
    lab.className = 'plabel2';
    lab.textContent = d.label;
    el.appendChild(lab);
  }
  return el;
}

/* ---------- Druckbogen ---------- */
var SEITE = { spalten: 4, zeilen: 5, karte: 50, randX: 5, randY: 23.5 };

function platziere(el, spalte, zeile) {
  el.style.left = (SEITE.randX + spalte * SEITE.karte) + 'mm';
  el.style.top = (SEITE.randY + zeile * SEITE.karte) + 'mm';
  if (deck.design.borders) el.classList.add('cut');
}

function baueDruck() {
  if (!deck.songs.length) { toast('Noch keine Karten in der Liste'); return; }
  var fehlend = deck.songs.filter(function (s) { return !s.year; });
  if (fehlend.length) {
    openModal({
      title: 'Jahre fehlen',
      text: fehlend.length + ' Karten haben noch kein Jahr. Trage es in der Liste nach \u2013 sonst steht auf der R\u00fcckseite ein Fragezeichen.',
      primary: 'Trotzdem drucken',
      onPrimary: druckStarten,
      secondary: 'Zur\u00fcck'
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
    vorn.style.background = (deck.design.theme === 'light') ? '#FFFFFF' : '#0B0E14';
    teil.forEach(function (s, idx) {
      var k = kartenVorderseite(s);
      platziere(k, idx % SEITE.spalten, Math.floor(idx / SEITE.spalten));
      vorn.appendChild(k);
    });
    root.appendChild(vorn);

    var hinten = document.createElement('div');
    hinten.className = 'sheet-page';
    hinten.style.background = '#FFFFFF';
    teil.forEach(function (s, idx) {
      var k = kartenRueckseite(s, jahre);
      /* Spalten spiegeln – sonst landet die Rückseite auf der falschen Karte */
      platziere(k, (SEITE.spalten - 1) - (idx % SEITE.spalten), Math.floor(idx / SEITE.spalten));
      hinten.appendChild(k);
    });
    root.appendChild(hinten);
  }

  root.hidden = false;
  setTimeout(function () {
    window.print();
    setTimeout(function () { root.hidden = true; root.innerHTML = ''; }, 1000);
  }, 120);
}

/* ---------- Events ---------- */
document.addEventListener('DOMContentLoaded', function () {
  $('#btnCards').addEventListener('click', openCards);
  $('#btnCardsBack').addEventListener('click', function () { showScreen('screen-home'); });
  $('#btnCardSearch').addEventListener('click', onSearch);
  $('#cardSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') onSearch(); });
  $('#btnCardLinks').addEventListener('click', onAddLinks);
  $('#btnCardsPrint').addEventListener('click', baueDruck);
  $('#btnCardsClear').addEventListener('click', function () {
    if (!deck.songs.length) return;
    openModal({
      title: 'Alle Karten löschen?',
      text: 'Die Liste mit ' + deck.songs.length + ' Songs wird geleert. Das Design bleibt erhalten.',
      primary: 'Löschen',
      onPrimary: function () { deck.songs = []; deckSave(); renderDeck(); },
      secondary: 'Abbrechen'
    });
  });

  $('#btnCardsDesign').addEventListener('click', function () {
    applyDesignInputs();
    var s = $('#designSheet');
    s.classList.add('open');
    s.setAttribute('aria-hidden', 'false');
  });
  $('#btnDesignClose').addEventListener('click', function () {
    var s = $('#designSheet');
    s.classList.remove('open');
    s.setAttribute('aria-hidden', 'true');
  });

  $('#dsTheme').addEventListener('change', function () { deck.design.theme = this.value; deckSave(); renderDesignPreview(); });
  $('#dsAccent').addEventListener('input', function () { deck.design.accent = this.value; deckSave(); renderDesignPreview(); });
  $('#dsLabel').addEventListener('input', function () { deck.design.label = this.value; deckSave(); renderDesignPreview(); });
  $('#dsBorders').addEventListener('click', function () {
    deck.design.borders = !deck.design.borders;
    this.setAttribute('aria-checked', deck.design.borders ? 'true' : 'false');
    deckSave();
  });
  $('#dsGradient').addEventListener('click', function () {
    deck.design.gradient = !deck.design.gradient;
    this.setAttribute('aria-checked', deck.design.gradient ? 'true' : 'false');
    deckSave(); renderDesignPreview();
  });
  $('#dsImage').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('Bild ist zu groß – bitte unter 2 MB'); return; }
    var r = new FileReader();
    r.onload = function () {
      deck.design.image = r.result;
      try { localStorage.setItem(DECK_IMG, r.result); } catch (e) { toast('Bild konnte nicht gespeichert werden'); }
      renderDesignPreview();
    };
    r.readAsDataURL(f);
  });
  $('#dsImageClear').addEventListener('click', function () {
    deck.design.image = null;
    try { localStorage.removeItem(DECK_IMG); } catch (e) { /* egal */ }
    $('#dsImage').value = '';
    renderDesignPreview();
  });
});
