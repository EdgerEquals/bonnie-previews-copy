/* Interaction meters + haptics (rules 8 and 9 in /home/box/.config/phi-timing-rules.md). Chat review preview and the
   chat-terminal-box side copy only. "One of many ways to play": a small dial, a spring-back lever and a toggle switch,
   each with its own 6-bar level meter, plus the page's existing buttons (haptics + glow only, no meter).
   NO microphone, camera or other sensors: only pointer, touch and keyboard input. Nothing here sends anything.
   Press model (shared by meters and haptics):
     drive x in 0..1 from press pressure (PointerEvent.pressure when the device really reports it, else touch contact
     size, else held time), hold duration and drag velocity;
     level = soft threshold (0 below 0.15) then ease-out 1 - (1 - x')^PHI;
     the bar rises in PHI^-3 s to level x (1 + 1/PHI^3) (overshoot ~0.236), settles back in PHI^-2 s, decays over PHI^2 s;
     the peak-hold mark drops after PHI^1 s. A meter peak briefly brightens the message-status glow ('simmie:meter').
   Haptics: navigator.vibrate where it exists (gentle 8 ms, firm 20 ms, over the overshoot line 28 ms, urgent status
   [18, 90, 18]), at most one pulse per PHI^1 s, urgent once per change of status. iPhone: no vibration API, so the
   switch is a native <input type="checkbox" switch> (iOS 18+ ticks on its own). Everything is feature-detected and
   wrapped in try/catch, so with no support it is silent: no errors, no prompts. */
