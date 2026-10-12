"use strict";
const fs=require("fs");
const vm=require("vm");
const assert=require("assert");
const test=require("node:test");

const cloudSource=fs.readFileSync("cloud-workspace.js","utf8");
const appSource=fs.readFileSync("js/app.js","utf8");

function extractFunction(source,signature){
    const start=source.indexOf(signature);
    assert.notEqual(start,-1,`missing ${signature}`);
    const brace=source.indexOf("){",start)+1;
    let depth=0;
    for(let i=brace;i<source.length;i++){
        if(source[i]==="{") depth++;
        else if(source[i]==="}" && --depth===0) return source.slice(start,i+1);
    }
    throw new Error(`unterminated ${signature}`);
}

function cloudHarness(authRpc){
    let refreshes=0;
    let merged=0;
    const sandbox={
        PharmFlowCloudWorkspace:{
            applyingRemote:false,receivingSyncBusy:false,receivingSyncPromise:null,
            lastTransactionReadAt:0,lastTransactionReadSucceeded:false,
            lastReceivingSnapshotComplete:false,receivingBootstrapComplete:false,
            receivingCursorCreatedAt:null,receivingCursorTransactionId:null,
            contextSwitching:false
        },
        AuthState:{context:{pharmacy_id:"pharmacy-a"}},
        cloudWorkspacePharmacyId(){return "pharmacy-a";},
        AppState:{workspace:{orderData:[{itemCode:"A"}],receivingHistory:[]}},
        navigator:{onLine:true},Date,Promise,Array,Object,Number,String,Map,
        authRpc,
        mergeCloudReceivingLedger(rows){merged+=rows.length;return rows.length>0;},
        rebuildStateIndexes(){},recalculateStatistics(){},saveWorkspaceSnapshot(){},
        AppEvents:{emit(){}},refreshEntireUI(){refreshes++;},refreshAllUI(){refreshes++;},
        setCloudWorkspaceStatus(){},Logger:{warn(){}},nowISO(){return "now";}
    };
    vm.runInNewContext(extractFunction(cloudSource,"async function pullCloudWorkspaceTransactions(options={})"),sandbox);
    return {sandbox,get refreshes(){return refreshes;},get merged(){return merged;}};
}

for(const simulatedSeconds of [5,25]){
    test(`overlapping startup callers wait for the ${simulatedSeconds}s ledger snapshot`,async()=>{
        let release;
        let requests=0;
        const row={transaction_id:"tx-1",sync_created_at:"2026-10-12T00:00:00Z"};
        const harness=cloudHarness(()=>{
            requests++;
            return new Promise(resolve=>{
                // The held response represents simulated 5s/25s latency. The
                // test releases it explicitly after checking the UI gate.
                release=()=>resolve([row]);
            });
        });

        let firstDone=false;
        let secondDone=false;
        const first=harness.sandbox.pullCloudWorkspaceTransactions().then(value=>{firstDone=true;return value;});
        const second=harness.sandbox.pullCloudWorkspaceTransactions().then(value=>{secondDone=true;return value;});
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(firstDone,false);
        assert.equal(secondDone,false,"a caller in the 2.5-second dedupe window must join, not pass the readiness gate");
        assert.equal(requests,1,"overlapping callers must share one server read");

        release();
        assert.deepEqual(await Promise.all([first,second]),[true,true]);
        assert.equal(harness.merged,1);
        assert.equal(harness.refreshes,1,"KPI refresh occurs once after the complete ledger result arrives");
        assert.equal(harness.sandbox.PharmFlowCloudWorkspace.lastReceivingSnapshotComplete,true);
    });
}

test("a failed or empty-throttled ledger read cannot report successful readiness",async()=>{
    let requests=0;
    const harness=cloudHarness(async()=>{requests++;throw new Error("offline");});
    assert.equal(await harness.sandbox.pullCloudWorkspaceTransactions(),false);
    assert.equal(await harness.sandbox.pullCloudWorkspaceTransactions(),false);
    assert.equal(requests,1,"failed reads stay throttled without being mislabeled successful");
    assert.equal(harness.sandbox.PharmFlowCloudWorkspace.lastReceivingSnapshotComplete,false);
    assert.equal(harness.refreshes,0);
});

test("a successfully loaded empty ledger is authoritative zero without a false transition",async()=>{
    let requests=0;
    const harness=cloudHarness(async()=>{requests++;return [];});
    assert.equal(await harness.sandbox.pullCloudWorkspaceTransactions(),true);
    assert.equal(harness.sandbox.PharmFlowCloudWorkspace.lastReceivingSnapshotComplete,true);
    assert.equal(harness.sandbox.PharmFlowCloudWorkspace.lastTransactionReadSucceeded,true);
    assert.equal(harness.refreshes,0,"a legitimate empty snapshot remains stable at zero");
    assert.equal(await harness.sandbox.pullCloudWorkspaceTransactions(),true);
    assert.equal(requests,1,"a successful empty result may use the existing short read throttle");
});

