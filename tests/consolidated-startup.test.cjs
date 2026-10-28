const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),cp=require('node:child_process'),{performance}=require('node:perf_hooks');
async function run(baseline,stored){
 const source=baseline?cp.execFileSync('git',['show','08843e4:js/auth.js'],{encoding:'utf8'}):fs.readFileSync('js/auth.js','utf8');const start=source.indexOf('async function initializeAuth()'),end=source.indexOf('\n\nfunction finishAuthBootState',start);let setup=0,render=0;
 const c={AuthState:{initialized:false,session:stored?{}:null},window:{location:{hash:''}},URLSearchParams,bindAuthUI(){},clearRecoveryArtifacts(){},handleRecoveryErrorFromUrl:()=>null,parseRecoverySessionFromUrl:()=>false,restoreAuthSession(){},isRestoredAccessTokenStale:()=>false,loadPublicSetupStatus:async()=>{setup++;await new Promise(r=>setTimeout(r,40));},finishAuthBootState(){},renderAuthState(){render++;}};vm.createContext(c);vm.runInContext(source.slice(start,end),c);const startTime=performance.now();await c.initializeAuth();return {setup,render,ms:performance.now()-startTime};
}
test('restored auth removes only the redundant public-setup request; signed-out setup still runs',async()=>{
 const old=await run(true,true),next=await run(false,true),signedOut=await run(false,false);assert.equal(old.setup,1);assert.equal(next.setup,0);assert.equal(next.render,0);assert.equal(signedOut.setup,1);assert.equal(signedOut.render,1);
 console.log('CONTROLLED_AUTH_SETUP_COMPARISON',JSON.stringify({baselineMs:Number(old.ms.toFixed(2)),candidateMs:Number(next.ms.toFixed(2)),conditions:'40ms simulated public setup response, token already fresh; context/permission gates unchanged'}));
});
