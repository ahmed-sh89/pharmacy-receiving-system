const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/auth.js','utf8');
function fn(name){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));return source.slice(start,source.indexOf('\n}',start)+2);}
test('resuming a forced-change session cannot grant application access or boot the workspace',()=>{
  const context={AuthState:{mustChangePassword:true,context:{pharmacy_id:'qa'}},renderAuthState(){context.locked=true;},window:{bootProtectedApplication(){throw Error('workspace booted');}}};
  vm.createContext(context);vm.runInContext(fn('hasApplicationAccess')+'\n'+fn('unlockApplicationAfterAuth')+'\nresult=hasApplicationAccess();unlockApplicationAfterAuth()',context);
  assert.equal(context.result,false);assert.equal(context.locked,true);
});
test('an old client session locks immediately on the current server password gate without token-refresh retry',async()=>{
  const context={AuthState:{mustChangePassword:false},getSupabaseAccessToken:()=> 'fixture',authRequest:async()=>{throw Error('PASSWORD_CHANGE_REQUIRED');},renderAuthState(){context.locked=true;},refreshAuthToken(){throw Error('unexpected token refresh');}};
  vm.createContext(context);vm.runInContext(fn('authRpc'),context);
  await assert.rejects(context.authRpc('list_pharmflow_orders'),/PASSWORD_CHANGE_REQUIRED/);
  assert.equal(context.AuthState.mustChangePassword,true);assert.equal(context.locked,true);
});
test('pending assignments cannot run while a temporary password is active',async()=>{
  const context={AuthState:{mustChangePassword:true},getSupabaseAccessToken(){throw Error('assignment invoked');}};
  vm.createContext(context);vm.runInContext(fn('finishPendingAccessIfPossible'),context);
  await context.finishPendingAccessIfPossible();
});

function completionFixture(failLogin=false){
  const events=[];
  const context={AuthState:{busy:false,mustChangePassword:true,user:{email:'fixture@pharmflow.test'},session:{id:'old'}},
    valueOf:()=> 'fixture-password',setAuthBusy(){},setAuthMessage(){},
    callPasswordAdmin:async()=>{events.push('replace');},
    authRequest:async()=>{events.push('reauthenticate');if(failLogin)throw Error('network unavailable');return {id:'fresh'};},
    persistAuthSession(session){context.AuthState.session=session;context.AuthState.mustChangePassword=false;events.push(session?'persist fresh':'clear session');},
    loadMyAppContext:async()=>{assert.equal(context.AuthState.session.id,'fresh');events.push('context');},
    renderAuthState(){},unlockApplicationAfterAuth(){events.push('unlock');},
    lockApplicationForAuth(){events.push('lock');},showAuthPanel(){events.push('login');}};
  vm.createContext(context);vm.runInContext(fn('completeTemporaryPassword'),context);
  return {context,events};
}
test('password completion reauthenticates before session-bound business operations resume',async()=>{
  const {context,events}=completionFixture();await context.completeTemporaryPassword();
  assert.deepEqual(events,['replace','reauthenticate','persist fresh','context','unlock']);
});
test('successful password replacement with failed reauthentication stays locked at login',async()=>{
  const {context,events}=completionFixture(true);await context.completeTemporaryPassword();
  assert.deepEqual(events,['replace','reauthenticate','clear session','lock','login']);
});
