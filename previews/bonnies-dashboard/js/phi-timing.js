/* PHI TIMING (shared module; same file on every Bonnie site/preview).
   Standing rules: /home/box/.config/phi-timing-rules.md (set by Danny, 2026-10-23). Summary, follow it in future builds:
   1. PHI = 1.6180339887; every timed interval is PHI^n seconds. Fast elements make small moves, slow ones big moves.
   2. Start offsets: element k (fixed order below) starts at period * frac(k * 0.6180339887), the golden angle.
      CSS uses a negative animation-delay (var(--phi-NAME-d)) so nothing waits blank on load.
   3. Bonnie's ladder: blinks PHI^2 2.618 / weather faces PHI^2,3,4 / facts PHI^4 6.854 / loop effect PHI^5 11.09 /
      animals PHI^5 11.09 / offering story PHI^6 17.94 / sticker sway PHI^7 29.03 / slow drift PHI^8 46.98 s.
   4. Simmie's palette runs 1.5 phi steps faster: period = Bonnie slot * PHI^-1.5 (~0.486), so the two ladders never
      share a period and never lock into a repeating alignment (space set 8.72, cloud orbit + space drift 22.84,
      mission log ambient 5.39, Ask Dad glow 2.06, Ask Dad satellite 3.33, cursor + status blinks 1.27 s).
   5. New elements: give them a Bonnie slot by role; Simmie's elements get * PHI^-1.5. Respect reduced motion.
   6. Weather sweep: the weather loop (faces, offering story + loop effect, sticker/chip sway) never changes; the weather
      state shifts every OTHER element's exponent by s steps: hot -1, sun -0.5, storm 0, cloud 0, rain +0.5, fog +1,
      clear night +1.5, deep night (00:00-05:00 Perth) +2. Same s for Bonnie and Simmie (still 1.5 steps apart),
      offsets kept, a new s lands at each element's next cycle boundary, reduced motion ignores it. No weather data: s=0.
      Preview override: ?weather=hot|sun|storm|cloud|rain|fog|night|deep.
   7. Message-status layer (separate pump, never changes weather or swept elements): a soft pulse ring on the terminal
      LED, Chat/Ask Dad buttons and the feed edge: idle PHI^5 11.09, new PHI^3 4.24, unread from Dad PHI^2 2.62,
      urgent (Ask Dad waiting / unanswered question) PHI^1 1.62 s. Only where messages exist (chat + dashboard
      previews and side copies), never on Rebella; it never reads or shows message text. Preview: ?msg=idle|new|dad|urgent.
   Functional timers (network polls, debounces, passcode back-off, one-shot event feedback) are not animations and
   stay as they were. */
