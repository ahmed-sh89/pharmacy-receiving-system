const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

test('filtered resolve RPC is pharmacy-scoped, scope-checked, idempotent and authenticated-only',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema pharmflow_expiry_private; create schema auth;
      create table pharmflow_expiry_private.inventory_requests_v1(
        request_id uuid primary key, pharmacy_id uuid not null, created_by uuid not null,
        payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
      );
      create function auth.uid() returns uuid language sql stable
        as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
      create function pharmflow_expiry_private.valid_auth_session() returns void
        language plpgsql as $$ begin return; end $$;
      create function public.is_pharmacy_member(uuid) returns boolean language sql stable
        as $$ select $1='22222222-2222-2222-2222-222222222222'::uuid $$;
      create table test_scope(scope jsonb not null);
      create function public.select_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean,uuid[])
        returns jsonb language sql stable as $$ select scope from test_scope limit 1 $$;
      create table test_race(enabled boolean not null);
      insert into test_race values(false);
      create function public.mutate_pharmflow_expiry_inventory_v1(uuid,uuid,text,jsonb,integer)
        returns jsonb language plpgsql as $$
        declare result jsonb;
        begin
          result:=jsonb_build_object('request_id',$2,'count',jsonb_array_length($4),'action',$3);
          insert into pharmflow_expiry_private.inventory_requests_v1
          values($2,$1,auth.uid(),jsonb_build_object('action',$3,'selection',$4,'quantity',$5),result,clock_timestamp());
          if (select enabled from test_race) then
            update test_scope set scope=jsonb_build_object(
              'count',1,'units',2,'selection',jsonb_build_array(
                jsonb_build_object('id','dddddddd-dddd-dddd-dddd-dddddddddddd','version','new-row')
              )
            );
          else
            update test_scope set scope='{"count":0,"units":0,"selection":[]}'::jsonb;
          end if;
          return result;
        end $$;
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20261018030000_expiry_resolve_all_filtered_v1.sql','utf8'));
    const pharmacy='22222222-2222-2222-2222-222222222222';
    const selection=[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',version:'ver-1'}];
    const filters={groups:['Medicine']};
    await db.query('insert into test_scope values ($1::jsonb)',[JSON.stringify({count:1,units:4,selection})]);
    const call=(request,pharmacyId=pharmacy,criteria=filters)=>db.query(
      'select public.resolve_all_filtered_pharmflow_expiry_inventory_v1($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,$5::integer,$6::bigint) as result',
      [pharmacyId,request,JSON.stringify(criteria),JSON.stringify(selection),1,4]
    );
    const request='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const first=await call(request);
    assert.deepEqual(first.rows[0].result,{request_id:request,count:1,action:'RESOLVE'});
    const retry=await call(request);
    assert.deepEqual(retry.rows[0].result,first.rows[0].result);
    await assert.rejects(call(request,pharmacy,{groups:['Beauty']}),/Request scope conflict/);
    await assert.rejects(call('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333'),/Pharmacy access required/);
    await db.query('update test_scope set scope=$1::jsonb',[
      JSON.stringify({count:1,units:4,selection:[{id:'dddddddd-dddd-dddd-dddd-dddddddddddd',version:'ver-2'}]})
    ]);
    await assert.rejects(call('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),/Filtered inventory changed/);
    await db.query('update test_scope set scope=$1::jsonb',[JSON.stringify({count:1,units:4,selection})]);
    await db.query('update test_race set enabled=true');
    await assert.rejects(
      call('ffffffff-ffff-ffff-ffff-ffffffffffff'),
      /Filtered inventory changed during resolution/
    );
    await db.query('update test_race set enabled=false');
    const grants=await db.query(`select
      has_function_privilege('authenticated','public.resolve_all_filtered_pharmflow_expiry_inventory_v1(uuid,uuid,jsonb,jsonb,integer,bigint)','execute') as authenticated_exec,
      has_function_privilege('anon','public.resolve_all_filtered_pharmflow_expiry_inventory_v1(uuid,uuid,jsonb,jsonb,integer,bigint)','execute') as anon_exec,
      (select relrowsecurity from pg_class where oid='pharmflow_expiry_private.filtered_inventory_requests_v1'::regclass) as audit_rls,
      (select count(*) from pharmflow_expiry_private.filtered_inventory_requests_v1) as audit_rows`);
    assert.equal(grants.rows[0].authenticated_exec,true);
    assert.equal(grants.rows[0].anon_exec,false);
    assert.equal(grants.rows[0].audit_rls,true);
    assert.equal(Number(grants.rows[0].audit_rows),1);
    const rollback=await db.query(`select
      (select count(*) from pharmflow_expiry_private.inventory_requests_v1) as requests,
      (select scope from test_scope) as scope`);
    assert.equal(Number(rollback.rows[0].requests),1,'race rejection rolls back the existing mutation request');
    assert.deepEqual(rollback.rows[0].scope,{count:1,units:4,selection});
  }finally{await db.close();}
});
