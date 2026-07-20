/* ============================================================
   scrubber.js — iOS-18 style time wheel (like the Clock app
   picker). A vertical wheel of "Month Year" rows that curves
   away at the edges, snaps to each month with a haptic +
   audible detent, and drives the Library grid to that month.
   ============================================================ */

class TimeWheel {
  static ROW_H = 34;      // px per row
  static VISIBLE = 5;     // rows visible in the window

  /**
   * @param {HTMLElement} root      container (#scrubber)
   * @param {(index:number)=>void} onScrub  fires on every detent while spinning
   * @param {(index:number)=>void} onCommit fires when the wheel settles
   */
  constructor(root, onScrub, onCommit) {
    this.root = root;
    this.onScrub = onScrub;
    this.onCommit = onCommit;
    this.months = [];
    this.index = 0;
    this.silent = false;     // true while we position the wheel programmatically
    this.userSpinning = false;
    this.rows = [];

    root.classList.add('timewheel');
    root.innerHTML = `
      <div class="tw-highlight"></div>
      <div class="tw-fade top"></div>
      <div class="tw-fade bottom"></div>
      <div class="tw-scroll"><div class="tw-pad top"></div><div class="tw-rows"></div><div class="tw-pad bottom"></div></div>`;
    this.scroller = root.querySelector('.tw-scroll');
    this.rowsEl = root.querySelector('.tw-rows');

    const pad = (TimeWheel.ROW_H * (TimeWheel.VISIBLE - 1)) / 2;
    root.querySelectorAll('.tw-pad').forEach(p => p.style.height = pad + 'px');
    root.style.setProperty('--tw-h', TimeWheel.ROW_H * TimeWheel.VISIBLE + 'px');
    root.style.setProperty('--tw-row', TimeWheel.ROW_H + 'px');

    // process directly in the event — rAF gets throttled in background
    // renderers and would drop detents; this handler is cheap.
    this.scroller.addEventListener('scroll', () => this._onScroll(), { passive: true });

    // detect user interaction so programmatic sync never fires detents
    this.scroller.addEventListener('pointerdown', () => { this.userSpinning = true; this.silent = false; });
    this.scroller.addEventListener('wheel', () => { this.userSpinning = true; this.silent = false; }, { passive: true });

    // settle detection: scrollend where supported, timeout fallback
    if ('onscrollend' in window) {
      this.scroller.addEventListener('scrollend', () => this._settled());
    } else {
      this.scroller.addEventListener('scroll', () => {
        clearTimeout(this._settleT);
        this._settleT = setTimeout(() => this._settled(), 140);
      }, { passive: true });
    }
  }

  setMonths(months) {
    this.months = months;
    this.rowsEl.innerHTML = '';
    this.rows = months.map(m => {
      const row = document.createElement('div');
      row.className = 'tw-row';
      row.innerHTML = `<span class="m">${m.name}</span><span class="y">${m.year}</span>`;
      this.rowsEl.appendChild(row);
      return row;
    });
    this.setIndex(Math.min(this.index, months.length - 1), true);
  }

  /** position the wheel from outside (grid scroll sync) — no detents */
  setIndex(i, force) {
    if (this.userSpinning && !force) return;
    i = Math.max(0, Math.min(this.months.length - 1, i));
    this.index = i;
    this.silent = true;
    this.scroller.scrollTop = i * TimeWheel.ROW_H;
    this._applyCurve();
  }

  _centerIndex() {
    return Math.max(0, Math.min(this.months.length - 1,
      Math.round(this.scroller.scrollTop / TimeWheel.ROW_H)));
  }

  _onScroll() {
    const i = this._centerIndex();
    this._applyCurve();
    if (i !== this.index) {
      const prev = this.months[this.index], next = this.months[i];
      this.index = i;
      if (!this.silent) {
        // detent: heavier when the year rolls over
        (prev && next && prev.year !== next.year) ? Haptics.heavyTick() : Haptics.tick();
        this.onScrub(i);
      }
    }
  }

  _settled() {
    const wasUser = this.userSpinning && !this.silent;
    this.userSpinning = false;
    this.silent = false;
    // re-derive from the final resting position — scroll events may have
    // been coalesced or dropped while the wheel was animating
    const i = this._centerIndex();
    this.index = i;
    this._applyCurve();
    if (wasUser) this.onCommit(i);
  }

  /** iOS drum effect: rows rotate away + fade with distance from center */
  _applyCurve() {
    const center = this.scroller.scrollTop / TimeWheel.ROW_H;
    const from = Math.max(0, Math.floor(center) - 4);
    const to = Math.min(this.rows.length - 1, Math.ceil(center) + 4);
    for (let i = from; i <= to; i++) {
      const d = i - center;
      const abs = Math.min(Math.abs(d), 3.2);
      this.rows[i].style.transform =
        `rotateX(${(-d * 16).toFixed(1)}deg) scale(${(1 - abs * 0.055).toFixed(3)}) translateZ(0)`;
      this.rows[i].style.opacity = (1 - abs * 0.28).toFixed(2);
      this.rows[i].classList.toggle('on', Math.round(center) === i);
    }
    // clear styles on rows that scrolled out of the curve window
    if (this._lastRange) {
      const [f0, t0] = this._lastRange;
      for (let i = f0; i <= t0; i++) {
        if (i < from || i > to) {
          if (this.rows[i]) { this.rows[i].style.opacity = 0.06; this.rows[i].classList.remove('on'); }
        }
      }
    }
    this._lastRange = [from, to];
  }
}
