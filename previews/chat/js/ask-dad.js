/* Ask Dad: amber key in the simmie — tty title bar + a small 'transmit to Dad' window (the page's one allowed pop-up).
   Sends through the page's own encrypted send path (passed in), tagged type:'ask-dad' there, so the reply routine can
   forward it to Dad. Native <dialog> + showModal(): focus stays inside, Esc closes, focus returns to the key.
   The mission log only ever gets 'message sent to Dad' (from app.js), never the text. */
(function (g) {
  'use strict';
  const PICKS = ['Can we talk?', 'Can you check something on my page?', 'Just saying hi'];
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function mount(bar, opts) {
    if (!bar || bar.querySelector('.ad-key')) return;
    bar.classList.add('has-ad'); bar.removeAttribute('aria-hidden');
    [...bar.children].forEach((c) => c.setAttribute('aria-hidden', 'true'));   // dots + title stay decorative
    const key = h('button', 'ad-key'); key.type = 'button'; key.setAttribute('aria-haspopup', 'dialog');
    const orbit = h('span', 'ad-orbit'); orbit.setAttribute('aria-hidden', 'true'); orbit.append(h('span', 'ad-sat', '🛰️'));
    key.append(h('span', 'ad-glow'), h('span', 'ad-key-t', 'Ask Dad'), orbit); bar.append(key);

    const dlg = h('dialog', 'ad-dlg'); dlg.setAttribute('aria-labelledby', 'ad-title'); dlg.setAttribute('aria-describedby', 'ad-desc');
    const win = h('div', 'ad-win');
    const top = h('div', 'ad-bar'); const sat = h('span', 'ad-sat2', '🛰️'); sat.setAttribute('aria-hidden', 'true');
    const title = h('h2', 'ad-title', 'transmit to Dad'); title.id = 'ad-title';
    const x = h('button', 'ad-x', 'esc ✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    top.append(sat, title, x);
    const form = h('form', 'ad-body'); form.autocomplete = 'off';
    const lbl = h('label', 'ad-lbl', 'message for Dad'); lbl.htmlFor = 'ad-text';
    const ta = h('textarea', 'ad-text'); ta.id = 'ad-text'; ta.rows = 3; ta.maxLength = 1000; ta.placeholder = 'type here, or pick one below…';
    const chips = h('div', 'ad-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Quick picks');
    PICKS.forEach((p) => { const c = h('button', 'ad-chip', p); c.type = 'button'; c.onclick = () => { ta.value = p; ta.focus(); ta.setSelectionRange(p.length, p.length); }; chips.append(c); });
    const row = h('div', 'ad-row'); const note = h('span', 'ad-note', 'Goes straight to Dad, not Simmie.'); note.id = 'ad-desc';
    const send = h('button', 'ad-send', 'transmit ➤'); send.type = 'submit'; row.append(note, send);
    const err = h('p', 'ad-err'); err.hidden = true;
    form.append(lbl, ta, chips, err, row);
    const sent = h('div', 'ad-sent', opts.sentText || 'Sent to Dad'); sent.setAttribute('role', 'status'); sent.hidden = true;
    const ripple = h('span', 'ad-ripple'); ripple.setAttribute('aria-hidden', 'true'); ripple.append(h('i'), h('i'), h('i'));
    win.append(top, form, sent, ripple); dlg.append(win); document.body.append(dlg);

    let closeT = null;
    function reset() { clearTimeout(closeT); win.classList.remove('is-open', 'is-sent'); form.hidden = false; sent.hidden = true; err.hidden = true; send.disabled = false; ta.value = ''; }
    function open() {
      reset(); dlg.showModal(); void win.offsetWidth; win.classList.add('is-open');
      ta.focus();
    }
    key.addEventListener('click', open);
    x.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { reset(); key.focus({ preventScroll: true }); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // tap outside the window closes too
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      send.disabled = true; err.hidden = true;
      const ok = await opts.send(text);
      if (!ok) { send.disabled = false; err.textContent = "Didn't send. Check your connection and try again."; err.hidden = false; return; }
      win.classList.add('is-sent'); form.hidden = true; sent.hidden = false; sent.focus && sent.setAttribute('tabindex', '-1'); sent.focus();
      closeT = setTimeout(() => { if (dlg.open) dlg.close(); }, g.PhiTiming.ms(1));
    });
  }
  g.SimmieAskDad = { mount };
})(window);
