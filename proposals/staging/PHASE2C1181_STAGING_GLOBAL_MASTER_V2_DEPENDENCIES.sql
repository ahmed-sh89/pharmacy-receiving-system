-- PHASE2C1181 — Staging-only Global Master V2 dependencies for Expiry client.
-- PREPARED FOR REVIEW ONLY. DO NOT APPLY TO PRODUCTION.
-- Intended Staging project ref: tovkcakucyagvbzvlnks
-- Source baseline: 02fef0f814740b341b86a644c472d0bd753f7b12
--
-- Before any separately approved application, verify the Supabase project
-- details immediately beforehand and bind the apply operation's project_id
-- to exactly tovkcakucyagvbzvlnks. PostgreSQL does not expose the Supabase
-- project ref as a reliable SQL setting, so this identity check must be made
-- by the application tool/caller; do not run this file from an unbound SQL
-- editor or connection.
--
-- This migration installs only dependencies missing from the inspected
-- Staging project for the existing V2 client contract. It deliberately does
-- not replay PHASE2C1152's legacy Global Master backfill or conflict import.
-- No existing application rows are updated or deleted.

begin;

-- Fail closed if the inspected preconditions changed after preparation.
do $$
declare
  v_table regclass;
  v_expected record;
begin
  if to_regclass('public.pharmflow_global_items_v2') is null
     or to_regclass('public.pharmflow_global_item_identifiers_v2') is null then
    raise exception 'Expected Global Master V2 tables are missing; stop and re-audit Staging';
  end if;

  if (select relkind from pg_class where oid = 'public.pharmflow_global_items_v2'::regclass) <> 'r'
     or (select relkind from pg_class where oid = 'public.pharmflow_global_item_identifiers_v2'::regclass) <> 'r' then
    raise exception 'Expected ordinary V2 tables; stop and re-audit relation types';
  end if;

  -- Fail closed on drift in the pre-existing columns, types, nullability or
  -- defaults. The approved foundation migration expects these exact shapes.
  for v_expected in
    select * from (values
      ('pharmflow_global_items_v2','item_code','text',true,null::text),
      ('pharmflow_global_items_v2','item_name','text',true,null::text),
      ('pharmflow_global_items_v2','group_name','text',false,null::text),
      ('pharmflow_global_items_v2','category','text',false,null::text),
      ('pharmflow_global_items_v2','sub_category','text',false,null::text),
      ('pharmflow_global_items_v2','created_at','timestamptz',true,'now()'),
      ('pharmflow_global_items_v2','created_by','uuid',false,null::text),
      ('pharmflow_global_items_v2','updated_at','timestamptz',true,'now()'),
      ('pharmflow_global_items_v2','updated_by','uuid',false,null::text),
      ('pharmflow_global_item_identifiers_v2','id','uuid',true,'gen_random_uuid()'),
      ('pharmflow_global_item_identifiers_v2','item_code','text',true,null::text),
      ('pharmflow_global_item_identifiers_v2','identifier_display','text',true,null::text),
      ('pharmflow_global_item_identifiers_v2','identifier_key','text',true,null::text),
      ('pharmflow_global_item_identifiers_v2','mapping_revision','int8',true,'1'),
      ('pharmflow_global_item_identifiers_v2','created_at','timestamptz',true,'now()'),
      ('pharmflow_global_item_identifiers_v2','created_by','uuid',false,null::text),
      ('pharmflow_global_item_identifiers_v2','updated_at','timestamptz',true,'now()'),
      ('pharmflow_global_item_identifiers_v2','updated_by','uuid',false,null::text)
    ) as expected(table_name,column_name,type_name,not_null,default_expr)
  loop
    v_table := to_regclass('public.' || v_expected.table_name);
    if not exists (
      select 1
        from pg_attribute a
        join pg_type t on t.oid = a.atttypid
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = v_table
         and a.attname = v_expected.column_name
         and not a.attisdropped
         and t.typname = v_expected.type_name
         and a.attnotnull = v_expected.not_null
         and pg_get_expr(d.adbin,d.adrelid) is not distinct from v_expected.default_expr
    ) then
      raise exception 'Unexpected definition for public.%.%', v_expected.table_name, v_expected.column_name;
    end if;
  end loop;

  if (select count(*) from pg_attribute where attrelid = 'public.pharmflow_global_items_v2'::regclass and attnum > 0 and not attisdropped) <> 9
     or (select count(*) from pg_attribute where attrelid = 'public.pharmflow_global_item_identifiers_v2'::regclass and attnum > 0 and not attisdropped) <> 9 then
    raise exception 'Unexpected extra columns in Global Master V2 tables';
  end if;

  if exists (select 1 from public.pharmflow_global_items_v2)
     or exists (select 1 from public.pharmflow_global_item_identifiers_v2) then
    raise exception 'Global Master V2 tables are no longer empty; stop and re-audit before adding constraints';
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid in ('public.pharmflow_global_items_v2'::regclass,
                        'public.pharmflow_global_item_identifiers_v2'::regclass)
  ) then
    raise exception 'Unexpected existing V2 constraints; stop and re-audit before adding approved constraints';
  end if;

  if to_regclass('public.pharmflow_global_item_identifiers_v2_item_code_idx') is not null then
    raise exception 'The foundation index name is already in use; stop and inspect it';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.pharmflow_global_items_v2'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.pharmflow_global_item_identifiers_v2'::regclass)
     or has_table_privilege('anon','public.pharmflow_global_items_v2','SELECT')
     or has_table_privilege('authenticated','public.pharmflow_global_items_v2','SELECT')
     or has_table_privilege('anon','public.pharmflow_global_item_identifiers_v2','SELECT')
     or has_table_privilege('authenticated','public.pharmflow_global_item_identifiers_v2','SELECT') then
    raise exception 'V2 table RLS or browser SELECT privileges differ from the approved foundation; stop and re-audit';
  end if;

  if to_regclass('public.pharmflow_identifier_mapping_audit_v1') is not null then
    raise exception 'The approved V2 audit table already exists; stop and inspect its schema';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_pharmflow_global_item_v2',
                         'pharmflow_is_reference_master_admin_v1',
                         'search_pharmflow_global_items_v2')
  ) then
    raise exception 'One or more target RPCs already exist; stop and compare them with the approved contracts';
  end if;

  if to_regprocedure('public.pharmflow_identifier_key_v2(text)') is null
     or to_regprocedure('public.is_system_owner()') is null then
    raise exception 'Required approved identifier or System Owner helper is missing';
  end if;
