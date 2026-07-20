/* ============================================================
   haptics.js — vibration + WebAudio tick sounds
   Vibration works on Android browsers; on desktop it no-ops.
   Audio context is created lazily on first user gesture.
   ============================================================ */

const Haptics = (() => {
  let ctx = null;

  function ensureCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Prime audio on the first real user gesture (autoplay policy)
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
    window.addEventListener(ev, ensureCtx, { once: true, passive: true }));

  function click(freq, gainVal, dur) {
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(gainVal, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function vibrate(pattern, effect) {
    // Android WebView: use real system haptic effects via the native bridge
    // (navigator.vibrate is not supported inside WebView)
    if (window.NativeGallery) {
      try { NativeGallery.haptic(effect); return; } catch { /* fall through */ }
    }
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* ignore */ } }
  }

  return {
    /** light detent — every month tick while scrubbing */
    tick() { vibrate(8, 'tick'); click(2100, 0.045, 0.03); },
    /** stronger detent — year boundary */
    heavyTick() { vibrate([14], 'heavy'); click(1400, 0.07, 0.05); },
    /** selection / toggle feedback */
    select() { vibrate(10, 'click'); click(1800, 0.05, 0.035); },
    /** success (e.g. favorite added) */
    success() { vibrate([10, 30, 12], 'double'); click(1567, 0.05, 0.06); setTimeout(() => click(2093, 0.05, 0.08), 70); },
    /** warning (delete) */
    warn() { vibrate([20, 40, 20], 'warn'); click(880, 0.06, 0.09); },
  };
})();
