-- ============================================================
-- PHARMFLOW — PHASE 2B.6
-- AUTHORITATIVE SHARED SESSION TERMINATION SIGNAL
-- Safe / additive migration
--
-- Purpose:
--   The legacy receiving-session snapshot RPC may still expose the last
--   snapshot after the PC locally disconnects. This migration adds a tiny,
--   independent server-side termination registry so every Zebra device can
--   immediately know that the PC session is finished.
--
-- This migration does NOT delete or alter Orders, Receiving History,
-- transactions, Returns, GTIN mappings, users, or existing cloud tables/RPCs.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.pharmflow_session_terminations (
    session_id text not null,
    session_secret_hash text not null,
    ended_at timestamptz not null default now(),
    ended_by_device text,
    primary key (session_id, session_secret_hash)
);

alter table public.pharmflow_session_terminations enable row level security;

-- No direct client table access is required. All access is through the two
-- SECURITY DEFINER RPC functions below.
revoke all on table public.pharmflow_session_terminations from public, anon, authenticated;

create or replace function public.pharmflow_end_session(
    p_session_id text,
    p_session_secret text,
    p_ended_by_device text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_session_id text := nullif(trim(coalesce(p_session_id,'')), '');
    v_secret text := nullif(trim(coalesce(p_session_secret,'')), '');
    v_hash text;
begin
    if v_session_id is null or v_secret is null then
        raise exception 'Session id and secret are required';
    end if;

    v_hash := encode(digest(v_secret, 'sha256'), 'hex');

    insert into public.pharmflow_session_terminations(
        session_id,
        session_secret_hash,
        ended_at,
        ended_by_device
    )
    values (
        v_session_id,
        v_hash,
        now(),
        nullif(trim(coalesce(p_ended_by_device,'')), '')
    )
    on conflict (session_id, session_secret_hash)
    do update set
        ended_at = excluded.ended_at,
        ended_by_device = excluded.ended_by_device;

    return true;
end;
$$;

create or replace function public.pharmflow_is_session_ended(
    p_session_id text,
    p_session_secret text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.pharmflow_session_terminations t
        where t.session_id = nullif(trim(coalesce(p_session_id,'')), '')
          and t.session_secret_hash = encode(
                digest(nullif(trim(coalesce(p_session_secret,'')), ''), 'sha256'),
                'hex'
              )
    );
$$;

revoke all on function public.pharmflow_end_session(text,text,text) from public;
revoke all on function public.pharmflow_is_session_ended(text,text) from public;

grant execute on function public.pharmflow_end_session(text,text,text) to anon, authenticated;
grant execute on function public.pharmflow_is_session_ended(text,text) to anon, authenticated;

-- ============================================================
-- END PHASE 2B.6
-- Expected SQL Editor result:
--   Success. No rows returned.
-- ============================================================
