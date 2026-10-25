-- Auto-confirmed email is not proof of ownership. Only trusted user-ID binding
-- from owner assignment/provisioning/approval may grant Admin membership.
-- This compatibility RPC is now a read-only, idempotent projection.
CREATE OR REPLACE FUNCTION public.claim_pharmacy_admin_assignment()
RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, member_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $claim$
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required';
 END IF;
 IF NOT pharmflow_auth_private.password_change_complete() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PASSWORD_CHANGE_REQUIRED';
 END IF;
 RETURN QUERY
 SELECT p.id,p.code,p.name,'admin'::text
 FROM public.pharmacy_admin_assignments a
 JOIN public.pharmacy_members m ON m.pharmacy_id=a.pharmacy_id AND m.user_id=auth.uid()
 JOIN public.pharmacies p ON p.id=a.pharmacy_id
 WHERE a.status='claimed' AND a.claimed_by=auth.uid()
 AND m.active AND m.role='admin' AND p.active AND p.status='active'
 ORDER BY a.assigned_at DESC LIMIT 1;
END $claim$;
REVOKE ALL ON FUNCTION public.claim_pharmacy_admin_assignment() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_pharmacy_admin_assignment() TO authenticated;
NOTIFY pgrst,'reload schema';
