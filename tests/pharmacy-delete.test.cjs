const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const {PGlite}=require('@electric-sql/pglite');

test('empty pharmacy deletion preserves shared accounts and blocks operational and anonymous attempts',async t=>{
 const db=new PGlite();
 t.after(()=>db.close());
 await db.exec(`
 create role anon; create role authenticated;
 create schema pharmflow_auth_private; create schema storage; create schema auth;
 create table auth.users(id uuid primary key);
 create table public.pharmacies(id uuid primary key,code text,status text);
 create table public.pharmacy_members(pharmacy_id uuid references pharmacies,id uuid references auth.users);
 create table public.pharmacy_admin_assignments(pharmacy_id uuid references pharmacies on delete cascade);
 create table public.pharmacy_invitations(pharmacy_id uuid references pharmacies on delete cascade);
 create table public.pharmflow_pharmacy_permissions_v1(pharmacy_id uuid references pharmacies);
 create table public.pharmflow_permission_audit_v1(pharmacy_id uuid references pharmacies);
 create table pharmflow_auth_private.account_provision_v1(pharmacy_id uuid references pharmacies,completed_at timestamptz);
 create table public.pharmflow_workspace_generation_v1(pharmacy_id uuid references pharmacies on delete cascade,generation int,reset_at timestamptz,reset_by uuid);
 create table storage.objects(name text);
 create table public.pharmflow_orders(pharmacy_id uuid references pharmacies on delete cascade);
 create table public.receiving_history(pharmacy_id uuid);
 create function public.is_system_owner() returns boolean language sql as
 $$select current_setting('test.owner',true) is not distinct from 'yes'$$;
 create function public.owner_delete_unactivated_pharmacy_v1(uuid,text) returns void language plpgsql as $$begin end$$;
 grant execute on function public.owner_delete_unactivated_pharmacy_v1(uuid,text) to authenticated;
 `);
 const old=fs.readFileSync('supabase/migrations/20261114121500_delete_unactivated_pharmacy.sql','utf8');
 await db.exec(old.slice(0,old.indexOf('CREATE FUNCTION pharmflow_auth_private.assert_pharmacy_deletable_v1')));
 await db.exec(fs.readFileSync('supabase/migrations/20261115010000_delete_empty_pharmacy.sql','utf8'));

 const empty='10000000-0000-0000-0000-000000000001';
 const other='10000000-0000-0000-0000-000000000002';
 const owner='20000000-0000-0000-0000-000000000001';
 await db.query("insert into pharmacies values ($1,'EMPTY','active'),($2,'OTHER','suspended')",[empty,other]);
 await db.query("insert into auth.users values ($1)",[owner]);
 await db.query("insert into pharmacy_members values ($1,$3),($2,$3)",[empty,other,owner]);
 await db.query("insert into pharmflow_workspace_generation_v1 values ($1,0,null,null)",[empty]);
 await db.exec(`
 create schema pharmflow_expiry_private;
 create table public.pharmflow_expiry_workers_v1(
  id uuid primary key,pharmacy_id uuid references pharmacies on delete cascade,
  worker_name text,active boolean,created_by uuid,system_key text,created_at timestamptz,updated_at timestamptz
 );
 create table pharmflow_expiry_private.operator_audit_v1(
  pharmacy_id uuid,worker_id uuid,actor uuid,action text,previous_name text,name text,occurred_at timestamptz
 );
 `);
 const defaults=fs.readFileSync('supabase/migrations/20261115021500_allow_expiry_defaults_on_empty_pharmacy_delete.sql','utf8');
 await db.exec(defaults);
 await db.exec(`create trigger expiry_system_operator_guard_v1 before insert or update or delete
  on public.pharmflow_expiry_workers_v1 for each row execute function pharmflow_expiry_private.protect_system_operator_v1()`);
 const worker='30000000-0000-0000-0000-000000000001';
 await db.query("insert into pharmflow_expiry_workers_v1 values ($1,$2,'Desktop',true,$3,'DESKTOP',now(),now())",[worker,empty,owner]);
 await db.query(`insert into pharmflow_expiry_private.operator_audit_v1
  select pharmacy_id,id,created_by,'ADD',null,worker_name,created_at from pharmflow_expiry_workers_v1`);
 await assert.rejects(db.query("delete from pharmflow_expiry_workers_v1 where id=$1",[worker]),/Built-in Operators cannot be removed/);
 const remove=(id,code)=>db.query("select owner_delete_empty_pharmacy_v1($1,$2)",[id,code]);
 await assert.rejects(remove(empty,'EMPTY'),/System Administrator required/);
 await db.exec("set test.owner='yes'");
 await db.query("insert into receiving_history values ($1)",[empty]);
 await assert.rejects(remove(empty,'EMPTY'),/operational data or history/);
 await db.query("delete from receiving_history where pharmacy_id=$1",[empty]);
 await db.query("insert into pharmflow_orders values ($1)",[other]);
 await assert.rejects(remove(other,'OTHER'),/operational data or history/);
 await db.query("insert into storage.objects values ($1)",[empty+'/evidence.png']);
 await assert.rejects(remove(empty,'EMPTY'),/stored files/);
 await db.query("delete from storage.objects where name=$1",[empty+'/evidence.png']);
 await assert.rejects(remove(empty,'WRONG'),/pharmacy code changed/);
 await db.query(`insert into pharmflow_expiry_private.operator_audit_v1
  select pharmacy_id,id,created_by,'RENAME','Old name',worker_name,now() from pharmflow_expiry_workers_v1`);
 await assert.rejects(remove(empty,'EMPTY'),/configured Expiry operators or operator history/);
 await db.exec("delete from pharmflow_expiry_private.operator_audit_v1 where action='RENAME'");
 await db.query("update pharmflow_expiry_workers_v1 set updated_at=created_at+interval '1 second' where id=$1",[worker]);
 await assert.rejects(remove(empty,'EMPTY'),/configured Expiry operators or operator history/);
 await db.query("update pharmflow_expiry_workers_v1 set updated_at=created_at where id=$1",[worker]);
 await remove(empty,'EMPTY');
 assert.deepEqual((await db.query("select id from pharmflow_expiry_workers_v1")).rows,[]);
 assert.deepEqual((await db.query("select worker_id from pharmflow_expiry_private.operator_audit_v1")).rows,[]);
 await remove(empty,'EMPTY');
 assert.deepEqual((await db.query("select * from pharmacy_members")).rows,[{pharmacy_id:other,id:owner}]);
 assert.deepEqual((await db.query("select id from auth.users")).rows,[{id:owner}]);
});

test('confirmation runs the deletion only on submit and keeps the dialog open on rejection',async()=>{
 const {document,Event}=parseHTML('<body></body>');
 const source=fs.readFileSync('js/settings-workspace.js','utf8');
 let closed=false;
 const context={document,window:{},createSettingsModal({content}) {
  document.body.append(content);
  return {close(){closed=true;content.remove();}};
 }};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function settingsDialog('),source.indexOf('window.settingsTextPrompt=')),context);
 let calls=0;
 const confirmed=context.window.settingsConfirm({
  title:'Delete Pharmacy',message:'Delete Example (EMPTY)?',confirmText:'Delete',
  async onConfirm(){if(++calls===1)throw Error('This pharmacy has operational data.');}
 });
 let form=document.body.querySelector('form');
 assert.match(form.textContent,/Delete Example \(EMPTY\)/);
 assert.equal(calls,0);
 form.dispatchEvent(new Event('submit'));
 await new Promise(setImmediate);
 assert.equal(closed,false);
 assert.equal(form.querySelector('[role=alert]').textContent,'This pharmacy has operational data.');
 form.dispatchEvent(new Event('submit'));
 assert.equal(await confirmed,true);
 assert.equal(closed,true);
});
