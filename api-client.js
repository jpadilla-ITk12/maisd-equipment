/* Direct JSON POST transport for the GitHub Pages frontend. */
(function(global){
  'use strict';
  var pendingIdentity=null, googleCredential='', clientInitialized=false;
  var KEY='maisd.google-identity.v1', nonce='';
  function config(){
    var c=global.MAISD_CONFIG||{};
    if(!/^https:\/\/script\.google\.com\/(?:a\/macros\/[a-zA-Z0-9.-]+\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/.test(c.apiUrl||'')||
       !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(c.googleClientId||'')||
       !Array.isArray(c.allowedDomains)||!c.allowedDomains.length||global.location.protocol!=='https:') {
      throw new Error('This site is awaiting its API and Google sign-in configuration.');
    }
    return c;
  }
  function decode(token){try{var p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(p),function(c){return '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2);}).join('')));}catch(e){return null;}}
  function usable(token){var p=decode(token);return p&&typeof p.exp==='number'&&p.exp>Date.now()/1000+60;}
  function forget(){clearViews();googleCredential='';try{sessionStorage.removeItem(KEY);}catch(e){}}
  function restore(){try{var token=sessionStorage.getItem(KEY)||'';if(usable(token))googleCredential=token;else forget();}catch(e){}}
  function identityPanel(message){
    var panel=document.getElementById('maisd-google-signin');
    if(!panel){
      panel=document.createElement('div');panel.id='maisd-google-signin';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','maisd-google-title');
      panel.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#f1f5f9;display:grid;place-items:center;padding:24px;color:#0f172a;font:16px system-ui';
      var card=document.createElement('div');card.style.cssText='max-width:420px;width:100%;background:white;padding:32px;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 32px #0f172a12';
      var title=document.createElement('h1');title.id='maisd-google-title';title.textContent='School account';title.style.cssText='font-size:24px;margin:0 0 12px';
      var body=document.createElement('p');body.textContent='Continue with your school Google account.';
      var button=document.createElement('div');button.id='maisd-google-button';
      var status=document.createElement('p');status.id='maisd-google-message';status.setAttribute('role','status');status.style.cssText='font-size:14px;line-height:1.5';
      var retry=document.createElement('button');retry.id='maisd-google-reload';retry.type='button';retry.textContent='Reload sign-in';retry.hidden=true;
      retry.style.cssText='padding:10px 16px;border:1px solid #cbd5e1;border-radius:6px;background:white;cursor:pointer;font:inherit';
      retry.onclick=function(){global.location.reload();};
      card.append(title,body,button,status,retry);panel.append(card);document.body.append(panel);
    }
    document.getElementById('maisd-google-message').textContent=message||'';
    return panel;
  }
  function rejectIdentity(error){
    identityPanel(error.message);document.getElementById('maisd-google-reload').hidden=false;
    var p=pendingIdentity;pendingIdentity=null;if(p)p.reject(error);
  }
  function acceptCredential(response){
    var token=response&&response.credential,claims=decode(token||''),c=config();
    if(!usable(token||'')||!claims||claims.aud!==c.googleClientId||claims.nonce!==nonce||c.allowedDomains.indexOf(String(claims.hd||'').toLowerCase())<0) {
      identityPanel('Choose an authorized school Google account.');return;
    }
    // Client checks only improve the UI. The API independently verifies the
    // Google signature, issuer, audience, expiry, domain and verified email.
    googleCredential=token;try{sessionStorage.setItem(KEY,token);}catch(e){}
    var panel=document.getElementById('maisd-google-signin');if(panel)panel.remove();
    var p=pendingIdentity;pendingIdentity=null;if(p)p.resolve(token);
  }
  function showGoogleButton(){
    var c=config();identityPanel('');
    if(!global.google||!google.accounts||!google.accounts.id)throw new Error('Google sign-in could not load. Check your connection and reload this page.');
    if(!clientInitialized){
      nonce=global.crypto.randomUUID()+global.crypto.randomUUID();
      google.accounts.id.initialize({client_id:c.googleClientId,callback:acceptCredential,nonce:nonce,auto_select:true,ux_mode:'popup'});
      clientInitialized=true;
    }
    var host=document.getElementById('maisd-google-button');host.replaceChildren();
    google.accounts.id.renderButton(host,{theme:'outline',size:'large',text:'continue_with',width:300});
    if(typeof google.accounts.id.prompt==='function')google.accounts.id.prompt();
  }
  function getIdentity(){
    config();if(usable(googleCredential))return Promise.resolve(googleCredential);
    restore();if(usable(googleCredential))return Promise.resolve(googleCredential);
    if(pendingIdentity)return pendingIdentity.promise;
    var resolve,reject,promise=new Promise(function(a,b){resolve=a;reject=b;});
    pendingIdentity={promise:promise,resolve:resolve,reject:reject};
    function launch(){
      try{
        identityPanel('Loading Google sign-in…');
        if(global.google&&google.accounts&&google.accounts.id){showGoogleButton();return;}
        var existing=document.getElementById('maisd-gsi-library');
        if(existing){showGoogleButton();return;}
        var script=document.createElement('script');script.id='maisd-gsi-library';script.src='https://accounts.google.com/gsi/client';script.async=true;
        script.onload=function(){try{showGoogleButton();}catch(e){rejectIdentity(e);}};
        script.onerror=function(){script.remove();rejectIdentity(new Error('Google sign-in could not load. Check your connection and reload this page.'));};
        document.head.append(script);
      }catch(e){rejectIdentity(e);}
    }
    if(document.body)launch();else document.addEventListener('DOMContentLoaded',launch,{once:true});
    return promise;
  }
  function timing(method,started,result){
    var detail={method:method,durationMs:Math.round(performance.now()-started),ok:result.ok};
    // Only accept known, finite counters. Never copy response data or credentials
    // into diagnostics, even if an API response contains unexpected fields.
    var raw=result._timing;
    if(raw&&typeof raw==='object'){
      var server={};
      ['serverMs','readMs','readCalls'].forEach(function(key){
        if(typeof raw[key]==='number'&&Number.isFinite(raw[key])&&raw[key]>=0)server[key]=raw[key];
      });
      if(Object.keys(server).length)detail.server=server;
    }
    return detail;
  }
  async function request(method,args){
    if(method==='apiLogin'||method==='apiLogout'||(global.MUTATING||[]).indexOf(method)>=0)clearViews();
    var c=config(),credential=await getIdentity();
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},120000);
    var started=performance.now();
    try{
      var response=await fetch(c.apiUrl,{
        method:'POST',mode:'cors',credentials:'omit',redirect:'follow',cache:'no-store',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'text/plain;charset=UTF-8'},
        body:JSON.stringify({version:1,origin:global.location.origin,method:method,args:args,googleIdToken:credential}),signal:controller.signal
      });
      if(!response.ok)throw new Error('The API connection was interrupted. Check save status before submitting again.');
      var result;try{result=await response.json();}catch(e){throw new Error('The API did not return a valid response. Check save status before submitting again.');}
      if(!result||typeof result!=='object'||typeof result.ok!=='boolean')throw new Error('The API response was incomplete. Check save status before submitting again.');
      if(result.code==='GOOGLE_AUTH_REQUIRED'){forget();clientInitialized=false;}
      if(!result.ok)clearViews();
      seedStartup(method,args,result);
      var detail=timing(method,started,result);
      if(global.console&&global.console.debug)global.console.debug('[MAISD timing] '+JSON.stringify(detail));
      if(c.diagnostics===true)global.dispatchEvent(new CustomEvent('maisd-api-timing',{detail:detail}));
      return result;
    }catch(error){
      clearViews();
      // A network failure does not prove a write failed. Never automatically
      // replay a request; the app already has idempotent request/status flows.
      if(error.name==='AbortError')throw new Error('The request timed out. Check save status before submitting again.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  function runner(success,failure,userObject){
    return new Proxy({}, {get:function(target,name){
      if(name==='withSuccessHandler')return function(fn){return runner(fn,failure,userObject);};
      if(name==='withFailureHandler')return function(fn){return runner(success,fn,userObject);};
      if(name==='withUserObject')return function(value){return runner(success,failure,value);};
      if(typeof name!=='string'||!/^api[A-Z]\w*$/.test(name))return undefined;
      return function(){var args=Array.prototype.slice.call(arguments),context=previewContext;Promise.resolve().then(function(){return context&&viewEligible(name,args)?readView(name,args,context):request(name,args);}).then(function(result){if(success)success(result,userObject);},function(error){if(failure)failure(error,userObject);});};
    }});
  }
  // Short-lived, tab-local display snapshots. Editors and writes always use the
  // normal fresh request path. No response is stored in local/session storage.
  var viewCache=new Map(),viewPending=new Map(),viewEpoch=0,viewOwner='',previewContext=null;
  var VIEW_TTL=15000,VIEW_LIMIT=12,viewWarmBusy=false;
  function clearViews(){viewEpoch++;viewCache.clear();viewPending.clear();}
  function viewEligible(method,args){return typeof args[0]==='string'&&!!args[0]&&(
    method==='apiEquipmentQuery'||method==='apiDetail'&&args[1]==='asset'||
    method==='apiPage'&&['maintenance','assignments'].indexOf(args[1])>=0);}
  function stableView(value){
    if(Array.isArray(value))return value.map(stableView);
    if(value&&typeof value==='object'){var out={};Object.keys(value).sort().forEach(function(k){if(value[k]!==undefined)out[k]=stableView(value[k]);});return out;}
    return value;
  }
  function viewKey(method,args){return method+':'+JSON.stringify(stableView(args));}
  function copyView(value){return JSON.parse(JSON.stringify(value));}
  function currentViewOwner(args){
    var claims=decode(googleCredential||'');
    var owner=(claims&&claims.sub||'')+':'+(args[0]||'');
    if(owner!==viewOwner){clearViews();viewOwner=owner;}
    return owner;
  }
  function putView(method,args,result,epoch,owner){
    if(epoch!==viewEpoch||owner!==viewOwner||!result||!result.ok||!usable(googleCredential))return;
    var key=viewKey(method,args);
    viewCache.delete(key);viewCache.set(key,{value:copyView(result),at:Date.now()});
    while(viewCache.size>VIEW_LIMIT)viewCache.delete(viewCache.keys().next().value);
  }
  function getView(method,args){
    if(!usable(googleCredential)){clearViews();return null;}
    currentViewOwner(args);
    var key=viewKey(method,args),entry=viewCache.get(key);
    if(entry&&Date.now()-entry.at>=VIEW_TTL){viewCache.delete(key);return null;}
    return entry;
  }
  function readView(method,args,context){
    if(!viewEligible(method,args))return request(method,args);
    var started=performance.now(),entry=getView(method,args),source=entry?'memory':'network',age=entry?Date.now()-entry.at:0;
    var owner=currentViewOwner(args),epoch=viewEpoch,key=viewKey(method,args),pending=viewPending.get(key),promise;
    if(entry)promise=Promise.resolve(copyView(entry.value));
    else if(pending){source='inflight';promise=pending;}
    else {
      promise=request(method,args).then(function(result){putView(method,args,result,epoch,owner);return result;});
      viewPending.set(key,promise);
      promise.then(function(){if(viewPending.get(key)===promise)viewPending.delete(key);},function(){if(viewPending.get(key)===promise)viewPending.delete(key);});
    }
    return promise.then(function(result){
      if(result.ok&&(epoch!==viewEpoch||owner!==viewOwner)){var e=new Error('The record changed while loading. Refresh to load it again.');e.code='STALE_VIEW';throw e;}
      if(context){context.source=source;context.ageMs=age;context.checkedAt=entry?entry.at:Date.now();}
      if(global.console&&global.console.debug&&!(context&&context.prefetch))global.console.debug('[MAISD view] '+JSON.stringify({method:method,source:source,durationMs:Math.round(performance.now()-started),ageMs:age,ok:result.ok}));
      return copyView(result);
    });
  }
  function withView(fn,context){var previous=previewContext;previewContext=context;try{return fn();}finally{previewContext=previous;}}
  function warmView(method,args){
    if(viewWarmBusy||!usable(googleCredential)||!viewEligible(method,args)||getView(method,args))return;
    viewWarmBusy=true;
    return readView(method,args,{prefetch:true}).catch(function(){}).finally(function(){viewWarmBusy=false;});
  }
  function seedStartup(method,args,result){
    var start=method==='apiStart'?result:method==='apiLogin'&&result&&result.ok&&result.data?result.data.startup:null;
    var token=method==='apiStart'?args[0]:result&&result.data&&result.data.token;
    var query=method==='apiStart'?args[1]:args[3];
    if(!start||!start.ok||!start.data||!start.data.initialEquipment||!start.data.initialEquipment.ok||!token)return;
    var q=copyView(query||{});if(q.snapshot===undefined)q.snapshot='';
    var a=[token,q],owner=currentViewOwner(a);putView('apiEquipmentQuery',a,start.data.initialEquipment,viewEpoch,owner);
  }
  function installFastViews(){
    if(!global.PAGES||!global.S||global.MAISD_FAST_VIEWS)return;
    global.MAISD_FAST_VIEWS='20261013.1';
    var pages=['assets','dashboard','districtreports','maintenance','assignments'];
    function freshness(context,page){
      if(global.S.page!==page||context.navigation!==global.NAVIGATION154)return;
      var host=document.getElementById('pageHost'),bar=document.getElementById('viewFreshness1511');
      if(!bar){bar=document.createElement('div');bar.id='viewFreshness1511';bar.style.cssText='padding:6px 20px;font-size:12px;color:var(--muted)';host.parentNode.insertBefore(bar,host);}
      bar.replaceChildren();var checked=new Intl.DateTimeFormat('en-US',{timeZone:global.S.timeZone||'America/Detroit',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(context.checkedAt||Date.now()));bar.append(document.createTextNode('Updated '+checked+'. '));
      var refresh=document.createElement('button');refresh.className='btn sm';refresh.textContent='Refresh';refresh.onclick=function(){global.reloadPage();};bar.append(refresh);bar.hidden=false;
    }
    pages.forEach(function(page){var previous=global.PAGES[page];if(!previous)return;
      global.PAGES[page]=function(){var self=this,args=arguments,context={navigation:global.NAVIGATION154,source:global.S.initialEquipment?'startup':'network',ageMs:0},started=performance.now();
        var result=withView(function(){return previous.apply(self,args);},context);
        return Promise.resolve(result).then(function(value){
          if(context.navigation===global.NAVIGATION154){freshness(context,page);if(global.console&&global.console.debug)global.console.debug('[MAISD screen] '+JSON.stringify({screen:page,source:context.source,durationMs:Math.round(performance.now()-started)}));}
          return value;
        });
      };
    });
    var assetBefore=global.assetDetail;
    if(assetBefore)global.assetDetail=function(){var args=arguments,self=this;return withView(function(){return assetBefore.apply(self,args);},{navigation:global.NAVIGATION154});};
    var reloadBefore=global.reloadPage;
    global.reloadPage=function(){clearViews();return reloadBefore.apply(this,arguments);};
    var goBefore=global.go;
    global.go=function(){var bar=document.getElementById('viewFreshness1511');if(bar)bar.hidden=true;return goBefore.apply(this,arguments);};
    // Warm only a screen or exact device the user points to. Never run a loop
    // through the inventory, collect extra records, or keep polling in the background.
    function intent(event){
      if(!global.S.token||document.hidden||global.WRITE_PROMISE14_)return;
      var el=event.target&&event.target.closest?event.target.closest('.nav a[data-mod],button[onclick]'):null;if(!el)return;
      var page=el.getAttribute('data-mod');
      if(page==='maintenance'||page==='assignments'){
        if(global.S.pagePerm[page]&&!global.can(global.S.pagePerm[page]))return;
        warmView('apiPage',[global.S.token,page]);return;
      }
      var match=/^assetDetail\('([A-Za-z0-9_-]{1,120})'\)$/.exec(el.getAttribute('onclick')||'');
      if(match&&(global.S.rows.asset||[]).some(function(a){return a.AssetID===match[1];}))warmView('apiDetail',[global.S.token,'asset',match[1]]);
    }
    document.addEventListener('pointerover',intent);document.addEventListener('focusin',intent);
    document.addEventListener('visibilitychange',function(){if(document.hidden)clearViews();});
    global.addEventListener('pagehide',clearViews);
    // Invalidate immediately, including saves that later time out, rather than
    // allowing a late read to repopulate a snapshot from before the write.
    var messageBefore=global.rpcMsg;
    global.rpcMsg=function(method){var mutating=(global.MUTATING||[]).indexOf(method)>=0;if(mutating)clearViews();var result=messageBefore.apply(this,arguments);return mutating?Promise.resolve(result).finally(clearViews):result;};
  }

  global.MAISD_API={runner:runner(),request:request,clearGoogleIdentity:forget,
    hasIdentity:function(){if(!usable(googleCredential))restore();return !!usable(googleCredential);},
    ensureIdentity:function(){return getIdentity().then(function(){return undefined;});}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installFastViews,{once:true});else installFastViews();
  function checkConfig(){try{config();}catch(e){identityPanel(e.message);}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkConfig,{once:true});else checkConfig();
})(window);
