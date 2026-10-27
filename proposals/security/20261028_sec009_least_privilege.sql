-- SEC-009 proposal only. No Production execution authorized.
-- Preserve SELECT/INSERT/UPDATE/DELETE, RLS, policies and function grants.
BEGIN;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacies FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_invitations FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_learned_gtin FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_learned_gtin_audit FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_members FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_registration_requests FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmflow_cloud_workspaces FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmflow_pharmacy_gtin_audit_v1 FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmflow_pharmacy_identity_audit_v1 FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.system_owners FROM anon, authenticated;
COMMIT;
