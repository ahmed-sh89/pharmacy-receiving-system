PharmFlow Phase 2B.9 — Central Global GTIN + resilient file mapping

Replace these files in the project:
  js/utils.js
  js/config.js
  js/master-gtin.js
  js/supabase.js

No new SQL is required if PHASE2B1_GLOBAL_GTIN_SUPABASE.sql was already run successfully.

What changes:
- Supabase Global GTIN is the authoritative pharmacy-wide reference.
- PC refreshes Global GTIN before creating/publishing a shared receiving session.
- Zebra refreshes Global GTIN directly from Supabase every time it joins a PC session.
- Settings > Update GTIN remains only for replacing the central master when a newer file is available.
- Item-number normalization tolerates Excel number/text formatting, spaces, .0, and leading-zero differences.
- More common Order/Master header aliases are recognized automatically.
- Category from Global GTIN continues to project onto matched order items.

Important:
Do not upload a GTIN file on Zebra. Update the master once from Settings on an ADMIN account; all devices then use Supabase.