end $$;

-- PHASE2C1152 foundation constraints, applied to the already-present empty
-- V2 tables. Names and definitions follow the approved foundation migration.
alter table public.pharmflow_global_items_v2
  add constraint pharmflow_global_items_v2_pkey primary key (item_code),
  add constraint pharmflow_global_items_v2_item_code_check check (btrim(item_code) <> ''),
  add constraint pharmflow_global_items_v2_item_name_check check (btrim(item_name) <> '');

alter table public.pharmflow_global_item_identifiers_v2
  add constraint pharmflow_global_item_identifiers_v2_pkey primary key (id),
  add constraint pharmflow_global_item_identifiers_v2_item_code_fkey
    foreign key (item_code) references public.pharmflow_global_items_v2(item_code) on delete restrict,
  add constraint pharmflow_global_item_identifiers_v2_identifier_display_check
    check (identifier_display = btrim(identifier_display) and identifier_display <> ''),
  add constraint pharmflow_global_item_identifiers_v2_identifier_key_check check (identifier_key <> ''),
  add constraint pharmflow_global_item_identifiers_v2_mapping_revision_check check (mapping_revision > 0),
  add constraint pharmflow_global_item_identifiers_v2_identifier_key_uq unique (identifier_key),
  add constraint pharmflow_global_item_identifiers_v2_item_identifier_uq unique (item_code, identifier_key),
  add constraint pharmflow_global_item_identifiers_v2_key_matches_display_ck
    check (identifier_key = public.pharmflow_identifier_key_v2(identifier_display));

create index pharmflow_global_item_identifiers_v2_item_code_idx
  on public.pharmflow_global_item_identifiers_v2(item_code);

-- Exact audit relation from PHASE2C1152. Writes are made only by the approved
-- authenticated RPCs; direct browser table access remains revoked.
create table public.pharmflow_identifier_mapping_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  action text not null check (action in ('ADD', 'CORRECT', 'REMOVE')),
  identifier_id uuid references public.pharmflow_global_item_identifiers_v2(id) on delete set null,
  identifier_display text not null,
  identifier_key text not null,
  old_item_code text,
  new_item_code text,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid not null references auth.users(id),
  performed_at timestamptz not null default now()
);

alter table public.pharmflow_identifier_mapping_audit_v1 enable row level security;
revoke all on table public.pharmflow_identifier_mapping_audit_v1 from anon, authenticated;

