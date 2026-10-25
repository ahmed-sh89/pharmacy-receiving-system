-- Isolated synthetic fixture scope, inside the runner transaction only.
SAVEPOINT claim_cases;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='10000000-0000-4000-8000-000000000002';
INSERT INTO public.pharmacy_admin_assignments(pharmacy_id,email,status,assigned_by)
VALUES('20000000-0000-4000-8000-000000000002','a@rehearsal.invalid','pending','10000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN
 -- Auto-confirmed signup, existing account and a matching pending email cannot claim.
 IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment()) THEN RAISE EXCEPTION 'Email-only pending claim';END IF;
 IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment()) THEN RAISE EXCEPTION 'Retry granted pending claim';END IF;
END $$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=NULL,raw_user_meta_data='{"email_verified":true,"pharmflow_provision_operation":"forged"}' WHERE id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
DO $$BEGIN IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment()) THEN RAISE EXCEPTION 'Unverified/forged metadata claim';END IF;END $$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment()) THEN RAISE EXCEPTION 'Confirmed timestamp treated as trusted binding';END IF;
 BEGIN PERFORM public.owner_assign_pharmacy_admin('20000000-0000-4000-8000-000000000002','a@rehearsal.invalid');RAISE EXCEPTION 'Non-owner reassignment';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Non-owner reassignment' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pharmacy_members WHERE pharmacy_id='20000000-0000-4000-8000-000000000002' AND user_id='10000000-0000-4000-8000-000000000003' AND active AND role='admin') THEN RAISE EXCEPTION 'Pending claim displaced existing admin';END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT * FROM public.owner_assign_pharmacy_admin('20000000-0000-4000-8000-000000000002','a@rehearsal.invalid');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE n integer;BEGIN
 SELECT count(*) INTO n FROM public.claim_pharmacy_admin_assignment();IF n<>1 THEN RAISE EXCEPTION 'Trusted assignment unavailable';END IF;
 SELECT count(*) INTO n FROM public.claim_pharmacy_admin_assignment();IF n<>1 THEN RAISE EXCEPTION 'Trusted retry not idempotent';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment()) THEN RAISE EXCEPTION 'Other UID claimed assignment';END IF;END $$;
RESET ROLE;
UPDATE public.pharmacy_members SET active=false WHERE pharmacy_id='20000000-0000-4000-8000-000000000002' AND user_id='10000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment()) THEN RAISE EXCEPTION 'Inactive membership reactivated';END IF;END $$;
RESET ROLE;
UPDATE auth.users SET raw_app_meta_data='{"pharmflow_must_change_password":true}' WHERE id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
DO $$BEGIN BEGIN PERFORM public.claim_pharmacy_admin_assignment();RAISE EXCEPTION 'Password gate bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN BEGIN PERFORM public.claim_pharmacy_admin_assignment();RAISE EXCEPTION 'Missing identity bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$BEGIN BEGIN PERFORM public.claim_pharmacy_admin_assignment();RAISE EXCEPTION 'Anon bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT claim_cases;
RELEASE SAVEPOINT claim_cases;
