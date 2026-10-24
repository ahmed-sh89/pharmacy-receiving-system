-- Staging compatibility only. Restore the existing status RPC contract.
-- Production behavior is preserved; its legacy owner helper is replaced by
-- Staging's equivalent existing system_owners/auth.uid() predicate.
-- No pharmacy rows, memberships, policies, or roles are changed by this migration.
CREATE FUNCTION public.owner_set_pharmacy_status(p_pharmacy_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $function$
begin
    if not public.is_system_owner() then
        raise exception 'System Owner access required';
    end if;
    if p_status not in ('active','suspended') then
        raise exception 'Invalid pharmacy status';
    end if;
    update public.pharmacies
       set status=p_status,
           active=(p_status='active'),
           updated_at=now()
     where id=p_pharmacy_id;
    if not found then
        raise exception 'Pharmacy not found';
    end if;
end;
$function$;
REVOKE ALL ON FUNCTION public.owner_set_pharmacy_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_pharmacy_status(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
