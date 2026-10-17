-- Recovery companion for PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql.
-- REVIEW ONLY: never run this against Production without an explicit recovery approval.
-- Restores only group_name before-images that still match the migration's after-value.
-- Does not drop audit evidence or loosen the new-item server-side Group validator.

begin;

do $$
declare v_conflicts bigint; v_restorable bigint; v_total bigint;
begin
  if pg_catalog.to_regclass('public.pharmflow_global_group_change_audit_v1') is null then
    raise exception 'Group change audit table is missing; stop recovery';
  end if;
  select count(*) into v_total from public.pharmflow_global_items_v2;

  select count(*) into v_conflicts
    from public.pharmflow_global_group_change_audit_v1 h
    join public.pharmflow_global_items_v2 i using (item_code)
   where i.group_name is distinct from h.new_group_name
     and i.group_name is distinct from h.previous_group_name;
  if v_conflicts > 0 then
    raise exception 'Recovery stopped: % item Group values changed after the migration; review before-images manually',v_conflicts;
  end if;

  select count(*) into v_restorable
    from public.pharmflow_global_group_change_audit_v1 h
    join public.pharmflow_global_items_v2 i using (item_code)
   where i.group_name is not distinct from h.new_group_name;
  update public.pharmflow_global_items_v2 i
     set group_name=h.previous_group_name
    from public.pharmflow_global_group_change_audit_v1 h
   where h.item_code=i.item_code
     and i.group_name is not distinct from h.new_group_name;

  if (select count(*) from public.pharmflow_global_items_v2) <> v_total then
    raise exception 'Recovery validation failed: item count changed';
  end if;
  raise notice 'Restored % unchanged Group values from the recorded before-image; audit evidence retained',v_restorable;
end $$;

select count(*) as audit_rows,
       count(*) filter (where i.item_code is null) as items_missing_since_migration,
       count(*) filter (where i.item_code is not null
         and i.group_name is not distinct from h.previous_group_name) as restored_or_already_restored,
       count(*) filter (where i.item_code is not null
         and i.group_name is not distinct from h.new_group_name) as still_at_migrated_value
  from public.pharmflow_global_group_change_audit_v1 h
  left join public.pharmflow_global_items_v2 i using (item_code);

commit;
