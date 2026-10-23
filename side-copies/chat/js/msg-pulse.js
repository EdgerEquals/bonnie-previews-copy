/* Message-status pulse layer (rule 7 in /home/box/.config/phi-timing-rules.md). A separate visual layer: a soft glow ring
   on the terminal LED, the Ask Dad key, the Chat → button and the feed's top edge. Its own phi ladder, never swept by the
   weather and never touching the weather loop:
     idle PHI^5 11.09 s slow breathe | new PHI^3 4.236 s | dad (unread from Dad) PHI^2 2.618 s | urgent PHI^1 1.618 s
   Slow states make the big soft move, fast states a small tight one (rule 1). A new state starts at each ring's next
   cycle boundary. This file never reads or shows message text: the page sends it only a state word
   (CustomEvent 'simmie:msgstatus', detail {state}). Meters (rule 8) add a brief brightness boost via 'simmie:meter'
   (detail {level}), which never changes the period. Preview override: ?msg=idle|new|dad|urgent (preview build only). */
(function (g) {
  'use strict';
  const T = g.PhiTiming, N = { idle: 5, new: 3, dad: 2, urgent: 1 }, ORDER = ['idle', 'new', 'dad', 'urgent'];
  const HOSTS = ['.tty-dot:nth-child(3)', '.ad-key', '#ft-chat', '#fact-ticker'];
  const reduce = () => g.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPreview = document.documentElement.dataset.preview === '1';
  const forced = (() => { if (!isPreview) return null; try { const v = new URLSearchParams(location.search).get('msg'); return N[v] ? v : null; } catch (e) { return null; } })();
  let state = forced || (N[g.SimmieMsgStatus] ? g.SimmieMsgStatus : 'idle'), boost = 0, boostT = null, known = !!(forced || N[g.SimmieMsgStatus]);
  const root = document.documentElement;
  root.dataset.msg = state;
  function ring(host) {
    if (host._mp) return host._mp;
    const r = document.createElement('span'); r.className = 'mp-ring' + (host.id === 'fact-ticker' ? ' mp-edge' : ''); r.setAttribute('aria-hidden', 'true');
    host.classList.add('mp-host'); host.appendChild(r); host._mp = r; set(r, state, true); return r;
  }
  function set(r, st, initial) {
    const P = T.s(N[st]);
    r.dataset.st = st; r.style.animationDuration = P.toFixed(3) + 's';
    // golden start offset on first stamp (k = 6 + index), phase 0 when switching at a boundary
    r.style.animationDelay = initial ? (-(P * T.frac(6 + HOSTS.length))).toFixed(3) + 's' : '0s';
    if (!initial) { getComputedStyle(r).animationDuration; r.getAnimations().forEach((a) => { a.currentTime = 0; }); }
  }
  function apply() {
    document.querySelectorAll('.mp-ring').forEach((r) => {
      if (r.dataset.st === state) return;
      const run = !reduce() && r.getAnimations().some((a) => a.playState === 'running');
      if (!run) { set(r, state, false); return; }
      if (r._wait) return; r._wait = true;
      r.addEventListener('animationiteration', function once() { r.removeEventListener('animationiteration', once); r._wait = false; set(r, state, false); });
    });
  }
  function scan() { HOSTS.forEach((sel) => document.querySelectorAll(sel).forEach(ring)); }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
  g.addEventListener('simmie:msgstatus', (e) => {
    const st = e && e.detail && e.detail.state; if (!N[st] || forced) return;
    if (st === state) return;
    const was = state; state = st; root.dataset.msg = st;
    if (!known) { known = true; document.querySelectorAll('.mp-ring').forEach((r) => set(r, st, true)); }   // first real status: no boundary wait
    else apply();
    g.dispatchEvent(new CustomEvent('simmie:msgpulse', { detail: { state: st, was } }));   // haptics listen for 'urgent'
  });
  g.addEventListener('simmie:meter', (e) => {   // meter peak: brief brightening only
    const lv = Math.max(0, Math.min(1.25, +(e && e.detail && e.detail.level) || 0));
    if (lv < boost) return; boost = lv; root.style.setProperty('--mp-boost', boost.toFixed(3));
    clearTimeout(boostT); boostT = setTimeout(() => { boost = 0; root.style.setProperty('--mp-boost', '0'); }, T.ms(0));
  });
  g.SimmieMsgPulse = { get state() { return state; }, forced, ORDER };
})(window);
