/* ============================================================
   app.js — views, navigation, grids, selection, search
   ============================================================ */

const App = (() => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  // ---------- state ----------
  let currentTab = 'library';
  let libraryMode = 'all';        // 'years' | 'months' | 'all'
  let libraryCols = 4;
  let scrubber = null;
  let sections = [];              // [{key, year, month, label, el, items}]
  let selecting = false;
  const selection = new Set();
  let currentList = [];           // items behind the currently visible grid
  let detail = null;              // {kind:'album'|'videos'|'trash'|'hidden'|'search', id?}

  // ---------- helpers ----------
  function monthKey(t) { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth(); }

  function groupByMonth(items) {
    const map = new Map();
    for (const it of items) {
      const k = monthKey(it.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()].map(([key, arr]) => {
      const [y, m] = key.split('-').map(Number);
      return { key, year: y, month: m, name: MONTHS[m], label: MONTHS[m] + ' ' + y, short: MONTHS_S[m], items: arr };
    });
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- grid cell ----------
  function makeCell(it, list) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.id = it.id;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = Data.thumbUri(it);
    img.alt = '';
    cell.appendChild(img);
    if (it.type === 'video') {
      const b = document.createElement('span');
      b.className = 'badge-dur';
      b.textContent = Math.floor(it.duration / 60) + ':' + String(it.duration % 60).padStart(2, '0');
      cell.appendChild(b);
    }
    if (Data.isFavorite(it.id)) {
      const f = document.createElement('span');
      f.className = 'badge-fav';
      f.textContent = '♥';
      cell.appendChild(f);
    }
    const check = document.createElement('span');
    check.className = 'check';
    cell.appendChild(check);

    cell.addEventListener('click', () => {
      if (selecting) { toggleSelect(it.id, cell); return; }
      const idx = list.indexOf(it);
      Viewer.open(list.slice(), idx, (why) => { if (why !== 'close') refreshCurrent(); });
    });
    let pressTimer = null;
    cell.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => { if (!selecting) { enterSelect(); toggleSelect(it.id, cell); } }, 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      cell.addEventListener(ev, () => clearTimeout(pressTimer)));

    if (selection.has(it.id)) cell.classList.add('selected');
    return cell;
  }

  function renderGrid(container, items, cols) {
    container.innerHTML = '';
    container.style.setProperty('--cols', cols);
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(makeCell(it, items));
    container.appendChild(frag);
  }

  // ---------- selection ----------
  function enterSelect() {
    selecting = true;
    selection.clear();
    Haptics.select();
    document.body.classList.add('selecting');
    $$('.select-toggle').forEach(b => b.textContent = 'Cancel');
    updateSelectBar();
  }
  function exitSelect() {
    selecting = false;
    selection.clear();
    document.body.classList.remove('selecting');
    $$('.select-toggle').forEach(b => b.textContent = 'Select');
    $$('.cell.selected').forEach(c => c.classList.remove('selected'));
    updateSelectBar();
  }
  function toggleSelect(id, cell) {
    if (selection.has(id)) selection.delete(id); else selection.add(id);
    cell.classList.toggle('selected', selection.has(id));
    Haptics.select();
    updateSelectBar();
  }
  function updateSelectBar() {
    const bar = $('#select-bar');
    bar.classList.toggle('show', selecting);
    $('#sel-count').textContent = selection.size ? `${selection.size} selected` : 'Select items';
    const inTrash = detail && detail.kind === 'trash';
    $('#sel-restore').style.display = inTrash ? '' : 'none';
    $('#sel-fav').style.display = inTrash ? 'none' : '';
    $('#sel-share').style.display = inTrash ? 'none' : '';
    $('#sel-del').textContent = inTrash ? 'Delete Forever' : '🗑';
  }

  function bindSelectBar() {
    $('#sel-fav').addEventListener('click', () => {
      if (!selection.size) return;
      selection.forEach(id => { if (!Data.isFavorite(id)) Data.toggleFavorite(id); });
      Haptics.success();
      toast(`Added ${selection.size} to Favourites`);
      exitSelect(); refreshCurrent();
    });
    $('#sel-share').addEventListener('click', async () => {
      if (!selection.size) return;
      if (navigator.share) { try { await navigator.share({ text: `${selection.size} items` }); } catch { } }
      else toast('Sharing not available on this device');
    });
    $('#sel-del').addEventListener('click', () => {
      if (!selection.size) return;
      Haptics.warn();
      if (detail && detail.kind === 'trash') {
        Data.deleteForever([...selection]);
        toast('Deleted permanently');
      } else {
        Data.moveToTrash([...selection]);
        toast(`Moved ${selection.size} to Recently Deleted`);
      }
      exitSelect(); refreshCurrent();
    });
    $('#sel-restore').addEventListener('click', () => {
      if (!selection.size) return;
      Data.restore([...selection]);
      Haptics.success();
      toast('Restored');
      exitSelect(); refreshCurrent();
    });
  }

  // ---------- LIBRARY ----------
  function renderLibrary(keepScroll) {
    const scroll = $('#library-scroll');
    const prevTop = keepScroll ? scroll.scrollTop : null;
    const host = $('#library-content');
    host.innerHTML = '';
    sections = [];
    if (Data.nativeDenied) {
      const b = document.createElement('button');
      b.className = 'perm-banner';
      b.innerHTML = '<strong>Allow access to your photos</strong><span>Showing demo images. Tap to grant permission.</span>';
      b.addEventListener('click', () => { try { NativeGallery.requestPermission(); } catch { } });
      host.appendChild(b);
    }
    const items = Data.library();
    currentList = items;
    const groups = groupByMonth(items);

    if (libraryMode === 'all') {
      for (const g of groups) {
        const sec = document.createElement('section');
        sec.className = 'month-section';
        const h = document.createElement('h2');
        h.className = 'month-header';
        h.textContent = g.label;
        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.style.setProperty('--cols', libraryCols);
        for (const it of g.items) grid.appendChild(makeCell(it, items));
        sec.append(h, grid);
        host.appendChild(sec);
        sections.push({ ...g, el: sec });
      }
    } else if (libraryMode === 'months') {
      const wrap = document.createElement('div');
      wrap.className = 'cards';
      for (const g of groups) {
        wrap.appendChild(makeCard(g.items[0], g.label, () => {
          setLibraryMode('all');
          jumpToMonth(sections.findIndex(s => s.key === g.key), true);
        }));
      }
      host.appendChild(wrap);
    } else { // years
      const byYear = new Map();
      groups.forEach(g => { if (!byYear.has(g.year)) byYear.set(g.year, g); });
      const wrap = document.createElement('div');
      wrap.className = 'cards years';
      for (const [year, g] of byYear) {
        wrap.appendChild(makeCard(g.items[0], String(year), () => {
          setLibraryMode('all');
          jumpToMonth(sections.findIndex(s => s.year === year), true);
        }));
      }
      host.appendChild(wrap);
    }

    // scrubber only makes sense in "All"
    $('#scrubber').style.display = libraryMode === 'all' ? '' : 'none';
    if (libraryMode === 'all') {
      scrubber.setMonths(groups.map(g => ({ key: g.key, year: g.year, month: g.month, name: g.name, label: g.label })));
      const settle = () => {
        if (prevTop != null) scroll.scrollTop = prevTop;
        else scroll.scrollTop = scroll.scrollHeight;   // newest at bottom, like iPhone
        syncScrubberToScroll();
      };
      requestAnimationFrame(settle);
      setTimeout(settle, 60); // re-apply once layout fully settles
    }
  }

  function makeCard(coverItem, label, onTap) {
    const card = document.createElement('button');
    card.className = 'photo-card';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = Data.thumbUri(coverItem);
    const lab = document.createElement('span');
    lab.className = 'card-label';
    lab.textContent = label;
    card.append(img, lab);
    card.addEventListener('click', () => { Haptics.select(); onTap(); });
    return card;
  }

  function setLibraryMode(mode) {
    libraryMode = mode;
    $$('#lib-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    renderLibrary();
  }

  function jumpToMonth(i, smooth) {
    if (i < 0 || !sections[i]) return;
    const scroll = $('#library-scroll');
    const top = sections[i].el.offsetTop - 8;
    scroll.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }

  let scrollRaf = false;
  function syncScrubberToScroll() {
    if (!sections.length || libraryMode !== 'all') return;
    const scroll = $('#library-scroll');
    const pos = scroll.scrollTop + scroll.clientHeight * 0.35;
    let idx = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].el.offsetTop <= pos) idx = i; else break;
    }
    scrubber.setIndex(idx);
  }

  // ---------- ALBUMS ----------
  function renderAlbums() {
    const host = $('#albums-content');
    host.innerHTML = '';

    const myAlbums = document.createElement('div');
    myAlbums.innerHTML = '<h2 class="sec-title">My Albums</h2>';
    const gridA = document.createElement('div');
    gridA.className = 'album-grid';
    for (const a of Data.ALBUM_DEFS) {
      const items = Data.albumItems(a.id);
      if (!items.length) continue;
      gridA.appendChild(albumCover(items[items.length - 1], a.name, items.length,
        () => openDetail({ kind: 'album', id: a.id, title: a.name })));
    }
    myAlbums.appendChild(gridA);

    const types = document.createElement('div');
    types.innerHTML = '<h2 class="sec-title">Media Types</h2>';
    const list = document.createElement('div');
    list.className = 'row-list';
    list.append(
      rowItem('▶', 'Videos', Data.videos().length, () => openDetail({ kind: 'videos', title: 'Videos' })),
      rowItem('♥', 'Favourites', Data.favorites().length, () => switchTab('favourites')),
    );
    types.appendChild(list);

    const util = document.createElement('div');
    util.innerHTML = '<h2 class="sec-title">Utilities</h2>';
    const list2 = document.createElement('div');
    list2.className = 'row-list';
    list2.append(
      rowItem('👁', 'Hidden', Data.hiddenItems().length, () => openDetail({ kind: 'hidden', title: 'Hidden' })),
      rowItem('🗑', 'Recently Deleted', Data.deletedItems().length, () => openDetail({ kind: 'trash', title: 'Recently Deleted' })),
    );
    util.appendChild(list2);

    host.append(myAlbums, types, util);
  }

  function albumCover(coverItem, name, count, onTap) {
    const b = document.createElement('button');
    b.className = 'album-cover';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = Data.thumbUri(coverItem);
    const meta = document.createElement('div');
    meta.className = 'album-meta';
    meta.innerHTML = `<span class="n">${name}</span><span class="c">${count}</span>`;
    b.append(img, meta);
    b.addEventListener('click', () => { Haptics.select(); onTap(); });
    return b;
  }

  function rowItem(icon, name, count, onTap) {
    const b = document.createElement('button');
    b.className = 'row-item';
    b.innerHTML = `<span class="ic">${icon}</span><span class="nm">${name}</span><span class="ct">${count}</span><span class="chev">›</span>`;
    b.addEventListener('click', () => { Haptics.select(); onTap(); });
    return b;
  }

  // ---------- DETAIL (album / videos / trash / hidden) ----------
  function detailItems() {
    switch (detail.kind) {
      case 'album': return Data.albumItems(detail.id);
      case 'videos': return Data.videos();
      case 'trash': return Data.deletedItems();
      case 'hidden': return Data.hiddenItems();
      default: return [];
    }
  }

  function openDetail(d) {
    detail = d;
    exitSelect();
    $('#detail-title').textContent = d.title;
    $('#view-detail').classList.add('open');
    renderDetail();
  }

  function renderDetail() {
    const items = detailItems();
    currentList = items;
    $('#detail-sub').textContent = detail.kind === 'trash'
      ? 'Items are removed after 30 days'
      : `${items.length} items`;
    renderGrid($('#detail-grid'), items, 4);
    if (!items.length) $('#detail-grid').innerHTML = '<p class="empty">Nothing here yet</p>';
  }

  function closeDetail() {
    $('#view-detail').classList.remove('open');
    detail = null;
    exitSelect();
    renderAlbums();
  }

  // ---------- FAVOURITES ----------
  function renderFavourites() {
    const items = Data.favorites();
    currentList = items;
    renderGrid($('#fav-grid'), items, 4);
    if (!items.length) $('#fav-grid').innerHTML = '<p class="empty">No favourites yet — tap ♥ on any photo</p>';
  }

  // ---------- SEARCH ----------
  function runSearch(q) {
    q = q.trim().toLowerCase();
    const host = $('#search-results');
    if (!q) { host.innerHTML = '<p class="empty">Search by month, year, album, “video”…</p>'; return; }
    const items = Data.library().filter(it => {
      const d = new Date(it.date);
      const hay = [
        MONTHS[d.getMonth()], MONTHS_S[d.getMonth()], String(d.getFullYear()),
        it.album, it.type,
        (Data.ALBUM_DEFS.find(a => a.id === it.album) || {}).name || '',
      ].join(' ').toLowerCase();
      return q.split(/\s+/).every(w => hay.includes(w));
    });
    currentList = items;
    host.innerHTML = `<p class="search-count">${items.length} results</p>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.setProperty('--cols', 4);
    items.forEach(it => grid.appendChild(makeCell(it, items)));
    host.appendChild(grid);
  }

  // ---------- refresh / tabs ----------
  function refreshCurrent() {
    if (detail) { renderDetail(); return; }
    switch (currentTab) {
      case 'library': renderLibrary(true); break;
      case 'albums': renderAlbums(); break;
      case 'favourites': renderFavourites(); break;
      case 'search': runSearch($('#search-input').value); break;
    }
  }

  function switchTab(tab) {
    if (detail) closeDetail();
    exitSelect();
    currentTab = tab;
    $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
    // fresh render on tab switch: Library opens at the newest photos
    if (tab === 'library') renderLibrary();
    else refreshCurrent();
  }

  // ---------- init ----------
  function init() {
    scrubber = new TimeWheel(
      $('#scrubber'),
      (i) => jumpToMonth(i, false),
      (i) => jumpToMonth(i, true),
    );

    $('#library-scroll').addEventListener('scroll', () => {
      if (scrollRaf) return;
      scrollRaf = true;
      requestAnimationFrame(() => { scrollRaf = false; syncScrubberToScroll(); });
    }, { passive: true });

    $$('#lib-seg button').forEach(b =>
      b.addEventListener('click', () => { Haptics.select(); setLibraryMode(b.dataset.mode); }));

    $('#lib-zoom').addEventListener('click', () => {
      libraryCols = libraryCols === 4 ? 3 : libraryCols === 3 ? 5 : 4;
      Haptics.select();
      renderLibrary(true);
    });

    $$('.select-toggle').forEach(b =>
      b.addEventListener('click', () => selecting ? exitSelect() : enterSelect()));

    $$('.tab').forEach(b => b.addEventListener('click', () => { Haptics.select(); switchTab(b.dataset.tab); }));
    $('#detail-back').addEventListener('click', () => { Haptics.select(); closeDetail(); });
    $('#search-input').addEventListener('input', (e) => runSearch(e.target.value));

    bindSelectBar();
    switchTab('library');

    // Android back button: unwind UI state before exiting the app
    window.handleBack = () => {
      const v = document.querySelector('.viewer');
      if (v && !v.classList.contains('hidden')) { Viewer.close(); return true; }
      if (selecting) { exitSelect(); return true; }
      if (detail) { closeDetail(); return true; }
      if (currentTab !== 'library') { switchTab('library'); return true; }
      return false;
    };
  }

  document.addEventListener('DOMContentLoaded', init);

  return { toast, refreshCurrent };
})();
