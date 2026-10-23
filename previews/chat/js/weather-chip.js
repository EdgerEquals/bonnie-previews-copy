/* Perth weather chip + emoji story for the chat header (self-contained; prefix .wx-).
   Data: Open-Meteo, fixed Perth coords (-31.95, 115.86), no geolocation, cached 30 min (also across reloads).
   ?weather=sun|hot|cloud|rain|storm|night forces a state for previewing. The tty box reuses SimmieWeather.real(). */
(function (g) {
  'use strict';
  const URL_ = 'https://api.open-meteo.com/v1/forecast?latitude=-31.95&longitude=115.86&current=temperature_2m,weather_code,is_day&timezone=Australia%2FPerth';
  const CK = 'simmie-wx-cache', TTL = 30 * 60e3;
  // face(s), offerings handed toward the icon, icon, words
  const SETS = {
    sun:   { faces: ['😊'], gifts: ['🕶️', '🍦', '🌻'], icon: '☀️', word: 'Sunny' },
    hot:   { faces: ['😄', '🤩', '😎'], gifts: ['🏖️', '🍦', '🕶️'], icon: '🌞', word: 'Hot' },
    cloud: { faces: ['🙂'], gifts: [], icon: '⛅', word: 'Cloudy' },
    rain:  { faces: ['🥺'], gifts: ['☂️', '🌸', '🎁', '☕'], icon: '🌧️', word: 'Rainy' },
    storm: { faces: ['🤗', '🫣', '😮'], gifts: ['🫂', '🕯️'], icon: '⛈️', word: 'Stormy' },
    night: { faces: ['😌', '🥰', '🤩'], gifts: ['✨'], icon: '🌙', word: 'Clear night' },
  };
  const STYLES = ['drop', 'peek', 'spin', 'pop'];
  const reduceM = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mem = null, inflight = null;
  async function real() {
    if (mem && Date.now() - mem.at < TTL) return mem;
    try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c && Date.now() - c.at < TTL) return (mem = c); } catch (e) {}
    if (!inflight) inflight = (async () => {
      try {
        const r = await fetch(URL_, { cache: 'no-store' }); if (!r.ok) throw 0;
        const c = (await r.json()).current; if (!c || typeof c.temperature_2m !== 'number') throw 0;
        mem = { at: Date.now(), t: Math.round(c.temperature_2m), code: +c.weather_code, day: !!c.is_day };
        try { localStorage.setItem(CK, JSON.stringify(mem)); } catch (e) {}
      } catch (e) {}
      inflight = null; return mem;
    })();
    return inflight;
  }
  function classify(w) {
    const c = w.code;
    if (c <= 1) return w.day ? (w.t >= 30 ? 'hot' : 'sun') : 'night';
    if (c >= 95) return 'storm';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
    return 'cloud';
  }
  // sweep row for rule 6 (fog has no face set of its own: the chip shows cloud, the sweep uses fog)
  const sweepRow = (st, w) => (st === 'cloud' && w && (w.code === 45 || w.code === 48) ? 'fog' : st);
  const ALIAS = { fog: 'cloud', deepnight: 'night' };   // preview-only override names
  function rawOverride() { const v = new URLSearchParams(location.search).get('weather'); return v && (SETS[v] || ALIAS[v]) ? v : null; }
  function override() { const v = rawOverride(); return v ? (ALIAS[v] || v) : null; }

  function mount(root) {
    root.classList.add('wx'); root.hidden = true;
    const T = g.PhiTiming, STORY = T.s(6), START = Date.now();
    let loop = 0, state = null, lastLine = '', faceStops = [];
    const stage = document.createElement('span'); stage.className = 'wx-stage'; stage.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.className = 'wx-label';
    root.append(stage, label);
    const span = (cls, txt, i) => { const o = document.createElement('span'); o.className = 'wx-sway'; o.style.setProperty('--i', i);
      const n = document.createElement('span'); n.className = cls; n.textContent = txt; o.appendChild(n); return o; };
    function build(st) {
      const s = SETS[st]; stage.innerHTML = '';
      faceStops.forEach((f) => f()); faceStops = [];
      const face = span('wx-face', s.faces[0], 0); stage.appendChild(face);
      // offering story on PHI^6 with golden start offset (k=9): face and gifts share one phase from the first frame
      const off = T.offset(T.K.story, 6); face.firstChild.style.setProperty('--wx-face-d', -off.toFixed(3) + 's'); stage.style.setProperty('--wx-off', off.toFixed(3) + 's');
      // three faces on PHI^2 / PHI^3 / PHI^4 beats (k=2): each beat brings its own face in with a soft crossfade
      if (s.faces.length > 1 && !reduceM()) s.faces.forEach((fc, i) => faceStops.push(T.every(T.K.faces, 2 + i, () => {
        if (document.hidden) return; const el = stage.querySelector('.wx-face'); if (!el || el.textContent === fc) return;
        el.classList.add('wx-fade'); setTimeout(() => { el.textContent = fc; el.classList.remove('wx-fade'); }, T.ms(-3));
      })));
      s.gifts.forEach((x, i) => { const o = span('wx-gift', x, i + 1); o.firstChild.style.setProperty('--n', i); stage.appendChild(o); });
      // sway: PHI^7 (k=10); each emoji gets its own golden phase
      stage.querySelectorAll('.wx-sway').forEach((o, i) => o.style.setProperty('--sway-d', -(T.s(7) * T.frac(T.K.sway + i)).toFixed(3) + 's'));
      const icon = document.createElement('span'); icon.className = 'wx-icon'; icon.textContent = s.icon; stage.appendChild(icon);
      // distance from each gift back to the icon (for PEEK: they slide out from behind it)
      requestAnimationFrame(() => {
        const ix = icon.getBoundingClientRect().left;
        stage.querySelectorAll('.wx-gift').forEach((gEl) => gEl.style.setProperty('--to-icon', (ix - gEl.getBoundingClientRect().left) + 'px'));
      });
      face.firstChild.addEventListener('animationiteration', next);
      setStyle();
    }
    // loop effect (DROP/PEEK/SPIN/POP) clock: changes every PHI^5 (k=5); applied when the next offering story starts,
    // so the hand-over never jumps mid-way
    const styleNow = () => STYLES[Math.floor(((Date.now() - START) / 1000 + T.offset(T.K.loopfx, 5)) / T.s(5)) % STYLES.length];
    function setStyle() { const st = styleNow(); STYLES.forEach((x) => stage.classList.remove('wx-' + x)); void stage.offsetWidth; stage.classList.add('wx-' + st); stage.dataset.style = st; }
    function next() { loop++; stage.style.setProperty('--wx-off', '0s'); setStyle(); }
    async function refresh() {
      const ov = override(), w = await real();
      const st = ov || (w ? classify(w) : null);
      if (g.PhiTiming) g.PhiTiming.setWeather(rawOverride() || (st ? sweepRow(st, w) : null), !!rawOverride());
      if (!st) { root.hidden = true; return; }
      const s = SETS[st];
      if (st !== state) { state = st; root.dataset.state = st; build(st); }
      label.innerHTML = ''; const pl = document.createElement('span'); pl.className = 'wx-place'; pl.textContent = 'Perth ';
      label.append(pl, document.createTextNode(w ? w.t + '°' : s.word));
      root.setAttribute('aria-label', 'Perth weather: ' + s.word + (w ? ', ' + w.t + ' degrees' : '') + (ov ? ' (preview)' : ''));
      root.title = 'Perth · ' + s.word + (w ? ' · ' + w.t + '°C' : '') + ' · Open-Meteo';
      root.hidden = false;
      const line = 'wx: ' + s.word.toLowerCase() + (w ? ' ' + w.t + '°' : '') + (ov ? ' [preview]' : '');
      if (line !== lastLine) { lastLine = line; window.dispatchEvent(new CustomEvent('simmie:log', { detail: line })); }
    }
    document.addEventListener('visibilitychange', () => root.classList.toggle('wx-paused', document.hidden));
    refresh(); setInterval(() => { if (!document.hidden) refresh(); }, TTL);
    return { refresh };
  }
  g.SimmieWeather = { real, classify, mount, SETS };
})(window);
