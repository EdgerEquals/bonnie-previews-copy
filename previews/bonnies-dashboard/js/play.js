/* Bonnie's Dashboard (preview / side copy only): message-status glow layer (phi rule 7), interaction meters (rule 8)
   and haptics (rule 9). Rules: /home/box/.config/phi-timing-rules.md, periods from js/phi-timing.js.
   Input is pointer, touch and keyboard only: no microphone, camera or other sensor, no permission prompts.
   Nothing here sends, saves to a server, or reads message text; the only storage is the preview-only haptics on/off key.
   Message status comes from page state only: queue pending count, the Ask Dad window being open, Simmie still replying. */
(function(){
  "use strict";
  var PT = window.PhiTiming, PHI = PT.PHI;
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  var $ = function(s){ return document.querySelector(s); };
  var HKEY = "preview-phi-haptics";
  var OVER = 1 / Math.pow(PHI, 3);            // overshoot ~0.236
  var DECAY = Math.pow(PHI, 2) * 1000;        // 2.618 s
  var HOLD = PHI * 1000;                      // peak-hold 1.618 s
  var SETTLE = 1000 / PHI;                    // overshoot settles back in ~0.618 s
  var BARS = 6;

  // ---------- haptics (rule 9): feature-detected, try/catch, fails silently ----------
  var hapOn = true; try{ hapOn = localStorage.getItem(HKEY) !== "off"; }catch(e){}
  var lastBuzz = 0;
  function buzz(pattern, force){
    if(!hapOn) return;
    try{
      if(typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
      var now = Date.now(); if(!force && now - lastBuzz < HOLD) return;   // at most one pulse per PHI^1 s
      lastBuzz = now; navigator.vibrate(pattern);
    }catch(e){}
  }
  function buzzFor(y){ buzz(y * (1 + OVER) > 1 ? 28 : y >= 0.5 ? 20 : 8); }   // gentle 8 | firm 20 | past the overshoot line 28

  // ---------- press model (rule 8) ----------
  // x: raw 0..1 from pressure / contact size / hold time / drag velocity; y: mapped level
  function curve(x){ x = Math.max(0, Math.min(1, x)); if(x < 0.15) return 0; var u = (x - 0.15) / 0.85; return 1 - Math.pow(1 - u, PHI); }
  function pressX(ev, heldMs){
    var p = 0;
    if(ev && typeof ev.pressure === "number" && ev.pressure > 0 && ev.pressure !== 0.5 && ev.pointerType !== "mouse") p = ev.pressure;   // real pressure only
    else if(ev && ev.width > 1 && ev.height > 1 && ev.pointerType === "touch") p = Math.min(1, (ev.width * ev.height) / (44 * 44));
    var h = Math.min(1, (heldMs || 0) / HOLD);
    return Math.max(p, h, 0.3);   // a plain tap still registers as a gentle press
  }

  // ---------- meters ----------
  var meters = {}, boost = 0;
  function meter(name, host){
    var m = document.createElement("span"); m.className = "pl-meter"; m.setAttribute("aria-hidden", "true");
    for(var i = 0; i < BARS; i++){ var b = document.createElement("i"); b.style.setProperty("--i", i); m.appendChild(b); }
    var pk = document.createElement("b"); pk.className = "pl-peak"; m.appendChild(pk);
    host.appendChild(m);
    meters[name] = {el:m, bars:[].slice.call(m.children, 0, BARS), peakEl:pk, y:0, t0:0, target:0, peak:0, peakAt:0, shown:-1};
  }
  function hit(name, x){
    var M = meters[name]; if(!M) return; var y = curve(x); if(!y) return;
    var now = performance.now();
    M.target = Math.max(y, level(M, now)); M.t0 = now;
    if(M.target >= M.peak || now - M.peakAt > HOLD){ M.peak = M.target; M.peakAt = now; }
    boost = Math.max(boost, M.target); paintBoost();
    buzzFor(y); kick();
  }
  // level over time: rise is instant at the press, overshoot by OVER then settle, then decay to 0 over PHI^2 s
  function level(M, now){
    var dt = now - M.t0, y = M.target; if(!y) return 0;
    if(RM.matches){ return dt < DECAY ? y : 0; }   // stepping: hold, then off
    if(dt < SETTLE){ var s = dt / SETTLE; return y * (1 + OVER * Math.sin(Math.PI * Math.min(1, s * 2)) * (1 - s)); }
    var d = (dt - SETTLE) / DECAY; return d >= 1 ? 0 : y * Math.pow(1 - d, PHI);
  }
  function paint(M, now){
    var v = Math.min(1 + OVER, level(M, now)), lit = Math.round(v * BARS);
    if(lit !== M.shown){ M.bars.forEach(function(b, i){ b.className = i < lit ? (i >= BARS - 1 ? "on hot" : i >= BARS - 2 ? "on warm" : "on") : ""; }); M.shown = lit; }
    if(now - M.peakAt > HOLD) M.peak = 0;   // peak-hold drops after PHI^1 s
    var pi = M.peak ? Math.min(BARS - 1, Math.round(M.peak * BARS) - 1) : -1;
    M.peakEl.style.display = pi < 0 ? "none" : ""; if(pi >= 0) M.peakEl.style.setProperty("--i", pi);
    return v > 0 || M.peak > 0;
  }
  var raf = 0, stepT = 0;
  function frame(){
    raf = 0; var now = performance.now(), live = false;
    Object.keys(meters).forEach(function(k){ if(paint(meters[k], now)) live = true; });
    boost = Math.max(0, boost - (RM.matches ? 0 : 16 / DECAY)); paintBoost();
    if(live || boost > 0) kick();
  }
  function kick(){
    if(RM.matches){ clearTimeout(stepT); stepT = setTimeout(function(){ frame(); if(!RM.matches) return; }, 0);
      setTimeout(frame, HOLD + 20); setTimeout(function(){ boost = 0; frame(); }, DECAY + 20); return; }
    if(!raf && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function paintBoost(){ document.documentElement.style.setProperty("--msg-boost", boost.toFixed(3)); }   // brightens the glow; never its period

  // ---------- message-status layer (rule 7) ----------
  function ring(host, cls){ if(!host) return; var r = document.createElement("span"); r.className = "msg-ring" + (cls ? " " + cls : ""); r.setAttribute("aria-hidden", "true"); host.appendChild(r); }
  var pending = 0, lastMsg = null;
  function status(){
    var dad = $("#dad-panel"), foot = $("#wx-foot");
    var urgent = (dad && !dad.hidden) || (foot && foot.classList.contains("tty-busy-on"));   // Ask Dad waiting / question awaiting a reply
    var st = urgent ? "urgent" : pending > 0 ? "new" : "idle";
    PT.setMsg(st); var eff = PT.msg();
    if(eff !== lastMsg){ if(eff === "urgent") buzz([18, 90, 18], true); lastMsg = eff; }   // urgent: once per change of status
  }

  // ---------- controls ----------
  function build(){
    var strip = $("#wx-foot"); if(!strip || $("#pl-play")) return;
    var box = document.createElement("div"); box.id = "pl-play"; box.className = "pl-play"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "One of many ways to play (nothing is sent)");
    box.title = "one of many ways to play";
    // dial
    var dw = document.createElement("span"); dw.className = "pl-cell";
    var dial = document.createElement("span"); dial.className = "pl-dial"; dial.tabIndex = 0; dial.setAttribute("role", "slider");
    dial.setAttribute("aria-label", "Play dial"); dial.setAttribute("aria-valuemin", "0"); dial.setAttribute("aria-valuemax", "100");
    var knob = document.createElement("i"); dial.appendChild(knob); dw.appendChild(dial); meter("dial", dw);
    // lever
    var lw = document.createElement("span"); lw.className = "pl-cell";
    var lever = document.createElement("span"); lever.className = "pl-lever"; lever.tabIndex = 0; lever.setAttribute("role", "slider");
    lever.setAttribute("aria-label", "Play lever (springs back)"); lever.setAttribute("aria-valuemin", "0"); lever.setAttribute("aria-valuemax", "100"); lever.setAttribute("aria-valuenow", "0");
    var handle = document.createElement("i"); lever.appendChild(handle); lw.appendChild(lever); meter("lever", lw);
    // switch: native checkbox with the switch attribute (real tick on iOS 18+ Safari; a normal checkbox elsewhere)
    var sw = document.createElement("label"); sw.className = "pl-cell pl-swcell";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.setAttribute("switch", ""); cb.className = "pl-switch"; cb.setAttribute("aria-label", "Play switch");
    sw.appendChild(cb); meter("switch", sw);
    // buttons meter (fed by every existing button on the page)
    var bw = document.createElement("span"); bw.className = "pl-cell pl-btncell"; bw.title = "buttons"; meter("buttons", bw);
    // haptics on/off (tiny; on by default)
    var hp = document.createElement("label"); hp.className = "pl-hap"; hp.title = "haptics on/off";
    var hcb = document.createElement("input"); hcb.type = "checkbox"; hcb.checked = hapOn; hcb.setAttribute("aria-label", "Haptics");
    var hl = document.createElement("span"); hl.setAttribute("aria-hidden", "true"); hl.textContent = "\u3030";
    hp.appendChild(hcb); hp.appendChild(hl);
    hcb.addEventListener("change", function(){ hapOn = hcb.checked; try{ localStorage.setItem(HKEY, hapOn ? "on" : "off"); }catch(e){} });
    [dw, lw, sw, bw, hp].forEach(function(n){ box.appendChild(n); });
    var ro = $("#wx-readout"); strip.insertBefore(box, ro || null);

    // dial: rotate by dragging round the centre or with arrow keys; drag speed + pressure drive the meter
    var ang = 0, dd = null;
    function setAng(a){ ang = Math.max(-135, Math.min(135, a)); knob.style.transform = "rotate(" + ang + "deg)"; dial.setAttribute("aria-valuenow", String(Math.round((ang + 135) / 2.7))); }
    function pAng(ev){ var r = dial.getBoundingClientRect(); return Math.atan2(ev.clientY - (r.top + r.height/2), ev.clientX - (r.left + r.width/2)) * 180 / Math.PI; }
    dial.addEventListener("pointerdown", function(ev){ dd = {a:pAng(ev), t:performance.now(), t0:performance.now(), base:ang}; try{ dial.setPointerCapture(ev.pointerId); }catch(e){} ev.preventDefault(); });
    dial.addEventListener("pointermove", function(ev){ if(!dd) return; var a = pAng(ev), da = a - dd.a; if(da > 180) da -= 360; if(da < -180) da += 360;
      var now = performance.now(), v = Math.abs(da) / Math.max(8, now - dd.t);   // deg per ms
      dd.a = a; dd.t = now; setAng(ang + da); if(Math.abs(da) > 0.5) hit("dial", Math.max(Math.min(1, v / 1.2), pressX(ev, 0) * 0.8)); });
    function dEnd(ev){ if(!dd) return; hit("dial", pressX(ev, performance.now() - dd.t0) * 0.9); dd = null; }
    dial.addEventListener("pointerup", dEnd); dial.addEventListener("pointercancel", function(){ dd = null; });
    var kd = {}; function held(k){ var n = performance.now(); if(!kd[k]) kd[k] = n; return n - kd[k]; }
    dial.addEventListener("keydown", function(ev){ var s = {ArrowUp:9, ArrowRight:9, ArrowDown:-9, ArrowLeft:-9, PageUp:27, PageDown:-27}[ev.key]; if(!s) return;
      ev.preventDefault(); setAng(ang + s); hit("dial", Math.max(0.3, Math.min(1, held("d") / HOLD))); });
    dial.addEventListener("keyup", function(){ kd.d = 0; });
    setAng(-60);

    // lever: pull along the track, springs back on release; pull distance (eased) + pull speed drive the meter
    var ld = null, LW = 26;
    function setPull(f, spring){ f = Math.max(0, Math.min(1, f)); lever.classList.toggle("spring", !!spring); handle.style.transform = "translateX(" + (f * LW).toFixed(1) + "px)"; lever.setAttribute("aria-valuenow", String(Math.round(f * 100))); return f; }
    lever.addEventListener("pointerdown", function(ev){ var r = lever.getBoundingClientRect(); ld = {x0:r.left + 5, t:performance.now(), x:ev.clientX, t0:performance.now(), f:0}; try{ lever.setPointerCapture(ev.pointerId); }catch(e){} ev.preventDefault(); });
    lever.addEventListener("pointermove", function(ev){ if(!ld) return; var now = performance.now(), v = Math.abs(ev.clientX - ld.x) / Math.max(8, now - ld.t);
      ld.x = ev.clientX; ld.t = now; ld.f = setPull((ev.clientX - ld.x0) / LW); hit("lever", Math.max(ld.f, Math.min(1, v / 0.9), pressX(ev, 0) * 0.8)); });
    function lEnd(ev){ if(!ld) return; hit("lever", Math.max(ld.f, pressX(ev, performance.now() - ld.t0) * 0.8)); ld = null; setPull(0, true); }
    lever.addEventListener("pointerup", lEnd); lever.addEventListener("pointercancel", function(){ ld = null; setPull(0, true); });
    var lk = 0;
    lever.addEventListener("keydown", function(ev){ if(["ArrowRight","ArrowUp"," ","Enter"].indexOf(ev.key) < 0) return; ev.preventDefault();
      lk = Math.min(1, lk + 0.25); setPull(lk); hit("lever", Math.max(lk, Math.min(1, held("l") / HOLD))); });
    lever.addEventListener("keyup", function(){ kd.l = 0; lk = 0; setPull(0, true); });
    lever.addEventListener("blur", function(){ lk = 0; setPull(0, true); });

    // switch: press time / pressure of the flick drives its meter (the tick itself is the browser's own)
    var sd = null;
    cb.addEventListener("pointerdown", function(ev){ sd = {t0:performance.now(), ev:ev}; });
    cb.addEventListener("change", function(){ var h = sd ? performance.now() - sd.t0 : 0; hit("switch", pressX(sd && sd.ev, h) + (cb.checked ? 0.15 : 0)); sd = null; });

    // existing buttons: press model only (their own behaviour is untouched; Approve/Reject stay preview-only)
    var bd = new WeakMap();
    document.addEventListener("pointerdown", function(ev){ var b = ev.target.closest && ev.target.closest("#app button, #ask-dad, #app .btn"); if(b) bd.set(b, {t0:performance.now(), ev:ev}); }, true);
    document.addEventListener("pointerup", function(ev){ var b = ev.target.closest && ev.target.closest("#app button, #ask-dad, #app .btn"); var d = b && bd.get(b); if(!d) return; bd.delete(b); hit("buttons", pressX(d.ev, performance.now() - d.t0)); }, true);
    document.addEventListener("keydown", function(ev){ if((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("#app button, #ask-dad")) hit("buttons", 0.45); }, true);

    // message-status rings: terminal LED, Ask Dad button, feed edge
    var bar = $(".tty-bar"); if(bar){ var led = document.createElement("span"); led.className = "msg-led"; led.setAttribute("aria-hidden", "true"); bar.insertBefore(led, bar.querySelector("span")); ring(led); }
    ring($("#ask-dad")); ring($("#wx-ticker"), "edge");
    var mo = new MutationObserver(status);
    if($("#dad-panel")) mo.observe($("#dad-panel"), {attributes:true, attributeFilter:["hidden"]});
    if($("#wx-foot")) mo.observe($("#wx-foot"), {attributes:true, attributeFilter:["class"]});
    status();
  }
  document.addEventListener("rebella:status", function(ev){ var d = ev.detail || {}; if(typeof d.pending === "number") pending = d.pending; build(); status(); });
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) kick(); });
})();
