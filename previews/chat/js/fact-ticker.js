/* PREVIEW COPY (simmie-chat previews/chat/) of Rebella's fact ticker (rebella 6ed236b / 0b5aedf), recoloured in
   css/fact-band.css. Preview change: the pause button also opens the two-step 'Send to Simmie' pop-up
   (js/fact-send.js) with the fact in view, and the band resumes when it closes.
   Original header: Rebella fact ticker for Bonnie's home page (Oct 2026). Small vanilla JS, no pop-ups, no tracking.
   Reads the shared verified fact bank (fields: age_min, age_max, topic, text, source, url) and the age dial,
   keeps only facts suitable for the dial age (13 if the dial is missing), then scrolls them gently.
   If the bank can't be loaded or has no suitable facts, the band stays hidden. */
(function(){
  'use strict';
  var box=document.getElementById('fact-ticker'); if(!box||!window.fetch) return;
  var FACTS=box.getAttribute('data-facts'), DIAL=box.getAttribute('data-age'), MAX=14;
  var LEADS=['Did you know?','Fun fact','Who would have thought?',"Here's a wild one",'True story','Curious, right?','Mind = blown'];
  var DOTS=['#FCD5B5','#B5E3E0','#C6E9D2','#DCD0F2','#FBE6A2','#F8C8D5']; /* the six section colours */
  var getJSON=function(u){return fetch(u,{cache:'no-cache',credentials:'same-origin'}).then(function(r){if(!r.ok)throw r.status;return r.json();});};
  var num=function(v,d){v=parseFloat(v);return isFinite(v)?v:d;};
  /* "Latest discovery" only when the bank itself marks a fact as a recent discovery with a date (within ~2 years). */
  function isRecentDiscovery(f){
    var flagged=f.recent_discovery===true||f.kind==='discovery'||f.type==='discovery';
    var y=num(f.discovery_year,NaN);
    if(!isFinite(y)){var m=String(f.discovered||f.discovery_date||'').match(/(19|20)\d\d/);y=m?+m[0]:NaN;}
    return (flagged||f.discovery_year!=null||f.discovered!=null||f.discovery_date!=null)&&isFinite(y)&&y>=new Date().getFullYear()-2;
  }
  function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
  function item(f,i,copy){
    var li=document.createElement('li'); li.className='ft-item'+(f.status?' ft-status':''); li._fact=f;
    var lead=document.createElement('span'); lead.className='ft-lead';
    lead.textContent=f.status?f.lead:isRecentDiscovery(f)?'Latest discovery':LEADS[i%LEADS.length];
    li.appendChild(lead);
    li.appendChild(document.createTextNode(String(f.text).trim()));
    var src=String(f.source||'').trim();
    if(src){
      var url=String(f.url||''), a;
      if(/^https:\/\//i.test(url)){a=document.createElement('a');a.href=url;a.rel='noopener';if(copy)a.tabIndex=-1;}
      else a=document.createElement('span');
      a.className='ft-src'; a.textContent='\u2014 '+src.slice(0,40); li.appendChild(a);
    }
    return li;
  }
  function dot(i){var d=document.createElement('li');d.className='ft-dot';d.setAttribute('aria-hidden','true');d.style.background=DOTS[i%DOTS.length];return d;}
  function list(facts,copy){
    var ul=document.createElement('ul'); ul.className='ft-list'; if(copy) ul.setAttribute('aria-hidden','true');
    facts.forEach(function(f,i){ul.appendChild(item(f,i,copy));ul.appendChild(dot(i));});
    return ul;
  }
  function build(facts){
    var track=box.querySelector('.ft-track'), win=box.querySelector('.ft-window');
    var pause=box.querySelector('.ft-pause'), next=box.querySelector('.ft-next');
    var rm=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
    var idx=0, userPaused=false;
    function scrolling(){
      box.classList.remove('is-static'); track.innerHTML='';
      track.appendChild(list(facts,false)); track.appendChild(list(facts,true)); /* two copies = seamless loop */
      phiTrack(); /* golden-ratio timing: each item gets PHI^4 6.854 s (Bonnie's facts slot), swept by the weather (rule 6) */
    }
    var T=window.PhiTiming, trackSw=null;
    function phiTrack(){
      var n=track.querySelector('.ft-list').querySelectorAll('.ft-item').length||1, per=T.sws(4), dur=n*per;
      track.style.setProperty('--ft-dur',dur.toFixed(3)+'s');
      track.style.animationDelay=(-(per*T.frac(T.K.feed))).toFixed(3)+'s'; trackSw=T.sweep();
    }
    if(T) T.onSweep(function(){   /* new sweep: re-time at the loop seam, never mid-scroll */
      if(box.classList.contains('is-static')) return;
      track.addEventListener('animationiteration',function once(){ track.removeEventListener('animationiteration',once);
        if(trackSw===T.sweep()) return; var n=track.querySelector('.ft-list').querySelectorAll('.ft-item').length||1;
        track.style.setProperty('--ft-dur',(n*T.sws(4)).toFixed(3)+'s'); track.style.animationDelay='0s'; trackSw=T.sweep();
        getComputedStyle(track).animationDuration; track.getAnimations().forEach(function(a){a.currentTime=0;}); });
    });
    function single(){
      box.classList.add('is-static'); track.innerHTML='';
      var ul=document.createElement('ul'); ul.className='ft-list'; ul.appendChild(item(facts[idx],idx,false)); track.appendChild(ul);
    }
    function render(){ rm.matches?single():scrolling(); }
    next.addEventListener('click',function(){idx=(idx+1)%facts.length;single();});
    function setPaused(v){
      userPaused=v; box.classList.toggle('is-paused',userPaused);
      pause.setAttribute('aria-pressed',String(userPaused));
      pause.setAttribute('aria-label',userPaused?'Play the fun facts':'Pause the fun facts and see this fact');
      pause.textContent=userPaused?'\u25B6':'\u275A\u275A';
    }
    function current(){ /* the fact in view: the item under the left part of the window (status lines skip to the next fact) */
      var items=[].slice.call(track.querySelectorAll('.ft-item')), x=win.getBoundingClientRect().left+40, k=0;
      for(var i=0;i<items.length;i++){var r=items[i].getBoundingClientRect();if((r.left<=x&&r.right>=x)||r.left>x){k=i;break;}}
      for(var j=0;j<items.length;j++){var it=items[(k+j)%items.length];if(it._fact&&!it._fact.status)return it._fact;}
      return null;
    }
    /* ---- Simmie replies interrupt the feed: one standout amber-gold line with the cloud. It is Simmie's, so it holds
       PHI^5 x PHI^-1.5 = 5.388 s (swept): starts readable at the left, pans once to the end if it is longer than the window ---- */
    var chat=document.getElementById('ft-chat'), live=document.getElementById('ft-live'), reply=null, replyAnim=null, chatT=null, replyEndT=null;
    function endReply(){
      clearTimeout(replyEndT); if(replyAnim){replyAnim.cancel();replyAnim=null;}
      if(reply){reply.remove();reply=null;} box.classList.remove('is-reply');
      clearTimeout(chatT); chatT=setTimeout(function(){chat.hidden=true;},T.ms(8));   // Chat → stays PHI^8 46.98 s after (functional, fixed)
      if(box.classList.contains('is-static')) single();
    }
    function showReply(d){
      endReply(); clearTimeout(chatT);
      reply=document.createElement('div'); reply.className='ft-reply';
      var inner=document.createElement('span'); inner.className='ft-reply-in';
      var av=document.createElement('img'); av.src='img/simmie-cloud.svg'; av.alt=''; av.className='ft-reply-av';
      var who=document.createElement('span'); who.className='ft-reply-who'; who.textContent='Simmie:';
      inner.appendChild(av); inner.appendChild(who); inner.appendChild(document.createTextNode(' '+String(d.text).replace(/\s+/g,' ').trim()));
      reply.appendChild(inner); win.appendChild(reply); box.classList.add('is-reply');
      chat.hidden=false; chat.dataset.id=d.id||'';
      if(live) live.textContent='Simmie replied: '+d.text;
      var hold=T.ssms(5);
      if(rm.matches){ replyEndT=setTimeout(endReply,T.ms(3.5)); return; }   // reduced motion: still line for 5.388 s (no sweep)
      var ww=win.clientWidth, iw=inner.scrollWidth;
      var over=Math.max(0,iw-ww+12);
      replyAnim=inner.animate([{transform:'translateX(0)'},{transform:'translateX(0)',offset:.236},{transform:'translateX('+(-over)+'px)',offset:.854},{transform:'translateX('+(-over)+'px)'}],{duration:hold,iterations:1,easing:'ease-in-out'});
      replyAnim.onfinish=endReply;
      if(userPaused) replyAnim.pause();
    }
    window.addEventListener('simmie:reply',function(e){ if(e&&e.detail&&e.detail.text) showReply(e.detail); });
    chat.addEventListener('click',function(e){   // on the chat page: jump to the full reply in the thread and focus the composer
      if(!document.getElementById('send-form')) return;   // other sites: plain link to the chat page
      e.preventDefault(); window.dispatchEvent(new CustomEvent('ft:open-chat',{detail:{id:chat.dataset.id}}));
    });
    next.addEventListener('click',function(){ if(reply) endReply(); },true);
    pause.addEventListener('click',function(e){   // while a reply is showing, pause only holds the reply line
      if(!reply) return; e.stopImmediatePropagation(); setPaused(!userPaused); if(replyAnim){userPaused?replyAnim.pause():replyAnim.play();}
    },true);
    pause.addEventListener('click',function(){
      setPaused(!userPaused);
      if(userPaused){var f=current(); if(f) window.dispatchEvent(new CustomEvent('ft:pause',{detail:{text:String(f.text).trim(),source:String(f.source||'').trim(),url:/^https:\/\//i.test(String(f.url||''))?String(f.url):''}}));}
    });
    window.addEventListener('ft:resume',function(){ if(userPaused) setPaused(false); });
    document.addEventListener('visibilitychange',function(){box.classList.toggle('is-paused',document.hidden||userPaused);});
    if(rm.addEventListener) rm.addEventListener('change',render);
    box.hidden=false; render();
  }
  /* Status lines (real public data; a line is left out if its source can't be read). 'New picks' is a mock in this preview. */
  function statuses(){
    var out=[], jobs=[];
    if(window.SimmieWeather) jobs.push(window.SimmieWeather.real().then(function(w){ if(!w) return;
      var st=window.SimmieWeather.classify(w), s=window.SimmieWeather.SETS[st]; out.push({status:true,lead:'Weather',text:'Perth: '+s.word.toLowerCase()+', '+w.t+'\u00B0 '+s.icon}); }).catch(function(){}));
    jobs.push(fetch('https://edgerequals.github.io/rebella/?t='+Date.now(),{cache:'no-store'}).then(function(r){
      out.push({status:true,lead:'Rebella',text:r.ok?'your site is live and looking good':'your site is not answering right now'}); }).catch(function(){}));
    return Promise.all(jobs).then(function(){
      if(ageOk) out.push({status:true,lead:'Age dial',text:'set to '+age+', so facts are picked for '+age});
      out.push({status:true,lead:'New picks',text:'3 new picks are waiting for you (preview)'});
      return out;
    });
  }
  var age=13, ageOk=false;
  (DIAL?getJSON(DIAL).then(function(d){var a=num(d&&(d.age!=null?d.age:d.age_years),13);if(a>=5&&a<=21){age=a;ageOk=true;}}).catch(function(){}):Promise.resolve())
  .then(function(){return getJSON(FACTS);})
  .then(function(bank){
    var arr=Array.isArray(bank)?bank:(bank&&Array.isArray(bank.facts)?bank.facts:[]);
    var ok=arr.filter(function(f){return f&&typeof f.text==='string'&&f.text.trim()&&f.source&&num(f.age_min,0)<=age&&age<=num(f.age_max,99);});
    if(!ok.length) return;
    return statuses().then(function(st){   /* occasional status lines, one after every 3 facts */
      var fx=shuffle(ok).slice(0,MAX), out=[];
      fx.forEach(function(f,i){out.push(f); if(i%3===2&&st.length) out.push(st.shift());});
      build(out.concat(st));
    });
  })
  .catch(function(){ /* bank unavailable: keep the band hidden */ });
})();