test("a paginated ledger is ready only after the final short or empty page",async()=>{
    let requests=0;
    const rows=Array.from({length:500},(_,i)=>({transaction_id:`tx-${i}`,sync_created_at:`cursor-${i}`}));
    const harness=cloudHarness(async()=>{
        requests++;
        if(requests<=11) return rows.map((row,index)=>({...row,transaction_id:`${requests}-${index}`}));
        return [];
    });
    assert.equal(await harness.sandbox.pullCloudWorkspaceTransactions(),true);
    assert.equal(requests,12,"full pages beyond the old 5,000-row cap require a final completion read");
    assert.equal(harness.merged,5500);
    assert.equal(harness.sandbox.PharmFlowCloudWorkspace.lastReceivingSnapshotComplete,true);
});

test("partial ledger pages followed by a failed page are never marked complete",async()=>{
    let requests=0;
    const rows=Array.from({length:500},(_,i)=>({transaction_id:`partial-${i}`,sync_created_at:`cursor-${i}`}));
    const harness=cloudHarness(async()=>{
        requests++;
        if(requests===1) return rows;
        throw new Error("network interrupted during pagination");
    });
    assert.equal(await harness.sandbox.pullCloudWorkspaceTransactions(),false);
    assert.equal(harness.sandbox.PharmFlowCloudWorkspace.lastReceivingSnapshotComplete,false);
    assert.equal(harness.sandbox.PharmFlowCloudWorkspace.lastTransactionReadSucceeded,false);
    assert.equal(harness.refreshes,0,"partial rows do not trigger a final KPI render");
});

test("workspace restore fails closed when the authoritative ledger fetch fails",async()=>{
    const sandbox={
        AuthState:{context:{pharmacy_id:"pharmacy-a"}},navigator:{onLine:true},
        AppState:{workspace:{orderData:[{itemCode:"A"}],orderFiles:[{documentId:"order-a"}],receivingHistory:[]}},
        PharmFlowCloudWorkspace:{hydratedPharmacyId:null,hydrationPromise:null,activeManifestPresent:true,
            receivingCursorCreatedAt:"old",receivingCursorTransactionId:"old",receivingBootstrapComplete:true},
        ensureCloudAccountContextIsolation(){},cloudWorkspacePharmacyId(){return "pharmacy-a";},
        authRpc:async name=>name==="get_pharmflow_cloud_workspace"?[{}]:[],
        setCloudWorkspaceStatus(){},getCloudWorkspaceGeneration:async()=>0,
        pullActiveOrderManifestAuthority:async()=>true,
        pullCloudWorkspaceTransactions:async()=>false,
        flushCloudWorkspaceQueue:async()=>true,Logger:{warn(){}}
    };
    vm.runInNewContext(extractFunction(cloudSource,"async function restoreCloudWorkspaceOnLogin()"),sandbox);
    assert.equal(await sandbox.restoreCloudWorkspaceOnLogin(),false);
    assert.equal(sandbox.PharmFlowCloudWorkspace.hydratedPharmacyId,null,"failed ledger data must not be marked hydrated");
});

test("Production startup does not initialize dashboard or scanner on failed authority",()=>{
    assert.match(appSource,/error\?\.code==="PHARMFLOW_STARTUP_AUTHORITY_NOT_READY"/);
    assert.match(appSource,/PharmFlow could not confirm the complete receiving snapshot/);
    assert.match(appSource,/Retry synchronization/);
});

test("failed startup presents a direct retry without exposing the workspace",()=>{
    const nodes={
        strong:{textContent:"Preparing PharmFlow"},
        small:{textContent:"Loading your receiving workspace…"}
    };
    let reloads=0;
    const card={
        children:[],
        querySelector(selector){return nodes[selector]||(selector==="#workspaceBootRetry"?null:null);},
        appendChild(element){this.children.push(element);}
    };
    const overlay={querySelector(){return card;}};
    const bodyClasses=[];
    const sandbox={
        document:{
            body:{classList:{add(value){bodyClasses.push(value);}}},
            getElementById(){return overlay;},
            createElement(){return {addEventListener(_type,handler){this.handler=handler;}};}
        },
        window:{location:{reload(){reloads++;}}}
    };
    vm.runInNewContext(extractFunction(appSource,"function showWorkspaceStartupAuthorityFailure()"),sandbox);
    sandbox.showWorkspaceStartupAuthorityFailure();
    assert.match(nodes.strong.textContent,/not ready/);
    assert.match(nodes.small.textContent,/Dashboard totals and scanning are paused/);
    assert.ok(bodyClasses.includes("workspaceBooting"));
    const retry=card.children[0];
    assert.equal(retry.textContent,"Retry synchronization");
    retry.handler();
    assert.equal(reloads,1);
});
