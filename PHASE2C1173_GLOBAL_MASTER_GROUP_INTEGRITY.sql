-- PHASE2C1173 — atomic Global Master Group integrity correction.
-- Prepared from Production main SHA 26da5078163f69ca76a9169dd8d97365d7ba6c54.
-- REVIEW ONLY: never apply to Production without separate explicit SQL approval.
-- This single transaction enforces future creation rules, preserves legacy linking,
-- normalizes only valid main Groups, and applies 61 Product Owner classifications.

begin;

create or replace function public.pharmflow_normalize_main_group_v1(p_group_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(btrim(coalesce(p_group_name, '')))
    when 'beauty' then 'Beauty'
    when 'fmcg' then 'FMCG'
    when 'homehealth' then 'HomeHealth'
    when 'home health' then 'HomeHealth'
    when 'medicine' then 'Medicine'
    when 'mom & baby' then 'Mom & Baby'
    when 'supplement' then 'Supplement'
    else null
  end
$$;
revoke all on function public.pharmflow_normalize_main_group_v1(text) from public, anon;
grant execute on function public.pharmflow_normalize_main_group_v1(text) to authenticated;

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
  v_item_code text := btrim(coalesce(p_item_code, ''));
  v_item_name text := btrim(coalesce(p_item_name, ''));
  v_identifier_display text := nullif(btrim(coalesce(p_identifier_display, '')), '');
  v_identifier_key text;
  v_group_name text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
  if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then
    raise exception 'Global Identifier write permission required';
  end if;
  if p_operation_id is null or v_item_code = '' or v_item_name = ''
     or v_identifier_display is null or v_reason = '' then
    raise exception 'Operation ID, Item Code, Item Name, identifier and reason are required';
  end if;

  v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
  perform pg_advisory_xact_lock(hashtextextended(v_identifier_key, 1153));

  -- A retry of a completed operation is not a new item creation. Keep its
  -- idempotent response even when the caller is an older client.
  select * into v_audit
    from public.pharmflow_identifier_mapping_audit_v1
   where operation_id = p_operation_id;
  if v_audit.id is not null then
    if v_audit.action = 'ADD'
       and v_audit.new_item_code = v_item_code
       and v_audit.identifier_key = v_identifier_key
       and exists (select 1 from public.pharmflow_global_items_v2 where item_code = v_item_code) then
      select * into v_mapping from public.pharmflow_global_item_identifiers_v2
       where identifier_key = v_identifier_key;
      if v_mapping.id is not null and v_mapping.item_code = v_item_code then
        return jsonb_build_object('success',true,'idempotent',true,'itemCode',v_item_code,
          'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
      end if;
    end if;
    raise exception 'Operation ID was already used for a different mapping operation';
  end if;

  if exists (select 1 from public.pharmflow_global_items_v2 where item_code = v_item_code) then
    raise exception 'Global Item Code already exists';
  end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2
   where identifier_key = v_identifier_key for update;
  if v_mapping.id is not null then
    raise exception 'Identifier is already mapped to another Item Code';
  end if;

  v_group_name := public.pharmflow_normalize_main_group_v1(p_group_name);
  if v_group_name is null then
    raise exception 'A valid approved Group is required to create a Global Item';
  end if;

  insert into public.pharmflow_global_items_v2(item_code,item_name,group_name,category,sub_category,created_by,updated_by)
  values(v_item_code,v_item_name,v_group_name,nullif(btrim(coalesce(p_category,'')),''),nullif(btrim(coalesce(p_sub_category,'')),''),auth.uid(),auth.uid());

  insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
  values(v_item_code,v_identifier_display,v_identifier_key,auth.uid(),auth.uid()) returning * into v_mapping;
  insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
  values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_item_code,v_reason,auth.uid());
  return jsonb_build_object('success',true,'idempotent',false,'itemCode',v_item_code,
    'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
end $$;

-- New version: only a missing item at the reference pharmacy consumes Group.
-- Existing Global links and pharmacy-scoped mappings remain prompt-free.
create or replace function public.learn_pharmflow_identifier_v2(
  p_global_operation_id uuid,
  p_pharmacy_operation_id uuid,
  p_pharmacy_id uuid,
  p_identifier_display text,
  p_item_code text,
  p_item_name text,
  p_group_name text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_reference boolean := false;
  v_global jsonb := null;
  v_pharmacy jsonb;
  v_item_exists boolean := false;
  v_created jsonb := null;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access is required';
  end if;
  select exists(select 1 from public.pharmacies p
    where p.id=p_pharmacy_id and p.code='HHP084' and p.active is true and p.status='active')
    into v_is_reference;

  if v_is_reference then
    if p_global_operation_id is null then raise exception 'Global operation ID required'; end if;
    select exists(select 1 from public.pharmflow_global_items_v2 gi
      where gi.item_code=btrim(coalesce(p_item_code,''))) into v_item_exists;
    if v_item_exists then
      -- No Group is needed to add an identifier to an existing Global Item.
      v_global := public.add_pharmflow_global_identifier_v2(
        p_global_operation_id,p_identifier_display,p_item_code,p_reason);
    else
      -- This is the only learn path that creates a new Global Item.
      v_created := public.create_pharmflow_global_item_and_learn_v1(
        p_global_operation_id,p_pharmacy_operation_id,p_pharmacy_id,p_item_code,p_item_name,
        p_group_name,null,null,p_identifier_display,p_reason);
      return jsonb_build_object('success',true,'scope','GLOBAL_AND_PHARMACY',
        'globalMapping',v_created->'globalItem','pharmacyMapping',v_created->'pharmacyMapping',
        'globalItemCreated',true);
    end if;
  end if;

  if p_pharmacy_operation_id is null then raise exception 'Pharmacy operation ID required'; end if;
  v_pharmacy := public.add_pharmflow_pharmacy_identifier_v2(
    p_pharmacy_operation_id,p_pharmacy_id,p_identifier_display,p_item_code,p_item_name,p_reason);
  return jsonb_build_object('success',true,
    'scope',case when v_is_reference then 'GLOBAL_AND_PHARMACY' else 'PHARMACY' end,
    'globalMapping',v_global,'pharmacyMapping',v_pharmacy,'globalItemCreated',false);
end $$;

-- Keep the legacy signature callable for existing clients. The delegated
-- path allows existing-item linking but fails closed for a missing Global item.
create or replace function public.learn_pharmflow_identifier_v1(
  p_global_operation_id uuid,
  p_pharmacy_operation_id uuid,
  p_pharmacy_id uuid,
  p_identifier_display text,
  p_item_code text,
  p_item_name text,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.learn_pharmflow_identifier_v2(
    p_global_operation_id,p_pharmacy_operation_id,p_pharmacy_id,
    p_identifier_display,p_item_code,p_item_name,null,p_reason)
$$;

revoke all on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.learn_pharmflow_identifier_v2(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.learn_pharmflow_identifier_v1(uuid,uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.learn_pharmflow_identifier_v2(uuid,uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.learn_pharmflow_identifier_v1(uuid,uuid,uuid,text,text,text,text) to authenticated;

create table if not exists public.pharmflow_global_group_change_audit_v1 (
  item_code text primary key,
  item_name text not null,
  previous_group_name text,
  previous_category text,
  previous_sub_category text,
  new_group_name text not null check (new_group_name in ('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement')),
  classification_source text not null check (classification_source in ('LEGACY_MAIN_GROUP_CATEGORY','PRODUCT_OWNER_WORKBOOK','NORMALIZED_EXISTING_GROUP')),
  source_reference text not null,
  changed_at timestamptz not null default clock_timestamp(),
  changed_by text not null default current_user
);
alter table public.pharmflow_global_group_change_audit_v1 enable row level security;
revoke all on public.pharmflow_global_group_change_audit_v1 from public, anon, authenticated;

create temporary table _pharmflow_group_approved (
  item_code text primary key,
  item_name text not null,
  group_name text not null check (group_name in ('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'))
) on commit drop;
insert into _pharmflow_group_approved(item_code,item_name,group_name) values
  ('1038234','Ohanic Color Protect Shampoo 250ml','Beauty'),
  ('1038236','Ohanic No-Yellow Shampoo 250ml','Beauty'),
  ('1056842','Avalon Aqueous Cream 100 Ml','Medicine'),
  ('1056843','Avoban 2% Nasal Ointment 3 Gm','Medicine'),
  ('1056846','Butafyl 1% Cream 15 Gm','Medicine'),
  ('1056847','Candan 8 Mg 28 Cap','Medicine'),
  ('1056848','Cidocomb Cream 30 Gm','Medicine'),
  ('1056849','Loradin 5 Mg 28 Tab','Medicine'),
  ('1056850','Sitavia-Met 50/1000 Mg 56 Tab','Medicine'),
  ('1056852','Zencin 250 Mg 6 Tab','Medicine'),
  ('1056853','Zencin 500 Mg 3 Tab','Medicine'),
  ('1056856','Ultra Fusion UD Eye Drops 0.4 ml','Medicine'),
  ('1056874','Docrosa 10 Mg 28 Tab','Medicine'),
  ('1056875','Docrosa 20 Mg 28 Tab','Medicine'),
  ('1056877','Doctors Naturals Hair Skin & Nail  30 Tab','Supplement'),
  ('1056879','Magmax 32 Cap','Supplement'),
  ('1056882','Onstera 10 Mg 30 Tab','Medicine'),
  ('1056883','Oxintel 0.4 Mg 30 Tab','Medicine'),
  ('1056887','Hemrimat Gel 25 G','Medicine'),
  ('1056888','Vigo 30 Cap','Supplement'),
  ('1056889','Focus Med Sterile Medical Vaseline Gauze 10X10CM 5 PCS','HomeHealth'),
  ('1056890','Focus Med Sterile Medical Vaseline Gauze 20X10CM 5 PCS','HomeHealth'),
  ('1056891','Afomill Refreshing Soothing Eye Drops 10 Ml','Medicine'),
  ('1056892','Afomill-Anti Redness Eye Drops 10 Ml','Medicine'),
  ('1056893','Arax Marine 30 Cap','Supplement'),
  ('1056894','Budenoor 120 Doses','Medicine'),
  ('1056895','Iridil Eye Drop 10 Ud','Medicine'),
  ('1056896','Iridina Eye Drops 10 Ml','Medicine'),
  ('1056897','Vomi Calm 30 Tab','Medicine'),
  ('1057408','Decozal 0.1% Nasal Spray 15 Ml','Medicine'),
  ('1057409','DR.TIGER PAIN RELIEF PATCH,  STRONG,  50PC/BOX','HomeHealth'),
  ('1057410','DR.TIGER PAIN RELIEF PATCH,  LIGHT, 50PC/BOX','HomeHealth'),
  ('1057411','DR.TIGER PAIN RELIEF PATCH , FAR INFRARED, 25PC/BOX','HomeHealth'),
  ('1057412','DR.TIGER PAIN RELIEF PATCH, GEL COLD & HOT, 2PC/BOX','HomeHealth'),
  ('1057413','D&S COOLING GEL PATCH, DISCOLOUR,  4PC/BOX','HomeHealth'),
  ('1057414','D&S COOLING GEL  PATCH   4PC/BOX','HomeHealth'),
  ('1057415','Ez Clean Zesty Gel 50 Ml With Green Rubber','HomeHealth'),
  ('1057416','Old Spice Whitewater Deodorant Stick 50ml','Beauty'),
  ('1057417','Old Spice Original Deodorant Stick 50ml','Beauty'),
  ('1057418','Old Spice Captain Deodorant Stick 50ml','Beauty'),
  ('1057419','Old Spice Captain Deodorant Spray 150ml','Beauty'),
  ('1057420','Old Spice Whitewater Deodorant Spray 150ml','Beauty'),
  ('1057421','Old Spice Original Deodorant Spray 150ml','Beauty'),
  ('1057422','Head & Shoulders Pure Clean Shampoo 400ml','Beauty'),
  ('1057423','Head & Shoulders Soothing Hydration Shampoo 400ml','Beauty'),
  ('1057424','Jakemans Blackcurrant Lozenges 73g','FMCG'),
  ('1057425','Jakemans Blueberry Lozenges 73g','FMCG'),
  ('1057426','Jakemans Cherry Lozenges 73g','FMCG'),
  ('1057427','Jakemans Honey and Lemon Lozenges 73g','FMCG'),
  ('1057428','Jakemans Menthol and Eucalyptus Lozenges 73g','FMCG'),
  ('1057429','Jakemans Peppermint Lozenges 73g','FMCG'),
  ('1057430','Jakemans Throat and Chest Lozenges 73g','FMCG'),
  ('1057431','Bamo Mints (Mint) Mouth Refreshment 32 Capsules','FMCG'),
  ('1057432','Bamo Mints (Strawberry) Mouth Refreshment 32 Capsules','FMCG'),
  ('1057433','Bamo Mints (Mango) Mouth Refreshment 32 Capsules','FMCG'),
  ('1057434','Bamo Mints (Watermelon) Mouth Refreshment  32 Capsules','FMCG'),
  ('1057435','Bamo Mints (Lemon) Mouth Refreshment 32 Capsules','FMCG'),
  ('1057436','Water Wipes On the Go Pack 10 Wipes','FMCG'),
  ('1057437','Water Wipes On the Go Pack 28 Wipes','FMCG'),
  ('1057438','Biogenic Butterfly Collagen Gel 60 Ml 8746','Beauty'),
  ('1057439','Biogenic Pretty White Sensitive Areas Cream 60 Ml 8715','Beauty');

-- Capture an explicit pre-state and stop if Product, classification, or table
-- contents changed incompatibly since the audit/review.
create temporary table _pharmflow_group_baseline on commit drop as
select count(*)::bigint as total_items,
       count(*) filter (where public.pharmflow_normalize_main_group_v1(group_name) is not null)::bigint as valid_group_items,
       count(*) filter (where nullif(btrim(group_name),'') is not null
         and public.pharmflow_normalize_main_group_v1(group_name) is not null
         and group_name is distinct from public.pharmflow_normalize_main_group_v1(group_name))::bigint as noncanonical_group_name_items,
       count(*) filter (where nullif(btrim(group_name),'') is null)::bigint as blank_group_items,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and public.pharmflow_normalize_main_group_v1(category) is not null)::bigint as legacy_category_items,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and public.pharmflow_normalize_main_group_v1(category) is not null
         and category is not distinct from public.pharmflow_normalize_main_group_v1(category))::bigint as canonical_legacy_category_items,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and public.pharmflow_normalize_main_group_v1(category) is not null
         and category is distinct from public.pharmflow_normalize_main_group_v1(category))::bigint as normalized_legacy_category_items,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and public.pharmflow_normalize_main_group_v1(category) is null)::bigint as unresolved_items,
       count(*) filter (where nullif(btrim(group_name),'') is not null
         and public.pharmflow_normalize_main_group_v1(group_name) is null)::bigint as invalid_nonblank_group_items
  from public.pharmflow_global_items_v2;

do $$
begin
  if (select total_items=56575
         and valid_group_items=3720
         and noncanonical_group_name_items=0
         and blank_group_items=52855
         and legacy_category_items=52792
         and canonical_legacy_category_items=52766
         and normalized_legacy_category_items=26
         and unresolved_items=63
         and invalid_nonblank_group_items=0
      from _pharmflow_group_baseline) is not true then
    raise exception 'Production Group baseline changed; stop and re-review before applying this migration';
  end if;
  if exists (select 1 from public.pharmflow_global_items_v2
    where nullif(btrim(group_name),'') is not null
      and public.pharmflow_normalize_main_group_v1(group_name) is null) then
    raise exception 'Invalid nonblank Global Master Group found; stop for review';
  end if;
  if (select count(*) from _pharmflow_group_approved) <> 61 then
    raise exception 'Approved workbook input count must remain exactly 61';
  end if;
  if (select count(*) from _pharmflow_group_approved a
      join public.pharmflow_global_items_v2 i using (item_code)) <> 61 then
    raise exception 'Approved workbook Item Code set no longer matches Production';
  end if;
  if exists (select 1 from _pharmflow_group_approved a
      join public.pharmflow_global_items_v2 i using (item_code)
     where i.item_name is distinct from a.item_name
        or (nullif(btrim(i.group_name),'') is not null
            and public.pharmflow_normalize_main_group_v1(i.group_name) is distinct from a.group_name)
        or (nullif(btrim(i.group_name),'') is null
            and public.pharmflow_normalize_main_group_v1(i.category) is not null
            and public.pharmflow_normalize_main_group_v1(i.category) is distinct from a.group_name)) then
    raise exception 'Approved workbook row conflicts with current Production item or existing classification';
  end if;
  if exists (select 1 from _pharmflow_group_approved a
      join public.pharmflow_global_group_change_audit_v1 h using (item_code)
     where h.new_group_name is distinct from a.group_name or h.item_name is distinct from a.item_name) then
    raise exception 'Existing Group audit row conflicts with this approved workbook';
  end if;
end $$;

-- Lock only rows that this migration intends to update. The update is atomic;
-- a raised exception before COMMIT rolls back the audit and data changes.
do $$
declare r record;
begin
  for r in
    select i.item_code
      from public.pharmflow_global_items_v2 i
     where (nullif(btrim(i.group_name),'') is not null
            and public.pharmflow_normalize_main_group_v1(i.group_name) is distinct from i.group_name)
        or (nullif(btrim(i.group_name),'') is null
            and public.pharmflow_normalize_main_group_v1(i.category) is not null)
        or exists (select 1 from _pharmflow_group_approved a where a.item_code=i.item_code)
     order by i.item_code
     for update
  loop
    null;
  end loop;
end $$;

-- Stable before-images make the change auditable and provide a conditional
-- recovery path. Category and sub_category are retained verbatim.
insert into public.pharmflow_global_group_change_audit_v1(
  item_code,item_name,previous_group_name,previous_category,previous_sub_category,
  new_group_name,classification_source,source_reference)
select i.item_code,i.item_name,i.group_name,i.category,i.sub_category,
       coalesce(public.pharmflow_normalize_main_group_v1(i.group_name),
                public.pharmflow_normalize_main_group_v1(i.category),a.group_name),
       case when a.item_code is not null then 'PRODUCT_OWNER_WORKBOOK'
            when nullif(btrim(i.group_name),'') is not null then 'NORMALIZED_EXISTING_GROUP'
            else 'LEGACY_MAIN_GROUP_CATEGORY' end,
       case when a.item_code is not null
            then 'PHARMFLOW_GLOBAL_MASTER_UNRESOLVED_GROUP_REVIEW_20261017(3).xlsx'
            when nullif(btrim(i.group_name),'') is not null
            then 'Equivalent approved existing Group normalized; migration PHASE2C1173'
            else 'Validated main Group in legacy category after approved case/trim normalization; migration PHASE2C1173' end
  from public.pharmflow_global_items_v2 i
  left join _pharmflow_group_approved a using (item_code)
 where ((nullif(btrim(i.group_name),'') is not null
          and public.pharmflow_normalize_main_group_v1(i.group_name) is distinct from i.group_name)
     or (nullif(btrim(i.group_name),'') is null
          and public.pharmflow_normalize_main_group_v1(i.category) is not null)
     or (a.item_code is not null and nullif(btrim(i.group_name),'') is null))
on conflict (item_code) do nothing;

update public.pharmflow_global_items_v2 i
   set group_name=coalesce(public.pharmflow_normalize_main_group_v1(i.group_name),
                           public.pharmflow_normalize_main_group_v1(i.category),a.group_name)
  from _pharmflow_group_approved a
 where a.item_code=i.item_code
   and nullif(btrim(i.group_name),'') is null;

-- Normalize valid existing Group spelling/case/whitespace and recover only an
-- exact approved Group in legacy category. Subordinate category text is untouched.
update public.pharmflow_global_items_v2 i
   set group_name=public.pharmflow_normalize_main_group_v1(i.group_name)
 where nullif(btrim(i.group_name),'') is not null
   and public.pharmflow_normalize_main_group_v1(i.group_name) is distinct from i.group_name;

update public.pharmflow_global_items_v2 i
   set group_name=public.pharmflow_normalize_main_group_v1(i.category)
 where nullif(btrim(i.group_name),'') is null
   and public.pharmflow_normalize_main_group_v1(i.category) is not null;

-- Fail closed if approved rows, names, category preservation, or total count drifted.
do $$
begin
  if (select count(*) from _pharmflow_group_approved a
      join public.pharmflow_global_items_v2 i using (item_code)
     where i.item_name=a.item_name
       and i.group_name=a.group_name) <> 61 then
    raise exception 'Post-update validation failed for approved workbook rows';
  end if;
  if exists (select 1 from public.pharmflow_global_group_change_audit_v1 h
      join public.pharmflow_global_items_v2 i using (item_code)
     where i.category is distinct from h.previous_category
        or i.sub_category is distinct from h.previous_sub_category
        or i.item_name is distinct from h.item_name) then
    raise exception 'Post-update validation failed: non-Group item fields changed';
  end if;
  if (select count(*) filter (where group_name in ('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'))
      from public.pharmflow_global_items_v2) <> 56573
     or (select count(*) filter (where nullif(btrim(group_name),'') is null)
         from public.pharmflow_global_items_v2) <> 2
     or exists (select 1 from public.pharmflow_global_items_v2
         where nullif(btrim(group_name),'') is not null
           and group_name not in ('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement')) then
    raise exception 'Post-update Group totals differ from the approved 56,575-item baseline';
  end if;
  if (select count(*) from public.pharmflow_global_items_v2)
     <> (select total_items from _pharmflow_group_baseline) then
    raise exception 'Post-update validation failed: Global Master item count changed';
  end if;
end $$;

select 'BEFORE' as audit_phase,total_items,valid_group_items,blank_group_items,
       legacy_category_items,canonical_legacy_category_items,normalized_legacy_category_items,
       unresolved_items,invalid_nonblank_group_items,
       null::bigint as canonical_homehealth_items,
       null::bigint as audited_changed_items
  from _pharmflow_group_baseline
union all
select 'AFTER',count(*)::bigint,
       count(*) filter (where group_name in ('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'))::bigint,
       count(*) filter (where nullif(btrim(group_name),'') is null)::bigint,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and public.pharmflow_normalize_main_group_v1(category) is not null)::bigint,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and category is not distinct from public.pharmflow_normalize_main_group_v1(category)
         and public.pharmflow_normalize_main_group_v1(category) is not null)::bigint,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and category is distinct from public.pharmflow_normalize_main_group_v1(category)
         and public.pharmflow_normalize_main_group_v1(category) is not null)::bigint,
       count(*) filter (where nullif(btrim(group_name),'') is null
         and public.pharmflow_normalize_main_group_v1(category) is null)::bigint,
       count(*) filter (where nullif(btrim(group_name),'') is not null
         and public.pharmflow_normalize_main_group_v1(group_name) is null)::bigint,
       count(*) filter (where group_name='HomeHealth')::bigint,
       (select count(*)::bigint from public.pharmflow_global_group_change_audit_v1)
  from public.pharmflow_global_items_v2;

commit;
