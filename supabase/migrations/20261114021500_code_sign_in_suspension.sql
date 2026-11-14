-- Include suspended pharmacies for credential verification only. The Edge
-- Function must withhold the session when the requested pharmacy is suspended.
CREATE FUNCTION public.pharmflow_admin_login_for_code_v2(p_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN count(*)=1 THEN jsonb_build_object(
  'email', min(candidate.email),
  'suspended', bool_or(candidate.suspended)
 ) END
 FROM (
  SELECT u.email, p.status='suspended' AS suspended
  FROM public.pharmacies p
  JOIN public.pharmacy_members m ON m.pharmacy_id=p.id AND m.active AND m.role='admin'
  JOIN auth.users u ON u.id=m.user_id
  WHERE p.code=upper(trim(p_code))
    AND ((p.active AND p.status='active') OR p.status='suspended')
    AND NOT EXISTS (SELECT FROM public.system_owners so WHERE so.user_id=m.user_id)
  -- Match the current ADMIN displayed by the owner and used for Reset.
  ORDER BY m.created_at DESC NULLS FIRST
  FETCH FIRST 1 ROW WITH TIES
 ) candidate;
$$;
REVOKE ALL ON FUNCTION public.pharmflow_admin_login_for_code_v2(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pharmflow_admin_login_for_code_v2(text) TO service_role;
