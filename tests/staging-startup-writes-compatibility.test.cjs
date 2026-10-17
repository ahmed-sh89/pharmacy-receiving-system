const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const saveWorkspaceMigration = fs.readFileSync(path.join(__dirname, '../proposals/staging/PHASE2C1185_CLOUD_WORKSPACE_SAVE_RPC_COMPAT.sql'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../proposals/staging/PHASE2C1186_STARTUP_WRITE_RPC_COMPATIBILITY.sql'), 'utf8');

test('Staging startup write RPCs retain tenant checks, idempotency and narrow grants', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create table public.pharmacies(id uuid primary key);
      create table public.pharmflow_active_order_manifest_v1(
        pharmacy_id uuid primary key references public.pharmacies(id), manifest jsonb not null default '{}'::jsonb,
        revision bigint not null default 1, updated_at timestamptz not null default now(),
        updated_by uuid, workspace_generation bigint not null default 0
      );
      create table public.pharmflow_workspace_generation_v1(
        pharmacy_id uuid primary key references public.pharmacies(id), generation bigint not null default 0,
        reset_at timestamptz, reset_by uuid, updated_at timestamptz not null default now()
      );
      create table public.pharmflow_cloud_workspaces(
        pharmacy_id uuid primary key references public.pharmacies(id), workspace jsonb not null default '{}',
        updated_at timestamptz not null default now(), updated_by uuid, device_id text
      );
      create table public.pharmflow_receiving_transactions_v1(
        pharmacy_id uuid not null references public.pharmacies(id), transaction_id text not null,
        order_number text, item_code text not null, item_name text, gtin text, quantity integer not null default 0,
        source text, device_id text, occurred_at timestamptz not null default now(), payload jsonb not null default '{}',
        created_by uuid, created_at timestamptz not null default now(), primary key(pharmacy_id,transaction_id)
      );
      alter table public.pharmflow_active_order_manifest_v1 enable row level security;
      alter table public.pharmflow_workspace_generation_v1 enable row level security;
      alter table public.pharmflow_cloud_workspaces enable row level security;
      alter table public.pharmflow_receiving_transactions_v1 enable row level security;
      revoke all on public.pharmflow_active_order_manifest_v1,public.pharmflow_workspace_generation_v1,
        public.pharmflow_cloud_workspaces,public.pharmflow_receiving_transactions_v1 from public,anon,authenticated;
      create function public.is_pharmacy_member(p_pharmacy_id uuid) returns boolean language sql stable as $$
        select auth.uid() is not null and p_pharmacy_id::text=current_setting('test.pharmacy_id',true)
      $$;
      create function public.pharmflow_manifest_member_v2(p_pharmacy_id uuid) returns boolean language sql stable as $$
        select public.is_pharmacy_member(p_pharmacy_id)
      $$;
      create function public.pharmflow_receiving_member_v2(p_pharmacy_id uuid) returns boolean language sql stable as $$
        select public.is_pharmacy_member(p_pharmacy_id)
      $$;
      create function public.pharmflow_can_access_pharmacy(p_pharmacy_id uuid) returns boolean language sql stable as $$
        select public.is_pharmacy_member(p_pharmacy_id)
      $$;
      insert into public.pharmacies values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
    `);
    await db.exec(saveWorkspaceMigration);
    await db.exec(migration);

    const grants = await db.query(`select
      has_function_privilege('authenticated','public.save_pharmflow_active_order_manifest_v3(uuid,jsonb,bigint)','execute') as auth_manifest,
      has_function_privilege('anon','public.save_pharmflow_active_order_manifest_v3(uuid,jsonb,bigint)','execute') as anon_manifest,
      has_function_privilege('authenticated','public.append_pharmflow_cloud_transaction_v2(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb)','execute') as auth_ledger,
      has_function_privilege('anon','public.append_pharmflow_cloud_transaction_v2(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb)','execute') as anon_ledger,
      has_table_privilege('authenticated','public.pharmflow_receiving_transactions_v1','insert') as direct_insert`);
    assert.deepEqual(grants.rows[0], {auth_manifest:true,anon_manifest:false,auth_ledger:true,anon_ledger:false,direct_insert:false});

    await db.exec(`set role authenticated;
      select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
      select set_config('test.pharmacy_id','00000000-0000-0000-0000-000000000001',false);`);
    const saved = await db.query(`select * from public.save_pharmflow_active_order_manifest_v3(
      '00000000-0000-0000-0000-000000000001',
      '{"orderFiles":[{"documentId":"SYN-1"}],"orderData":[{"itemCode":"X"}]}'::jsonb,0)`);
    assert.equal(saved.rows[0].revision,1);
    assert.equal(saved.rows[0].order_files,1);
    assert.equal(saved.rows[0].order_items,1);
    await assert.rejects(()=>db.query(`select * from public.save_pharmflow_active_order_manifest_v3(
      '00000000-0000-0000-0000-000000000002',
      '{"orderFiles":[{}],"orderData":[{}]}'::jsonb,0)`),/Pharmacy access required/);
    await db.query(`select public.append_pharmflow_cloud_transaction_v2(
      '00000000-0000-0000-0000-000000000001','test-tx','SYN-1','X','Item','',1,'RECEIVING','fixture',now(),'{}'::jsonb)`);
    await db.query(`select public.append_pharmflow_cloud_transaction_v2(
      '00000000-0000-0000-0000-000000000001','test-tx','SYN-1','X','Item','',1,'RECEIVING','fixture',now(),'{}'::jsonb)`);
    await db.exec('reset role');
    const counts=await db.query(`select
      (select count(*)::int from public.pharmflow_receiving_transactions_v1) as receiving_rows,
      (select count(*)::int from public.pharmflow_active_order_manifest_v1) as manifest_rows,
      (select count(*)::int from public.pharmflow_cloud_workspaces) as workspace_rows`);
    assert.deepEqual(counts.rows[0],{receiving_rows:1,manifest_rows:1,workspace_rows:0});
  } finally {
    await db.close();
  }
});
