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
  function forget(){googleCredential='';try{sessionStorage.removeItem(KEY);}catch(e){}}
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
      var detail=timing(method,started,result);
      if(global.console&&global.console.debug)global.console.debug('[MAISD timing] '+JSON.stringify(detail));
      if(c.diagnostics===true)global.dispatchEvent(new CustomEvent('maisd-api-timing',{detail:detail}));
      return result;
    }catch(error){
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
      return function(){var args=Array.prototype.slice.call(arguments);Promise.resolve().then(function(){return request(name,args);}).then(function(result){if(success)success(result,userObject);},function(error){if(failure)failure(error,userObject);});};
    }});
  }
  global.MAISD_API={runner:runner(),request:request,clearGoogleIdentity:forget,
    hasIdentity:function(){if(!usable(googleCredential))restore();return !!usable(googleCredential);},
    ensureIdentity:function(){return getIdentity().then(function(){return undefined;});}
  };
  function checkConfig(){try{config();}catch(e){identityPanel(e.message);}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkConfig,{once:true});else checkConfig();
})(window);
