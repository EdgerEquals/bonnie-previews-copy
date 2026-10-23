/* PREVIEW: two-step 'Send to Simmie' pop-up for the fact band. Pausing the band opens step 1 (the fact, its source,
   'Send to Simmie'); that is replaced in place by step 2 ('Want to add anything?', optional note, Send /
   Just send the fact / close). One native <dialog>, so only one pop-up is ever visible; Esc or the close key cancels.
   Preview sends nothing: the animation plays, it reads 'preview, not sent', the mission log types
   'fact sent to Simmie (preview)' (never her text), it closes and the band resumes.
   Later (NOT wired up here): a normal encrypted chat message, text 'About this fact: <fact>' + '\n\n' + her note. */
(function () {
  'use strict';
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = window.PhiTiming;   // golden-ratio timing
  const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const mlog = (t) => window.dispatchEvent(new CustomEvent('simmie:log', { detail: t }));
  const dlg = h('dialog', 'fs-dlg'); dlg.setAttribute('aria-labelledby', 'fs-h1');
  const win = h('div', 'fs-win');
  const x = h('button', 'fs-x', 'esc ✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close, send nothing');
  // step 1
  const s1 = h('div', 'fs-step fs-s1'); const h1 = h('h2', 'fs-h', 'This fact'); h1.id = 'fs-h1';
  const ftext = h('p', 'fs-fact'); const fsrc = h('p', 'fs-src');
  const go = h('button', 'fs-btn fs-primary', 'Send to Simmie'); go.type = 'button';
  const r1 = h('div', 'fs-row'); r1.append(go); s1.append(h1, ftext, fsrc, r1);
  // step 2
  const s2 = h('form', 'fs-step fs-s2'); s2.hidden = true; s2.autocomplete = 'off';
  const h2 = h('h2', 'fs-h', 'Want to add anything?'); h2.id = 'fs-h2';
  const lbl = h('label', 'fs-lbl', 'Note for Simmie (optional)'); lbl.htmlFor = 'fs-note';
  const note = h('textarea', 'fs-note'); note.id = 'fs-note'; note.rows = 2; note.maxLength = 600; note.placeholder = 'Add a note or question (optional)';
  const send = h('button', 'fs-btn fs-primary', 'Send'); send.type = 'submit';
  const just = h('button', 'fs-btn', 'Just send the fact'); just.type = 'button';
  const r2 = h('div', 'fs-row'); r2.append(just, send); s2.append(h2, lbl, note, r2);
  // sent
  const s3 = h('div', 'fs-step fs-s3', 'preview, not sent'); s3.hidden = true; s3.setAttribute('role', 'status'); s3.tabIndex = -1;
  const ripple = h('span', 'fs-ripple'); ripple.setAttribute('aria-hidden', 'true'); ripple.append(h('i'), h('i'), h('i'));
  const env = h('span', 'fs-env', '✉️'); env.setAttribute('aria-hidden', 'true');
  win.append(x, s1, s2, s3, ripple, env); dlg.append(win); document.body.append(dlg);

  let fact = null, closeT = null;
  function place() {   // same spot every time: just ABOVE the footer feed, fully on screen
    const band = document.getElementById('fact-ticker'), r = band && !band.hidden ? band.getBoundingClientRect() : null;
    const bottom = r ? Math.max(8, Math.round(window.innerHeight - r.top + 8)) : 90;
    dlg.style.top = 'auto'; dlg.style.bottom = bottom + 'px'; dlg.style.maxHeight = (window.innerHeight - bottom - 8) + 'px';
  }
  function swap(from, to, focusEl) {   // smooth in-place replacement: one fades/slides out, the other in
    if (reduce()) { from.hidden = true; to.hidden = false; focusEl && focusEl.focus(); return; }
    from.classList.add('fs-out');
    setTimeout(() => { from.hidden = true; from.classList.remove('fs-out'); to.hidden = false; to.classList.add('fs-in');
      focusEl && focusEl.focus(); setTimeout(() => to.classList.remove('fs-in'), T.ms(-2)); }, T.ms(-3));
  }
  function open(f) {
    fact = f; clearTimeout(closeT);
    win.className = 'fs-win'; s1.hidden = false; s2.hidden = true; s3.hidden = true; note.value = ''; x.hidden = false;
    ftext.textContent = f.text; fsrc.textContent = '';
    if (f.source) { if (f.url) { const a = h('a', '', '— ' + f.source); a.href = f.url; a.rel = 'noopener'; a.target = '_blank'; fsrc.append(a); } else fsrc.textContent = '— ' + f.source; }
    place(); dlg.showModal(); dlg.setAttribute('aria-labelledby', 'fs-h1'); go.focus();
  }
  go.addEventListener('click', () => { dlg.setAttribute('aria-labelledby', 'fs-h2'); swap(s1, s2, note); });
  function fire() {
    const sentFact = fact;
    // Preview: nothing is sent. Real build would send 'About this fact: ' + fact.text + (note ? '\n\n' + note : '').
    x.hidden = true; win.classList.add('is-sent'); swap(s2, s3, s3);
    mlog('fact sent to Simmie (preview)');
    closeT = setTimeout(() => { if (dlg.open) dlg.close(); }, T.ms(1));
    const venus = /venus/i.test(sentFact ? sentFact.text : '');
    setTimeout(() => { if (window.SimmiePreview) window.SimmiePreview.simmieSays(venus ? 'Ooh, good pick! Venus spins backwards too. Want more? (preview)' : 'Ooh, good pick! I love that one. Want more like it? (preview)'); }, T.ms(3));
  }
  s2.addEventListener('submit', (e) => { e.preventDefault(); fire(); });
  just.addEventListener('click', () => { note.value = ''; fire(); });
  x.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { clearTimeout(closeT); fact = null; window.dispatchEvent(new CustomEvent('ft:resume')); });
  window.addEventListener('ft:pause', (e) => open(e.detail));
  window.addEventListener('resize', () => { if (dlg.open) place(); });
})();