-- PHASE2C1159 authorization policy: System Owner or an active Admin in the
-- active HHP084 reference pharmacy. Authorization comes from server records,
-- never a client-supplied claim.
create or replace function public.pharmflow_is_reference_master_admin_v1()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
       public.is_system_owner()
       or exists (
         select 1
           from public.pharmacy_members pm
           join public.pharmacies p on p.id = pm.pharmacy_id
          where pm.user_id = auth.uid()
            and pm.active is true
            and lower(coalesce(pm.role,'')) = 'admin'
            and p.active is true
            and p.status = 'active'
            and upper(btrim(coalesce(p.code,''))) = 'HHP084'
       )
     )
$$;

-- Approved PHASE2C1159 create contract: one transaction writes item,
-- identifier, and audit; operation_id supports safe retry; identifier-key
-- locking plus database uniqueness prevents duplicate mappings.
create or replace function public.create_pharmflow_global_item_v2(
  p_operation_id uuid,
  p_item_code text,
  p_item_name text,
  p_group_name text default null,
  p_category text default null,
  p_sub_category text default null,
  p_identifier_display text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item_code text := btrim(coalesce(p_item_code,''));
  v_item_name text := btrim(coalesce(p_item_name,''));
  v_identifier_display text := nullif(btrim(coalesce(p_identifier_display,'')),'');
  v_identifier_key text;
  v_reason text := btrim(coalesce(p_reason,''));
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
  if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then
    raise exception 'Global Identifier write permission required';
  end if;
  if p_operation_id is null or v_item_code='' or v_item_name='' or v_identifier_display is null or v_reason='' then
    raise exception 'Operation ID, Item Code, Item Name, identifier and reason are required';
  end if;

  v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
  perform pg_advisory_xact_lock(hashtextextended(v_identifier_key,1153));

  select * into v_audit
    from public.pharmflow_identifier_mapping_audit_v1
   where operation_id=p_operation_id;
  if v_audit.id is not null then
    if v_audit.action='ADD'
       and v_audit.new_item_code=v_item_code
       and v_audit.identifier_key=v_identifier_key
       and exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then
      select * into v_mapping from public.pharmflow_global_item_identifiers_v2
       where identifier_key=v_identifier_key;
      if v_mapping.id is not null and v_mapping.item_code=v_item_code then
        return jsonb_build_object('success',true,'idempotent',true,'itemCode',v_item_code,
          'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
      end if;
    end if;
    raise exception 'Operation ID was already used for a different mapping operation';
  end if;

  if exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then
    raise exception 'Global Item Code already exists';
  end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2
   where identifier_key=v_identifier_key for update;
  if v_mapping.id is not null then
    raise exception 'Identifier is already mapped to another Item Code';
  end if;

  insert into public.pharmflow_global_items_v2(item_code,item_name,group_name,category,sub_category,created_by,updated_by)
  values(v_item_code,v_item_name,nullif(btrim(coalesce(p_group_name,'')),''),nullif(btrim(coalesce(p_category,'')),''),
    nullif(btrim(coalesce(p_sub_category,'')),''),auth.uid(),auth.uid());

  insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
  values(v_item_code,v_identifier_display,v_identifier_key,auth.uid(),auth.uid()) returning * into v_mapping;
  insert into public.pharmflow_identifier_mapping_audit_v1(
    operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by
  ) values (
    p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_item_code,v_reason,auth.uid()
  );
  return jsonb_build_object('success',true,'idempotent',false,'itemCode',v_item_code,
    'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
end
$$;

-- PHASE2C1179 authenticated search contract used by the restored client.
create or replace function public.search_pharmflow_global_items_v2(
  p_query text,
  p_limit integer default 50
)
returns table(item_code text,item_name text,group_name text,category text,sub_category text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    i.item_code,
    i.item_name,
    i.group_name,
    i.category,
    i.sub_category
  from public.pharmflow_global_items_v2 i
  where
    btrim(coalesce(p_query,'')) = ''
    or i.item_code ilike '%' || btrim(p_query) || '%'
    or i.item_name ilike '%' || btrim(p_query) || '%'
  order by
    case
      when upper(i.item_code)=upper(btrim(p_query)) then 0
      when upper(i.item_name)=upper(btrim(p_query)) then 1
      when i.item_code ilike btrim(p_query)||'%' then 2
      when i.item_name ilike btrim(p_query)||'%' then 3
      else 4
    end,
    i.item_name,
    i.item_code
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.pharmflow_is_reference_master_admin_v1() from public, anon;
grant execute on function public.pharmflow_is_reference_master_admin_v1() to authenticated;
revoke all on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.search_pharmflow_global_items_v2(text,integer) from public, anon;
grant execute on function public.search_pharmflow_global_items_v2(text,integer) to authenticated;

commit;
