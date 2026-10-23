// Bonnie's Dashboard interludes: little emoji + CSS scenes that cross the header lane and the footer lane.
// Bonnie's animal set every PHI^5 = 11.09 s and Simmie's space set every PHI^4.5 = 8.72 s (rule 4: Simmie runs 1.5 phi
// steps faster), each on its own clock from js/phi-timing.js; the ratio is irrational so they never settle into a beat.
// When both want the same lane at once they take different bands. Decorative only (aria-hidden, pointer-events:none),
// transform + opacity only, lanes never overlap controls or queue items. Paused when the tab is hidden; nothing moves
// under reduced motion. The mission log notes each turn.
(function(){
  "use strict";
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  var $ = function(s){ return document.querySelector(s); };
  var LOG = function(t){ if(window.RebellaLog) window.RebellaLog(t); };
  // which way each emoji naturally faces, so it is mirrored only when it would otherwise run backwards
  var APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  var ANIMALS = [
    {name:"horse trot", e:"\uD83D\uDC0E", face:"left", gait:"il-trot"},
    {name:"rabbit hops", e:"\uD83D\uDC07", face:"left", gait:"il-hop"},
    {name:"dog bound + look-back", e:"\uD83D\uDC15", face:"left", gait:"il-dog"},
    // the bird faces left in Apple's emoji font and right in Google's (Noto), so its facing depends on the device
    {name:"bird flight", e:"\uD83D\uDC26", face:APPLE ? "left" : "right", gait:"il-fly", glow:true}
  ];
  var SPACE = [
    {name:"satellite orbits saturn", html:'<span class="il-orbiter"><span class="il-c">\uD83E\uDE90</span><span class="il-ring"><span>\uD83D\uDEF0\uFE0F</span></span></span>'},
    {name:"rocket arc", e:"\uD83D\uDE80", face:"right", gait:"il-arc"},
    {name:"comet + sparkles", html:'<span class="il-comet">\u2604\uFE0F<i>\u2728</i><i>\u2728</i><i>\u2728</i></span>'},
    {name:"moon circles earth", html:'<span class="il-orbiter"><span class="il-c">\uD83C\uDF0D</span><span class="il-ring slow"><span>\uD83C\uDF19</span></span></span>'},
    {name:"command tokens", html:'<span class="il-tokens">&gt; orbit.ok \u00B7 stars++ \u00B7 ping 13ms \u00B7 ready_</span>'}
  ];
  var PT = window.PhiTiming;
  var busyUntil = {head:0, foot:0}, ai = 0, si = 0, started = false, running = [];
  function lane(name){ return document.getElementById(name === "head" ? "il-head" : "il-foot"); }
  function pickLane(pref){   // preferred band, or the other one if it's taken right now
    var other = pref === "head" ? "foot" : "head", now = Date.now();
    if(busyUntil[pref] <= now) return pref; if(busyUntil[other] <= now) return other; return null;
  }
  function run(set, item, pref){
    if(document.hidden || RM.matches || $("#app").hidden) return;
    var ln = pickLane(pref); if(!ln) return;
    var L = lane(ln); if(!L || !L.offsetWidth) return;
    var w = L.getBoundingClientRect().width, rtl = Math.random() < 0.5;
    var el = document.createElement("span"); el.className = "il-actor" + (item.glow ? " il-glow" : "");
    var inner = document.createElement("span"); inner.className = "il-inner " + (item.gait || "");
    if(item.html) inner.innerHTML = item.html; else inner.textContent = item.e;
    // emoji animals face left: flip them when they travel left-to-right
    var dir = rtl ? "left" : "right";
    if(item.face && item.face !== dir) inner.style.setProperty("--il-face", "-1");
    inner.style.animationDelay = (-Math.random()).toFixed(2) + "s";   // staggered gait
    el.appendChild(inner); L.appendChild(el);
    var from = rtl ? w + 30 : -40, to = rtl ? -40 : w + 30;
    var dur = PT.ms(set === "animals" ? "animal-cross" : "space-cross");   // crossing time on the ladder (swept)
    busyUntil[ln] = Date.now() + dur;
    var a = el.animate([{transform:"translateX(" + from + "px)", opacity:0},{opacity:1, offset:.08},{opacity:1, offset:.92},{transform:"translateX(" + to + "px)", opacity:0}],
      {duration:dur, easing:"linear", fill:"forwards"});
    running.push(a);
    a.onfinish = a.oncancel = function(){ el.remove(); running = running.filter(function(x){ return x !== a; }); };
    LOG("turn: " + item.name + " (" + (set === "animals" ? "Bonnie's" : "Simmie's") + ", " + (ln === "head" ? "header" : "footer") + ")");
  }
  function start(){
    if(started) return; started = true;
    PT.every("animals", function(){ var it = ANIMALS[ai++ % ANIMALS.length]; run("animals", it, it.glow ? "head" : "foot"); });   // the bird flies in the header band
    PT.every("space", function(){ run("space", SPACE[si++ % SPACE.length], "head"); });
  }
  document.addEventListener("visibilitychange", function(){ running.forEach(function(a){ if(document.hidden) a.pause(); else a.play(); }); });
  var rT = null;
  function reflow(){ clearTimeout(rT); rT = setTimeout(function(){ running.slice().forEach(function(a){ a.cancel(); }); busyUntil = {head:0, foot:0}; }, 150); }
  window.addEventListener("resize", reflow);
  function replace(){ reflow(); setTimeout(function(){
      var app = $("#app"), f = $("#wx-foot"); if(app && f) app.style.setProperty("--hz-foot-h", Math.ceil(f.getBoundingClientRect().height) + "px");
      if(started && !document.hidden) run("animals", ANIMALS[ai++ % ANIMALS.length], "foot");
    }, 450); }
  window.addEventListener("orientationchange", replace);
  if(screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", replace);
  document.addEventListener("rebella:status", start);
  document.addEventListener("rebella:locked", function(){ running.slice().forEach(function(a){ a.cancel(); }); });
})();
