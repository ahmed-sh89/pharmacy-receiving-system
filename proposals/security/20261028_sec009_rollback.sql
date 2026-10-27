-- Only after fresh ACL verification and separate approval; reopens SEC-009.
BEGIN;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacies TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_invitations TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_learned_gtin TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_learned_gtin_audit TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_members TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmacy_registration_requests TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmflow_cloud_workspaces TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmflow_pharmacy_gtin_audit_v1 TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pharmflow_pharmacy_identity_audit_v1 TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.system_owners TO anon, authenticated;
COMMIT;
