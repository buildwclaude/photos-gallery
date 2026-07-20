/* ============================================================
   data.js — demo media library + persistence
   Generates a deterministic set of "photos" and "videos" as
   lightweight SVG data-URIs (no network, instant loads).
   Favorites / deleted / hidden state persists in localStorage.
   ============================================================ */

const Data = (() => {
  // --- seeded RNG (mulberry32) ---
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PALETTES = [
    ['#ff9a9e', '#fad0c4', '#fbc2eb'], ['#a18cd1', '#fbc2eb', '#f6d365'],
    ['#f6d365', '#fda085', '#f5576c'], ['#84fab0', '#8fd3f4', '#a6c1ee'],
    ['#a1c4fd', '#c2e9fb', '#d4fc79'], ['#fccb90', '#d57eeb', '#e0c3fc'],
    ['#e0c3fc', '#8ec5fc', '#43e97b'], ['#4facfe', '#00f2fe', '#38f9d7'],
    ['#43e97b', '#38f9d7', '#4facfe'], ['#fa709a', '#fee140', '#ff9a9e'],
    ['#30cfd0', '#330867', '#a18cd1'], ['#667eea', '#764ba2', '#f093fb'],
    ['#2b5876', '#4e4376', '#667eea'], ['#ff758c', '#ff7eb3', '#fccb90'],
    ['#c79081', '#dfa579', '#f6d365'], ['#00c6fb', '#005bea', '#30cfd0'],
    ['#f83600', '#f9d423', '#fa709a'], ['#5ee7df', '#b490ca', '#a1c4fd'],
  ];

  const ALBUM_DEFS = [
    { id: 'camera',      name: 'Camera',      weight: 42 },
    { id: 'screenshots', name: 'Screenshots', weight: 14 },
    { id: 'downloads',   name: 'Downloads',   weight: 14 },
    { id: 'whatsapp',    name: 'WhatsApp',    weight: 16 },
    { id: 'selfies',     name: 'Selfies',     weight: 8 },
    { id: 'travel',      name: 'Travel',      weight: 6 },
  ];

  function pickAlbum(r) {
    const total = ALBUM_DEFS.reduce((s, a) => s + a.weight, 0);
    let x = r() * total;
    for (const a of ALBUM_DEFS) { x -= a.weight; if (x <= 0) return a.id; }
    return 'camera';
  }

  // --- SVG scene generators (make "photos" look varied) ---
  function svgLandscape(r, [c1, c2, c3], w, h) {
    const sunX = 20 + r() * 60, sunY = 15 + r() * 25, sunR = 6 + r() * 8;
    const m1 = 45 + r() * 15, m2 = 55 + r() * 20;
    return `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#s)"/>
      <circle cx="${sunX}%" cy="${sunY}%" r="${sunR}%" fill="#fffbe8" opacity="0.9"/>
      <path d="M0 ${h} L0 ${h * m1 / 100} L${w * 0.35} ${h * (m1 - 22) / 100} L${w * 0.62} ${h * m1 / 100} L${w} ${h * (m1 - 12) / 100} L${w} ${h} Z" fill="${c3}" opacity="0.75"/>
      <path d="M0 ${h} L0 ${h * m2 / 100} L${w * 0.28} ${h * (m2 - 16) / 100} L${w * 0.55} ${h * m2 / 100} L${w * 0.8} ${h * (m2 - 20) / 100} L${w} ${h * m2 / 100} L${w} ${h} Z" fill="#1e2740" opacity="0.55"/>`;
  }

  function svgBlobs(r, [c1, c2, c3], w, h) {
    let s = `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#s)"/>`;
    for (let i = 0; i < 4; i++) {
      s += `<circle cx="${(r() * 100).toFixed(1)}%" cy="${(r() * 100).toFixed(1)}%" r="${(8 + r() * 22).toFixed(1)}%" fill="${i % 2 ? c3 : '#ffffff'}" opacity="${(0.15 + r() * 0.3).toFixed(2)}"/>`;
    }
    return s;
  }

  function svgCity(r, [c1, c2, c3], w, h) {
    let s = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#s)"/>`;
    let x = 0;
    while (x < w) {
      const bw = w * (0.06 + r() * 0.1), bh = h * (0.25 + r() * 0.45);
      s += `<rect x="${x.toFixed(0)}" y="${(h - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="#141b33" opacity="${(0.65 + r() * 0.3).toFixed(2)}"/>`;
      x += bw + w * 0.015;
    }
    s += `<circle cx="${20 + r() * 60}%" cy="${12 + r() * 15}%" r="${5 + r() * 5}%" fill="${c3}" opacity="0.85"/>`;
    return s;
  }

  function svgWaves(r, [c1, c2, c3], w, h) {
    let s = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#s)"/>`;
    for (let i = 0; i < 3; i++) {
      const y = h * (0.5 + i * 0.16), a = h * (0.05 + r() * 0.05);
      s += `<path d="M0 ${y} Q ${w * 0.25} ${y - a}, ${w * 0.5} ${y} T ${w} ${y} L${w} ${h} L0 ${h} Z" fill="${i % 2 ? c3 : '#ffffff'}" opacity="${0.2 + i * 0.12}"/>`;
    }
    return s;
  }

  const SCENES = [svgLandscape, svgBlobs, svgCity, svgWaves];

  function buildSvg(item, w, h) {
    const r = rng(item.seed);
    const pal = PALETTES[item.seed % PALETTES.length];
    const scene = SCENES[item.seed % SCENES.length];
    const body = scene(r, pal, w, h);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  }

  function toUri(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // --- library generation: ~260 items across Jan 2021 → Jul 2026 ---
  const START = new Date(2021, 0, 5).getTime();
  const END = new Date(2026, 6, 18).getTime();

  function generate() {
    const r = rng(20260719);
    const items = [];
    let id = 0;
    // cluster shots into "moments": bursts of 2–7 items on the same day
    let t = START;
    while (t < END && items.length < 420) {
      t += (3 + r() * 15) * 86400000; // gap of 3–18 days between moments
      const burst = 1 + Math.floor(r() * 3);
      const album = pickAlbum(r);
      for (let i = 0; i < burst && t < END; i++) {
        const seed = 7000 + id * 13;
        const isVideo = r() < 0.14;
        const portrait = r() < 0.3;
        items.push({
          id: 'm' + id++,
          seed,
          type: isVideo ? 'video' : 'photo',
          date: t + i * (60000 * (2 + r() * 40)),
          album,
          duration: isVideo ? Math.round(4 + r() * 115) : 0,
          w: portrait ? 1080 : 1920,
          h: portrait ? 1920 : 1080,
        });
      }
    }
    items.sort((a, b) => a.date - b.date);
    return items;
  }

  // --- persisted user state ---
  const LS_KEY = 'gallery.state.v1';
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      return {
        favorites: new Set(s.favorites || []),
        deleted: new Set(s.deleted || []),
        hidden: new Set(s.hidden || []),
      };
    } catch { return { favorites: new Set(), deleted: new Set(), hidden: new Set() }; }
  }
  function saveState() {
    localStorage.setItem(LS_KEY, JSON.stringify({
      favorites: [...state.favorites],
      deleted: [...state.deleted],
      hidden: [...state.hidden],
    }));
  }

  // --- native bridge (Android WebView) ---
  // MainActivity injects window.NativeGallery before the page loads.
  function loadNative() {
    try {
      if (!window.NativeGallery || NativeGallery.getState() !== 'granted') return null;
      const raw = JSON.parse(NativeGallery.getMedia());
      if (!raw.length) return null;
      return raw.map(m => ({
        id: 'n' + m.id, mid: m.id, seed: (m.id % 997) | 0,
        type: m.type, date: m.date, album: m.album || 'Other',
        duration: Math.round((m.duration || 0) / 1000),
        w: m.w || 1080, h: m.h || 1080, native: true,
      })).sort((a, b) => a.date - b.date);
    } catch { return null; }
  }

  const nativeItems = loadNative();
  const NATIVE = !!nativeItems;
  const all = nativeItems || generate();
  const state = loadState();
  // seed a few favorites on first demo run
  if (!NATIVE && !localStorage.getItem(LS_KEY)) {
    const r = rng(99);
    all.forEach(it => { if (r() < 0.08) state.favorites.add(it.id); });
    saveState();
  }

  // native albums come from the device's real buckets (Camera, WhatsApp, …)
  const ALBUM_LIST = NATIVE
    ? (() => {
        const counts = new Map();
        all.forEach(it => counts.set(it.album, (counts.get(it.album) || 0) + 1));
        return [...counts.entries()].sort((a, b) => b[1] - a[1])
          .map(([name]) => ({ id: name, name }));
      })()
    : ALBUM_DEFS;

  const byId = new Map(all.map(it => [it.id, it]));

  return {
    ALBUM_DEFS: ALBUM_LIST,
    native: NATIVE,
    nativeDenied: !!(window.NativeGallery && NativeGallery.getState() !== 'granted'),
    byId,
    thumbUri: (item) => item.native
      ? '/thumb/' + (item.type === 'video' ? 'vid' : 'img') + '/' + item.mid
      : toUri(buildSvg(item, 300, 300)),
    fullUri: (item) => item.native
      ? (item.type === 'video' ? '/thumb/vid/' + item.mid : '/media/img/' + item.mid)
      : toUri(buildSvg(item, item.w / 2, item.h / 2)),
    videoUri: (item) => item.native && item.type === 'video' ? '/media/vid/' + item.mid : null,

    /** visible library items (not deleted, not hidden), oldest → newest */
    library() { return all.filter(it => !state.deleted.has(it.id) && !state.hidden.has(it.id)); },
    favorites() { return this.library().filter(it => state.favorites.has(it.id)); },
    videos() { return this.library().filter(it => it.type === 'video'); },
    albumItems(albumId) { return this.library().filter(it => it.album === albumId); },
    deletedItems() { return all.filter(it => state.deleted.has(it.id)); },
    hiddenItems() { return all.filter(it => state.hidden.has(it.id) && !state.deleted.has(it.id)); },

    isFavorite(id) { return state.favorites.has(id); },
    toggleFavorite(id) {
      state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
      saveState();
      return state.favorites.has(id);
    },
    moveToTrash(ids) { ids.forEach(id => state.deleted.add(id)); saveState(); },
    restore(ids) { ids.forEach(id => state.deleted.delete(id)); saveState(); },
    deleteForever(ids) {
      ids.forEach(id => { state.deleted.delete(id); state.favorites.delete(id); state.hidden.delete(id); byId.delete(id); });
      for (let i = all.length - 1; i >= 0; i--) if (!byId.has(all[i].id)) all.splice(i, 1);
      saveState();
    },
    hide(ids) { ids.forEach(id => state.hidden.add(id)); saveState(); },
    unhide(ids) { ids.forEach(id => state.hidden.delete(id)); saveState(); },
  };
})();
