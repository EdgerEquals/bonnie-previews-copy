// Rebella moderation: MISSION LOG. Short timestamped lines narrating real on-page events (weather, queue, decisions
// by item number, refreshes, facts, rotation, tab visibility). Display only: it sends nothing, and it never logs
// talk-box text, chat content, titles or passwords. Last 4 lines, older ones fade. At least 1.5 s per line.
// Reduced motion: lines appear without typing. Paused while the tab is hidden.
(function(){
  "use strict";
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  var PT = window.PhiTiming;   // pacing from js/phi-timing.js: real lines >= mlog-pace apart, ambient line at most every mlog-ambient
  var MAX = 4;
  var q = [], busy = false, lastAt = 0, hb = null, on = false;
  function ts(){ return new Date().toLocaleTimeString("en-AU", {timeZone:"Australia/Perth", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false}); }
  function box(){ return document.getElementById("wx-mlog"); }
  function push(text){ if(!on && text.indexOf("tab") !== 0) { q.push(text); return; } q.push(text); pump(); }
  function pump(){
    if(busy || !q.length || document.hidden || !box()) return;
    while(q.length > 6){ var k = q.findIndex(function(t){ return /^(turn:|\u00B7)/.test(t); }); if(k < 0) break; q.splice(k, 1); }   // keep up with real events: drop old scenery lines first
    var fast = q.length > 3, wait = Math.max(0, lastAt + (fast ? 700 : PT.ms("mlog-pace")) - Date.now());
    if(wait){ busy = true; setTimeout(function(){ busy = false; pump(); }, wait); return; }
    busy = true; var text = q.shift(), b = box();
    var line = document.createElement("div"); line.className = "ml-line";
    var t = document.createElement("span"); t.className = "ml-t"; t.textContent = ts() + " ";
    var m = document.createElement("span"); m.className = "ml-m"; line.appendChild(t); line.appendChild(m);
    b.appendChild(line); while(b.children.length > MAX) b.removeChild(b.firstChild);
    [].forEach.call(b.children, function(c, i){ c.style.opacity = [0.25, 0.45, 0.7, 1][MAX - b.children.length + i]; });
    var mirror = document.getElementById("tty-mlog"); if(mirror) mirror.textContent = text;
    var done = function(){ busy = false; lastAt = Date.now(); beat(); pump(); };
    if(RM.matches || fast){ m.textContent = text; done(); return; }
    var i = 0; (function type(){ if(document.hidden){ setTimeout(type, 400); return; } m.textContent = text.slice(0, ++i); if(i < text.length) setTimeout(type, 28); else done(); })();
  }
  function beat(){ clearTimeout(hb); hb = setTimeout(function(){ if(!q.length && !document.hidden){ push("\u00B7 all systems nominal"); } else beat(); }, PT.ms("mlog-ambient")); }
  window.RebellaLog = push;

  // events the page really has
  document.addEventListener("rebella:status", function(ev){
    var d = ev.detail || {};
    if(!on){ on = true; push("boot: dashboard unlocked"); }
    if(d.pending !== st.pending) push("queue: " + d.pending + " waiting");
    if(d.linkMs != null && d.linkAt !== st.linkAt) push("link: queue file " + d.linkMs + "ms");
    else if(d.link === "fail" && d.linkAt !== st.linkAt) push("link: queue check failed, retry in 60s");
    st = {pending:d.pending, linkAt:d.linkAt};
    pump();
  });
  var st = {pending:null, linkAt:null};
  document.addEventListener("rebella:decision", function(ev){
    var d = ev.detail || {}; if(!d.n) return;
    push("item #" + d.n + " " + (d.status === "approved" ? "approved" : d.status === "rejected" ? "skipped" : "back to pending") + (d.preview ? " (preview: not saved)" : ""));
  });
  document.addEventListener("rebella:locked", function(){ q = []; var b = box(); if(b) b.textContent = ""; on = false; clearTimeout(hb); });
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function(){
    if(!on) return;
    if(document.hidden){ hiddenAt = Date.now(); q.push("tab hidden \u2014 holding"); }
    else { q.push("tab back \u2014 resuming (" + Math.round((Date.now() - hiddenAt)/1000) + "s away)"); pump(); }
  });
  var mq = window.matchMedia ? window.matchMedia("(orientation: portrait)") : null;
  if(mq && mq.addEventListener) mq.addEventListener("change", function(){ if(on) push("rotated: " + (mq.matches ? "portrait" : "landscape")); });
})();
