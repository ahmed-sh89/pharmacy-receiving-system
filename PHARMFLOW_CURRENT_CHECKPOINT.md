
### B10 Clean15.13 — Awaiting user verification
Unified Auth Gate root fix applied after Supabase logs confirmed refresh-token rejection (400) followed by protected RPC 401s. Expected result: stale session causes one terminal auth recovery to Sign In; no Complete access false state and no refresh-token request storm. Receiving/Handheld operational paths unchanged.


### B10 Clean15.14 — Awaiting user verification
Supabase Auth header error-code root fix. `authRequest()` now reads `x-sb-error-code` (with underscore fallback) before body error codes, so `refresh_token_not_found` is recognized as terminal immediately. This allows the existing Clean15.12/15.13 stale-session invalidation and unified auth gate to stop protected RPCs and route to Sign In instead of false Complete access. No Receiving, Handheld, manifest, ledger, SQL, or Egress polling logic changed.


### B10 Clean15.15 — Awaiting user verification
Auth bootstrap UI gate applied after clean Incognito verification showed: valid Sign In -> workspace, then Refresh -> brief Sign In flash -> workspace. Expected result is now Refresh -> Preparing PharmFlow -> workspace, with no transient Sign In or Complete access screen. Business/auth network logic is unchanged.
