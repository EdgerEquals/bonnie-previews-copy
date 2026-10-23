/* simmie — tty: compact terminal talk box for the chat page (self-contained component).
   The page passes in its own send function (the same encrypted path the composer uses) and calls update(list)
   whenever the thread re-renders. This file has no crypto and never touches the network for sending.
   Idle lines use only real, public data: Open-Meteo (fixed Perth coords, no geolocation), the public Rebella site,
   its sitemap.xml and _pipeline_articles.json, and this site's own age-dial.json / facts.json. Any line whose
   source can't be read is left out. */
(function (g) {
  'use strict';
  const PERTH = { lat: -31.95, lon: 115.86 };
  const REBELLA = 'https://edgerequals.github.io/rebella/';
  const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const T = g.PhiTiming;   // golden-ratio timing (see js/phi-timing.js); Simmie rhythms = Bonnie slot x PHI^-1.5
  const THINK_AFTER = T.ms(6), READY_FOR = T.ms(7), CHAR_MS = T.ms(-7);
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // ---------- public data (cached) ----------
  const data = { weather: null, wAt: 0, status: null, sAt: 0, articles: null, latest: null, aAt: 0, age: null, gAt: 0, facts: null, fAt: 0 };
  const W = (c, day) => c === 0 ? (day ? ['SUNNY', '☀'] : ['CLEAR NIGHT', '☾']) : c <= 2 ? ['PARTLY CLOUDY', '⛅'] : c === 3 ? ['CLOUDY', '☁']
    : c <= 48 ? ['FOGGY', '☁'] : c <= 57 ? ['DRIZZLE', '☂'] : c <= 67 ? ['RAINY', '☂'] : c <= 77 ? ['SNOW?!', '❄'] : c <= 82 ? ['SHOWERS', '☂'] : ['STORMY', '⚡'];
  async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
  async function weather() {
    if (data.weather && Date.now() - data.wAt < 30 * 60e3) return data.weather;
    if (g.SimmieWeather) {   // shared cache with the header chip (real data only; ignores ?weather= previews)
      const w = await g.SimmieWeather.real(); if (!w) return data.weather;
      const [word, icon] = W(w.code, w.day); data.weather = { word, icon, t: w.t }; data.wAt = Date.now(); return data.weather;
    }
    try {
      const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${PERTH.lat}&longitude=${PERTH.lon}&current=temperature_2m,weather_code,is_day&timezone=Australia%2FPerth`);
      const c = j.current; if (!c || typeof c.temperature_2m !== 'number') throw 0;
      const [word, icon] = W(+c.weather_code, !!c.is_day);
      data.weather = { word, icon, t: Math.round(c.temperature_2m) }; data.wAt = Date.now();
    } catch (e) {}
    return data.weather;
  }
  async function report() {
    const now = Date.now(), jobs = [];
    if (now - data.sAt > 5 * 60e3) jobs.push((async () => {
      const before = data.status;
      try { const r = await fetch(REBELLA + '?t=' + now, { cache: 'no-store' }); data.status = r.ok ? 'LIVE' : 'DOWN (HTTP ' + r.status + ')'; }
      catch (e) { data.status = 'NO RESPONSE'; }
      data.sAt = Date.now();
      if (data.status !== before) mlog('link: rebella ' + (data.status === 'LIVE' ? 'up' : data.status === 'NO RESPONSE' ? 'no response' : 'down'));
    })());
    if (now - data.aAt > 10 * 60e3) jobs.push((async () => {
      try {
        const r = await fetch(REBELLA + 'sitemap.xml', { cache: 'no-store' }); if (!r.ok) throw 0;
        const n = ((await r.text()).match(/<loc>[^<]*\/articles\/[^<]+<\/loc>/g) || []).length; data.articles = n || null;
      } catch (e) { data.articles = null; }
      try {
        const list = await getJSON(REBELLA + '_pipeline_articles.json'); let best = null;
        for (const a of Array.isArray(list) ? list : []) if (a && a.title && (!best || String(a.published || '') > String(best.published || ''))) best = a;
        data.latest = best ? String(best.title) : null;
      } catch (e) { data.latest = null; }
      data.aAt = Date.now();
    })());
    jobs.push(ageDial());
    await Promise.all(jobs);
    const t = new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', hour12: false });
    const lines = [];
    if (data.status) lines.push('rebella: ' + data.status + (data.articles ? ' · ' + data.articles + ' articles' : ''));
    else if (data.articles) lines.push('rebella: ' + data.articles + ' articles');
    if (data.latest) lines.push('latest: "' + data.latest + '"');
    if (data.age != null) lines.push('age dial: ' + data.age);
    return lines.length ? ['SYSTEM REPORT ' + t + ' AWST'].concat(lines) : null;
  }
  async function ageDial() {
    if (Date.now() - data.gAt < 10 * 60e3) return data.age;
    try { const j = await getJSON('../../age-dial.json?t=' + Date.now()); const a = +j.age; data.age = a >= 10 && a <= 16 ? a : null; } catch (e) { data.age = null; }
    data.gAt = Date.now(); return data.age;
  }
  let factIx = 0;
  async function fact() {
    const age = await ageDial(); if (age == null) return null;
    if (Date.now() - data.fAt > 30 * 60e3) {
      try { const j = await getJSON('../../facts.json?t=' + Date.now()); data.facts = (Array.isArray(j) ? j : j.facts || []).filter((f) => f && f.text && f.source && +f.age_min <= +f.age_max); }
      catch (e) { data.facts = null; }
      data.fAt = Date.now();
    }
    const ok = (data.facts || []).filter((f) => +f.age_min <= age && age <= +f.age_max);
    if (!ok.length) return null;
    const f = ok[(factIx++ + Math.floor(Math.random() * ok.length)) % ok.length];
    mlog('fact #' + (data.facts.indexOf(f) + 1) + ' (' + String(f.source).toLowerCase() + ')');
    return 'FACT · ' + String(f.source).toUpperCase() + ': ' + f.text;
  }

  // ---------- mission log: short timestamped STATUS lines about real on-page events ----------
  // Display only: never message text, chat content or passwords; nothing here is sent anywhere.
  // Other scripts on the page add lines with window.dispatchEvent(new CustomEvent('simmie:log', { detail: 'status text' })).
  const MLOG_GAP = T.ms(-1), MLOG_KEEP = 4;   // real events log right away (0.618 s spacing); the ambient heartbeat at most every PHI^5 x PHI^-1.5 = 5.388 s
  let mlogPane = null, mlogQ = [], mlogBusy = false, mlogLast = 0, mlogBeat = null;
  const stamp = () => new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function mlog(text) { mlogQ.push(String(text).slice(0, 48)); pumpLog(); }
  async function pumpLog() {
    if (mlogBusy || !mlogPane) return; mlogBusy = true;
    while (mlogQ.length) {
      const wait = mlogLast + MLOG_GAP - Date.now(); if (wait > 0) await sleep(wait);
      const text = mlogQ.shift(), heartbeat = text.startsWith('· ');
      const lastRow = mlogPane.lastElementChild;
      if (heartbeat && lastRow && lastRow.dataset.beat) { lastRow.querySelector('.ts').textContent = stamp(); mlogLast = Date.now(); continue; }
      const r = el('div', 'tty-mrow'); if (heartbeat) r.dataset.beat = '1';
      const t = el('span', 'tx'); r.append(el('span', 'ts', stamp()), document.createTextNode(' '), t); mlogPane.append(r);
      while (mlogPane.children.length > MLOG_KEEP) mlogPane.firstChild.remove();
      [...mlogPane.children].forEach((c, i, a) => { c.style.opacity = String(1 - (a.length - 1 - i) * 0.22); });
      if (reduce() || document.hidden) t.textContent = text;
      else for (let i = 1; i <= text.length; i++) { t.textContent = text.slice(0, i); await sleep(T.ms(-9)); }
      mlogLast = Date.now();
    }
    mlogBusy = false; armBeat();
  }
  function armBeat() { clearTimeout(mlogBeat); mlogBeat = setTimeout(() => { if (!document.hidden) mlog('· all systems nominal'); else armBeat(); }, T.ssms(5)); }   // mission-log ambient: Simmie, slot PHI^5 -> PHI^3.5 5.388s, swept
  window.addEventListener('simmie:log', (e) => { if (e && typeof e.detail === 'string') mlog(e.detail); });
  document.addEventListener('visibilitychange', () => mlog(document.hidden ? 'tab hidden — holding' : 'tab visible — resuming'));
  const orient = window.matchMedia('(orientation: landscape)');
  (orient.addEventListener ? orient.addEventListener.bind(orient, 'change') : orient.addListener.bind(orient))((e) => mlog('rotated: ' + (e.matches ? 'landscape' : 'portrait')));

  // ---------- component ----------
  function mount(root, opts) {
    const me = opts.name || 'bonnie';
    root.classList.add('tty'); root.innerHTML = '';
    const bar = el('div', 'tty-bar'); bar.setAttribute('aria-hidden', 'true');
    bar.append(el('span', 'tty-dot'), el('span', 'tty-dot'), el('span', 'tty-dot'), el('span', 'tty-title', 'simmie — tty'));
    const body = el('div', 'tty-body'); body.tabIndex = 0; body.setAttribute('role', 'button');
    body.setAttribute('aria-label', 'Talk to Simmie here. Tap to type a message.');
    const cloud = el('span', 'tty-cloud'); cloud.setAttribute('aria-hidden', 'true');
    const screen = el('div', 'tty-screen'); screen.setAttribute('aria-hidden', 'true');
    const live = el('div', 'tty-sr'); live.setAttribute('aria-live', 'polite');
    body.append(cloud, screen);
    mlogPane = el('div', 'tty-mlog'); mlogPane.setAttribute('aria-hidden', 'true');   // visual only; not announced
    root.append(bar, body, mlogPane, live);
    mlog('tty online'); report();   // first link check -> 'link: rebella up'
    fetch('img/simmie-cloud.svg').then((r) => r.ok ? r.text() : Promise.reject()).then((s) => {
      cloud.innerHTML = s; const svg = cloud.querySelector('svg'); if (!svg) throw 0;
      svg.removeAttribute('role'); svg.removeAttribute('aria-label'); svg.querySelectorAll('title').forEach((t) => t.remove());
      const eyes = svg.querySelector('g[fill="#1E1E1E"]'); if (eyes) eyes.classList.add('eyes');
      cloud.append(el('span', 'tty-shine'));
    })
      .catch(() => { cloud.innerHTML = '<img src="img/simmie-cloud.svg" alt="">'; });

    let mode = 'idle';          // idle | input | waiting | reply | ready
    let token = 0;              // bumps to cancel whatever is typing
    let cycle = 0, idleTimer = null, readyTimer = null, spinTimer = null;
    let seen = null, myIds = new Set(), queue = [], waitingSince = 0;
    let input = null, cur = null;

    function cols() {
      const probe = el('span', '', '0000000000'); probe.style.visibility = 'hidden'; probe.style.position = 'absolute'; screen.append(probe);
      const w = probe.getBoundingClientRect().width / 10 || 7.8; probe.remove();
      return Math.max(20, Math.floor(screen.clientWidth / w));
    }
    function trim() { while (screen.children.length > 14) screen.firstChild.remove(); screen.scrollTop = screen.scrollHeight; }
    function row(prompt, text, cls) {
      const r = el('div', 'tty-row' + (cls ? ' ' + cls : '')); r.append(el('span', 'tty-p', prompt + ' '), el('span', 't', text || ''));
      screen.append(r); trim(); return r;
    }
    function chunks(text, width) {
      const words = String(text).replace(/\s+/g, ' ').trim().split(' '), out = []; let line = '';
      for (let w of words) {
        while (w.length > width) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, width)); w = w.slice(width); }
        if (!line) line = w; else if ((line + ' ' + w).length <= width) line += ' ' + w; else { out.push(line); line = w; }
      }
      if (line) out.push(line); return out;
    }
    async function type(text, my, cls) {
      const width = cols() - 8;
      for (const part of chunks(text, width)) {
        if (my !== token) return false;
        const r = row('simmie>', '', cls), t = r.querySelector('.t');
        if (reduce()) { t.textContent = part; }
        else {
          root.classList.add('talking'); const c = el('span', 'tty-cur'); r.append(c);
          for (let i = 1; i <= part.length; i++) { if (my !== token) { root.classList.remove('talking'); c.remove(); return false; } t.textContent = part.slice(0, i); await sleep(CHAR_MS); }
          c.remove(); root.classList.remove('talking');
        }
        await sleep(reduce() ? T.ms(0) : T.ms(-2));
      }
      return my === token;
    }
    function stopAll() { token++; clearTimeout(idleTimer); clearTimeout(readyTimer); clearInterval(spinTimer); root.classList.remove('talking'); }

    // ---- idle: playful scripts, every 4th cycle a system report, now and then a fact ----
    const SCRIPTS = ['HELLO BONNIE', 'SYSTEMS NOMINAL', 'ALL CLEAR', 'STARS ALIGNED', '#WEATHER'];
    let sIx = 0;
    async function idle() {
      if (queue.length) return playReplies();
      stopAll(); mode = 'idle'; const my = token;
      body.setAttribute('aria-label', 'Talk to Simmie here. Tap to type a message.');
      if (reduce()) {   // reduced motion: one static line, no cycling
        const w = await weather(); if (my !== token) return;
        screen.innerHTML = ''; row('simmie>', w ? `PERTH ${w.t}°C · ${w.word} ${w.icon}` : 'HELLO BONNIE'); return;
      }
      while (my === token) {
        if (document.hidden) { await sleep(T.ms(1)); continue; }
        cycle++;
        let lines = null;
        if (cycle % 4 === 0) lines = await report();
        else if (cycle % 4 === 2) { const f = await fact(); if (f) lines = [f]; }
        if (!lines) {
          let s = SCRIPTS[sIx++ % SCRIPTS.length];
          if (s === '#WEATHER') { const w = await weather(); s = w ? `PERTH ${w.t}°C · ${w.word} ${w.icon}` : SCRIPTS[sIx++ % SCRIPTS.length]; }
          lines = [s];
        }
        for (const l of lines) { if (!(await type(l, my))) return; }
        await sleep(T.ssms(3));   // idle gap: Simmie, slot PHI^3 -> PHI^1.5 2.058s, swept by the weather
      }
    }

    // ---- input ----
    function openInput(focus) {
      stopAll(); mode = 'input';
      const r = el('div', 'tty-in-row'); r.append(el('span', 'tty-p', me + '$\u00a0'));
      const wrap = el('span', 'tty-in-wrap'); input = el('input', 'tty-input'); cur = el('span', 'tty-cur');
      input.type = 'text'; input.maxLength = 1500; input.enterKeyHint = 'send'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Message to Simmie');
      wrap.append(input, cur); r.append(wrap); screen.append(r); trim();
      const place = () => { const w = cols(), chW = screen.clientWidth / w; const pos = input.selectionStart == null ? input.value.length : input.selectionStart;
        cur.style.left = Math.max(0, Math.min(pos * chW - input.scrollLeft * 0.8125, wrap.clientWidth - chW)) + 'px'; };
      ['input', 'keyup', 'click', 'select', 'focus'].forEach((e) => input.addEventListener(e, place));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { input.value = ''; input.blur(); idle(); }
      });
      input.addEventListener('blur', () => { setTimeout(() => { if (mode === 'input' && input && !input.value && document.activeElement !== input) idle(); }, T.ms(1)); });
      body.setAttribute('aria-label', 'Simmie terminal');
      if (focus) input.focus({ preventScroll: true }); place();
    }
    async function submit() {
      const text = input.value.trim(); if (!text) return;
      input.value = '';                       // clears on enter
      const id = await opts.send(text);       // the page's own encrypted send
      if (id) myIds.add(id);
      input.parentNode.parentNode.remove(); input = null;
      startWaiting();
    }
    function startWaiting() {
      stopAll(); mode = 'waiting'; waitingSince = Date.now(); const my = token;
      const r = row('simmie>', reduce() ? '⠇' : SPIN[0], 'wait'), t = r.querySelector('.t'); let i = 0, said = false;
      live.textContent = 'Message sent. Waiting for Simmie.';
      spinTimer = setInterval(() => {
        if (my !== token) return clearInterval(spinTimer);
        if (Date.now() - waitingSince > THINK_AFTER) {
          if (!said) { said = true; t.textContent = 'SIMMIE IS THINKING…'; live.textContent = 'Simmie is thinking. Replies can take a minute or more.'; }
          return;
        }
        if (!reduce()) t.textContent = SPIN[++i % SPIN.length];
      }, T.ms(-5));
    }
    async function playReplies() {
      stopAll(); mode = 'reply'; const my = token;
      while (queue.length && my === token) {
        const m = queue.shift(); live.textContent = 'Simmie says: ' + m.text;
        if (!(await type(m.text, my))) return;
      }
      if (my !== token) return;
      ready();
    }
    function ready() {   // stays ready for her next message for ~30 s, then back to idle scripts
      stopAll(); mode = 'ready';
      const r = row(me + '$', ''); r.firstChild.textContent = me + '$\u00a0'; r.append(el('span', 'tty-cur'));
      readyTimer = setTimeout(() => { if (mode === 'ready') idle(); }, READY_FOR);
    }
    body.addEventListener('click', (e) => { if (mode === 'input') { if (input && e.target !== input) input.focus(); return; } if (mode !== 'reply') openInput(true); });
    body.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === body && mode !== 'input') { e.preventDefault(); openInput(true); } });

    function update(list, initial) {
      const simmie = list.filter((m) => m.from === 'simmie');
      if (seen === null) { if (!initial) return; seen = new Set(simmie.map((m) => m.id)); idle(); return; }
      const fresh = simmie.filter((m) => !seen.has(m.id)).sort((a, b) => a.ts - b.ts);
      fresh.forEach((m) => seen.add(m.id));
      if (fresh.length) { mlog(fresh.length > 1 ? fresh.length + ' replies received from simmie' : 'reply received from simmie'); queue.push(...fresh); if (mode !== 'input' || !(input && input.value)) playReplies(); return; }
      if (mode === 'waiting') {
        const mine = list.filter((m) => myIds.has(m.id));
        if (opts.preview && mine.length && mine.every((m) => m.state === 'preview')) {   // PREVIEW: spinner, then say so
          myIds.clear(); const my = token, left = Math.max(0, T.ms(1) - (Date.now() - waitingSince));
          setTimeout(() => { if (my !== token) return; stopAll(); mode = 'reply'; const my2 = token;
            live.textContent = 'Preview, not sent.'; type('PREVIEW, NOT SENT', my2, 'dim').then((ok) => { if (ok) ready(); }); }, left);
          return;
        }
        if (mine.length && mine.every((m) => m.state === 'failed')) {
          stopAll(); mode = 'reply'; const my = token; myIds.clear();
          live.textContent = "That message didn't send. You can try again from the chat.";
          type("DIDN'T SEND · TAP TRY AGAIN IN THE CHAT", my, 'dim').then((ok) => { if (ok) ready(); });
        }
      }
    }
    return { update };
  }
  g.SimmieTTY = { mount };
})(window);