(function(root){
  "use strict";
  var PHI = 1.6180339887, G = 0.6180339887, SIM = Math.pow(PHI, -1.5);
  // [name, Bonnie-ladder exponent, Simmie palette?]  ORDER IS THE k NUMBERING: append new elements, never reorder.
  var E = [
    ["light-queue",2,1],["light-fresh",2,1],["light-link",2,1],["light-sky",2,1],["cursor",2,1],
    ["face-a",2,0,1],["face-b",3,0,1],["face-c",4,0,1],
    ["askdad-glow",3,1],["askdad-orbit",4,1],
    ["fact",4,0],["loop-effect",5,0,1],["mlog-ambient",5,1],["animals",5,0],["space",6,1],["story",6,0,1],
    ["sway",7,0,1],["cloud-orbit",8,1],["bg-drift",8,1],
    // other timers found, on the nearest readable step for their role
    ["cloud-breathe",2,1],["cloud-blink",2,1],["cloud-shine",5,1],["cloud-bob",0,1],
    ["wave",4,1],["wave-busy",1,1],["marquee",8,0,1],["chip-drift",7,0,1],["panel-dot",2,1],
    ["gait-trot",-2,0],["gait-hop",-1,0],["gait-dog",2,0],["gait-fly",0,0],["gait-glow",0,0],["animal-cross",4,0],
    ["space-cross",5,1],["space-ring",3,1],["space-ring-slow",4,1],["space-spark",2,1],
    ["tty-hold",4,1],["tty-hold-multi",3,1],["tty-gap",1,1],["mlog-pace",2,1],
    ["band-sway",7,0,1],
    ["askdad-breathe",5,1]   // Ask Dad circle breathing: Simmie slot PHI^5 * PHI^-1.5 = 5.39 s (swept)
  ];
  var T = {}, list = [];
  E.forEach(function(e, i){
    var k = i + 1, n = e[2] ? e[1] - 1.5 : e[1], s = Math.pow(PHI, n), f = (k * G) % 1;
    T[e[0]] = {k:k, n:n, simmie:!!e[2], weather:!!e[3], base:s, frac:f};
    list.push(e[0]);
  });
  var SWEEP = {hot:-1, sun:-0.5, storm:0, cloud:0, rain:0.5, fog:1, night:1.5, deep:2};
  var MSG = {idle:5, "new":3, dad:2, urgent:1};
  var sw = 0, msgState = null, msgForced = null, wxForced = null;
  var RM = (typeof window !== "undefined" && window.matchMedia) ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  try{ var q = new URLSearchParams(location.search); wxForced = q.get("weather"); if(!(wxForced in SWEEP)) wxForced = null;
    msgForced = q.get("msg"); if(!(msgForced in MSG)) msgForced = null; }catch(e){}
  function g(name){ var t = T[name]; if(!t) throw new Error("phi-timing: unknown element " + name); return t; }
  function shift(t){ return (t.weather || RM.matches) ? 0 : sw; }
  function per(name){ var t = g(name); return t.base * Math.pow(PHI, shift(t)); }
  function perthHour(){ try{ return +new Date().toLocaleString("en-AU", {timeZone:"Australia/Perth", hour:"2-digit", hour12:false}) % 24; }catch(e){ return new Date().getHours(); } }
  var weatherKey = null;   // last weather mood the page reported (null = no weather state on this page)
  function sweepFor(key){ if(wxForced) return SWEEP[wxForced];   // ?weather= preview wins exactly (use ?weather=deep for deep night)
    if(key == null) return 0; var h = perthHour(); if(h >= 0 && h < 5) key = "deep"; return SWEEP[key] || 0; }
  var api = {
    PHI:PHI, list:list, SWEEP:SWEEP, MSG:MSG,
    s:per, ms:function(n){ return Math.round(per(n) * 1000); },
    base:function(n){ return g(n).base; },
    off:function(n){ return per(n) * g(n).frac; }, offMs:function(n){ return Math.round(api.off(n) * 1000); },
    info:function(n){ var t = g(n); return {k:t.k, n:t.n, simmie:t.simmie, weather:t.weather, base:t.base, s:per(n), off:api.off(n), shift:shift(t)}; },
    sweep:function(){ return RM.matches ? 0 : sw; },
    // repeating timer: first tick at the golden-angle offset, then one per period; re-reads the period every cycle,
    // so a new sweep lands at the next cycle boundary. returns {stop}
    every:function(n, fn){ var h = {t:null, dead:false};
      function tick(){ if(h.dead) return; fn(); h.t = setTimeout(tick, api.ms(n)); }
      h.t = setTimeout(tick, api.offMs(n)); h.stop = function(){ h.dead = true; clearTimeout(h.t); }; return h; },
    // the page tells the module its weather mood (sun|hot|cloud|fog|rain|storm|night) or null when it has none
    setWeather:function(key){ weatherKey = key || null; setSweep(sweepFor(weatherKey)); },
    weatherOverride:function(){ return wxForced; },
    // message-status layer (rule 7): idle|new|dad|urgent; ?msg= wins
    setMsg:function(state){ setMsg(state); }, msg:function(){ return msgState; },
    // for JS-managed animations (mark the element data-phi-js): change the period at a cycle boundary without a jump
    retime:function(a, ms){ retime(a, ms); }
  };
  root.PhiTiming = api;

  // ---------- CSS side ----------
  var doc = (typeof document !== "undefined") ? document : null, rootStyle = doc && doc.documentElement.style;
  function writeVars(){ list.forEach(function(n){ var t = T[n]; rootStyle.setProperty("--phi-" + n, per(n).toFixed(3) + "s"); rootStyle.setProperty("--phi-" + n + "-d", (-api.off(n)).toFixed(3) + "s"); }); }
  // which keyframes belong to the weather loop (never swept) or the message layer (own pump)
  var FIXED = /^(wx-drift|wx-sway|wx-fadein|wx-blip|bw-|msg-pulse)/;
  function sweepable(a){ return a && a.animationName && !FIXED.test(a.animationName) && a.effect && a.effect.getTiming().iterations === Infinity &&
    !(a.effect.target && a.effect.target.closest && a.effect.target.closest(".wx-mq-track,.wx-seq,.wx-icon,#wx-mq-track,.bw-sticker,[data-phi-js]")); }
  // retime a running CSS animation at an iteration boundary without a visible jump
  function retime(a, D){ var t = a.effect.getTiming(), ct = a.currentTime; if(ct == null || !t.duration) return;
    var it = Math.round((ct - t.delay) / t.duration); a.effect.updateTiming({duration:D, delay:t.delay}); a.currentTime = t.delay + it * D; }
  function setSweep(next){
    if(RM.matches) next = 0;
    if(next === sw) return; var f = Math.pow(PHI, next - sw);
    if(doc && doc.getAnimations){ doc.getAnimations().forEach(function(a){ if(!sweepable(a)) return;
      var t = a.effect.getTiming(); if(a._phiD == null){ a.effect.updateTiming({duration:t.duration, delay:t.delay}); a._phiD = t.duration; }   // pin to its current period
      a._phiNext = (a._phiNext || a._phiD) * f; }); }
    sw = next; if(rootStyle) writeVars();   // new elements start on the new periods
    if(doc) doc.documentElement.setAttribute("data-phi-sweep", String(sw));
  }
  if(doc){
    writeVars();
    doc.addEventListener("animationiteration", function(ev){
      var el = ev.target; if(!el.getAnimations) return;
      el.getAnimations().forEach(function(a){
        if(a.animationName !== ev.animationName) return;
        if(a._phiNext != null){ retime(a, a._phiNext); a._phiD = a._phiNext; a._phiNext = null; }
        if(a.animationName === "msg-pulse" && a._msgNext != null){ retime(a, a._msgNext); a._msgNext = null; }
      });
    }, true);
    // deep night starts/ends on the Perth clock (functional check once a minute, not an animation)
    setInterval(function(){ if(weatherKey || wxForced) setSweep(sweepFor(weatherKey)); }, 60000);
    if(wxForced) setTimeout(function(){ setSweep(sweepFor(null)); }, 0);
    if(RM.addEventListener) RM.addEventListener("change", function(){ setSweep(sweepFor(weatherKey)); });
  }
  // ---------- message-status layer ----------
  function msgPer(st){ return Math.pow(PHI, MSG[st]); }
  function setMsg(state){
    if(msgForced) state = msgForced; if(!(state in MSG)) state = "idle";
    if(state === msgState || !doc) return; msgState = state; var D = msgPer(state) * 1000;
    rootStyle.setProperty("--phi-msg", (D/1000).toFixed(3) + "s");
    doc.documentElement.setAttribute("data-msg", state);
    if(doc.getAnimations) doc.getAnimations().forEach(function(a){ if(a.animationName === "msg-pulse"){
      var t = a.effect.getTiming(); if(!a._msgPinned){ a.effect.updateTiming({duration:t.duration, delay:t.delay}); a._msgPinned = true; } a._msgNext = D; } });
  }
  if(typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : this);
