/* Interludes on golden-ratio timing (js/phi-timing.js, rules in ~/.config/phi-timing-rules.md):
   Bonnie's animals 🐎🐇🐕🐦 every PHI^5 11.09 s (k=7); Simmie's space crew 🛰️🚀☄️🌙 every PHI^6 x PHI^-1.5 = 8.72 s (k=8).
   Both periods follow the weather sweep (rule 6), read afresh at each cycle boundary. When both fall due within 1 s
   of each other they split the two lanes (animal in the footer lane, space in the header lane).
   Explicit per-emoji facing: each glyph's native heading is listed, and it is flipped / rotated to face its travel.
   Transform + opacity only; skipped while the tab is hidden; off entirely under reduced motion. */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // native heading of each glyph in common emoji fonts (Apple, Noto): 'left' = faces left; deg = direction it points
  const FACING = {
    '🐎': { faces: 'left' }, '🐇': { faces: 'left' }, '🐕': { faces: 'left' }, '🐦': { faces: 'left' },
    '🚀': { deg: -45 },    // points up-right
    '☄️': { deg: 135 },    // head lower-left, so it travels toward lower-left
    '🛰️': { deg: null }, '🌙': { deg: null },   // orbiters: no heading
  };
  const ANIMALS = [{ e: '🐎', n: 'horse', g: 'trot' }, { e: '🐇', n: 'rabbit', g: 'hop' }, { e: '🐕', n: 'dog', g: 'collie' }, { e: '🐦', n: 'bird', g: 'fly' }];
  const SPACE = ['sat', 'rocket', 'comet', 'moon'];
  const T = window.PhiTiming;
  const log = (t) => window.dispatchEvent(new CustomEvent('simmie:log', { detail: t }));
  const lanes = { header: document.getElementById('lane-h'), footer: document.getElementById('lane-f') };
  if (!lanes.header || !lanes.footer) return;
  const W = (l) => l.clientWidth || 300;
  const face = (e, dirRight) => { const f = FACING[e]; return f && f.faces === 'left' ? (dirRight ? 'scaleX(-1)' : 'scaleX(1)') : f && f.faces === 'right' ? (dirRight ? 'scaleX(1)' : 'scaleX(-1)') : 'none'; };
  const turn = (e, travelDeg) => { const f = FACING[e]; return f && typeof f.deg === 'number' ? 'rotate(' + (travelDeg - f.deg) + 'deg)' : 'none'; };
  function item(lane, html) { const d = document.createElement('span'); d.className = 'il-it'; d.innerHTML = html; lane.appendChild(d); return d; }
  function run(d, frames, ms) { const a = d.animate(frames, { duration: ms, easing: 'linear', fill: 'forwards' }); a.onfinish = () => d.remove(); return a; }
  let aN = 0, sN = 0, dir = 1, satN = 0;
  function animal(band) {
    const A = ANIMALS[aN++ % ANIMALS.length], lane = lanes[band]; dir = -dir;
    const right = dir > 0, w = W(lane), from = right ? -24 : w + 8, to = right ? w + 8 : -24;
    const d = item(lane, '<span class="il-g"><span class="il-f" style="transform:' + face(A.e, right) + '">' + A.e + '</span></span>');
    if (A.g === 'fly') d.classList.add('il-bird');
    const g = d.firstChild, ms = T.swms(4);   // crossing PHI^4 6.854 s (swept)
    const X = (x) => ({ transform: 'translateX(' + x + 'px)' });
    if (A.g === 'collie') {   // low trot, a bound, a look-back pause
      run(d, [X(from), { ...X(from + (to - from) * .45), offset: .4 }, { ...X(from + (to - from) * .55), offset: .5 }, { ...X(from + (to - from) * .55), offset: .66 }, X(to)], ms);
      g.animate([{ transform: 'translateY(1px)' }, { transform: 'translateY(-1px)' }, { transform: 'translateY(1px)' }], { duration: T.swms(-2), iterations: Infinity });
      const f = g.firstChild, a = face(A.e, right), b = face(A.e, !right);
      setTimeout(() => { if (f.isConnected) f.animate([{ transform: a }, { transform: b, offset: .2 }, { transform: b, offset: .8 }, { transform: a }], { duration: T.swms(0) }); }, Math.round(ms * .52));
    } else {
      run(d, [X(from), X(to)], ms);
      const bob = A.g === 'hop' ? [{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)', offset: .45 }, { transform: 'translateY(0)', offset: .9 }, { transform: 'translateY(0)' }]
        : A.g === 'fly' ? [{ transform: 'translateY(0) scaleY(1)' }, { transform: 'translateY(-3px) scaleY(.8)', offset: .25 }, { transform: 'translateY(0) scaleY(1)', offset: .5 }, { transform: 'translateY(2px) scaleY(.9)', offset: .75 }, { transform: 'translateY(0) scaleY(1)' }]
        : [{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }];
      g.animate(bob, { duration: T.swms(A.g === 'hop' ? -1 : A.g === 'fly' ? 0 : -2), iterations: Infinity });
    }
    log(A.e + ' ' + A.n + ' crossing ' + band);
  }
  function orbit(lane, center, sat, r, ms) {
    const w = W(lane), x = Math.round(w * (.3 + Math.random() * .4));
    const c = item(lane, center); c.style.transform = 'translateX(' + x + 'px)';
    const s = item(lane, sat); s.style.fontSize = '9px'; const fr = [];
    for (let i = 0; i <= 12; i++) { const a = i / 12 * 2 * Math.PI; fr.push({ transform: 'translate(' + (x + 3 + Math.cos(a) * r) + 'px,' + (-2 + Math.sin(a) * 4) + 'px)' }); }
    s.animate(fr, { duration: ms, iterations: 2 }).onfinish = () => { s.remove(); c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.ssms(-1) }).onfinish = () => c.remove(); };
  }
  function space(band) {
    const k = SPACE[sN++ % SPACE.length], lane = lanes[band], w = W(lane);
    if (k === 'sat') { satN++; orbit(lane, '🪐', '🛰️', 16, T.ssms(2)); log('🛰️ sat orbit ' + satN + ' (' + band + ')'); }
    else if (k === 'moon') { orbit(lane, '🌍', '🌙', 15, T.ssms(2)); log('🌙 moon circling earth (' + band + ')'); }
    else if (k === 'rocket') {   // travels left to right, nose turned to face the way it's going
      const r = item(lane, '<span class="il-f" style="display:inline-block;transform:' + turn('🚀', 0) + '">🚀</span>');
      run(r, [{ transform: 'translate(-20px,2px)' }, { transform: 'translate(' + w / 2 + 'px,-3px)' }, { transform: 'translate(' + (w + 20) + 'px,2px)' }], T.ssms(3));
      log('🚀 rocket across ' + band);
    } else {   // comet travels right to left, head first, sparkle tail behind it
      const c = item(lane, '<span class="il-f" style="display:inline-block;transform:' + turn('☄️', 180) + '">☄️</span><span style="opacity:.6;font-size:9px">✨</span>');
      run(c, [{ transform: 'translateX(' + (w + 10) + 'px)', opacity: 0 }, { transform: 'translateX(' + w * .8 + 'px)', opacity: 1, offset: .1 }, { transform: 'translateX(-40px)', opacity: .9 }], T.ssms(3));
      log('☄️ comet through ' + band);
    }
  }
  // next due times: first tick lands at period - golden offset (rule 2), then one swept period per cycle
  const now0 = Date.now();
  let nA = now0 + T.swms(5) - Math.round(T.swms(5) * T.frac(T.K.animals)), nS = now0 + T.ssms(6) - Math.round(T.ssms(6) * T.frac(T.K.space)), side = 0;
  setInterval(() => {
    const t = Date.now();
    if (document.hidden) { if (t > nA) nA = t + T.swms(5); if (t > nS) nS = t + T.ssms(6); return; }
    const da = t >= nA, ds = t >= nS, near = T.ms(0);
    if ((da && nS - t < near) || (ds && nA - t < near)) { animal('footer'); space('header'); nA = t + T.swms(5); nS = t + T.ssms(6); return; }
    if (da) { animal(side++ % 2 ? 'header' : 'footer'); nA = t + T.swms(5); }
    if (ds) { space(side++ % 2 ? 'footer' : 'header'); nS = t + T.ssms(6); }
  }, T.ms(-3));
  document.addEventListener('visibilitychange', () => {
    document.querySelectorAll('.il-lane *').forEach((n) => n.getAnimations().forEach((a) => (document.hidden ? a.pause() : a.play())));
  });
})();
