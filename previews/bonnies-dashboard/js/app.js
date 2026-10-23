// PREVIEW COPY for Dad (simmie-chat/previews/bonnies-dashboard). Same passcode gate and encrypted queue as Bonnie's real
// dashboard, but nothing is saved or sent: Approve/Reject only show "preview, not saved"; no relay, no ntfy, no GitHub writes.
// Rebella moderation dashboard. Passcode gate (PBKDF2 hash in js/config.js) + encrypted real queue (../queue.enc.json).
// Decisions: saved in this browser AND sent, encrypted, to a secret ntfy.sh relay topic; the box relay publishes approvals
// and logs rejections, and sends encrypted status pings back (publishing -> pushed -> live).
(function(){
  "use strict";
  var CFG = window.REBELLA_GATE || {unset:true};
  var CR = window.RebellaCrypto;
  var PREVIEW = true;
  var SKEY = "preview-rebella-mod-session";          // sessionStorage: gate hash (unlocked for this tab)
  var KKEY = "preview-rebella-mod-qkey";             // sessionStorage: derived queue key (not the passcode)
  var DKEY = "preview-rebella-mod-decisions";   // never written in preview; separate name so the real dashboard is never affected     // localStorage: decisions made in this browser
  var CAT = {"Make It":"c-make","Big Questions":"c-questions","Mind & Body":"c-mind","Your World":"c-world","Read Watch Listen":"c-rwl","Your Voice":"c-voice"};
  var $ = function(s){return document.querySelector(s);};
  var filter = "pending";
  var panel = null;   // inline panel open in one card: {id, kind:"reject"|"video", pick, text}
  var REASONS = ["Not age-appropriate","Body image / diet content","Unverified or misleading claims","Advertising or sponsored","Privacy or consent concern","Off-topic for Rebella"];
  var Q = null, ITEMS = [], qkey = null, es = null, live = {}, remote = {}, checking = {};
  var linkState = "ok", linkAt = Date.now(), linkMs = null;   // did the last queue fetch work, and when (read by the footer)
  // Tell the header/footer (js/hud.js, js/talk.js) what the dashboard really knows. Fires only once unlocked,
  // and only carries what is already on screen (counts, titles, times), never the key or the relay topic.
  function emitStatus(counts){
    try{
      var pend = ITEMS.filter(function(it){ return statusOf(it.id) === "pending"; });
      var newest = ITEMS.filter(function(it){ return it.published; }).sort(function(a,b){ return a.published < b.published ? 1 : -1; })[0];
      document.dispatchEvent(new CustomEvent("rebella:status", {detail:{
        pending:counts.pending, approved:counts.approved, rejected:counts.rejected, all:counts.all,
        updated:Q && Q.updated, link:linkState, linkAt:linkAt, linkMs:linkMs,
        top:pend[0] ? {title:pend[0].title, score:pend[0].score} : null,
        newest:newest ? {title:newest.title, date:newest.published} : null,
        published:Q && Q.published ? Object.keys(Q.published).length : 0, liveChecked:Object.keys(live).length
      }}));
    }catch(e){}
  }

  function hex(buf){return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
  function fromHex(h){var a=new Uint8Array(h.length/2);for(var i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a;}
  function safeEq(a,b){if(a.length!==b.length)return false;var r=0;for(var i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0;}
  async function derive(code){
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt:fromHex(CFG.salt), iterations:CFG.iterations}, key, 256);
    return hex(bits);
  }
  async function fetchQueueDoc(){
    var r = await fetch("REPLACE_ME/queue.enc.json?t=" + Date.now(), {cache:"no-store", credentials:"omit"});
    if(!r.ok) throw new Error("no queue"); return r.json();
  }
  async function openQueue(doc){
    Q = await CR.decryptJSON(qkey, doc.box); ITEMS = Q.items || [];
  }

  function isUnlocked(){ return !CFG.unset && sessionStorage.getItem(SKEY) === CFG.hash && !!qkey; }
  function show(){
    var ok = isUnlocked();
    $("#gate").hidden = ok; $("#app").hidden = !ok;
    document.body.classList.toggle("locked", !ok);
    if(ok){ render(); startLive(); } else setTimeout(function(){ $("#passcode").focus(); }, 0);
  }

  // ---------- gate ----------
  var fails = 0;
  $("#gate-form").addEventListener("submit", async function(e){
    e.preventDefault();
    var msg = $("#gate-msg"), input = $("#passcode");
    msg.className = "gate-msg";
    if(CFG.unset){ msg.className="gate-msg warn"; msg.textContent="Passcode not set up yet. Run build_gate.py first."; return; }
    if(!window.crypto || !crypto.subtle){ msg.textContent="This page needs HTTPS to check the passcode."; return; }
    var btn = this.querySelector("button"); btn.disabled = true; msg.textContent = "Checking...";
    try{
      var code = input.value.trim();
      var h = await derive(code);
      if(safeEq(h, CFG.hash)){
        msg.textContent = "Opening the queue...";
        try{
          var doc = await fetchQueueDoc();
          qkey = await CR.deriveKey(code, doc.kdf.salt, doc.kdf.iter);
          await openQueue(doc);
          sessionStorage.setItem(KKEY, await CR.exportKey(qkey));
        }catch(err){ qkey = null; msg.className="gate-msg warn"; msg.textContent="Passcode OK, but the content queue couldn't be opened. Ask Simmie to run the scanner again."; input.value=""; return; }
        sessionStorage.setItem(SKEY, CFG.hash); input.value=""; msg.textContent=""; fails=0; show();
      } else { fails++; input.value=""; msg.textContent="That passcode didn't work."; await new Promise(function(r){setTimeout(r, Math.min(4000, 400*fails));}); }
    } finally { btn.disabled = false; if(!isUnlocked()) input.focus(); }
  });
  $("#lock").addEventListener("click", function(){ sessionStorage.removeItem(SKEY); sessionStorage.removeItem(KKEY); qkey=null; Q=null; ITEMS=[]; if(es){es.close(); es=null;} try{ document.dispatchEvent(new CustomEvent("rebella:locked")); }catch(e){} show(); });

  // ---------- decisions ----------
  function load(){ try{ return JSON.parse(localStorage.getItem(DKEY)) || {}; }catch(e){ return {}; } }
  function save(d){ localStorage.setItem(DKEY, JSON.stringify(d)); }
  // the box's record wins once it exists (shared across devices); this browser's record fills the gap until then
  function rec(id){
    var boxd = (Q && Q.decisions && Q.decisions[id]) || null, loc = load()[id] || null;
    if(Q && Q.published && Q.published[id]) return {status:"approved", state:"published", url:Q.published[id].url, decidedAt:(boxd||loc||{}).decidedAt};
    if(boxd && (!loc || (boxd.decidedAt||"") >= (loc.decidedAt||""))) return boxd;
    return loc;
  }
  function statusOf(id){ var r = rec(id); return r ? r.status : "pending"; }
  function nonce(){ return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10); }

  async function send(obj){
    if(PREVIEW) throw new Error("preview");
    var body = JSON.stringify(Object.assign({v:1}, await CR.encryptJSON(qkey, obj)));
    var r = await fetch(Q.relay.base + "/" + Q.relay.topic, {method:"POST", body:body, headers:{"Content-Type":"text/plain"}});
    if(!r.ok) throw new Error("HTTP " + r.status);
  }
  async function decide(id, status, reason){
    if(PREVIEW){   // nothing saved, nothing sent
      try{ document.dispatchEvent(new CustomEvent("rebella:decision", {detail:{n:ITEMS.findIndex(function(it){ return it.id === id; }) + 1, status:status, preview:true}})); }catch(e){}
      var c = document.querySelector('.item[data-id="' + CSS.escape(id) + '"]');
      if(c){ var n = c.querySelector(".preview-note") || el("p","preview-note"); n.setAttribute("role","status");
        n.textContent = (status === "approved" ? "Approve" : status === "rejected" ? "Reject" : "Undo") + ": preview, not saved"; c.appendChild(n); }
      return;
    }
    try{ document.dispatchEvent(new CustomEvent("rebella:decision", {detail:{n:ITEMS.findIndex(function(it){ return it.id === id; }) + 1, status:status}})); }catch(e){}
    var d = load(), now = new Date().toISOString();
    if(status === "pending") d[id] = {status:"pending", decidedAt:now, state:"sending"};
    else d[id] = {status:status, reason:reason||"", decidedAt:now, state:"sending"};
    save(d); remote[id] = null; render();
    try{
      await send({type:"decision", id:id, status:status, reason:reason||"", decidedAt:now, nonce:nonce()});
      d = load(); if(d[id]) d[id].state = "sent"; save(d);
    }catch(e){ d = load(); if(d[id]) d[id].state = "unsent"; save(d); }
    render();
  }

  // ---------- live status from the box (encrypted pings on the same topic) ----------
  function startLive(){
    if(PREVIEW) return;   // no relay connection in preview
    if(es || !Q || !Q.relay || !window.EventSource) return;
    try{
      es = new EventSource(Q.relay.base + "/" + Q.relay.topic + "/sse?since=12h");
      es.onmessage = async function(ev){
        try{
          var outer = JSON.parse(ev.data); if(outer.event !== "message") return;
          var m = await CR.decryptJSON(qkey, JSON.parse(outer.message));
          if(m.type === "status"){ remote[m.id] = m; if(m.state === "live" && m.url) live[m.id] = m.url; render(); }
        }catch(e){}
      };
    }catch(e){}
  }
  // is the page really there? (same site, so a plain fetch works)
  function checkLive(id, url){
    if(live[id] || checking[id]) return; checking[id] = true;
    fetch(url + "?t=" + Date.now(), {cache:"no-store"}).then(function(r){ if(r.ok){ live[id] = url; render(); } })
      .catch(function(){}).then(function(){ setTimeout(function(){ checking[id] = false; }, 15000); });
  }
  setInterval(function(){ if(isUnlocked()) render(); }, 20000);
  setInterval(async function(){   // pick up queue changes (top-ups, new scans, other devices) every minute
    if(!isUnlocked()) return;
    var t0 = performance.now();
    try{ var doc = await fetchQueueDoc(); await openQueue(doc); linkState = "ok"; linkAt = Date.now(); linkMs = Math.round(performance.now() - t0); render(); }catch(e){ linkState = "fail"; linkAt = Date.now(); linkMs = null; render(); }
  }, 60000);

  function pipeLine(it, r){
    var rm = remote[it.id], url = (r && r.url) || (rm && rm.url) || it.url;
    if(r && r.status === "approved"){
      if(live[it.id]) return {cls:"pipe live", html:"Live \u2713 <a href=\"" + live[it.id] + "\" target=\"_blank\" rel=\"noopener\">Open the page on Rebella</a>"};
      if(rm && rm.state === "error") return {cls:"pipe err", text:"Approved, but publishing hit a problem. Simmie's publisher will retry."};
      if(r.state === "unsent") return {cls:"pipe err", text:"Approved here, but it didn't reach the publisher. Tap Retry."};
      if(r.state === "sending") return {cls:"pipe", text:"Approved \u00b7 sending\u2026"};
      checkLive(it.id, url);
      if((rm && (rm.state === "pushed" || rm.state === "slow")) || r.state === "published") return {cls:"pipe", text:"Approved \u00b7 published, waiting for the page to go live (1\u20135 minutes)\u2026"};
      return {cls:"pipe", text:"Approved, publishing\u2026 (this page updates by itself)"};
    }
    if(r && r.status === "rejected"){
      if(r.state === "unsent") return {cls:"pipe err", text:"Rejected here, but it didn't reach the box. Tap Retry."};
      if(r.state === "sending") return {cls:"pipe", text:"Rejected \u00b7 sending\u2026"};
      if((rm && rm.state === "rejected-logged") || r.state === "logged") return {cls:"pipe", text:"Rejected \u00b7 logged. It won't be suggested again."};
      return {cls:"pipe", text:"Rejected \u00b7 sent"};
    }
    return null;
  }

  function el(tag, cls, text){ var n=document.createElement(tag); if(cls)n.className=cls; if(text!=null)n.textContent=text; return n; }
  function btn(label, cls, fn){ var b=el("button","btn "+cls,label); b.type="button"; b.addEventListener("click",fn); return b; }
  function link(href, text){ var a=el("a",null,text); a.href=href; a.target="_blank"; a.rel="noopener noreferrer"; return a; }

  function card(it){
    var r = rec(it.id), st = r ? r.status : "pending";
    if(st === "pending") r = null;
    var a = el("article", "item " + (CAT[it.category]||"c-make")); a.setAttribute("data-id", it.id);
    var top = el("div","top"), left = el("div");
    left.appendChild(el("span","tag",it.category));
    left.appendChild(el("span","type",it.type));
    top.appendChild(left);
    var rt = el("div"); rt.appendChild(el("span","status "+st, st)); top.appendChild(rt);
    a.appendChild(top);
    if(it.image && (it.image.thumb || it.image.src)){
      var fig = el("div","pic"), img = el("img"); img.src = it.image.thumb || it.image.src; img.alt = it.image.alt || ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      fig.appendChild(img); a.appendChild(fig);
      a.appendChild(el("p","pic-credit","Photo: " + (it.image.artist||"") + " \u00b7 " + (it.image.licLabel||"") + " \u00b7 " + (it.image.via||"")));
    }
    a.appendChild(el("h3",null,it.title));
    a.appendChild(el("p","src","Source: " + it.source + (it.authors ? " \u00b7 " + it.authors : "") + " \u00b7 Licence: " + it.licence));
    a.appendChild(el("p","sum",it.summary || ""));
    var dl = el("dl"); dl.appendChild(el("dt",null,"Suggested age:"));
    dl.appendChild(el("dd","age"+(/not/i.test(it.age)?" bad":""),it.age));
    if(it.words){ dl.appendChild(el("dt",null,"Length:")); dl.appendChild(el("dd",null,it.words + " words")); }
    dl.appendChild(el("dt",null,"Score:")); dl.appendChild(el("dd",null,String(it.score)));
    a.appendChild(dl);
    var ul = el("ul","flags");
    if(!(it.flags||[]).length) ul.appendChild(el("li","none","No flags"));
    (it.flags||[]).forEach(function(f){ ul.appendChild(el("li",null,"\u26A0 "+f)); });
    a.appendChild(ul);
    var ln = el("div","links");
    ln.appendChild(link(it.source_url, it.type === "video" ? "Watch the video first \u2197" : "Read the original \u2197"));
    if(it.image && it.image.page) ln.appendChild(link(it.image.page, "Photo source \u2197"));
    ln.appendChild(link(it.licence_url, "Licence \u2197"));
    a.appendChild(ln);
    if(it.licence_note) a.appendChild(el("p","why",it.licence_note));
    var pl = pipeLine(it, r);
    if(pl){ var p = el("p", pl.cls); if(pl.html) p.innerHTML = pl.html; else p.textContent = pl.text; a.appendChild(p); }
    if(r && r.decidedAt){
      var when = new Date(r.decidedAt).toLocaleString("en-AU",{dateStyle:"medium",timeStyle:"short"});
      a.appendChild(el("p","decision",(st==="approved"?"Approved ":"Rejected ")+when+(r.reason?" \u2014 "+r.reason:"")));
    }
    var acts = el("div","actions");
    if(st === "pending" && panel && panel.id === it.id){
      a.appendChild(panel.kind === "reject" ? rejectPanel(it) : videoPanel(it));
      return a;
    }
    if(st === "pending"){
      acts.appendChild(btn("\u2713 Approve","btn-approve",function(){
        if(it.type === "video"){ openPanel(it.id, "video"); return; }
        decide(it.id,"approved"); }));
      acts.appendChild(btn("\u2715 Reject","btn-primary",function(){ openPanel(it.id, "reject"); }));
    } else if(r && r.state === "unsent"){
      acts.appendChild(btn("\u21BB Retry","btn-approve",function(){ decide(it.id, st, r.reason); }));
    } else if(st === "rejected"){
      acts.appendChild(btn("\u21B6 Undo","btn-secondary",function(){ decide(it.id,"pending"); }));
    }
    a.appendChild(acts);
    return a;
  }

  // ---------- inline panels (no dialogs / confirm boxes) ----------
  function openPanel(id, kind){ panel = {id:id, kind:kind, pick:"", text:""}; render(); focusPanel(); }
  function closePanel(){ var id = panel && panel.id; panel = null; render();
    if(id){ var c = document.querySelector('.item[data-id="' + CSS.escape(id) + '"] .actions button'); if(c) c.focus(); } }
  function focusPanel(){ var f = document.querySelector(".inline-panel select, .inline-panel .btn"); if(f) f.focus(); }
  function onEsc(e){ if(e.key === "Escape"){ e.preventDefault(); closePanel(); } }
  function rejectPanel(it){
    var f = el("form","inline-panel reject-panel"); f.setAttribute("aria-label","Reject this item"); f.noValidate = true;
    f.appendChild(el("p","ip-title","Reject this item?"));
    var lid = "rp-" + it.id.replace(/[^\w-]/g,"");
    var lab = el("label",null,"Reason (optional)"); lab.htmlFor = lid + "-pick"; f.appendChild(lab);
    var sel = el("select","field"); sel.id = lid + "-pick";
    sel.appendChild(new Option("Choose a reason, or type below",""));
    REASONS.forEach(function(r){ sel.appendChild(new Option(r, r)); });
    sel.value = panel.pick; sel.addEventListener("change", function(){ panel.pick = sel.value; });
    f.appendChild(sel);
    var ta = el("textarea","field"); ta.rows = 3; ta.placeholder = "Add a note (optional)"; ta.setAttribute("aria-label","Note (optional)");
    ta.value = panel.text; ta.addEventListener("input", function(){ panel.text = ta.value; });
    f.appendChild(ta);
    var b = el("div","ip-btns");
    var ok = el("button","btn btn-primary btn-reject-confirm","\u2715 Reject"); ok.type = "submit";
    var no = el("button","btn btn-secondary","Cancel"); no.type = "button"; no.addEventListener("click", closePanel);
    b.appendChild(ok); b.appendChild(no); f.appendChild(b);
    f.addEventListener("submit", function(e){
      e.preventDefault();
      var reason = [panel.pick, panel.text.trim()].filter(Boolean).join(": ");
      panel = null; render(); decide(it.id, "rejected", reason);
    });
    f.addEventListener("keydown", onEsc);
    return f;
  }
  function videoPanel(it){
    var d = el("div","inline-panel confirm-strip video-confirm"); d.setAttribute("role","group"); d.setAttribute("aria-label","Approve this video?");
    d.appendChild(el("p","ip-title","Approve this video?"));
    d.appendChild(el("p","cs-text","Have you watched the whole video? It will be embedded on Rebella."));
    var b = el("div","ip-btns");
    b.appendChild(btn("\u2713 Yes, approve","btn-approve",function(){ panel = null; render(); decide(it.id,"approved"); }));
    b.appendChild(btn("Cancel","btn-secondary",closePanel));
    d.appendChild(b); d.addEventListener("keydown", onEsc);
    return d;
  }

  function render(){
    if(!Q) return;
    if(panel && !ITEMS.some(function(it){ return it.id === panel.id && statusOf(it.id) === "pending"; })) panel = null;
    var keepFocus = panel && document.activeElement && document.activeElement.closest && document.activeElement.closest(".inline-panel");
    var q = $("#queue"), counts = {pending:0,approved:0,rejected:0,all:ITEMS.length};
    ITEMS.forEach(function(it){ counts[statusOf(it.id)]++; });
    Object.keys(counts).forEach(function(k){ $("#c-"+k).textContent = counts[k]; });
    document.querySelectorAll(".tab").forEach(function(t){ t.setAttribute("aria-selected", t.dataset.filter===filter ? "true":"false"); });
    emitStatus(counts);
    $("#queue-meta").textContent = "Queue updated " + new Date(Q.updated*1000).toLocaleString("en-AU",{dateStyle:"medium",timeStyle:"short"}) + ". Highest score first.";
    if(keepFocus){   // don't rebuild the cards while someone is typing in an open panel; just refresh the counts
      return;
    }
    q.textContent = "";
    var shown = ITEMS.filter(function(it){ return filter==="all" || statusOf(it.id)===filter; });
    shown.forEach(function(it){ q.appendChild(card(it)); });
    $("#empty").hidden = shown.length > 0;
  }

  document.querySelectorAll(".tab").forEach(function(t){
    t.addEventListener("click", function(){ filter = t.dataset.filter; render(); });
  });


  // ---------- export / reset ----------
  $("#export").addEventListener("click", function(){
    var out = {exportedAt:new Date().toISOString(), note:"Rebella moderation decisions", decisions:
      ITEMS.map(function(it){ var r=rec(it.id)||{}; return {id:it.id,title:it.title,source:it.source,source_url:it.source_url,licence:it.licence,type:it.type,category:it.category,status:r.status||"pending",reason:r.reason||"",decidedAt:r.decidedAt||null,url:live[it.id]||r.url||null}; })};
    var blob = new Blob([JSON.stringify(out,null,2)],{type:"application/json"});
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "rebella-decisions-"+new Date().toISOString().slice(0,10)+".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  });
  function resetStrip(open){
    $("#reset-strip").hidden = !open; $("#reset").setAttribute("aria-expanded", open ? "true" : "false");
    if(open){ $("#reset-msg").textContent = ""; $("#reset-no").focus(); }
  }
  $("#reset").addEventListener("click", function(){ resetStrip($("#reset-strip").hidden); });
  $("#reset-no").addEventListener("click", function(){ resetStrip(false); $("#reset").focus(); });
  $("#reset-yes").addEventListener("click", function(){
    localStorage.removeItem(DKEY); resetStrip(false); render(); $("#reset-msg").textContent = "Cleared the decisions saved in this browser."; $("#reset").focus();
  });
  $("#reset-strip").addEventListener("keydown", function(e){ if(e.key === "Escape"){ e.preventDefault(); resetStrip(false); $("#reset").focus(); } });

  // ---------- boot ----------
  (async function(){
    var saved = sessionStorage.getItem(KKEY);
    if(saved && sessionStorage.getItem(SKEY) === CFG.hash){
      try{ qkey = await CR.importKey(saved); await openQueue(await fetchQueueDoc()); }
      catch(e){ qkey = null; sessionStorage.removeItem(KKEY); }
    }
    show();
  })();
})();
