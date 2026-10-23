/* PREVIEW for Dad (previews/chat/): the chat page side copy with a built-in sample thread.
   Hard-coded preview mode: no password, no crypto, no relay / ntfy, no log or config fetch. Nothing is ever sent.
   Rendering, the Dad question chip, the simmie — tty box and Ask Dad are the same code as the side branch. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const screens = ['chat'];
  const show = (n) => screens.forEach((s) => { $('screen-' + s).hidden = s !== n; });
  const mlog = (t) => window.dispatchEvent(new CustomEvent('simmie:log', { detail: t }));   // status only, never content
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const msgs = new Map();
  let typingUntil = 0;
  async function savePending() {}
  function schedulePoll() {}

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
  // PREVIEW: her tap animates like a send, then shows 'preview, not sent'.
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
    if (q.from === 'dad') mlog('dad question answered');
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
  // PREVIEW: nothing is encrypted or sent. The bubble shows 'sending…', then 'preview, not sent'.
  async function deliver(m) {
    const rec = msgs.get(m.id); rec.state = 'pending'; render();
    await new Promise((r) => setTimeout(r, reduceMotion() ? window.PhiTiming.ms(-3) : window.PhiTiming.ms(0)));
    rec.state = 'preview'; mlog('preview: not sent'); render();
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
      if (mine) label += m.state === 'pending' ? ' · sending…' : m.state === 'preview' ? ' · preview, not sent' : m.state === 'sent' ? ' · sent ✓' : m.state === 'failed' ? ' · ' + (m.err || "didn't send") : ' · ✓✓';
      meta.textContent = label;
      if (false) { const r = document.createElement('button'); r.className = 'retry'; r.type = 'button'; r.textContent = 'Try again'; r.onclick = () => deliver(m); meta.appendChild(r); }
      b.appendChild(meta); log.appendChild(b);
    }
    // typing hint: shown while her latest message is newer than Simmie's latest reply (for up to 20 min)
    const lastMine = list.filter((m) => m.from === 'daughter' && m.state !== 'failed' && m.state !== 'preview' && m.type !== 'ask-dad').pop();
    const lastTheirs = list.filter((m) => m.from === 'simmie').pop();
    const waiting = lastMine && (!lastTheirs || lastTheirs.ts < lastMine.ts) && Date.now() - lastMine.ts < 20 * 60 * 1000;
    const typing = waiting && Date.now() < typingUntil;
    $('typing-text').textContent = typing ? 'Simmie is typing…' : 'Waiting for Simmie… replies usually take under a minute';
    $('typing').classList.toggle('active', typing);
    $('typing').hidden = !waiting;
    ttySync(false, list);
    emitStatus(list);
    const box = askOpen && document.querySelector('.ask-box textarea');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); box.scrollIntoView({ block: 'nearest' }); }
    else log.scrollTop = log.scrollHeight;
  }

  // Unanswered (same rule as the side copy): button questions -> no answer yet; plain '?' -> she hasn't sent anything after it.
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
  // ---------- simmie — tty box (shown once Dad has messaged; sits as a dock above the composer) ----------
  let tty = null;
  function ttySync(initial, list) {
    list = list || [...msgs.values()].sort((a, b) => a.ts - b.ts);
    const dock = $('tty-dock');
    if (!window.SimmieTTY) { dock.hidden = true; return; }
    dock.hidden = !list.some((m) => m.from === 'dad');
    if (!tty) {
      tty = window.SimmieTTY.mount(dock, { name: 'bonnie', preview: true, send: (t) => sendText(t) });
      if (window.SimmieAskDad) window.SimmieAskDad.mount(dock.querySelector('.tty-bar'), { sentText: 'preview, not sent', send: async (t) => { const id = await sendText(t, 'ask-dad'); const r = msgs.get(id); if (r && r.p) await r.p; return !!r && r.state === 'preview'; } });
    }
    tty.update(list, initial);
  }
  // On a small phone, fold the dock away while she types in the main composer (keyboard up = little room).
  ta.addEventListener('focus', () => { if (window.matchMedia('(max-width:480px)').matches) $('screen-chat').classList.add('composing'); });
  ta.addEventListener('blur', () => $('screen-chat').classList.remove('composing'));
  // Phones: fold the footer feed away while any text box has the keyboard up, so it never jumps over the text box.
  document.addEventListener('focusin', (e) => { if (window.matchMedia('(pointer:coarse)').matches && e.target.matches && e.target.matches('#msg, .tty-input')) $('screen-chat').classList.add('kb'); });
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!(a && a.matches && a.matches('#msg, .tty-input'))) $('screen-chat').classList.remove('kb'); }, 50));
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
  setInterval(() => { if (!askOpen) render(); }, window.PhiTiming.ms(7));

  if (window.SimmieWeather) window.SimmieWeather.mount($('wx'));
  // ---------- PREVIEW boot: built-in sample thread (written for this preview; not real chat content) ----------
  const now = Date.now(), M = 60000;
  [
    { id: 'pv-s1', ts: now - 95 * M, from: 'simmie', text: 'Hi Bonnie! This is a preview of your chat page. How has your day been?' },
    { id: 'pv-d1', ts: now - 90 * M, from: 'daughter', text: 'Pretty good, thanks!' },
    { id: 'pv-q1', ts: now - 70 * M, from: 'dad', text: 'Would you like to go for a walk by the river on Sunday morning?', kind: 'question', options: ['Yes', 'No'] },
    { id: 'pv-s2', ts: now - 65 * M, from: 'simmie', text: 'A river walk sounds lovely. Maybe you will spot some black swans.' },
    { id: 'pv-d2', ts: now - 40 * M, from: 'dad', text: 'Proud of how hard you worked on your project this week.' },
    { id: 'pv-p1', ts: now - 20 * M, from: 'dad', text: 'Which would you like for dinner tomorrow, soup or a stir-fry?' },
  ].forEach((m) => addMsg(m, 'logged'));
  // PREVIEW hooks: a mock Simmie reply after a preview send, and the feed's 'Chat →' jump.
  window.SimmiePreview = {
    simmieSays(text) {
      const id = 'pv-s-' + Date.now().toString(36);
      addMsg({ id, ts: Date.now(), from: 'simmie', text }, 'logged'); render();
      window.dispatchEvent(new CustomEvent('simmie:reply', { detail: { id, text } }));
    },
  };
  window.addEventListener('ft:open-chat', (e) => {
    const id = e.detail && e.detail.id, t = id && $('log').querySelector('.msg[data-id="' + CSS.escape(id) + '"]');
    if (t) { t.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); t.classList.remove('ft-hl'); void t.offsetWidth; t.classList.add('ft-hl'); setTimeout(() => t.classList.remove('ft-hl'), window.PhiTiming.ms(2)); }
    $('msg').focus({ preventScroll: true });
    mlog('jumped to simmie reply');
  });
  show('chat'); render(); ttySync(true); mlog('preview thread loaded · ' + msgs.size + ' msgs');
})();
