-- PharmFlow Phase 2C.9.4
-- Safe deletion of ONE Near Expiry capture only.
-- Does not touch Global GTIN, orders, receiving history, workers, or other captures.

create or replace function public.delete_pharmacy_expiry_capture(
    p_pharmacy_id uuid,
    p_capture_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_deleted integer := 0;
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_expiry_captures_v1
    where id = p_capture_id
      and pharmacy_id = p_pharmacy_id;

    get diagnostics v_deleted = row_count;
    return v_deleted = 1;
end;
$$;

revoke all on function public.delete_pharmacy_expiry_capture(uuid,uuid) from public, anon;
grant execute on function public.delete_pharmacy_expiry_capture(uuid,uuid) to authenticated;

select pg_notify('pgrst','reload schema');
