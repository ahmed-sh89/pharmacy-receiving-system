-- ============================================================
-- PharmFlow Phase 2C.10.1
-- Cloud-authoritative finalized archive / cross-PC integrity
-- Safe additive migration.
-- ============================================================

create table if not exists public.pharmflow_finalized_archives_v1 (
    pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
    archive_id text not null,
    order_numbers text[] not null default '{}',
    closed_at timestamptz not null default now(),
    archive_payload jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    primary key (pharmacy_id, archive_id)
);

create index if not exists idx_pf_finalized_archives_v1_closed
on public.pharmflow_finalized_archives_v1(pharmacy_id, closed_at desc);

alter table public.pharmflow_finalized_archives_v1 enable row level security;
revoke all on public.pharmflow_finalized_archives_v1 from public, anon, authenticated;

create or replace function public.save_pharmflow_finalized_archive(
    p_pharmacy_id uuid,
    p_archive_id text,
    p_order_numbers text[],
    p_closed_at timestamptz,
    p_archive_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_archive_id,'')),'') is null then
        raise exception 'Archive id is required';
    end if;

    insert into public.pharmflow_finalized_archives_v1(
        pharmacy_id, archive_id, order_numbers, closed_at,
        archive_payload, created_by
    )
    values(
        p_pharmacy_id,
        trim(p_archive_id),
        coalesce(p_order_numbers,'{}'::text[]),
        coalesce(p_closed_at,now()),
        coalesce(p_archive_payload,'{}'::jsonb),
        auth.uid()
    )
    on conflict(pharmacy_id,archive_id)
    do update set
        order_numbers=excluded.order_numbers,
        closed_at=excluded.closed_at,
        archive_payload=excluded.archive_payload;

    return true;
end;
$$;

create or replace function public.list_pharmflow_finalized_archives(
    p_pharmacy_id uuid
)
returns table(
    archive_id text,
    order_numbers text[],
    closed_at timestamptz,
    archive_payload jsonb
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
    select
        a.archive_id,
        a.order_numbers,
        a.closed_at,
        a.archive_payload
    from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id)
    order by a.closed_at desc;
$$;

create or replace function public.delete_all_pharmflow_finalized_archives(
    p_pharmacy_id uuid,
    p_confirmation text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if p_confirmation <> 'DELETE ALL HISTORICAL DATA' then
        raise exception 'Invalid confirmation';
    end if;

    delete from public.pharmflow_finalized_archives_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$$;

revoke all on function public.save_pharmflow_finalized_archive(uuid,text,text[],timestamptz,jsonb) from public,anon;
revoke all on function public.list_pharmflow_finalized_archives(uuid) from public,anon;
revoke all on function public.delete_all_pharmflow_finalized_archives(uuid,text) from public,anon;

grant execute on function public.save_pharmflow_finalized_archive(uuid,text,text[],timestamptz,jsonb) to authenticated;
grant execute on function public.list_pharmflow_finalized_archives(uuid) to authenticated;
grant execute on function public.delete_all_pharmflow_finalized_archives(uuid,text) to authenticated;

select pg_notify('pgrst','reload schema');
