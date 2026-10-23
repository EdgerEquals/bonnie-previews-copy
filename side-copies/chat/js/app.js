/* Simmie chat page. Everything private is AES-GCM encrypted with a key derived from the chat password.
   Sending: encrypted message -> ntfy relay topic (CORS-friendly simple POST) -> box relay -> Grok Bot routine webhook.
   (The webhook itself can't be called from a browser: it sends no CORS headers for this site, and its key must stay private.)
   Replies: encrypted log.enc.json in the repo (polled) + live encrypted pings on the same relay topic. */
(function () {
  'use strict';
  const C = window.SimmieCrypto;
  const SKEY = 'simmie-chat-key', PKEY = 'simmie-chat-pending';
  const $ = (id) => document.getElementById(id);
  const screens = ['loading', 'notready', 'login', 'chat'];
  const show = (n) => screens.forEach((s) => { $('screen-' + s).hidden = s !== n; });
  // Local testing only: ?stubsend=1 on localhost skips the relay POST and the live relay (nothing leaves the machine).
  // Off by default and ignored on any other host.
  const STUB_SEND = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('stubsend') === '1';
  const mlog = (t) => window.dispatchEvent(new CustomEvent('simmie:log', { detail: t }));   // status only, never content
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let meta = null;      // config.enc.json (public part: salt etc.)
  let key = null;       // CryptoKey
  let cfg = null;       // decrypted config {relay:{base,topic}, repo, branch}
  const msgs = new Map(); // id -> {id, ts, from, text, state}
  let pollTimer = null, lastSentAt = 0, es = null, lastLogText = '', lastLiveId = '', typingUntil = 0, esRetry = null;

  async function boot() {
    try {
      const r = await fetch('REPLACE_ME/config.enc.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('no config');
      meta = await r.json();
      if (!meta || !meta.kdf || !meta.config) throw new Error('bad config');
    } catch (e) { show('notready'); return; }
    const saved = sessionStorage.getItem(SKEY);
    if (saved) {
      try { key = await C.importKey(saved); cfg = await C.decryptJSON(key, meta.config); return openChat(); }
      catch (e) { sessionStorage.removeItem(SKEY); key = null; }
    }
    show('login'); $('pw').focus();
  }

  $('pw-toggle').addEventListener('click', () => {
    const i = $('pw'), on = i.type === 'password'; i.type = on ? 'text' : 'password';
    $('pw-toggle').textContent = on ? 'Hide' : 'Show'; $('pw-toggle').setAttribute('aria-label', on ? 'Hide password' : 'Show password');
  });

  $('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('login-btn'), err = $('login-error'); err.hidden = true; btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const k = await C.deriveKey($('pw').value.trim(), meta.kdf.salt, meta.kdf.iter);
      cfg = await C.decryptJSON(k, meta.config);
      key = k; sessionStorage.setItem(SKEY, await C.exportKey(k)); $('pw').value = '';
      openChat();
    } catch (e) {
      err.textContent = "That password didn't work. Try again?"; err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Open chat'; }
  });

  $('lock-btn').addEventListener('click', () => {
    sessionStorage.removeItem(SKEY); key = null; cfg = null; msgs.clear(); $('log').innerHTML = '';
    lockOut('');
  });
  function lockOut(msg) {
    sessionStorage.removeItem(SKEY); key = null; cfg = null; msgs.clear(); $('log').innerHTML = ''; lastLogText = '';
    clearTimeout(pollTimer); stopLive();
    const err = $('login-error'); if (msg) { err.textContent = msg; err.hidden = false; } else err.hidden = true;
    show('login'); $('pw').focus();
  }

  async function openChat() {
    show('chat'); render();
    await loadPending();
    await pollLog();
    ttySync(true);
    mlog('thread synced · ' + msgs.size + ' msgs');
    startLive();
    if (!window.matchMedia('(max-width:480px)').matches) $('msg').focus();
  }

  // ---------- pending (sent but not yet in the log) ----------
  async function savePending() {
    const list = [...msgs.values()].filter((m) => m.state === 'pending' || m.state === 'sent' || m.state === 'failed')
      .map(({ id, ts, from, text, state, reply_to, answer, comment, type }) => ({ id, ts, from, text, reply_to, answer, comment, type, state: state === 'failed' ? 'failed' : 'sent' }));
    try { localStorage.setItem(PKEY, JSON.stringify(await C.encryptJSON(key, list))); } catch (e) {}
  }
  async function loadPending() {
    try {
      const raw = localStorage.getItem(PKEY); if (!raw) return;
      const list = await C.decryptJSON(key, JSON.parse(raw));
      list.forEach((m) => { if (!msgs.has(m.id)) msgs.set(m.id, m); });
      render();
    } catch (e) { localStorage.removeItem(PKEY); }
  }

  // ---------- log polling ----------
  function logUrls() {
    const repo = cfg.repo || 'REPLACE_ME/REPLACE_ME', br = cfg.branch || 'main', t = Date.now();
    return [
      `REPLACE_ME/${repo}/${br}/log.enc.json?t=${t}`,
      `REPLACE_ME/log.enc.json?ref=${br}&t=${t}`,
      `log.enc.json?t=${t}`,
    ];
  }
  async function fetchLog() {
    for (const u of logUrls()) {
      try {
        const opts = { cache: 'no-store' };
        if (u.includes('api.github.com')) opts.headers = { Accept: 'application/vnd.github.raw+json' };
        const r = await fetch(u, opts);
        if (r.ok) return await r.text();
      } catch (e) {}
    }
    return null;
  }
  async function pollLog() {
    clearTimeout(pollTimer);
    if (!key) return;
    const text = await fetchLog();
    if (text && text !== lastLogText) {
      lastLogText = text;
      try {
        const data = JSON.parse(text); let ok = 0;
        for (const box of data.entries || []) {
          try { addMsg(await C.decryptJSON(key, box), 'logged'); ok++; } catch (e) {}
        }
        if ((data.entries || []).length && !ok && await passwordChanged()) return;
        await savePending(); render();
      } catch (e) {}
    }
    schedulePoll();
  }
  // If nothing in the log opens with our key, check whether the password was changed (new config) and ask again.
  async function passwordChanged() {
    try {
      const r = await fetch('REPLACE_ME/config.enc.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return false;
      const m = await r.json();
      try { await C.decryptJSON(key, m.config); return false; } catch (e) {}
      meta = m; lockOut('The chat password has been changed. Type the new one to open your chat.'); return true;
    } catch (e) { return false; }
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!key || document.hidden) return;
    const since = Date.now() - lastSentAt;
    pollTimer = setTimeout(pollLog, since < 2 * 60 * 1000 ? 5000 : since < 10 * 60 * 1000 ? 15000 : 20000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!key) return;
    if (document.hidden) { clearTimeout(pollTimer); return; }
    startLive(true); pollLog();   // phone came back: reconnect live + check now
  });
  window.addEventListener('online', () => { if (key) { startLive(true); pollLog(); } });

  // ---------- live relay pings (instant replies) ----------
  function stopLive() { clearTimeout(esRetry); if (es) { es.close(); es = null; } }
  function startLive(force) {
    if (STUB_SEND || !key || !cfg || !cfg.relay || !window.EventSource) return;
    if (es && !force && es.readyState !== 2) return;
    if (es && force && es.readyState === 1) return;   // already open
    stopLive();
    try {
      const since = lastLiveId ? '?since=' + encodeURIComponent(lastLiveId) : '';
      es = new EventSource(`${cfg.relay.base}/${cfg.relay.topic}/sse${since}`);
      es.onmessage = async (ev) => {
        try {
          const outer = JSON.parse(ev.data); if (outer.event !== 'message') return;
          if (outer.id) lastLiveId = outer.id;
          const m = await C.decryptJSON(key, JSON.parse(outer.message));
          if (m.type === 'typing') {
            if (Date.now() - (+m.ts || 0) < 5 * 60 * 1000) { typingUntil = Date.now() + 3 * 60 * 1000; render(); }
            return;
          }
          if (m.from === 'simmie') { addMsg(m, 'logged'); typingUntil = 0; render(); }
          else if (m.from === 'dad') { addMsg(m, 'logged'); render(); }
          else if (m.from === 'daughter' && msgs.has(m.id) && msgs.get(m.id).state === 'pending') { msgs.get(m.id).state = 'sent'; render(); }
        } catch (e) {}
      };
      es.onerror = () => {   // browser retries by itself unless closed; if closed, reopen with ?since=
        if (es && es.readyState === 2) { clearTimeout(esRetry); esRetry = setTimeout(() => startLive(true), 3000); }
      };
    } catch (e) {}
  }

  function addMsg(m, state) {
    if (!m || !m.id || typeof m.text !== 'string') return;
    const cur = msgs.get(m.id);
    if (cur && cur.state === 'logged') return;
    const from = m.from === 'simmie' || m.from === 'dad' ? m.from : 'daughter';
    const rec = { id: m.id, ts: +m.ts || Date.now(), from, text: m.text, state };
    if (from !== 'daughter' && m.kind === 'question') {
      rec.kind = 'question'; rec.options = Array.isArray(m.options) && m.options.length ? m.options.map(String).filter((o) => o && o !== 'Ask more').slice(0, 2) : ['Yes', 'No'];
      if (rec.options.length < 2) rec.options = ['Yes', 'No'];
    }
    if (from === 'daughter' && m.type === 'ask-dad') rec.type = 'ask-dad';   // sent from the Ask Dad panel
    if (from === 'daughter' && m.reply_to) { rec.reply_to = String(m.reply_to); rec.answer = String(m.answer || ''); if (m.comment) rec.comment = String(m.comment); }
    msgs.set(m.id, rec);
  }

  // ---------- Dad's Yes / No questions ----------
  // Her tap is sent like any other message of hers (same encrypted relay -> webhook path), with reply_to + answer.
  const senderName = (from) => (from === 'dad' ? 'Dad' : 'Simmie');
  const ASK = 'Ask more';
  function answerFor(q) {
    const prefix = '[Answer to ' + senderName(q.from) + ': "' + q.text + '"] ';
    for (const m of msgs.values()) {
      if (m.from !== 'daughter' || m.state === 'failed') continue;
      if (m.reply_to === q.id) return m.comment ? m.answer + ': ' + m.comment : (m.answer || m.text.slice(m.text.indexOf('"] ') + 3));
      if (!m.reply_to && m.text.startsWith(prefix)) return m.text.slice(prefix.length);
    }
    return null;
  }
  async function answerQuestion(q, opt, comment) {
    if (answerFor(q) !== null) return;
    if (q.from === 'dad') mlog('dad question ' + ([...msgs.values()].sort((a, b) => a.ts - b.ts).filter(isDadQuestion).findIndex((m) => m.id === q.id) + 1) + ' answered');
    const m = { id: 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), ts: Date.now(), from: 'daughter',
      text: '[Answer to ' + senderName(q.from) + ': "' + q.text + '"] ' + (comment ? opt + ': ' + comment : opt), reply_to: q.id, answer: opt };
    if (comment) m.comment = comment;
    addMsg(m, 'pending'); render();
    await deliver(m);
  }

  // ---------- sending ----------
  const ta = $('msg');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('send-form').requestSubmit(); } });
  $('send-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = ta.value.trim(); if (!text) return;
    ta.value = ''; ta.style.height = 'auto';
    await sendText(text);
  });
  // One send path for the composer and the simmie — tty box: a normal message of hers, encrypted by deliver().
  async function sendText(text, type) {
    const m = { id: 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), ts: Date.now(), from: 'daughter', text };
    if (type === 'ask-dad') m.type = 'ask-dad';
    addMsg(m, 'pending'); render();
    msgs.get(m.id).p = deliver(m);   // not awaited here; the Ask Dad panel waits on it to show 'Sent to Dad'
    return m.id;
  }
  async function deliver(m) {
    const rec = msgs.get(m.id); rec.state = 'pending'; render();
    try {
      const plain = { id: m.id, ts: m.ts, from: 'daughter', text: m.text };
      if (rec.type === 'ask-dad') plain.type = 'ask-dad';   // tells the reply routine to forward to Dad, not answer as Simmie
      if (rec.reply_to) { plain.reply_to = rec.reply_to; plain.answer = rec.answer; if (rec.comment) plain.comment = rec.comment; }
      const body = JSON.stringify({ v: 1, ...(await C.encryptJSON(key, plain)) });
      if (body.length > 3800) throw new Error('too long');
      const r = STUB_SEND ? { ok: true } : await fetch(`${cfg.relay.base}/${cfg.relay.topic}`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      rec.state = 'sent'; lastSentAt = Date.now(); rec.err = '';
      mlog((rec.type === 'ask-dad' ? 'message sent to Dad' : 'msg encrypted → sent') + (STUB_SEND ? ' [stub]' : ''));
    } catch (e) {
      mlog('msg send failed');
      rec.state = 'failed'; rec.err = String(e.message || e) === 'too long' ? 'Too long, try splitting it up.' : "Didn't send.";
    }
    await savePending(); render(); schedulePoll();
  }

  // ---------- render ----------
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (ts) => new Date(ts).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  function render() {
    const log = $('log'), list = [...msgs.values()].sort((a, b) => a.ts - b.ts);
    
    log.innerHTML = '';
    if (!list.length) {
      const e = document.createElement('div'); e.className = 'empty';
      e.innerHTML = '<p class="big">Hi! 👋</p><p>Type a message below and Simmie will reply here. Replies usually take under a minute.</p>';
      log.appendChild(e);
    }
    let day = '';
    for (const m of list) {
      const d = fmtDay(m.ts);
      if (d !== day) { day = d; const s = document.createElement('div'); s.className = 'day'; s.textContent = d; log.appendChild(s); }
      const b = document.createElement('div');
      const mine = m.from === 'daughter';
      b.dataset.id = m.id;
      b.className = 'msg ' + (mine ? 'me' : 'them') + (m.from === 'dad' ? ' dad' : '') + (m.reply_to ? ' answer' : '') + (m.state === 'pending' ? ' pending' : '') + (m.state === 'failed' ? ' failed' : '');
      if (m.from === 'dad') { const w = document.createElement('span'); w.className = 'sender'; w.textContent = 'Dad'; b.appendChild(w); }
      if (m.type === 'ask-dad') { const q = document.createElement('span'); q.className = 'quote'; q.textContent = 'To Dad'; b.appendChild(q); }
      if (m.reply_to) {
        const qm = msgs.get(m.reply_to), q = document.createElement('span'); q.className = 'quote';
        q.textContent = 'Answer to ' + (qm ? senderName(qm.from) : (m.text.match(/^\[Answer to (\w+)/) || [, 'Dad'])[1]); b.appendChild(q);
        b.appendChild(document.createTextNode(m.comment ? m.answer + ': ' + m.comment : (m.answer || m.text)));
      } else b.appendChild(document.createTextNode(m.text));
      if (m.from !== 'daughter' && m.kind === 'question') b.appendChild(questionControls(m));
      const meta = document.createElement('span'); meta.className = 'meta';
      let label = fmtTime(m.ts);
      if (mine) label += m.state === 'pending' ? ' · sending…' : m.state === 'sent' ? ' · sent ✓' : m.state === 'failed' ? ' · ' + (m.err || "didn't send") : ' · ✓✓';
      meta.textContent = label;
      if (m.state === 'failed') { const r = document.createElement('button'); r.className = 'retry'; r.type = 'button'; r.textContent = 'Try again'; r.onclick = () => deliver(m); meta.appendChild(r); }
      b.appendChild(meta); log.appendChild(b);
      if (jump.id === m.id && Date.now() < jump.until) { b.classList.add('jump-hl'); b.tabIndex = -1; }
    }
    // typing hint: shown while her latest message is newer than Simmie's latest reply (for up to 20 min)
    const lastMine = list.filter((m) => m.from === 'daughter' && m.state !== 'failed' && m.type !== 'ask-dad').pop();
    const lastTheirs = list.filter((m) => m.from === 'simmie').pop();
    const waiting = lastMine && (!lastTheirs || lastTheirs.ts < lastMine.ts) && Date.now() - lastMine.ts < 20 * 60 * 1000;
    const typing = waiting && Date.now() < typingUntil;
    $('typing-text').textContent = typing ? 'Simmie is typing…' : 'Waiting for Simmie… replies usually take under a minute';
    $('typing').classList.toggle('active', typing);
    $('typing').hidden = !waiting;
    dadChip(list);
    ttySync(false, list);
    emitStatus(list);
    const box = askOpen && document.querySelector('.ask-box textarea');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); box.scrollIntoView({ block: 'nearest' }); }
    else if (jump.id && Date.now() < jump.until) {   // keep a just-jumped-to question in view (and focused) across re-renders
      const t = log.querySelector('.msg[data-id="' + CSS.escape(jump.id) + '"]');
      if (t) { t.scrollIntoView({ block: 'center' }); if (jump.refocus && document.activeElement === document.body) (t.querySelector('.choice:not(:disabled)') || t).focus({ preventScroll: true }); }
    }
    else log.scrollTop = log.scrollHeight;
  }

  // ---------- Dad's question jump (header chip) ----------
  // A Dad message counts as a question if it has buttons (kind 'question', from chat.py ask) or its text ends with '?'.
  // Unanswered: button questions -> answerFor(q) is null (no reply of hers with reply_to = its id, and no
  // '[Answer to Dad: "..."]' message); plain '?' messages -> she hasn't sent any (non-failed) message after it.
  const isDadQuestion = (m) => m.from === 'dad' && (m.kind === 'question' || /\?[\s"'”’)\]\p{Extended_Pictographic}\uFE0F]*$/u.test(m.text));
  function unansweredDad(list) {
    const lastMine = list.filter((m) => m.from === 'daughter' && m.state !== 'failed').reduce((t, m) => Math.max(t, m.ts), 0);
    return list.filter((m) => isDadQuestion(m) && (m.kind === 'question' ? answerFor(m) === null : lastMine <= m.ts));
  }
  // ---------- message status for the pulse layer (rule 7): the page works out a state word and hands only that over ----------
  let seenTs = Date.now(), seenT = null, lastStatus = '';
  function markSeenSoon() {   // seen = page visible and the log at the bottom for PHI^3 4.236 s
    clearTimeout(seenT);
    const log = $('log'); if (document.hidden || !log || log.scrollHeight - log.scrollTop - log.clientHeight > 40) return;
    seenT = setTimeout(() => { seenTs = Date.now(); emitStatus(); }, window.PhiTiming.ms(3));
  }
  function emitStatus(list) {
    list = list || [...msgs.values()].sort((a, b) => a.ts - b.ts);
    const lastAsk = list.filter((m) => m.from === 'daughter' && m.type === 'ask-dad' && m.state !== 'failed').pop();
    const askWaiting = !!lastAsk && !list.some((m) => m.from === 'dad' && m.ts > lastAsk.ts);
    const unseen = list.filter((m) => m.from !== 'daughter' && m.ts > seenTs);
    const st = unansweredDad(list).length || askWaiting ? 'urgent' : unseen.some((m) => m.from === 'dad') ? 'dad' : unseen.length ? 'new' : 'idle';
    window.SimmieMsgStatus = st;
    if (st !== lastStatus) { lastStatus = st; window.dispatchEvent(new CustomEvent('simmie:msgstatus', { detail: { state: st } })); }
    if (unseen.length) markSeenSoon();
  }
  document.addEventListener('visibilitychange', () => markSeenSoon());
  document.addEventListener('DOMContentLoaded', () => { const l = $('log'); if (l) l.addEventListener('scroll', () => markSeenSoon(), { passive: true }); });
  let jump = { id: '', until: 0, refocus: false };
  function dadChip(list) {
    const chip = $('dad-chip'), open = unansweredDad(list), q = open[open.length - 1];
    chip.hidden = !q; if (!q) { chip.dataset.id = ''; return; }
    chip.dataset.id = q.id;
    const short = q.text.replace(/\s+/g, ' ').trim();
    $('dad-chip-q').textContent = short.length > 60 ? short.slice(0, 58).trimEnd() + '…' : short;
    $('dad-chip-more').textContent = open.length > 1 ? '+' + (open.length - 1) : '';
    $('dad-chip-more').hidden = open.length < 2;
    chip.setAttribute('aria-label', 'From Dad: ' + short + (open.length > 1 ? '. Plus ' + (open.length - 1) + ' more unanswered.' : '') + ' Jump to the question.');
  }
  $('dad-chip').addEventListener('click', () => {
    const id = $('dad-chip').dataset.id; if (!id) return;
    const t = $('log').querySelector('.msg[data-id="' + CSS.escape(id) + '"]'); if (!t) return;
    mlog('dad question ' + ([...msgs.values()].sort((a, b) => a.ts - b.ts).filter(isDadQuestion).findIndex((m) => m.id === id) + 1) + ' jumped to');
    jump = { id, until: Date.now() + window.PhiTiming.ms(2), refocus: true };
    t.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    t.classList.remove('jump-hl'); void t.offsetWidth; t.classList.add('jump-hl'); t.tabIndex = -1;
    (t.querySelector('.choice:not(:disabled)') || t).focus({ preventScroll: true });
    setTimeout(() => { jump.refocus = false; const x = $('log').querySelector('.msg.jump-hl'); if (x && Date.now() >= jump.until) x.classList.remove('jump-hl'); }, window.PhiTiming.ms(2) + 100);
  });

  // ---------- simmie — tty box (shown once Dad has messaged; sits as a dock above the composer) ----------
  let tty = null;
  function ttySync(initial, list) {
    list = list || [...msgs.values()].sort((a, b) => a.ts - b.ts);
    const dock = $('tty-dock');
    if (!window.SimmieTTY) { dock.hidden = true; return; }
    dock.hidden = !list.some((m) => m.from === 'dad');
    if (!tty) {
      tty = window.SimmieTTY.mount(dock, { name: 'bonnie', send: (t) => sendText(t) });
      if (window.SimmieAskDad) window.SimmieAskDad.mount(dock.querySelector('.tty-bar'), { send: async (t) => { const id = await sendText(t, 'ask-dad'); const r = msgs.get(id); if (r && r.p) await r.p; return !!r && r.state === 'sent'; } });
    }
    tty.update(list, initial);
  }
  // On a small phone, fold the dock away while she types in the main composer (keyboard up = little room).
  ta.addEventListener('focus', () => { if (window.matchMedia('(max-width:480px)').matches) $('screen-chat').classList.add('composing'); });
  ta.addEventListener('blur', () => $('screen-chat').classList.remove('composing'));
  // Yes / No (+ "Ask more" -> small text box). Locked once answered; the answered state comes from the log.
  let askOpen = '', askDraft = '';
  function questionControls(m) {
    const ans = answerFor(m), wrap = document.createElement('div'), row = document.createElement('div');
    row.className = 'choices' + (ans !== null ? ' done' : ''); wrap.appendChild(row);
    const picked = ans === null ? null : (ans.startsWith(ASK) ? ASK : ans);
    const opts = m.options.concat([ASK]);   // Ask more is always the third option
    for (const opt of opts) {
      const btn = document.createElement('button'); btn.type = 'button';
      btn.className = 'choice' + (opt === ASK ? ' ask' : '') + (picked === opt ? ' picked' : '') + (askOpen === m.id && opt === ASK ? ' open' : '');
      btn.textContent = (picked === opt ? '✓ ' : '') + opt; btn.disabled = ans !== null;
      btn.onclick = () => {
        if (opt === ASK) { askOpen = askOpen === m.id ? '' : m.id; render(); if (askOpen) { const t = document.querySelector('.ask-box textarea'); if (t) t.focus(); } return; }
        row.querySelectorAll('button').forEach((x) => { x.disabled = true; }); askOpen = ''; answerQuestion(m, opt);
      };
      row.appendChild(btn);
    }
    if (ans !== null) {
      const n = document.createElement('span'); n.className = 'choice-note';
      n.textContent = ans.startsWith(ASK) ? 'You asked: ' + ans.replace(/^Ask more:?\s*/, '') : 'You answered: ' + ans; wrap.appendChild(n);
    } else if (askOpen === m.id) {
      const f = document.createElement('form'); f.className = 'ask-box';
      const t = document.createElement('textarea'); t.rows = 2; t.maxLength = 1000; t.placeholder = 'Type your question or comment…'; t.value = askDraft;
      t.setAttribute('aria-label', 'Your question or comment for ' + senderName(m.from));
      t.oninput = () => { askDraft = t.value; };
      const s = document.createElement('button'); s.type = 'submit'; s.className = 'choice'; s.textContent = 'Send';
      f.onsubmit = (e) => { e.preventDefault(); const v = t.value.trim(); if (!v) return; askOpen = ''; askDraft = ''; answerQuestion(m, ASK, v); };
      f.appendChild(t); f.appendChild(s); wrap.appendChild(f);
    }
    return wrap;
  }
  // The answer as the page knows it: "Yes" / "No" / "Ask more: <text>"
  setInterval(() => { if (key && !askOpen) render(); }, window.PhiTiming.ms(7));

  if (window.SimmieWeather) window.SimmieWeather.mount($('wx'));
  boot();
})();