(function (g) {
  'use strict';
  const T = g.PhiTiming, PHI = T.PHI, OS = 1 / Math.pow(PHI, 3), BARS = 6;
  const host = document.getElementById('play'); if (!host) return;
  const reduce = () => g.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const shape = (x) => { x = clamp(x); if (x < 0.15) return 0; return 1 - Math.pow(1 - (x - 0.15) / 0.85, PHI); };
  const easeOut = (u) => 1 - Math.pow(1 - clamp(u), PHI);
  const isPreview = document.documentElement.dataset.preview === '1';

  // ---------- haptics ----------
  const HKEY = isPreview ? 'simmie-chat-preview:haptics' : 'simmie-chat-side:haptics';
  let hapOn = true; try { hapOn = localStorage.getItem(HKEY) !== 'off'; } catch (e) {}
  const canVibrate = (() => { try { return typeof navigator.vibrate === 'function'; } catch (e) { return false; } })();
  let lastBuzz = 0;
  function buzz(pattern, urgent) {
    if (!hapOn || !canVibrate) return;
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;   // no tap yet: stay silent
      const t = Date.now(); if (!urgent && t - lastBuzz < T.ms(1)) return; lastBuzz = t;
      navigator.vibrate(pattern);
    } catch (e) {}
  }
  function hapFor(v) { if (v <= 0) return; buzz(v * (1 + OS) > 1 ? 28 : v < 0.5 ? 8 : 20, false); }
  g.addEventListener('simmie:msgpulse', (e) => { try { if (e.detail && e.detail.state === 'urgent') buzz([18, 90, 18], true); } catch (err) {} });

  // ---------- meter ----------
  function Meter(el) {
    el.className = 'pl-meter'; el.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < BARS; i++) el.appendChild(document.createElement('i'));
    const bars = [...el.children]; let base = 0, peak = 0, peakT = null, raf = 0, t0 = 0, from = 0, stepT = null, cur = 0;
    function draw(lv) {
      cur = lv; const n = Math.round(clamp(lv) * BARS), pk = Math.max(n, Math.round(clamp(peak) * BARS));
      bars.forEach((b, i) => { b.classList.toggle('on', i < n); b.classList.toggle('pk', i === pk - 1 && pk > n); });
      el.classList.toggle('over', lv > 1);
    }
    function frame() {
      const t = (Date.now() - t0) / 1000, up = T.s(-3), settle = T.s(-2), decay = T.s(2), top = base * (1 + OS);
      let lv;
      if (t < up) lv = from + (top - from) * easeOut(t / up);
      else if (t < up + settle) lv = top + (base - top) * easeOut((t - up) / settle);
      else if (t < up + settle + decay) lv = base * Math.pow(1 - (t - up - settle) / decay, PHI);
      else lv = 0;
      const done = t >= up + settle + decay; draw(done ? 0 : lv); raf = done ? 0 : requestAnimationFrame(frame); if (done) base = 0;
    }
    function hit(x) {
      const v = shape(x); if (v <= 0) return 0;
      if (v * (1 + OS) > peak || !peakT) peak = Math.min(1, v * (1 + OS));
      clearTimeout(peakT); peakT = setTimeout(() => { peak = 0; peakT = null; draw(cur); }, T.ms(1));   // peak-hold drops after PHI^1 s
      g.dispatchEvent(new CustomEvent('simmie:meter', { detail: { level: v * (1 + OS) } }));
      if (reduce()) {   // stepping, no animation: jump to the level, then drop one bar per PHI^-1 s
        clearTimeout(stepT); base = Math.max(base, v); draw(base);
        const step = () => { base = Math.max(0, base - 1 / BARS); draw(base); if (base > 0) stepT = setTimeout(step, T.ms(-1)); };
        stepT = setTimeout(step, T.ms(-1)); return v;
      }
      if (v < cur && raf) return v;               // a softer touch doesn't cut a louder one short
      from = cur; base = v; t0 = Date.now(); if (!raf) raf = requestAnimationFrame(frame);
      return v;
    }
    draw(0);
    return { hit };
  }
  // press drive from a pointer down/up pair (pressure, else contact size, else held time)
  function pressDrive(down, upT) {
    const held = clamp((upT - down.t) / T.ms(0));            // a 1 s hold = full
    if (down.pressure > 0 && down.pressure !== 0.5 && down.type !== 'mouse') return Math.max(down.pressure, held * 0.6);
    if (down.type === 'touch' && down.size > 1) return Math.max(clamp(down.size / 40), held * 0.6);
    return 0.2 + held * 0.8;
  }
  const downInfo = (e) => ({ t: Date.now(), pressure: e.pressure || 0, type: e.pointerType, size: Math.sqrt((e.width || 0) * (e.height || 0)) });

  // ---------- build ----------
  host.classList.add('play'); host.setAttribute('role', 'group'); host.setAttribute('aria-label', 'One of many ways to play');
  const h = (tag, cls, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const hint = h('span', 'pl-hint'); hint.textContent = 'one of many ways to play'; hint.setAttribute('aria-hidden', 'true');

  // dial (rotary knob): drag to turn, arrow keys step; drive = turning speed
  const dialW = h('span', 'pl-ctl'), dial = h('span', 'pl-dial', { role: 'slider', tabindex: '0', 'aria-label': 'Dial, one of many ways to play', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' });
  dial.appendChild(h('i', 'pl-dial-mark')); const dmEl = h('span'); const dialMeter = Meter(dmEl); dialW.append(dial, dmEl);
  let dialVal = 0;
  const setDial = (v) => { dialVal = Math.max(0, Math.min(100, v)); dial.style.setProperty('--a', (-135 + dialVal * 2.7) + 'deg'); dial.setAttribute('aria-valuenow', String(Math.round(dialVal))); };
  setDial(0);
  (function () {
    let drag = null;
    const ang = (e) => { const r = dial.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    dial.addEventListener('pointerdown', (e) => { try { dial.setPointerCapture(e.pointerId); } catch (err) {} drag = { a: ang(e), t: performance.now(), d: downInfo(e), last: 0 }; e.preventDefault(); });
    dial.addEventListener('pointermove', (e) => {
      if (!drag) return; const a = ang(e); let da = a - drag.a; if (da > 180) da -= 360; if (da < -180) da += 360;
      const now = performance.now(), dt = Math.max(1, now - drag.t); drag.a = a; drag.t = now; setDial(dialVal + da / 2.7);
      if (now - drag.last > T.ms(-4)) { drag.last = now; const x = clamp(Math.abs(da) / dt * 1000 / 720); hapFor(dialMeter.hit(x)); }
    });
    const end = (e) => { if (!drag) return; const d = drag; drag = null; if (!d.last) hapFor(dialMeter.hit(pressDrive(d.d, Date.now()) * 0.7)); };
    dial.addEventListener('pointerup', end); dial.addEventListener('pointercancel', end);
    dial.addEventListener('keydown', (e) => {
      const big = e.key === 'PageUp' || e.key === 'PageDown', dir = { ArrowUp: 1, ArrowRight: 1, PageUp: 1, ArrowDown: -1, ArrowLeft: -1, PageDown: -1 }[e.key];
      if (e.key === 'Home' || e.key === 'End') { setDial(e.key === 'Home' ? 0 : 100); hapFor(dialMeter.hit(0.9)); e.preventDefault(); return; }
      if (!dir) return; e.preventDefault(); setDial(dialVal + dir * (big ? 30 : 10)); hapFor(dialMeter.hit(big ? 0.8 : 0.45));
    });
  })();

  // lever: slide right, it springs back on release; drive = pull distance, pull speed and hold time
  const levW = h('span', 'pl-ctl'), lever = h('span', 'pl-lever', { role: 'slider', tabindex: '0', 'aria-label': 'Lever, springs back, one of many ways to play', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' });
  const knob = h('i', 'pl-knob'); lever.appendChild(knob); const lmEl = h('span'); const levMeter = Meter(lmEl); levW.append(lever, lmEl);
  (function () {
    let drag = null, pos = 0, keyT = null;
    const setPos = (p, spring) => { pos = clamp(p); lever.classList.toggle('spring', !!spring); lever.style.setProperty('--p', pos.toFixed(3)); lever.setAttribute('aria-valuenow', String(Math.round(pos * 100))); };
    const travel = () => Math.max(1, lever.clientWidth - knob.offsetWidth);
    lever.addEventListener('pointerdown', (e) => { try { lever.setPointerCapture(e.pointerId); } catch (err) {} drag = { x0: e.clientX - pos * travel(), lx: e.clientX, t: performance.now(), d: downInfo(e), last: 0, v: 0 }; setPos(pos, false); e.preventDefault(); });
    lever.addEventListener('pointermove', (e) => {
      if (!drag) return; const now = performance.now(), dt = Math.max(1, now - drag.t);
      drag.v = Math.abs(e.clientX - drag.lx) / dt * 1000; drag.lx = e.clientX; drag.t = now; setPos((e.clientX - drag.x0) / travel(), false);
      if (now - drag.last > T.ms(-4)) { drag.last = now; hapFor(levMeter.hit(Math.max(pos * 0.85, clamp(drag.v / 600)))); }
    });
    const end = () => { if (!drag) return; const d = drag; drag = null; const held = clamp((Date.now() - d.d.t) / T.ms(1));
      hapFor(levMeter.hit(Math.max(pos * (0.6 + 0.4 * held), d.last ? 0 : pressDrive(d.d, Date.now()) * 0.6))); setPos(0, true); };
    lever.addEventListener('pointerup', end); lever.addEventListener('pointercancel', end);
    lever.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!dir) return; e.preventDefault();
      setPos(pos + dir * 0.25, false); hapFor(levMeter.hit(pos)); clearTimeout(keyT); keyT = setTimeout(() => setPos(0, true), T.ms(-1));
    });
  })();

  // toggle switch: native <input type="checkbox" switch> (iOS 18+ gives its own haptic tick); drive = how it was pressed
  const swW = h('label', 'pl-ctl pl-sw-w'), sw = h('input', 'pl-sw', { type: 'checkbox', switch: '', 'aria-label': 'Switch, one of many ways to play' });
  const nativeSwitch = (() => { try { return 'switch' in HTMLInputElement.prototype; } catch (e) { return false; } })();
  if (!nativeSwitch) sw.classList.add('pl-sw-drawn');   // browsers without the switch control get a drawn one (no fake haptic)
  const smEl = h('span'); const swMeter = Meter(smEl); swW.append(sw, smEl);
  (function () {
    let d = null;
    sw.addEventListener('pointerdown', (e) => { d = downInfo(e); });
    sw.addEventListener('change', () => { const x = d ? pressDrive(d, Date.now()) : 0.6; d = null; hapFor(swMeter.hit(Math.max(0.35, x))); });
  })();

  // haptics on/off (preview-only storage key); hidden where vibration isn't available and there's nothing to switch off
  const hap = h('button', 'pl-hap', { type: 'button', 'aria-pressed': String(hapOn), title: 'Haptics' });
  const hapLabel = () => { hap.setAttribute('aria-pressed', String(hapOn)); hap.setAttribute('aria-label', 'Haptics ' + (hapOn ? 'on' : 'off')); hap.textContent = hapOn ? '〰' : '—'; };
  hapLabel();
  hap.addEventListener('click', () => { hapOn = !hapOn; try { localStorage.setItem(HKEY, hapOn ? 'on' : 'off'); } catch (e) {} hapLabel(); if (hapOn) buzz(8, true); });
  if (!canVibrate) hap.hidden = true;

  host.append(hint, dialW, levW, swW, hap);

  // the page's existing buttons join in: same press model -> haptics and a glow lift, no meter of their own
  (function () {
    let d = null;
    const isBtn = (t) => t && t.closest && t.closest('button, .ft-chat, .q-opt') && !t.closest('#play');
    document.addEventListener('pointerdown', (e) => { d = isBtn(e.target) ? downInfo(e) : null; }, true);
    document.addEventListener('pointerup', (e) => {
      if (!d || !isBtn(e.target)) { d = null; return; } const v = shape(pressDrive(d, Date.now())); d = null;
      if (v > 0) { g.dispatchEvent(new CustomEvent('simmie:meter', { detail: { level: v } })); hapFor(v); }
    }, true);
  })();
  g.SimmiePlay = { shape, OS, canVibrate, nativeSwitch };
})(window);
