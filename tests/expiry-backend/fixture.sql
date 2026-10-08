-- Synthetic local schema dependencies; no live data or credentials.
create role authenticated;
create role anon;
create role rls_probe;
create schema auth;
create schema storage;
create table storage.buckets(id text primary key,public boolean);
insert into storage.buckets values('pharmflow-needs-review',false);
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.pharmacies(id uuid primary key);
create table public.test_members(user_id uuid,pharmacy_id uuid,is_admin boolean,primary key(user_id,pharmacy_id));
create function public.is_pharmacy_member(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.test_members where user_id=auth.uid() and pharmacy_id=p)$$;
create function public.is_pharmacy_admin(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.test_members where user_id=auth.uid() and pharmacy_id=p and is_admin)$$;
create function public.pharmflow_identifier_key_v2(p text) returns text language sql immutable as $$select upper(btrim(coalesce(p,'')))$$;
create table public.pharmflow_expiry_workers_v1(id uuid primary key,pharmacy_id uuid,worker_name text,active boolean);
create table public.pharmflow_needs_review_v1 (
 id uuid primary key default gen_random_uuid(),pharmacy_id uuid,workflow text,gtin text,raw_barcode text,order_id text,order_name text,pending_quantity integer,expiry_month integer,expiry_year integer,worker_id uuid,captured_by_name text,device_id text,source text,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),status text default 'PENDING',review_reason text
);
create table public.pharmflow_needs_review_v2 (
 id uuid primary key default gen_random_uuid(),pharmacy_id uuid not null,workflow text not null default 'RECEIVING' check(workflow in ('RECEIVING','EXPIRY')),
 gtin text not null,identifier_display text not null,identifier_key text not null,raw_barcode text,pending_quantity integer not null check(pending_quantity>0),review_reason text,
 source text,device_id text,created_by uuid not null,created_at timestamptz default now(),status text not null default 'PENDING',operation_id text,photo_path text,
 resolved_by uuid,resolved_item_code text,resolved_item_name text
);
alter table public.pharmflow_needs_review_v2 enable row level security;
create policy review_member_read on public.pharmflow_needs_review_v2 for select to authenticated using(public.is_pharmacy_member(pharmacy_id));
create policy review_member_write on public.pharmflow_needs_review_v2 for insert to authenticated with check(public.is_pharmacy_member(pharmacy_id) and created_by=auth.uid());
create policy review_member_update on public.pharmflow_needs_review_v2 for update to authenticated using(public.is_pharmacy_member(pharmacy_id)) with check(public.is_pharmacy_member(pharmacy_id));
grant select on public.pharmflow_needs_review_v2 to authenticated;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner uuid,owner_id text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
create policy media_select on storage.objects for select to authenticated using(bucket_id='pharmflow-needs-review' and public.is_pharmacy_member((split_part(name,'/',1))::uuid));
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='pharmflow-needs-review' and public.is_pharmacy_member((split_part(name,'/',1))::uuid));
create policy media_update on storage.objects for update to authenticated using(bucket_id='pharmflow-needs-review' and public.is_pharmacy_member((split_part(name,'/',1))::uuid)) with check(bucket_id='pharmflow-needs-review' and public.is_pharmacy_member((split_part(name,'/',1))::uuid));
create policy media_delete on storage.objects for delete to authenticated using(bucket_id='pharmflow-needs-review' and public.is_pharmacy_admin((split_part(name,'/',1))::uuid));
grant select,insert,update,delete on storage.objects to authenticated;
-- Test-only sentinels for protected-domain mutations.
create table public.test_receiving_ledger(id int primary key,quantity int);
insert into public.test_receiving_ledger values(1,42);
create table public.test_global_master(identifier_display text primary key,item_code text);
insert into public.test_global_master values('U0030','GLOBAL1');
