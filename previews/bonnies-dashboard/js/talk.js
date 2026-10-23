// PREVIEW COPY: the talk box and Ask Dad never touch the chat relay or ntfy. They play the full animation, then say
// "preview, not sent". No chat password is asked for or stored.
// Rebella moderation: the "simmie - tty" terminal in the footer.
// Idle: types short scripts, and every 4th cycle a SYSTEM REPORT of real dashboard data or a FACT.
// Tap: talk to Simmie inline. Uses the SAME channel as the Simmie chat page (EdgerEquals/simmie-chat js/app.js):
// the chat config (config.enc.json), the key derived from the chat password (PBKDF2 -> AES-GCM, js/simmie-crypto.js),
// an encrypted {v,iv,ct} text/plain POST to the chat relay topic, and replies from the same topic (live) + log.enc.json.
// So messages land in Bonnie's chat thread and the chat page replies routine answers them.
// The chat password is never stored: like the chat page, only the derived key is kept in sessionStorage (this tab).
// No pop-ups. Static under reduced motion. Paused while the tab is hidden.
(function(){
  "use strict";
  var CHAT = "https://edgerequals.github.io/simmie-chat/";
  var SKEY = "simmie-chat-key";            // same sessionStorage name the chat page uses (same origin)
  var SC = window.SimmieCrypto, PREVIEW = true;
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  var $ = function(s){ return document.querySelector(s); };
  var H = function(){ return window.RebellaHud || null; };
  var LOG = function(t){ if(window.RebellaLog) window.RebellaLog(t); };   // event names only, never text
  var SPIN = ["\u280B","\u2819","\u2839","\u2838","\u283C","\u2834","\u2826","\u2827","\u2807","\u280F"];
  var mode = "idle", started = false, timer = null, job = null, cycle = 0, afterTimer = null;
  var chat = {meta:null, key:null, cfg:null}, wait = null;   // wait: {id, ts, es, poll, t0}

  function perth(ts, withDay){
    var o = {timeZone:"Australia/Perth", hour:"2-digit", minute:"2-digit", hour12:false};
    if(withDay){ o.day = "numeric"; o.month = "short"; }
    return new Date(ts).toLocaleString("en-AU", o) + " AWST";
  }
  function ago(ms){ var s = ms/1000; return s < 3600 ? Math.max(1, Math.round(s/60)) + " min" : s < 172800 ? Math.round(s/3600) + " h" : Math.round(s/86400) + " days"; }

  // ---------- what the idle terminal says ----------
  function scripts(){
    var st = H() && H().status(), w = H() && H().weatherMsg();
    var l = ["HEY BONNIE!", "YOU ROCK"];
    if(st) l.push(st.pending ? st.pending + " TO CHECK - YOU GOT THIS" : "QUEUE CLEAR - HIGH FIVE");
    l.push("STARS ALIGNED \u2728");
    if(w) l.push(w);
    l.push("SYSTEMS NOMINAL");
    return l;
  }
  function report(){   // real data only; a line is left out when its value isn't known
    var h = H(), st = h && h.status(), L = ["SYSTEM REPORT " + perth(Date.now())];
    if(st){
      L.push("queue: " + st.pending + " pending \u00B7 " + st.approved + " approved \u00B7 " + st.rejected + " rejected");
      if(st.top) L.push("next up: \"" + st.top.title + "\" (score " + st.top.score + ")");
      if(st.newest && st.newest.date) L.push("newest article: \"" + st.newest.title + "\" (source date " + new Date(st.newest.date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric",timeZone:"Australia/Perth"}) + ")");
      if(st.updated) L.push("feed updated: " + perth(st.updated*1000) + " (" + ago(Date.now() - st.updated*1000) + " ago)");
      L.push("last queue check: " + (st.link === "ok" ? "ok" : "FAILED") + " at " + perth(st.linkAt));
      L.push("published pages: " + st.published + (st.liveChecked ? " \u00B7 " + st.liveChecked + " confirmed live just now" : ""));
    }
    var ps = h && h.stats();
    if(ps){ var s = ps.stages;
      L.push("pipeline: " + s.passed_filters + " passed filters \u00B7 " + s.waiting_for_bonnie + " waiting for Bonnie" + (s.not_yet_in_her_queue != null ? " (" + s.not_yet_in_her_queue + " not yet in her queue)" : ""));
      L.push("screened out: " + s.screened_out_safety + " by safety filter \u00B7 " + s.screened_out_low_score + " low score");
      if(ps.oldest_waiting_found_at) L.push("oldest waiting: " + ago(Date.now() - Date.parse(ps.oldest_waiting_found_at)));
      if(ps.last_scan_at) L.push("last scan: " + perth(Date.parse(ps.last_scan_at), true));
    }
    if(h){ var a = h.age(); L.push("age dial: " + a.age + (a.src === "default" ? " (default; age-dial.json not published)" : a.src === "?age" ? " (preview link)" : ""));
      var w = h.weather(); L.push(w && w.ok ? "weather: " + w.label + (w.temp != null ? " " + w.temp + "\u00B0" : "") + " Perth (Open-Meteo " + perth(w.at) + ")" + (w.forced ? " [preview mood]" : "")
        : w ? "weather: n/a (fetch failed; showing preview mood)" : "weather: n/a (Open-Meteo not reachable)"); }
    return L;
  }
  function factLine(){
    var f = H() && H().fact(Math.floor(cycle/4)); if(!f) return null;
    LOG("fact #" + (Math.floor(cycle/4) + 1) + (f.source ? " (" + String(f.source).toLowerCase() + ")" : " (built-in)"));
    return "FACT" + (f.source ? " \u00B7 " + f.source : "") + ": " + f.text;
  }

  // ---------- terminal output ----------
  var out = function(){ return $("#tty-out"); };
  function cloud(on){ var c = $("#tty-cloud"); if(c) c.classList.toggle("talking", !!on && !RM.matches); }
  function cap(){   // characters that fit on the output line (body width minus cloud, prompt and padding)
    var body = $(".tty-body"), m = $("#tty-measure"); if(!body) return 40;
    var cw = m ? m.getBoundingClientRect().width / 10 : 7.2; cw = cw || 7.2;
    var avail = body.clientWidth - 26 - 6 - 10 - cw * 8.5;   // 8.5 chars = "simmie> "
    return Math.max(12, Math.floor(avail / cw) - 1);
  }
  function chunks(text){
    var n = cap(), words = String(text).split(/\s+/), res = [], cur = "";
    words.forEach(function(w){
      while(w.length > n){ if(cur){ res.push(cur); cur = ""; } res.push(w.slice(0, n)); w = w.slice(n); }
      if(!cur) cur = w; else if((cur + " " + w).length <= n) cur += " " + w; else { res.push(cur); cur = w; }
    });
    if(cur) res.push(cur); return res;
  }
  function stop(){ clearTimeout(timer); timer = null; job = null; cloud(false); }
  // types each line (split into chunks that fit), holding between; then calls done
  function typeLines(lines, done, hold){
    stop(); var q = []; lines.forEach(function(l){ chunks(l).forEach(function(c){ q.push(c); }); });
    var i = 0, pos = 0; job = {q:q};
    function step(){
      timer = null; if(!job) return;
      if(document.hidden){ return; }                 // resumes on visibilitychange
      var o = out(); if(!o) return;
      if(i >= q.length){ cloud(false); job = null; if(done) done(); return; }
      if(RM.matches){ o.textContent = q[i]; i++; timer = setTimeout(step, hold || 2600); return; }
      cloud(true); pos++; o.textContent = q[i].slice(0, pos);
      if(pos >= q[i].length){ cloud(false); i++; pos = 0; timer = setTimeout(step, hold || 2200); }
      else timer = setTimeout(step, 55);
    }
    job.step = step; timer = setTimeout(step, 250);
  }

  // ---------- idle loop ----------
  function idle(){
    mode = "idle"; showPane("idle");
    if(RM.matches){ stop(); out().textContent = "HEY BONNIE!"; setIdleLabel("HEY BONNIE!"); return; }
    cycle++;
    var lines;
    if(cycle % 8 === 4){ lines = report(); LOG("report: " + lines.length + " lines"); }
    else if(cycle % 8 === 0 && (lines = factLine())) lines = [lines];
    else { var s = scripts(); lines = [s[cycle % s.length]]; }
    setIdleLabel(lines.join(". "));
    typeLines(lines, function(){ out().textContent = ""; timer = setTimeout(function(){ if(mode === "idle") idle(); }, window.PhiTiming.ms("tty-gap")); }, window.PhiTiming.ms(lines.length > 1 ? "tty-hold-multi" : "tty-hold"));
  }
  function setIdleLabel(t){ var b = $("#tty-open"); if(b) b.setAttribute("aria-label", "Simmie says: " + t + ". Tap to talk to Simmie"); }

  // ---------- panes ----------
  function showPane(p){
    $("#tty-open").hidden = p !== "idle";
    $("#tty-form").hidden = p !== "input" && p !== "key";
    $("#tty-busy").hidden = p !== "busy";
    var f = $("#tty-form");
    if(p === "input" || p === "key"){
      f.dataset.mode = p;
      $("#tty-prompt").textContent = p === "key" ? "chat password$" : "bonnie$";
      var i = $("#tty-in"); i.type = p === "key" ? "password" : "text";
      i.setAttribute("aria-label", p === "key" ? "Chat password (kept for this tab only)" : "Message to Simmie");
      i.placeholder = p === "key" ? "same as your chat page" : "type to Simmie\u2026";
      i.autocomplete = p === "key" ? "current-password" : "off";
      $("#tty-send").textContent = p === "key" ? "Unlock" : "Send";
    }
    document.getElementById("wx-foot").classList.toggle("tty-open", p !== "idle");
  }
  function busyLine(t){ $("#tty-busy-text").textContent = t; }

  // ---------- chat channel (same as the chat page) ----------
  async function loadMeta(){
    if(chat.meta) return chat.meta;
    var r = await fetch("REPLACE_ME/config.enc.json?t=" + Date.now(), {cache:"no-store", credentials:"omit"});
    if(!r.ok) throw new Error("no chat config"); chat.meta = await r.json(); return chat.meta;
  }
  async function ensureKey(){
    if(PREVIEW) return true;
    if(chat.key && chat.cfg) return true;
    await loadMeta();
    var saved = sessionStorage.getItem(SKEY);
    if(saved){ try{ chat.key = await SC.importKey(saved); chat.cfg = await SC.decryptJSON(chat.key, chat.meta.config); return true; }
      catch(e){ sessionStorage.removeItem(SKEY); chat.key = null; chat.cfg = null; } }
    return false;
  }
  async function unlock(pw){
    await loadMeta();
    var k = await SC.deriveKey(pw.trim(), chat.meta.kdf.salt, chat.meta.kdf.iter);
    var cfg = await SC.decryptJSON(k, chat.meta.config);     // throws if the password is wrong
    chat.key = k; chat.cfg = cfg; sessionStorage.setItem(SKEY, await SC.exportKey(k)); LOG("talk: chat unlocked for this tab");
  }
  async function deliver(text){
    if(PREVIEW) return {id:"preview", ts:Date.now(), preview:true};
    var m = {id:"d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8), ts:Date.now(), from:"daughter", text:text, source:"moderation"};
    var body = JSON.stringify(Object.assign({v:1}, await SC.encryptJSON(chat.key, m)));
    if(body.length > 3800) throw new Error("too long");
    var r = await fetch(chat.cfg.relay.base + "/" + chat.cfg.relay.topic, {method:"POST", body:body, headers:{"Content-Type":"text/plain"}});
    if(!r.ok) throw new Error("HTTP " + r.status);
    return m;
  }
  function endWait(){ var f = $("#wx-foot"); if(f) f.classList.remove("tty-busy-on"); if(!wait) return; if(wait.es) wait.es.close(); clearTimeout(wait.poll); clearInterval(wait.spin); clearTimeout(wait.giveUp); wait = null; }
  function listen(m){
    endWait();
    if(m.preview){   // play the thinking animation, then answer locally
      wait = {id:m.id, ts:m.ts, t0:Date.now(), done:false}; var w = wait;
      w.giveUp = setTimeout(function(){ if(wait !== w) return; w.done = true; endWait(); showReply("preview, not sent"); }, 4500);
      return;
    }
    wait = {id:m.id, ts:m.ts, t0:Date.now(), done:false};
    var w = wait;
    function got(reply){ if(w.done || wait !== w) return; w.done = true; endWait(); showReply(reply.text); }
    try{
      w.es = new EventSource(chat.cfg.relay.base + "/" + chat.cfg.relay.topic + "/sse?since=" + Math.floor(m.ts/1000 - 5));
      w.es.onmessage = async function(ev){
        try{
          var o = JSON.parse(ev.data); if(o.event !== "message") return;
          var x = await SC.decryptJSON(chat.key, JSON.parse(o.message));
          if(x.type === "typing"){ w.typing = true; return; }
          if(x.from === "simmie" && typeof x.text === "string" && (+x.ts || 0) >= m.ts - 2000) got(x);
        }catch(e){}
      };
    }catch(e){}
    (function poll(){   // fallback: the chat log in the repo (same URL order as the chat page)
      w.poll = setTimeout(async function(){
        if(wait !== w) return;
        if(!document.hidden){
          var repo = chat.cfg.repo || "REPLACE_ME/REPLACE_ME", br = chat.cfg.branch || "main";
          try{
            var r = await fetch("REPLACE_ME/" + repo + "/" + br + "/log.enc.json?t=" + Date.now(), {cache:"no-store", credentials:"omit"});
            if(r.ok){ var d = await r.json();
              for(var i = (d.entries||[]).length - 1; i >= 0 && i >= d.entries.length - 12; i--){
                try{ var x = await SC.decryptJSON(chat.key, d.entries[i]); if(x.from === "simmie" && (+x.ts||0) >= m.ts - 2000){ got(x); return; } }catch(e){}
              } }
          }catch(e){}
        }
        poll();
      }, 15000);
    })();
    w.giveUp = setTimeout(function(){ if(wait === w) endWait(); }, 10*60*1000);   // stop listening after 10 min
  }
  function thinking(){
    $("#wx-foot").classList.add("tty-busy-on");
    mode = "busy"; showPane("busy"); stop(); cloud(true);
    var i = 0, w = wait;
    function tick(){
      if(!wait || wait !== w || mode !== "busy") return;
      var s = (Date.now() - w.t0) / 1000, sp = RM.matches ? "\u2026" : SPIN[i++ % SPIN.length];
      if(s > 240){ busyLine("still thinking - the reply will also land on your chat page"); cloud(false);
        clearInterval(w.spin); setTimeout(function(){ if(mode === "busy") idle(); }, 6000); return; }
      busyLine(sp + (w.typing ? " typing\u2026" : s > 20 ? " SIMMIE IS THINKING\u2026" : ""));
    }
    tick(); w.spin = setInterval(function(){ if(!document.hidden) tick(); }, RM.matches ? 5000 : 120);
  }
  function showReply(text){
    LOG("talk: reply received");
    clearTimeout(afterTimer);
    var live = $("#tty-live"); if(live) live.textContent = "Simmie: " + text;
    mode = "reply"; showPane("busy"); busyLine("");
    $("#tty-busy").hidden = true; $("#tty-open").hidden = false;   // output line
    typeLines([text], function(){ openInput(true); }, 1800);
  }

  // ---------- talk mode ----------
  async function openTalk(){
    stop(); mode = "input";
    var ok = false; try{ ok = await ensureKey(); }catch(e){ ok = false; if(!chat.meta){ return say(["can't reach the chat right now - try your chat page"], idle); } }
    showPane(ok ? "input" : "key"); $("#tty-in").value = ""; $("#tty-in").focus();
  }
  function openInput(auto){
    mode = "input"; showPane("input"); var i = $("#tty-in"); i.value = "";
    if(auto) i.focus({preventScroll:true});
    clearTimeout(afterTimer);
    afterTimer = setTimeout(function(){ if(mode === "input" && !$("#tty-in").value) closeTalk(); }, 30000);
  }
  function closeTalk(){ clearTimeout(afterTimer); $("#tty-in").value = ""; idle(); var b = $("#tty-open"); if(b && document.activeElement && document.activeElement.closest("#tty")) b.focus({preventScroll:true}); }
  function say(lines, then){ mode = "reply"; showPane("idle"); typeLines(lines, then || idle, 2200); }

  function wire(){
    $("#tty-open").addEventListener("click", function(){ if(mode === "idle" || mode === "reply") openTalk(); });
    $("#tty-x").addEventListener("click", closeTalk);
    $("#tty-form").addEventListener("keydown", function(e){ if(e.key === "Escape"){ e.preventDefault(); closeTalk(); } });
    $("#tty-in").addEventListener("input", function(){ clearTimeout(afterTimer); });
    $("#tty-form").addEventListener("submit", async function(e){
      e.preventDefault();
      var i = $("#tty-in"), v = i.value; i.value = "";            // clears straight away
      if(this.dataset.mode === "key"){
        if(!v.trim()) return;
        try{ await unlock(v); v = ""; showPane("input"); i.focus(); }
        catch(err){ v = ""; say(["hmm, that password didn't open your chat - try again?"], function(){ showPane("key"); mode = "input"; i.focus(); }); }
        return;
      }
      var text = v.trim(); if(!text) return;
      if(text.length > 1500) return say(["that's a long one - try splitting it up"], function(){ openInput(true); });
      clearTimeout(afterTimer);
      try{ var m = await deliver(text); LOG(m.preview ? "preview: not sent" : "talk: message sent"); listen(m); thinking(); }
      catch(err){ say([String(err.message) === "too long" ? "too long - try splitting it up" : "didn't send - check your connection and try again"], function(){ openInput(true); }); }
    });
  }

  // ---------- Ask Dad: ONE amber circle pinned at the top-right of the header + a small non-modal transmission window ----------
  // In normal header flow (Lock sits just to its left); not draggable. Tap/Enter/Space opens the window just below it,
  // kept on screen. The plain message is tagged type:"ask-dad" and goes the same encrypted relay path as the talk box
  // (in the preview copy nothing is sent).
  function dadWire(){
    var btn = $("#ask-dad"), panel = $("#dad-panel"), ta = $("#dp-text"), st = $("#dp-status"), keyRow = $("#dp-keyrow"), key = $("#dp-key");
    if(!btn || !panel) return;
    var closeT = null;
    try{ localStorage.removeItem("preview-askdad-pos"); localStorage.removeItem("bd-askdad-pos"); }catch(e){}   // old floating-button position
    function topMin(){ var b = document.querySelector(".preview-band"); return b ? Math.ceil(b.getBoundingClientRect().bottom) + 4 : 6; }
    function placePanel(){   // just below the button, fully on screen (above only if it can't fit below); clamped sideways
      var r = btn.getBoundingClientRect(), pw = panel.offsetWidth, ph = panel.offsetHeight, m = 8;
      var y = r.bottom + m; if(y + ph > innerHeight - m) y = Math.max(topMin(), r.top - ph - m);
      if(y + ph > innerHeight - m) y = Math.max(topMin(), innerHeight - ph - m);
      var x = Math.min(Math.max(m, r.right - pw), innerWidth - pw - m);
      panel.style.left = Math.round(x) + "px"; panel.style.top = Math.round(y) + "px";
    }
    var rT = null; function replace(){ clearTimeout(rT); rT = setTimeout(function(){ if(!panel.hidden) placePanel(); }, 120); }
    window.addEventListener("resize", replace); window.addEventListener("orientationchange", function(){ setTimeout(replace, 350); });
    window.addEventListener("scroll", function(){ if(!panel.hidden) placePanel(); }, {passive:true});
    function toggle(){ panel.hidden ? open() : close(); }
    btn.addEventListener("click", toggle);
    btn.classList.add("ready");
    function open(){
      clearTimeout(closeT); panel.hidden = false; panel.classList.remove("sent","closing"); placePanel(); void panel.offsetWidth; panel.classList.add("opening");
      btn.setAttribute("aria-expanded","true"); st.textContent = "";
      ensureKey().catch(function(){ return false; }).then(function(ok){ keyRow.hidden = !!ok; placePanel(); });
      setTimeout(function(){ ta.focus({preventScroll:true}); }, RM.matches ? 0 : 280);
    }
    function close(){
      clearTimeout(closeT); if(panel.hidden) return;
      btn.setAttribute("aria-expanded","false"); key.value = "";
      var done = function(){ panel.hidden = true; panel.classList.remove("opening","sent","closing"); };
      if(RM.matches) done(); else { panel.classList.add("closing"); setTimeout(done, 220); }
      if(panel.contains(document.activeElement) || document.activeElement === document.body) btn.focus({preventScroll:true});
    }
    // the biplane: takes off from the window and climbs off screen, trailing smoke puffs (transform + opacity only)
    function fly(done){
      if(RM.matches || !document.body.animate){ done(); return; }
      var tpl = $("#biplane-tpl"), r = panel.getBoundingClientRect(); if(!tpl){ done(); return; }
      var plane = tpl.content.firstElementChild.cloneNode(true); document.body.appendChild(plane);
      var x0 = r.left + 30, y0 = r.bottom - 40, dx = innerWidth - x0 + 80, dy = -(y0 + 80), T = 2000, t0 = performance.now(), puffs = 0, layer = document.createElement("div");
      layer.className = "bp-smoke"; layer.setAttribute("aria-hidden","true"); document.body.appendChild(layer);
      var path = function(k){ return {x:x0 + dx * k, y:y0 + dy * k * k + Math.sin(k * 9) * 4}; };   // gentle climb with a bob
      var frames = []; for(var i = 0; i <= 10; i++){ var k = i/10, p = path(k), bank = -8 - 14 * k + Math.sin(k * 7) * 4;
        frames.push({transform:"translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px) rotate(" + bank.toFixed(1) + "deg)", opacity:i === 10 ? 0 : 1}); }
      var a = plane.animate(frames, {duration:T, easing:"cubic-bezier(.35,.05,.6,1)", fill:"forwards"});
      var spawn = setInterval(function(){
        if(puffs >= 25 || document.hidden) return;
        var m = new DOMMatrixReadOnly(getComputedStyle(plane).transform), tail = m.transformPoint(new DOMPoint(4, 20)), s = document.createElement("span"); puffs++;
        s.className = "bp-puff"; layer.appendChild(s);
        var wx = (Math.random() - .5) * 14, wy = -6 - Math.random() * 10, sc = 2.2 + Math.random();
        s.animate([{transform:"translate(" + tail.x.toFixed(1) + "px," + tail.y.toFixed(1) + "px) scale(.5)", opacity:.85},
                   {transform:"translate(" + (tail.x - 10 + wx).toFixed(1) + "px," + (tail.y + wy).toFixed(1) + "px) scale(" + sc.toFixed(2) + ")", opacity:0}],
                  {duration:1200, easing:"ease-out", fill:"forwards"}).onfinish = function(){ s.remove(); };
      }, 80);
      a.onfinish = function(){ clearInterval(spawn); plane.remove(); setTimeout(function(){ layer.remove(); }, 1300); };
      setTimeout(done, 1500);   // the window closes while the plane is still climbing away
    }
    $("#dp-x").addEventListener("click", close);
    panel.addEventListener("keydown", function(e){ if(e.key === "Escape"){ e.preventDefault(); close(); } });
    [].forEach.call(panel.querySelectorAll(".dp-chip"), function(c){ c.addEventListener("click", function(){ ta.value = c.textContent; ta.focus(); }); });
    ta.addEventListener("keydown", function(e){ if(e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer:fine)").matches){ e.preventDefault(); $("#dp-form").requestSubmit(); } });
    function sent(label){
      ta.value = ""; panel.classList.add("sent"); st.textContent = label;
      fly(function(){ closeT = setTimeout(close, RM.matches ? 2500 : 300); });
    }
    $("#dp-form").addEventListener("submit", async function(e){
      e.preventDefault();
      var text = ta.value.trim(); if(!text){ st.textContent = "type something first"; return; }
      var sendBtn = $("#dp-send"); sendBtn.disabled = true; st.textContent = "transmitting\u2026";
      try{
        if(PREVIEW){ await new Promise(function(r){ setTimeout(r, 400); }); LOG("preview: not sent"); sent("Sent to Dad (preview, not sent)"); return; }
        if(!(await ensureKey())){
          if(!key.value.trim()){ keyRow.hidden = false; placePanel(); key.focus(); st.textContent = "chat password needed once for this tab"; return; }
          try{ await unlock(key.value); }catch(err){ key.value = ""; st.textContent = "that password didn't open your chat"; key.focus(); return; }
          key.value = ""; keyRow.hidden = true;
        }
        var m = {id:"d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8), ts:Date.now(), from:"daughter", type:"ask-dad", text:text, source:"moderation"};
        var body = JSON.stringify(Object.assign({v:1}, await SC.encryptJSON(chat.key, m)));
        if(body.length > 3800) throw new Error("too long");
        var r = await fetch(chat.cfg.relay.base + "/" + chat.cfg.relay.topic, {method:"POST", body:body, headers:{"Content-Type":"text/plain"}});
        if(!r.ok) throw new Error("HTTP " + r.status);
        LOG("message sent to Dad"); sent("Sent to Dad \u2713");
      }catch(err){ st.textContent = String(err.message) === "too long" ? "too long - try a shorter one" : "didn't send - try again"; }
      finally{ sendBtn.disabled = false; }
    });
    document.addEventListener("rebella:locked", close);
    // (pinned in the header: nothing to place)
  }

  document.addEventListener("visibilitychange", function(){ if(!document.hidden && job && !timer && job.step) timer = setTimeout(job.step, 200); });
  document.addEventListener("rebella:status", function(){ if(!started){ started = true; wire(); dadWire(); idle(); } });
  document.addEventListener("rebella:locked", function(){ stop(); endWait(); clearTimeout(afterTimer); mode = "idle"; sessionStorage.removeItem(SKEY); chat.key = null; chat.cfg = null; });
})();
