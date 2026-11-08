"use strict";
/* Read-only diagnostics emitted only for the approved startup Staging branch.
   No tokens, user/pharmacy identifiers, payloads, storage or response bodies. */
(() => {
    const spans=[];
    let recording=true;
    function record(name,start){
        if(spans.length<120)spans.push({stage:name,startMs:Math.round(start),durationMs:Math.round(performance.now()-start)});
    }
    function wrap(name,label=name){
        const original=window[name];
        if(typeof original!=="function")return;
        window[name]=function(...args){
            if(!recording)return original.apply(this,args);
            const start=performance.now();
            const stage=label==='auth-network'
                ? 'auth-network:'+String(args[0]||'').split('?')[0].split('/').pop()
                : label;
            let result;
            try{result=original.apply(this,args);}catch(error){record(stage,start);throw error;}
            const finish=()=>{
                record(stage,start);
                if(name==='startApplication')recording=false;
            };
            if(result && typeof result.then==='function')result.then(finish,finish);
            else finish();
            return result;
        };
    }
    function snapshot(){
        const nav=performance.getEntriesByType('navigation')[0];
        const resources=performance.getEntriesByType('resource');
        const assets=resources.filter(r=>['script','link','css','img'].includes(r.initiatorType));
        return {
            environment:'staging',
            navigation:nav?{
                htmlResponseStartMs:Math.round(nav.responseStart),htmlResponseEndMs:Math.round(nav.responseEnd),
                domInteractiveMs:Math.round(nav.domInteractive),domContentLoadedMs:Math.round(nav.domContentLoadedEventStart)
            }:null,
            screen:{authLoading:document.body.classList.contains('authBooting'),workspaceLoading:document.body.classList.contains('workspaceBooting')},
            spans:spans.map(s=>({...s})),
            assets:assets.map(r=>({path:new URL(r.name,location.href).pathname,startMs:Math.round(r.startTime),durationMs:Math.round(r.duration),transferBytes:r.transferSize}))
        };
    }
    window.PharmFlowStartupTimings=Object.freeze({snapshot});
    // Registered in <head>, before bootstrap's DOMContentLoaded listener.
    window.addEventListener('DOMContentLoaded',()=>{
        for(const name of ['initializeAuth','finishPendingAccessIfPossible','loadMyAppContext','loadMyRegistrationStatus','ensureStartupCloudAuthority','restoreCloudWorkspaceOnLogin','getCloudWorkspaceGeneration','pullActiveOrderManifestAuthority','pullCloudWorkspaceTransactions','repairSharedReceivingLedgerFromLocal','initializeState','startRouter','initializeUI','initializeOptionalModules','refreshSafeAccountIdentity','refreshEntireUI','startApplication'])wrap(name);
        wrap('authRequest','auth-network');
        const button=document.createElement('button');
        button.type='button';button.textContent='Staging: startup timings';
        button.style.cssText='position:fixed;bottom:8px;right:8px;z-index:2147483647;font:12px sans-serif;padding:6px';
        button.addEventListener('click',()=>{
            let panel=document.getElementById('stagingStartupTimings');
            if(panel){panel.remove();return;}
            panel=document.createElement('pre');panel.id='stagingStartupTimings';panel.textContent=JSON.stringify(snapshot(),null,2);
            panel.style.cssText='position:fixed;inset:12px 12px 46px;overflow:auto;z-index:2147483646;background:white;color:#173f70;border:2px solid #173f70;padding:12px;font:12px monospace;white-space:pre-wrap';
            document.body.append(panel);
        });
        document.body.append(button);
    },{once:true});
})();
