import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
const SECRET='__SECRET__', MARKER='__MARKER__', EXPIRES=__EXPIRES__;
const EXPECTED='https://tovkcakucyagvbzvlnks.supabase.co';
let running=false, completed=false;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(SECRET.length<48||Date.now()>EXPIRES||req.headers.get('x-fixture-secret')!==SECRET)return json({error:'Unavailable'},403);
 const url=Deno.env.get('SUPABASE_URL');if(url!==EXPECTED)return json({error:'Staging assertion failed'},403);
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!service||!anon)return json({error:'Server configuration unavailable'},500);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(12000)})}});
 const body=await req.json().catch(()=>({}));
 const emails=[MARKER+'-a@example.invalid',MARKER+'-b@example.invalid'];
 async function owned(id:string){const r=await admin.auth.admin.getUserById(id);return !r.error&&r.data.user?.app_metadata?.pharmflow_security_fixture===MARKER&&emails.includes(r.data.user.email||'');}
 async function clean(ids:string[]){
  const rows=[];for(const id of ids){if(!await owned(id)){rows.push({id,deleted:false,reason:'Ownership check failed'});continue;}
   const deleted=await admin.auth.admin.deleteUser(id);const check=await admin.auth.admin.getUserById(id);
   rows.push({id,deleted:!deleted.error&&!check.data?.user,delete_error:deleted.error?{code:deleted.error.code,status:deleted.error.status,message:deleted.error.message}:null,remaining:!!check.data?.user});
  }return rows;
 }
 if(body.action==='cleanup')return json({cleanup:await clean(Array.isArray(body.ids)?body.ids.filter((x:unknown)=>typeof x==='string'):[])});
 
 if(body.action==='owner-create'){
  const fixture_ids=[];for(let i=0;i<2;i++){
   const password='Pf9!'+SECRET.slice(0,24)+'-'+i;
   const created=await admin.auth.admin.createUser({email:emails[i],password,email_confirm:true,app_metadata:{pharmflow_must_change_password:false,pharmflow_security_fixture:MARKER}});
   if(created.error)return json({error:'Owner fixture creation failed',fixture_ids},500);
   fixture_ids.push(created.data.user!.id);
  }return json({fixture_ids,marker:MARKER});
 }
 if(body.action==='owner-run'){
  const selected=body.ids;if(!Array.isArray(selected)||selected.length!==2||!await owned(selected[0])||!await owned(selected[1]))return json({error:'Ownership check failed'},403);
  const checks:any[]=[];let failure;
  async function call(path:string,data:any,token?:string){
   const headers:Record<string,string>={apikey:anon!,'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
   const response=await fetch(url+path,{method:'POST',headers,body:JSON.stringify(data),signal:AbortSignal.timeout(12000)});
   let value:any={};try{value=await response.json();}catch{}
   return {status:response.status,data:value};
  }
  function verify(name:string,pass:boolean,status?:number){checks.push({name,pass,status});if(!pass)throw Error(name);}
  try{
   const owner=await call('/auth/v1/token?grant_type=password',{email:emails[0],password:'Pf9!'+SECRET.slice(0,24)+'-0'});
   verify('isolated owner login',owner.status===200,owner.status);
   const token=owner.data.access_token;
   const isOwner=await call('/rest/v1/rpc/is_system_owner',{},token);
   verify('trusted database recognizes only newly assigned fixture owner',isOwner.status===200&&isOwner.data===true,isOwner.status);
   for(const slug of ['pharmflow-password-admin-settings-rc','pharmflow-password-admin']){
    const reset=await call('/functions/v1/'+slug,{action:'reset',target_user_id:selected[1]},token);
    verify(slug+' authorized owner reset succeeds',reset.status===200&&typeof reset.data.temporary_password==='string',reset.status);
    const login=await call('/auth/v1/token?grant_type=password',{email:emails[1],password:reset.data.temporary_password});
    verify(slug+' reset credential logs in with required change',login.status===200&&login.data.user?.app_metadata?.pharmflow_must_change_password===true,login.status);
    const same=await call('/functions/v1/'+slug,{action:'complete',new_password:reset.data.temporary_password},login.data.access_token);
    verify(slug+' owner-reset credential reuse denied',same.status===400&&same.data.error==='Choose a different password',same.status);
    const complete=await call('/functions/v1/'+slug,{action:'complete',new_password:'Qx8!'+SECRET.slice(24,48)+'-'+slug.length},login.data.access_token);
    verify(slug+' reset completion succeeds with distinct replacement',complete.status===200&&complete.data.success===true,complete.status);
   }
  }catch(e){failure=e instanceof Error?e.message:'Owner fixture failed';}
  return json({pass:!failure,results:checks,failure,fixture_ids:selected});
 }

 
 if(body.action==='session-probe'){
  const pharmacies=["b2db74e7-3039-4d16-a25b-412a19cc10e3","a5462380-61bf-4d73-add6-cb18dff317d0"];const observations:any[]=[];const results:any[]=[];
  async function request(path:string,data:any,token?:string){
   const headers:Record<string,string>={apikey:anon!,'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
   const r=await fetch(url+path,{method:'POST',headers,body:JSON.stringify(data),signal:AbortSignal.timeout(12000)});let value:any={};try{value=await r.json();}catch{}return {status:r.status,data:value};
  }
  async function read(i:number,token:string,label:string){
   for(const fn of ['get_my_pharmflow_permissions_v1','get_pharmflow_active_order_manifest_meta_v1','query_pharmflow_expiry_inventory_v1']){
    const r=await request('/rest/v1/rpc/'+fn,{p_pharmacy_id:pharmacies[i]},token);
    observations.push({label,account:i,rpc:fn,status:r.status});
   }
  }

  if(body.phase==='parallel'){
   const password='Pf9!'+SECRET.slice(0,24)+'-0';
   const a=await request('/auth/v1/token?grant_type=password',{email:emails[0],password});
   const b=await request('/auth/v1/token?grant_type=password',{email:emails[0],password});
   results.push({case:'two independent sessions authenticate',pass:a.status===200&&b.status===200});
   if(a.status===200&&b.status===200){
    await read(0,a.data.access_token,'parallel first before');await read(0,b.data.access_token,'parallel second before');
    const out=await request('/auth/v1/logout?scope=local',{},a.data.access_token);
    results.push({case:'local logout succeeds',pass:out.status===204,status:out.status});
    await read(0,a.data.access_token,'parallel first revoked');await read(0,b.data.access_token,'parallel second remains');
   }return json({results,observations,phase:body.phase});
  }

  for(let i=0;i<2;i++){
   const password=['suspended','modules-disabled','member-disabled','afterfix'].includes(body.phase)&&i===1?'Rx7!'+SECRET.slice(16,40)+'-done':'Pf9!'+SECRET.slice(0,24)+'-'+i;
   const login=await request('/auth/v1/token?grant_type=password',{email:emails[i],password});
   results.push({case:'isolated pharmacy login '+i,pass:login.status===200,status:login.status});
   if(login.status!==200)continue;
   const token=login.data.access_token;
   if(['suspended','modules-disabled','member-disabled'].includes(body.phase)){await read(i,token,body.phase);continue;}
   await read(i,token,'before revocation');
   const foreign=await request('/rest/v1/rpc/get_pharmflow_active_order_manifest_meta_v1',{p_pharmacy_id:pharmacies[1-i]},token);
   results.push({case:'cross-fixture pharmacy denied '+i,pass:[400,403].includes(foreign.status),status:foreign.status});
   if(i===0){
    const out=await request('/auth/v1/logout?scope=global',{},token);
    results.push({case:'fixture logout',pass:out.status===204,status:out.status});await read(i,token,'after global logout');
   }else{
    const id=login.data.user.id;if(!await owned(id))return json({error:'Ownership assertion failed'},403);
    const reset=await admin.auth.admin.updateUserById(id,{password:'Tx6!'+SECRET.slice(8,32)+'-reset',app_metadata:{...login.data.user.app_metadata,pharmflow_must_change_password:true}});
    results.push({case:'owned identity password reset',pass:!reset.error});
    const temp=await request('/auth/v1/token?grant_type=password',{email:emails[i],password:'Tx6!'+SECRET.slice(8,32)+'-reset'});
    if(temp.status!==200){results.push({case:'reset login',pass:false,status:temp.status});continue;}
    const complete=await request('/functions/v1/pharmflow-password-admin',{action:'complete',new_password:'Rx7!'+SECRET.slice(16,40)+'-done'},temp.data.access_token);
    results.push({case:'actual reset completion',pass:complete.status===200,status:complete.status});await read(i,token,'after reset and completed replacement');
   }
  }
  return json({results,observations,phase:body.phase});
 }

 if(body.action!=='run'||running||completed)return json({error:'Run unavailable'},409);
 running=true;
 const ids:string[]=[],results:any[]=[],sessions:any[]=[],observations:any[]=[];
 async function api(path:string,method:string,data?:unknown,token?:string,privileged=false){
  const headers:Record<string,string>={apikey:privileged?service!:anon!,'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  const response=await fetch(url+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(12000)});
  const text=await response.text();let parsed:any={};try{parsed=JSON.parse(text);}catch{}
  return {status:response.status,data:parsed};
 }
 function check(name:string,pass:boolean,details:Record<string,unknown>={}){results.push({name,pass,...details});if(!pass)throw Error(name);}
 const password=(i:number,replacement=false)=>(replacement?'Qx8!':'Pf9!')+SECRET.slice(replacement?24:0,replacement?48:24)+'-'+i;
 let failure:string|undefined;
 try{
  for(let i=0;i<2;i++){
   const created=await admin.auth.admin.createUser({email:emails[i],password:password(i),email_confirm:true,app_metadata:{pharmflow_must_change_password:true,pharmflow_security_fixture:MARKER}});
   check('create owned disposable identity '+i,!created.error&&!!created.data.user);
   ids.push(created.data.user!.id);
   const login=await api('/auth/v1/token?grant_type=password','POST',{email:emails[i],password:password(i)});
   check('temporary login '+i,login.status===200&&!!login.data.access_token,{status:login.status});sessions.push(login.data);
  }
  const slugs=['pharmflow-password-admin-settings-rc','pharmflow-password-admin'];
  for(let i=0;i<2;i++){
   const slug=slugs[i],token=sessions[i].access_token;
   const unauth=await api('/functions/v1/'+slug,'POST',{action:'complete',new_password:password(i,true)});
   check(slug+' unauthenticated denied',unauth.status===401,{status:unauth.status});
   const reuse=await api('/functions/v1/'+slug,'POST',{action:'complete',new_password:password(i)},token);
   check(slug+' temporary password reuse rejected',reuse.status===400&&reuse.data.error==='Choose a different password',{status:reuse.status});
   const user=await api('/auth/v1/user','GET',undefined,token);
   check(slug+' rejected reuse preserves must-change',user.status===200&&user.data.app_metadata?.pharmflow_must_change_password===true);
  }
  // Legacy completion accepts only caller.id: a foreign target must not change B.
  const completeA=await api('/functions/v1/'+slugs[0],'POST',{action:'complete',new_password:password(0,true),target_user_id:ids[1],user_id:ids[1],pharmacy_id:'foreign-fixture'},sessions[0].access_token);
  check('legacy authorized caller-only completion',completeA.status===200&&completeA.data.success===true,{status:completeA.status});
  const victim=await api('/auth/v1/token?grant_type=password','POST',{email:emails[1],password:password(1)});
  check('foreign target unchanged after legacy completion',victim.status===200,{status:victim.status});
  const completeB=await api('/functions/v1/'+slugs[1],'POST',{action:'complete',new_password:password(1,true),target_user_id:ids[0],user_id:ids[0],role:'system_owner'},sessions[1].access_token);
  check('current authorized caller-only completion',completeB.status===200&&completeB.data.success===true,{status:completeB.status});
  for(let i=0;i<2;i++){
   const fresh=await api('/auth/v1/token?grant_type=password','POST',{email:emails[i],password:password(i,true)});
   check('new password login '+i,fresh.status===200&&fresh.data.user?.app_metadata?.pharmflow_must_change_password===false,{status:fresh.status});
   const old=await api('/auth/v1/token?grant_type=password','POST',{email:emails[i],password:password(i)});
   check('previous password rejected '+i,old.status===400,{status:old.status});
   const token=fresh.data.access_token;
   for(const slug of slugs){
    const reset=await api('/functions/v1/'+slug,'POST',{action:'reset',target_user_id:ids[1-i],role:'system_owner'},token);
    check(slug+' non-owner cannot reset foreign identity '+i,reset.status===403,{status:reset.status});
    const repeat=await api('/functions/v1/'+slug,'POST',{action:'complete',new_password:password(i)},token);
    check(slug+' completed account cannot bypass restriction '+i,repeat.status===403,{status:repeat.status});
   }
   const refresh=await api('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:fresh.data.refresh_token});
   check('replacement session refresh '+i,refresh.status===200&&!!refresh.data.access_token,{status:refresh.status});
   const priorAccess=await api('/auth/v1/user','GET',undefined,sessions[i].access_token);
   observations.push({case:'old access token after password change '+i,status:priorAccess.status});
   const signout=await api('/auth/v1/logout?scope=global','POST',{},refresh.data.access_token);
   check('global sign-out fixture '+i,signout.status===204,{status:signout.status});
   const after=await api('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:refresh.data.refresh_token});
   check('signed-out refresh rejected '+i,after.status===400,{status:after.status});
   const accessAfter=await api('/auth/v1/user','GET',undefined,refresh.data.access_token);
   observations.push({case:'access token after global sign-out '+i,status:accessAfter.status});
  }
 }catch(e){failure=e instanceof Error?e.message:'Fixture failed';}
 const cleanup=await clean(ids);completed=true;running=false;
 return json({marker:MARKER,fixture_ids:ids,results,observations,cleanup,pass:!failure&&cleanup.every(x=>x.deleted),failure});
});
