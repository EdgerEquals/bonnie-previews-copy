// Rebella moderation "HUD": header weather chip + fun-fact ticker, footer status lights / waveform / gauge /
// weather readout / emoji marquee, and the background layers (space loop + faint drifting code).
// Everything starts only after the passcode gate is passed (first "rebella:status" event from app.js).
// Weather: Open-Meteo with fixed Perth coordinates only (no browser location, no permission prompt), cached 30 min,
// fails silently. Preview: ?weather=sun|hot|cloud|fog|rain|storm|night, ?age=10..16. No sound, no pop-ups.
// Static under reduced motion; paused while the tab is hidden. Lights only show things the dashboard really knows.
(function(){
  "use strict";
  var WX_URL = "https://api.open-meteo.com/v1/forecast?latitude=-31.95&longitude=115.86&current=weather_code,temperature_2m,is_day&timezone=Australia%2FPerth";
  var CHAT = "https://edgerequals.github.io/simmie-chat/";
  var CKEY = "rebella-mod-weather-v1", TTL = 30*60*1000;
  var STALE_H = 24;   // FRESH light: queue older than a day turns amber (scans/top-ups run on demand, not on a timer)
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  var $ = function(s){ return document.querySelector(s); };
  var LOG = function(t){ if(window.RebellaLog) window.RebellaLog(t); };
  var qs = (function(){ try{ return new URLSearchParams(location.search); }catch(e){ return {get:function(){return null;}}; } })();
  var PT = window.PhiTiming;   // js/phi-timing.js: every period below comes from there (rules in its header)
  // faces: three emotions per weather, cycling on PHI^2 / PHI^3 / PHI^4 s (2.618 / 4.236 / 6.854; was 2/3/5); gifts are handed to the weather icon
  var SETS = {
    sun:   {icon:"\u2600\uFE0F", label:"Sunny", faces:["\uD83D\uDE04","\uD83E\uDD29","\uD83D\uDE0E"], gifts:["\uD83D\uDD76\uFE0F","\uD83C\uDF66","\uD83C\uDF3B"], msg:"SUNNY - GO GET SOME RAYS"},
    hot:   {icon:"\uD83C\uDF1E", label:"Hot", faces:["\uD83D\uDE04","\uD83E\uDD29","\uD83D\uDE0E"], gifts:["\uD83C\uDFD6\uFE0F","\uD83C\uDF66","\uD83D\uDD76\uFE0F"], msg:"HOT ONE - WATER + SUNSCREEN"},
    cloud: {icon:"\u26C5", label:"Cloudy", faces:["\uD83D\uDE10","\uD83E\uDDD0","\uD83D\uDE34"], gifts:["\uD83C\uDFA7","\uD83E\uDDE6"], msg:"CLOUDY - COMFY HOODIE DAY"},
    fog:   {icon:"\uD83C\uDF2B\uFE0F", label:"Foggy", faces:["\uD83D\uDE0C","\uD83E\uDD14","\uD83D\uDE34"], gifts:["\uD83E\uDDE3","\uD83D\uDD26"], msg:"MISTY - TAKE IT SLOW"},
    rain:  {icon:"\uD83C\uDF27\uFE0F", label:"Rain", faces:["\uD83E\uDD7A","\uD83E\uDD14","\uD83E\uDD79"], gifts:["\u2602\uFE0F","\uD83C\uDF38","\uD83C\uDF81","\u2615"], msg:"RAIN OUTSIDE - COSY INSIDE"},
    storm: {icon:"\u26C8\uFE0F", label:"Storm", faces:["\uD83E\uDD17","\uD83E\uDEE3","\uD83D\uDE2E"], gifts:["\uD83E\uDEC2","\uD83D\uDD6F\uFE0F","\uD83C\uDF6B"], msg:"STORMY - STAY SNUG"},
    night: {icon:"\uD83C\uDF19", label:"Clear night", faces:["\uD83D\uDE0C","\uD83E\uDD70","\uD83E\uDD29"], gifts:["\u2728","\uD83E\uDD89"], msg:"CLEAR NIGHT - STARS ARE OUT"}
  };
  function mood(code, isDay, temp){   // WMO weather codes (+ temperature for "hot") -> seven moods
    code = Number(code);
    if(code >= 95) return "storm";
    if((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    if(code === 45 || code === 48) return "fog";
    if(code <= 1) return isDay === 0 ? "night" : (temp >= 30 ? "hot" : "sun");   // clear/sunny and 30 C or more = hot
    return "cloud";   // 2, 3, and the rare snow codes in Perth
  }
  var forced = SETS[qs.get("weather")] ? qs.get("weather") : null;

  // Built-in fun facts (fallback when simmie-chat/facts.json isn't published yet). Playful, checked, age-appropriate.
  var FACTS = {
    10:{space:"A day on Venus is longer than its whole year",ocean:"An octopus has three hearts and blue blood",animals:"Wombats do cube-shaped poo",body:"Babies have around 300 bones; adults have 206",
        weather:"Lightning is about five times hotter than the Sun's surface",birds:"A group of flamingos is called a flamboyance",moon:"The Moon drifts about 3.8 cm further from Earth each year",
        food:"Honey can stay edible for thousands of years",perth:"Quokkas live on Rottnest Island, just off Perth"},
    11:{space:"Saturn is less dense than water, so it would float in a giant bath",animals:"Koalas sleep up to about 20 hours a day",body:"Your heart beats roughly 100,000 times a day",
        ocean:"The Pacific Ocean is bigger than all of Earth's land put together",earth:"Antarctica is the biggest desert on Earth",sharks:"Sharks were around before trees existed",
        tech:"The first computer 'bug' was a real moth, found in 1947",maths:"Zero was used as a number in India over 1,300 years ago"},
    12:{space:"Sunlight takes about 8 minutes 20 seconds to reach you",animals:"Tardigrades can survive being dried out for years",body:"Your brain uses about 20% of your body's energy",
        history:"Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid",wa:"Zircon crystals from WA's Jack Hills are about 4.4 billion years old",
        ocean:"Most of the sea floor still hasn't been mapped in high detail",birds:"Crows can recognise human faces and remember them for years",maths:"In a group of 23 people there's about a 50% chance two share a birthday"},
    13:{space:"A teaspoon of neutron star would weigh about a billion tonnes",body:"Stretched out, the DNA in one of your cells is about 2 metres long",animals:"Octopuses can taste with their suckers",
        reef:"The Great Barrier Reef can be seen from orbit",history:"Oxford University was teaching before the Aztec city of Tenochtitlan was founded",tech:"The first text message, in 1992, said 'Merry Christmas'",
        maths:"There are more ways to shuffle a deck of cards than atoms on Earth",music:"Your brain releases dopamine at the best bit of a favourite song",wa:"Shark Bay's stromatolites are living relatives of some of Earth's oldest life"},
    14:{space:"There are more stars in the universe than grains of sand on all Earth's beaches",brain:"Teen brains keep rewiring until the mid-20s, and that's totally normal",
        physics:"Squeeze the empty space out of every atom in every human and we'd fit in a sugar cube",animals:"A mantis shrimp punches so fast the water flashes with light and heat",
        history:"South Australian women won the vote in 1894, among the first in the world",earth:"Mount Everest grows a few millimetres taller each year",tech:"The Apollo guidance computer had about 4 KB of memory",ocean:"About half the oxygen you breathe comes from tiny ocean plankton"},
    15:{space:"GPS satellite clocks run slightly fast, so they're tuned to correct for relativity",body:"You're about 1 cm taller in the morning than at night",physics:"Bananas are a tiny bit radioactive, thanks to potassium-40",
        maths:"0.999... repeating forever is exactly equal to 1",history:"In WA's 'Great Emu War' of 1932, the emus basically won",trees:"Trees can share nutrients through underground fungal networks",
        earth:"Earth's inner core is about as hot as the surface of the Sun",chem:"Old windows are thicker at the bottom because of how the glass was made, not because glass flows"},
    16:{space:"Andromeda's light left it about 2.5 million years before it reached your eyes",physics:"The Sun's fusion relies on quantum tunnelling",maths:"Some infinities are bigger than others; Cantor proved it in 1891",
        bio:"Your body has roughly as many bacterial cells as human cells",tech:"Voyager 1, launched in 1977, still sends data from interstellar space",culture:"Aboriginal and Torres Strait Islander cultures go back more than 50,000 years",
        mind:"Memories are rebuilt each time you recall them, which is why they can shift",wa:"The Pilbara holds some of the oldest evidence of life, about 3.5 billion years old",chem:"Gold was forged in colliding and exploding stars"}
  };
  var age = 13, ageSrc = "default", bank = null;   // bank: [{topic,text,source}] for the current age from facts.json
  function clampAge(n){ n = parseInt(n, 10); return n >= 10 && n <= 16 ? n : null; }
  function factList(){
    if(bank && bank.length) return bank;
    var f = FACTS[age] || FACTS[13];
    return Object.keys(f).map(function(k){ return {topic:k, text:f[k], source:null}; });
  }

  // ---------- weather ----------
  var wx = {state:"idle", key:forced, temp:null, at:null};
  function readCache(){ try{ var c = JSON.parse(localStorage.getItem(CKEY)); if(c && Date.now() - c.t < TTL) return c; }catch(e){} return null; }
  function applyData(c){ wx.state = "ok"; wx.temp = Math.round(c.temp); wx.at = c.t; wx.key = forced || mood(c.code, c.isDay, c.temp); PT.setWeather(wx.key); paintWeather();
    LOG("wx: " + SETS[mood(c.code, c.isDay, c.temp)].label.toLowerCase() + " " + wx.temp + "\u00B0" + (forced ? " (preview: " + forced + ")" : "")); }
  function loadWeather(){
    var c = readCache(); if(c){ applyData(c); return; }
    wx.state = "loading"; paintWeather();
    fetch(WX_URL, {cache:"no-store", credentials:"omit", referrerPolicy:"no-referrer"}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){
        var cur = j && j.current; if(!cur || cur.weather_code == null || cur.temperature_2m == null) throw 0;
        var d = {t:Date.now(), code:cur.weather_code, temp:cur.temperature_2m, isDay:cur.is_day};
        try{ localStorage.setItem(CKEY, JSON.stringify(d)); }catch(e){}
        applyData(d);
      }).catch(function(){ wx.state = "fail"; PT.setWeather(forced); paintWeather(); LOG("wx: offline" + (forced ? ", preview " + forced : ", chip hidden")); });
  }
  function paintWeather(){
    var s = wx.key && SETS[wx.key], chip = $("#wx-chip"), seq = $("#wx-seq");
    var t = wx.temp != null ? " " + wx.temp + "\u00B0" : "";
    if(chip){
      chip.hidden = !s;
      if(s){
        chip.querySelector(".wx-text").textContent = s.icon + " Perth" + t;
        var lab = "Weather in Perth: " + s.label + (wx.temp != null ? ", " + wx.temp + " degrees" : "") + (forced ? " (preview)" : "");
        chip.title = lab; chip.setAttribute("aria-label", lab);
        story(s);
      }
    }
    var ro = $("#wx-readout"); if(ro){ ro.hidden = !s; ro.textContent = s ? s.icon + t + " Perth" : ""; }
    var mq = $("#wx-mq-track");
    if(mq){ mq.textContent = "";
      if(s){ var flat = [].concat.apply([], s.seq).join(" ") + "  \u00B7  \u2B50  \u00B7  ";
        for(var k=0;k<2;k++) mq.appendChild(el("span","wx-mq-half", new Array(5).join(flat))); }
      $("#wx-marquee").hidden = !s; }
    setLight("sky", wx.state === "ok" ? "ok" : wx.state === "fail" ? "warn" : "idle",
      wx.state === "ok" ? "SKY: weather fetched" + (s ? ", " + s.label + (forced ? " (preview)" : "") : "")
      : wx.state === "fail" ? "SKY: weather couldn't be fetched" + (forced ? " (showing the preview mood)" : "") : "SKY: loading the weather");
  }


  // ---------- header emoji story: face turns away, turns back, hands gifts to the weather icon ----------
  // [face slot (3 stacked emotions)] [gifts...] [weather icon]; transform + opacity only.
  var ST = {timers:[], key:null, loop:0};
  var STYLES = ["drop","peek","spin","pop"];   // how the gifts appear; rotates each loop
  function stClear(){ ST.timers.forEach(clearTimeout); ST.timers.forEach(clearInterval); ST.timers = []; var q = $("#wx-seq"); if(q && q.getAnimations) q.getAnimations({subtree:true}).forEach(function(a){ a.cancel(); }); }
  function later(fn, ms){ var t = setTimeout(function(){ if(document.hidden){ later(fn, 400); return; } fn(); }, ms); ST.timers.push(t); }
  function anim(node, frames, ms, ease){ if(!node.animate) return null; return node.animate(frames, {duration:ms, easing:ease || "ease-in-out", fill:"forwards"}); }
  function story(s){
    var seq = $("#wx-seq"); if(!seq) return;
    if(ST.key === wx.key && seq.childNodes.length) return;   // same weather: keep the running story
    stClear(); ST.key = wx.key; seq.textContent = "";
    function slot(cls, i){ var d = el("span","wx-drift " + cls); d.style.animationDelay = (-(PT.off("chip-drift") + i * PT.s("chip-drift") * 0.0618)).toFixed(3) + "s"; seq.appendChild(d); return d; }
    var faceSlot = slot("wx-face", 0), faces = s.faces.map(function(f, i){ var e = el("span","wx-f" + (i ? "" : " on"), f); faceSlot.appendChild(e); return e; });
    var faceBox = el("span","wx-facebox"); while(faceSlot.firstChild) faceBox.appendChild(faceSlot.firstChild); faceSlot.appendChild(faceBox);
    var gifts = s.gifts.map(function(g, i){ var d = slot("wx-gift", i+1), e = el("span","wx-g",g); d.appendChild(e); return e; });
    var icon = el("span","wx-icon",s.icon); slot("wx-iconslot", s.gifts.length+1).appendChild(icon);
    if(RM.matches){ gifts.forEach(function(g){ g.style.opacity = 1; }); return; }      // static final state
    // polyrhythm: each emotion takes the slot on its own phi period, starting at its golden-angle offset; one always shows
    ["face-a","face-b","face-c"].forEach(function(name, i){
      var go = function(){ if(document.hidden) return; faces.forEach(function(f, j){ f.classList.toggle("on", j === i); }); };
      ST.timers.push(setTimeout(function(){ go(); ST.timers.push(setInterval(go, PT.ms(name))); }, PT.offMs(name)));
    });
    var t0 = Date.now() - PT.offMs("loop-effect");
    function loop(){
      var style = STYLES[Math.floor((Date.now() - t0) / PT.ms("loop-effect")) % STYLES.length], t = 0;   // effect changes every PHI^5, sampled per story
      gifts.forEach(function(g){ g.style.opacity = 0; });
      // beat 1: turn away (rotateY with perspective squish, lean, drift away)
      anim(faceBox, [{transform:"perspective(60px) rotateY(0) rotate(0) translateX(0)"},{transform:"perspective(60px) rotateY(55deg) scaleX(.8) rotate(-8deg) translateX(-4px)"}], 700);
      t += 1500;
      // beat 2: turn back (~400 ms) and glide toward the icon
      later(function(){ anim(faceBox, [{transform:"perspective(60px) rotateY(55deg) scaleX(.8) rotate(-8deg) translateX(-4px)"},{transform:"perspective(60px) rotateY(0) rotate(4deg) translateX(3px)"}], 400, "cubic-bezier(.3,1.3,.5,1)"); }, t);
      t += 450;
      gifts.forEach(function(g, i){
        later(function(){
          anim(faceBox, [{transform:"perspective(60px) rotate(4deg) translateX(3px) translateY(0)"},{transform:"perspective(60px) rotate(0) translateX(4px) translateY(-3px)", offset:.4},{transform:"perspective(60px) rotate(4deg) translateX(3px) translateY(0)"}], 380, "ease-out");   // tiny hop
          var from = style === "drop" ? "translateY(-9px)" : style === "peek" ? "translateX(-10px) scale(.6)" : style === "spin" ? "rotate(-200deg) scale(.4)" : "scale(.2)";
          anim(g, [{opacity:0, transform:from},{opacity:1, transform:"translateY(-2px) scale(1.15)", offset:.7},{opacity:1, transform:"none"}], 480, "ease-out");
        }, t + i*650);
      });
      t += gifts.length*650 + 3200;   // hold
      later(function(){   // soft reset
        gifts.forEach(function(g){ anim(g, [{opacity:1},{opacity:0, transform:"translateY(2px) scale(.9)"}], 600); });
        anim(faceBox, [{transform:"perspective(60px) rotate(4deg) translateX(3px)"},{transform:"perspective(60px) rotateY(0) rotate(0) translateX(0)"}], 700);
      }, t);
      t += 1300;
      later(loop, Math.max(300, PT.ms("story") - t));   // offering story every PHI^6 = 17.94 s
    }
    later(loop, PT.offMs("story") % 4000);   // golden-angle start, capped so the chip is never blank for long
  }
  document.addEventListener("visibilitychange", function(){ var q = $("#wx-seq"); if(q && q.getAnimations) q.getAnimations({subtree:true}).forEach(function(a){ if(a.playState !== "finished"){ if(document.hidden) a.pause(); else a.play(); } }); });

  // ---------- header fact ticker ----------
  function paintTicker(){
    var tr = $("#wx-tick-track"); if(!tr) return; tr.textContent = "";
    var list = factList();
    for(var half=0; half<2; half++){
      var h = el("span","wx-tick-half"); if(half) h.setAttribute("aria-hidden","true");
      list.forEach(function(f){
        h.appendChild(el("span","tk-k","fact[")); h.appendChild(el("span","tk-n",String(age))); h.appendChild(el("span","tk-k","]." + String(f.topic).replace(/\W+/g,"_")));
        h.appendChild(el("span","tk-p"," = ")); h.appendChild(el("span","tk-s","\"" + f.text + "\"")); h.appendChild(el("span","tk-p",";   "));
      });
      tr.appendChild(h);
    }
    tickN = list.length; tr.setAttribute("data-phi-js", "");   // one item passes every PHI^4 (swept at the loop boundary)
    var ta = tr.getAnimations ? tr.getAnimations()[0] : null;
    if(ta && ta.effect){ PT.retime(ta, tickN * PT.ms("fact")); } else tr.style.animationDuration = (tickN * PT.s("fact")).toFixed(2) + "s";
    $("#wx-ticker").setAttribute("aria-label", "Fun facts for age " + age);
  }
  var tickN = 0;
  document.addEventListener("animationiteration", function(ev){ if(ev.target.id === "wx-tick-track" && tickN && ev.target.getAnimations){
    var ta = ev.target.getAnimations()[0]; if(ta) PT.retime(ta, tickN * PT.ms("fact")); } });
  function loadAgeAndFacts(){
    var q = clampAge(qs.get("age"));
    var ageP = q ? Promise.resolve((ageSrc = "?age", q)) :
      fetch(CHAT + "age-dial.json?t=" + Date.now(), {cache:"no-store", credentials:"omit"}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .then(function(j){ var a = clampAge(j && j.age); if(!a) throw 0; ageSrc = "age-dial.json"; return a; }).catch(function(){ ageSrc = "default"; return 13; });
    ageP.then(function(a){ age = a; paintTicker(); LOG("refresh: age " + a + " (" + ageSrc + ")"); return fetch(CHAT + "facts.json?t=" + Date.now(), {cache:"no-store", credentials:"omit"}); })
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){
        var arr = Array.isArray(j) ? j : (j && j.facts) || [];
        bank = arr.filter(function(f){ return f && typeof f.text === "string" && +f.age_min <= age && age <= +f.age_max; })
          .map(function(f){ return {topic:f.topic || "fact", text:f.text, source:f.source || null, url:f.url || null}; });
        if(bank.length){ paintTicker(); LOG("facts: " + bank.length + " for age " + age + " (facts.json)"); } else { bank = null; LOG("facts: built-in set"); }
      }).catch(function(){ bank = null; LOG("facts: built-in set"); });
  }

  // ---------- footer: lights, gauge, waveform ----------
  function setLight(name, state, title){
    var l = document.querySelector('.wx-light[data-light="' + name + '"]'); if(!l) return;
    l.classList.remove("ok","warn","idle"); l.classList.add(state); l.title = title; l.setAttribute("aria-label", title);
  }
  function blip(name){
    var l = document.querySelector('.wx-light[data-light="' + name + '"]'); if(!l || RM.matches) return;
    l.classList.remove("blip"); void l.offsetWidth; l.classList.add("blip");
  }
  var last = null, lastPending = null;
  function ago(sec){ return sec < 3600 ? Math.max(1, Math.round(sec/60)) + " min" : sec < 172800 ? Math.round(sec/3600) + " h" : Math.round(sec/86400) + " days"; }
  function paintStatus(d){
    last = d;
    setLight("queue", d.pending ? "warn" : "ok", d.pending ? "QUEUE: " + d.pending + " waiting for a decision" : "QUEUE: nothing pending, all clear");
    if(lastPending !== null && lastPending !== d.pending) blip("queue");
    lastPending = d.pending;
    if(d.updated){ var s = Date.now()/1000 - d.updated;
      setLight("fresh", s > STALE_H*3600 ? "warn" : "ok", "FRESH: queue file built " + ago(s) + " ago" + (s > STALE_H*3600 ? " (over a day)" : "")); }
    setLight("link", d.link === "ok" ? "ok" : "warn", d.link === "ok" ? "LINK: last queue check worked" : "LINK: last queue check failed, retrying every minute");
    var g = $("#wx-gauge"); if(g && d.all){
      var done = d.approved + d.rejected, frac = done / d.all;
      g.style.setProperty("--wx-g", (-90 + 180*frac).toFixed(1) + "deg");
      g.setAttribute("aria-label", "Decided " + done + " of " + d.all); g.title = "DONE: " + done + " of " + d.all + " decided";
    }
  }
  setInterval(function(){ if(last && !document.hidden) paintStatus(last); }, 60000);

  // ---------- pipeline stats (aggregate-only file; omitted if missing or stale) ----------
  var pstats = null;
  function loadStats(){
    fetch("pipeline-stats.json?t=" + Date.now(), {cache:"no-store"}).then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){ var g = Date.parse(j && j.generated_at); pstats = (g && Date.now() - g < 6*3600*1000 && j.stages) ? j : null; LOG(pstats ? "pipeline: stats " + Math.round((Date.now() - g)/60000) + " min old" : "pipeline: stats stale, hidden"); })
      .catch(function(){ pstats = null; });
  }

  // ---------- background layers ----------
  function startBg(){
    var v = $("#wx-bg-video"); if(!v) return;
    if(RM.matches){ v.removeAttribute("autoplay"); return; }   // poster only
    if(!v.querySelector("source")){
      [["../../media/space-loop.webm","video/webm"],["../../media/space-loop.mp4","video/mp4"]].forEach(function(s){ var x = document.createElement("source"); x.src = s[0]; x.type = s[1]; v.appendChild(x); });
      v.load();
    }
    var p = v.play(); if(p && p.catch) p.catch(function(){});
  }

  // ---------- pause / motion ----------
  var started = false;
  function syncPause(){
    document.documentElement.classList.toggle("wx-paused", document.hidden);
    var v = $("#wx-bg-video"); if(v && started && !RM.matches){ if(document.hidden) v.pause(); else { var p = v.play(); if(p && p.catch) p.catch(function(){}); } }
  }
  document.addEventListener("visibilitychange", syncPause);
  if(RM.addEventListener) RM.addEventListener("change", function(){ var v = $("#wx-bg-video"); if(v && RM.matches) v.pause(); else if(started) startBg(); });

  function el(tag, cls, text){ var n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n; }

  // ---------- wiring: only after the gate ----------
  document.addEventListener("rebella:status", function(ev){
    if(!started){ started = true; loadWeather(); loadAgeAndFacts(); paintTicker(); startBg(); syncPause();   // preview: no pipeline-stats file
      setInterval(function(){ if(!document.hidden && !readCache()) loadWeather(); }, 5*60*1000);
    }
    paintStatus(ev.detail || {});
  });
  document.addEventListener("rebella:locked", function(){ var v = $("#wx-bg-video"); if(v) v.pause(); });

  // keep the content clear of the fixed footer, whatever height it ends up (talk mode, small screens)
  (function(){ var f = $("#wx-foot"), app = $("#app"); if(!f || !app || !window.ResizeObserver) return;
    new ResizeObserver(function(){ app.style.setProperty("--hz-foot-h", Math.ceil(f.getBoundingClientRect().height) + "px"); }).observe(f); })();

  // read-only view for the terminal (js/talk.js)
  window.RebellaHud = {
    weatherMsg: function(){ return wx.key && SETS[wx.key] ? SETS[wx.key].msg : null; },
    weather: function(){ return wx.key && SETS[wx.key] ? {label:SETS[wx.key].label, temp:wx.temp, at:wx.at, forced:!!forced, ok:wx.state === "ok"} : null; },
    status: function(){ return last; },
    age: function(){ return {age:age, src:ageSrc}; },
    fact: function(i){ var l = factList(); return l.length ? l[i % l.length] : null; },
    stats: function(){ return pstats; }
  };
})();
