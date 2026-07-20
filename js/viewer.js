/* ============================================================
   viewer.js — full-screen media viewer
   Swipe between items, double-tap / pinch to zoom, favorite,
   share, info sheet, delete. iOS-style chrome that fades.
   ============================================================ */

const Viewer = (() => {
  let items = [];        // current playlist
  let index = 0;
  let onChange = null;   // notify app (favorites/deletes) to refresh grids

  let el, track, slides, topbar, bottombar, titleEl, subEl, favBtn, playBadge;
  let chromeVisible = true;

  // gesture state
  let startX = 0, startY = 0, dx = 0, dragging = false, swipeAxis = null;
  // zoom state
  let scale = 1, panX = 0, panY = 0;
  let pinch = null; // {d0, scale0, cx, cy}
  const pointers = new Map();

  function build() {
    el = document.createElement('div');
    el.className = 'viewer hidden';
    el.innerHTML = `
      <div class="viewer-track">
        <div class="viewer-slide prev"><img draggable="false"></div>
        <div class="viewer-slide cur"><img draggable="false"><video playsinline controls preload="metadata" style="display:none"></video><div class="viewer-play">▶</div></div>
        <div class="viewer-slide next"><img draggable="false"></div>
      </div>
      <div class="viewer-top">
        <button class="vbtn back" aria-label="Back">‹</button>
        <div class="viewer-title"><div class="t"></div><div class="s"></div></div>
        <button class="vbtn fav" aria-label="Favourite">♡</button>
      </div>
      <div class="viewer-bottom">
        <button class="vbtn share" aria-label="Share">⇪</button>
        <button class="vbtn info" aria-label="Info">ⓘ</button>
        <button class="vbtn trash" aria-label="Delete">🗑</button>
      </div>
      <div class="viewer-info hidden">
        <div class="sheet-grab"></div>
        <div class="info-body"></div>
      </div>`;
    document.body.appendChild(el);

    track = el.querySelector('.viewer-track');
    slides = [...el.querySelectorAll('.viewer-slide')];
    topbar = el.querySelector('.viewer-top');
    bottombar = el.querySelector('.viewer-bottom');
    titleEl = el.querySelector('.viewer-title .t');
    subEl = el.querySelector('.viewer-title .s');
    favBtn = el.querySelector('.vbtn.fav');
    playBadge = el.querySelector('.viewer-play');

    el.querySelector('.vbtn.back').addEventListener('click', close);
    favBtn.addEventListener('click', () => {
      const it = items[index];
      const fav = Data.toggleFavorite(it.id);
      fav ? Haptics.success() : Haptics.select();
      renderChrome();
      onChange && onChange('favorite');
    });
    el.querySelector('.vbtn.trash').addEventListener('click', () => {
      const it = items[index];
      Haptics.warn();
      Data.moveToTrash([it.id]);
      App.toast('Moved to Recently Deleted');
      items.splice(index, 1);
      onChange && onChange('delete');
      if (!items.length) return close();
      index = Math.min(index, items.length - 1);
      renderSlides();
      renderChrome();
    });
    el.querySelector('.vbtn.share').addEventListener('click', async () => {
      const it = items[index];
      if (navigator.share) {
        try { await navigator.share({ title: 'Photo', text: fmtDate(it.date) }); } catch { /* cancelled */ }
      } else {
        App.toast('Sharing not available on this device');
      }
    });
    el.querySelector('.vbtn.info').addEventListener('click', toggleInfo);

    // gestures
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('wheel', onWheel, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (el.classList.contains('hidden')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });
  }

  function fmtDate(t) {
    return new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fmtTime(t) {
    return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function open(list, i, changeCb) {
    if (!el) build();
    items = list;
    index = i;
    onChange = changeCb;
    resetZoom();
    el.classList.remove('hidden');
    document.body.classList.add('noscroll');
    chromeVisible = true;
    el.classList.remove('chrome-hidden');
    renderSlides();
    renderChrome();
  }

  function close() {
    const vid = el.querySelector('.viewer-slide.cur video');
    if (vid) { vid.pause(); vid.removeAttribute('src'); }
    el.classList.add('hidden');
    el.querySelector('.viewer-info').classList.add('hidden');
    document.body.classList.remove('noscroll');
    onChange && onChange('close');
  }

  function renderSlides() {
    resetZoom();
    const set = (slide, it) => {
      const img = slide.querySelector('img');
      if (it) { img.src = Data.fullUri(it); img.style.visibility = 'visible'; }
      else img.style.visibility = 'hidden';
    };
    set(slides[0], items[index - 1]);
    set(slides[1], items[index]);
    set(slides[2], items[index + 1]);
    track.style.transition = 'none';
    track.style.transform = 'translateX(-100%)';
    const it = items[index];
    // native videos play for real; demo videos just show a badge
    const vid = slides[1].querySelector('video');
    const vsrc = it ? Data.videoUri(it) : null;
    if (vsrc) {
      vid.src = vsrc;
      vid.style.display = 'block';
      slides[1].querySelector('img').style.display = 'none';
      playBadge.style.display = 'none';
    } else {
      vid.pause();
      vid.removeAttribute('src');
      vid.style.display = 'none';
      slides[1].querySelector('img').style.display = 'block';
      playBadge.style.display = it && it.type === 'video' ? 'flex' : 'none';
    }
  }

  function renderChrome() {
    const it = items[index];
    if (!it) return;
    titleEl.textContent = fmtDate(it.date);
    subEl.textContent = fmtTime(it.date) + (it.type === 'video' ? ` · ${Math.floor(it.duration / 60)}:${String(it.duration % 60).padStart(2, '0')}` : '');
    favBtn.textContent = Data.isFavorite(it.id) ? '♥' : '♡';
    favBtn.classList.toggle('on', Data.isFavorite(it.id));
    const sheet = el.querySelector('.viewer-info');
    if (!sheet.classList.contains('hidden')) fillInfo();
  }

  function fillInfo() {
    const it = items[index];
    const album = Data.ALBUM_DEFS.find(a => a.id === it.album);
    el.querySelector('.info-body').innerHTML = `
      <h3>${fmtDate(it.date)}</h3>
      <p class="muted">${fmtTime(it.date)}</p>
      <div class="info-row"><span>${it.type === 'video' ? 'Video' : 'Photo'}</span><span>${it.w} × ${it.h}</span></div>
      <div class="info-row"><span>Album</span><span>${album ? album.name : it.album}</span></div>
      ${it.type === 'video' ? `<div class="info-row"><span>Duration</span><span>${it.duration}s</span></div>` : ''}
      <div class="info-row"><span>File</span><span>IMG_${it.id.slice(1).padStart(4, '0')}.${it.type === 'video' ? 'MP4' : 'HEIC'}</span></div>`;
  }

  function toggleInfo() {
    const sheet = el.querySelector('.viewer-info');
    const show = sheet.classList.contains('hidden');
    if (show) fillInfo();
    sheet.classList.toggle('hidden', !show);
    Haptics.select();
  }

  function step(dir) {
    const ni = index + dir;
    if (ni < 0 || ni >= items.length) { snapBack(); return; }
    track.style.transition = 'transform 0.28s cubic-bezier(0.25,0.9,0.3,1)';
    track.style.transform = `translateX(${-100 - dir * 100}%)`;
    Haptics.tick();
    setTimeout(() => { index = ni; renderSlides(); renderChrome(); }, 280);
  }

  function snapBack() {
    track.style.transition = 'transform 0.24s ease-out';
    track.style.transform = 'translateX(-100%)';
  }

  // ---- zoom helpers ----
  function resetZoom() { scale = 1; panX = 0; panY = 0; applyZoom(); }
  function applyZoom() {
    const img = slides[1].querySelector('img');
    if (img) img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  function onDblClick(e) {
    if (e.target.closest('.vbtn') || e.target.closest('.viewer-info')) return;
    if (scale > 1) resetZoom();
    else {
      scale = 2.5;
      const r = el.getBoundingClientRect();
      panX = (r.width / 2 - e.clientX) * 1.5;
      panY = (r.height / 2 - e.clientY) * 1.5;
      applyZoom();
    }
    Haptics.select();
  }
  function onWheel(e) {
    if (el.classList.contains('hidden')) return;
    e.preventDefault();
    scale = Math.max(1, Math.min(5, scale * (e.deltaY < 0 ? 1.12 : 0.89)));
    if (scale === 1) { panX = 0; panY = 0; }
    applyZoom();
  }

  // ---- pointer gestures ----
  function onDown(e) {
    if (e.target.closest('.vbtn') || e.target.closest('.viewer-info') || e.target.tagName === 'VIDEO') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale0: scale };
      dragging = false;
      return;
    }
    dragging = true;
    swipeAxis = null;
    startX = e.clientX; startY = e.clientY; dx = 0;
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      scale = Math.max(1, Math.min(5, pinch.scale0 * (d / pinch.d0)));
      applyZoom();
      return;
    }
    if (!dragging) return;

    if (scale > 1) { // pan while zoomed
      panX += e.clientX - startX; panY += e.clientY - startY;
      startX = e.clientX; startY = e.clientY;
      applyZoom();
      return;
    }
    dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!swipeAxis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      swipeAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (swipeAxis === 'x') {
      track.style.transition = 'none';
      track.style.transform = `translateX(calc(-100% + ${dx}px))`;
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) {
      pinch = null;
      if (scale < 1.05) resetZoom();
      return;
    }
    if (!dragging) return;
    dragging = false;
    if (scale > 1) return;
    if (swipeAxis === 'y' && Math.abs(e.clientY - startY) > 90) { close(); return; }
    if (swipeAxis === 'x' && Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    else if (swipeAxis === 'x') snapBack();
    else if (!swipeAxis) { // plain tap: toggle chrome
      chromeVisible = !chromeVisible;
      el.classList.toggle('chrome-hidden', !chromeVisible);
    }
  }

  return { open, close };
})();
