/* Phi timing: follows the standing rules in /home/box/.config/phi-timing-rules.md (rules 1-7). Read them before changing a number.
   - Every period is PHI^n s. Bonnie's elements use her ladder; Simmie-palette elements use their Bonnie slot x PHI^-1.5 (rule 4).
   - Start offsets: element k starts at period * frac(k * 0.6180339887) (golden angle), a negative CSS delay (rule 2).
   - Weather sweep (rule 6): the weather state shifts every NON-weather element's exponent by s steps
     (hot -1, sun -0.5, storm 0, cloud 0, rain +0.5, fog +1, clear night +1.5, deep night 00:00-05:00 Perth +2).
     The weather loop itself (faces, offering story, sticker sway) never sweeps. A new s takes effect at each element's next
     cycle boundary. Reduced motion ignores the sweep (s = 0). No weather data -> s = 0.
   - The message-status pulse (rule 7) is a separate layer with its own ladder: js/msg-pulse.js. It is never swept.
   Only the chat review preview (previews/chat/) and the chat-terminal-box side copy use this file. */
(function (g) {
  'use strict';
  const PHI = 1.6180339887, G = 0.6180339887, T0 = Date.now();
  const s = (n) => Math.pow(PHI, n);                 // fixed seconds (weather loop, one-shot UI transitions, functional waits)
  const ms = (n) => Math.round(s(n) * 1000);
  const frac = (k) => (k * G) % 1;
  const K = { blink: 1, faces: 2, askdad: 3, feed: 4, loopfx: 5, mlog: 6, animals: 7, space: 8, story: 9, sway: 10, slow: 11, other: 12 };
  const offset = (k, n) => s(n) * frac(k);
  const offsetMs = (k, n) => Math.round(offset(k, n) * 1000);
  const SIMMIE = -1.5;                               // rule 4
  const reduce = () => g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- rule 6: weather sweep
  const SWEEP = { hot: -1, sun: -0.5, storm: 0, cloud: 0, rain: 0.5, fog: 1, night: 1.5, deepnight: 2 };
  const perthHour = () => +new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', hour: 'numeric', hourCycle: 'h23' }).format(new Date()) % 24;
  let wx = null, wxForced = false, sw = 0; const subs = [];
  function sweepState() {                            // which row of the sweep table is active
    if (!wx) return null;
    if (wx === 'deepnight' || wxForced) return wx;  // a forced ?weather= preview state wins over the clock
    return perthHour() < 5 ? 'deepnight' : wx;       // 00:00-05:00 Perth is deep night whatever the sky
  }
  function recompute() {
    const st = sweepState(), v = reduce() || !st ? 0 : (SWEEP[st] ?? 0);
    if (v === sw) return; sw = v;
    document.documentElement.dataset.sweep = String(v);
    subs.forEach((f) => { try { f(v, st); } catch (e) {} });
    restyleAll();
    g.dispatchEvent(new CustomEvent('simmie:log', { detail: 'phi sweep ' + (v > 0 ? '+' : '') + v + ' (' + (st || 'no weather') + ')' }));
  }
  function setWeather(state, forced) { wx = state || null; wxForced = !!forced; recompute(); }
  setInterval(recompute, 60000 * s(3) | 0);          // re-check the deep-night clock every ~4.2 min (no network)
  const sweep = () => sw;
  const onSweep = (f) => { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); };
  // swept periods: Bonnie slot n, or Simmie (slot n x PHI^-1.5)
  const sws = (n) => s(n + sw), swms = (n) => ms(n + sw);
  const ss = (n) => s(n + SIMMIE + sw), ssms = (n) => ms(n + SIMMIE + sw);

  // ---- swept CSS animations: duration + golden delay set inline, re-timed only at the element's next cycle boundary
  const REG = [];  // { sel, n, simmie, k, sib }   sib: add the element's index among siblings to k (dots)
  function periodFor(r) { return s(r.n + (r.simmie ? SIMMIE : 0) + sw); }
  function kFor(r, el) { return r.sib ? r.k + Array.prototype.indexOf.call(el.parentNode.children, el) : r.k; }
  function stamp(el, r) {   // in global phase: as if it had been running since load at the current period
    const P = periodFor(r), t = (Date.now() - T0) / 1000, d = (t + P * frac(kFor(r, el))) % P;
    el.style.animationDuration = P.toFixed(3) + 's'; el.style.animationDelay = (-d).toFixed(3) + 's'; el._phiSw = sw;
  }
  function retime(el, r) {
    if (el._phiSw === sw || el._phiWait) return;
    const running = el.getAnimations ? el.getAnimations().filter((a) => a.playState === 'running') : [];
    if (!running.length) { stamp(el, r); return; }
    el._phiWait = true;
    el.addEventListener('animationiteration', function once() {   // cycle boundary: start the new period at phase 0
      el.removeEventListener('animationiteration', once); el._phiWait = false;
      const P = periodFor(r); el.style.animationDuration = P.toFixed(3) + 's'; el.style.animationDelay = '0s'; el._phiSw = sw;
      getComputedStyle(el).animationDuration; el.getAnimations().forEach((a) => { a.currentTime = 0; });
    });
  }
  function restyleAll() { REG.forEach((r) => document.querySelectorAll(r.sel).forEach((el) => retime(el, r))); }
  function scan(node) {
    if (node.nodeType !== 1) return;
    REG.forEach((r) => { if (node.matches(r.sel)) stamp(node, r); node.querySelectorAll(r.sel).forEach((el) => { if (el._phiSw === undefined) stamp(el, r); }); });
  }
  function register(sel, n, opts) {
    const r = Object.assign({ sel, n, simmie: false, k: K.other, sib: false }, opts || {}); REG.push(r);
    document.querySelectorAll(sel).forEach((el) => stamp(el, r));
  }
  new MutationObserver((ml) => ml.forEach((m) => m.addedNodes.forEach(scan))).observe(document.documentElement, { childList: true, subtree: true });
  // A repeating timer on PHI^n (n can be a function so it re-reads the sweep each cycle); first tick after period - offset.
  function every(k, n, fn) {
    const per = () => ms(typeof n === 'function' ? n() : n);
    let t = setTimeout(function tick() { fn(); t = setTimeout(tick, per()); }, Math.max(0, per() - Math.round(per() * frac(k))));
    return () => clearTimeout(t);
  }

  // ---- the swept CSS elements shared by both builds (Simmie palette unless noted). Weather loop is NOT here (never swept).
  register('.tty-cur', 2, { simmie: true, k: K.blink });            // terminal cursor  PHI^0.5 1.272s at s=0
  register('.tty-cloud svg,.tty-cloud img', 2, { simmie: true, k: K.blink });   // cloud breathing
  register('.tty-cloud .eyes', 2, { simmie: true, k: K.blink });    // cloud eye blink
  register('.tty-shine', 4, { simmie: true, k: K.other });         // cloud sheen  PHI^2.5 3.330s
  register('.dots i', 2, { simmie: true, k: K.blink, sib: true });   // "Waiting for Simmie" status dots
  register('.ad-glow', 3, { simmie: true, k: K.askdad });           // Ask Dad glow  PHI^1.5 2.058s
  register('.ad-orbit', 4, { simmie: true, k: K.askdad });          // Ask Dad satellite orbit  PHI^2.5 3.330s

  g.PhiTiming = { PHI, G, T0, s, ms, frac, K, offset, offsetMs, every, SWEEP, setWeather, sweep, onSweep, sws, swms, ss, ssms, register, sweepState };
})(window);
