-- Staging-only compatibility restoration for the approved PharmFlow Preview.
-- Recovered from read-only Production contract inspection and repository
-- migrations. Apply ONLY to Supabase project tovkcakucyagvbzvlnks.
-- This migration is additive, creates no business/test records, and does not
-- change the Expiry photo-cleanup queue or scheduler.

-- Authentication/access-flow contracts.
create table public.pharmacy_registration_requests (
    id uuid primary key default gen_random_uuid(),
    applicant_user_id uuid not null references auth.users(id) on delete cascade,
    applicant_email text not null,
    applicant_name text,
    requested_pharmacy_name text not null,
    requested_pharmacy_code text not null,
    status text not null default 'pending'
        check (status in ('pending','approved','rejected')),
    submitted_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references auth.users(id),
    review_note text,
    pharmacy_id uuid references public.pharmacies(id),
    updated_at timestamptz not null default now()
);
alter table public.pharmacy_registration_requests enable row level security;
revoke all on public.pharmacy_registration_requests from public, anon, authenticated;

create table public.pharmacy_admin_assignments (
    id uuid primary key default gen_random_uuid(),
    pharmacy_id uuid not null unique references public.pharmacies(id) on delete cascade,
    email text not null,
    status text not null default 'pending'
        check (status in ('pending','claimed','cancelled')),
    assigned_by uuid not null references auth.users(id),
    assigned_at timestamptz not null default now(),
    claimed_by uuid references auth.users(id),
    claimed_at timestamptz
);
alter table public.pharmacy_admin_assignments enable row level security;
revoke all on public.pharmacy_admin_assignments from public, anon, authenticated;
create index pharmacy_admin_assignments_email_status_idx
    on public.pharmacy_admin_assignments (lower(email), status, assigned_at desc);

-- Receiving/Active Order Manifest startup read contracts. Tables remain
-- inaccessible directly to API roles; SECURITY DEFINER RPCs below enforce
-- authenticated pharmacy membership server-side.
create table public.pharmflow_workspace_generation_v1 (
    pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
    generation bigint not null default 0,
    reset_at timestamptz,
    reset_by uuid references auth.users(id),
    updated_at timestamptz not null default now()
);
alter table public.pharmflow_workspace_generation_v1 enable row level security;
revoke all on public.pharmflow_workspace_generation_v1 from public, anon, authenticated;

create table public.pharmflow_active_order_manifest_v1 (
    pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
    manifest jsonb not null default '{}'::jsonb,
    revision bigint not null default 1,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id),
    workspace_generation bigint not null default 0
);
alter table public.pharmflow_active_order_manifest_v1 enable row level security;
revoke all on public.pharmflow_active_order_manifest_v1 from public, anon, authenticated;

create table public.pharmflow_cloud_workspaces (
    pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
    workspace jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id),
    device_id text
);
alter table public.pharmflow_cloud_workspaces enable row level security;
revoke all on public.pharmflow_cloud_workspaces from public, anon, authenticated;

create table public.pharmflow_receiving_transactions_v1 (
    pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
    transaction_id text not null,
    order_number text,
    item_code text not null,
    item_name text,
    gtin text,
    quantity integer not null default 0,
    source text,
    device_id text,
    occurred_at timestamptz not null default now(),
    payload jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    primary key (pharmacy_id, transaction_id)
);
create index pharmflow_receiving_transactions_v1_delta_idx
    on public.pharmflow_receiving_transactions_v1 (pharmacy_id, created_at, transaction_id);
alter table public.pharmflow_receiving_transactions_v1 enable row level security;
revoke all on public.pharmflow_receiving_transactions_v1 from public, anon, authenticated;

-- The Staging helper intentionally reuses the already-verified active-member
-- check. Disabled memberships and inactive pharmacies cannot read workspace
-- state. System Owners retain their existing cross-pharmacy administrative
-- context through is_pharmacy_member().
create or replace function public.pharmflow_manifest_member_v2(p_pharmacy_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
    select auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id);
$$;

create or replace function public.pharmflow_receiving_member_v2(p_pharmacy_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
    select auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id);
$$;

create or replace function public.pharmflow_can_access_pharmacy(p_pharmacy_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
    select auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id);
$$;

create or replace function public.get_public_setup_status()
returns table(owner_exists boolean)
language sql stable security definer
set search_path = public
as $$
    select exists(select 1 from public.system_owners);
$$;

create or replace function public.get_my_pharmacy_registration()
returns table(
    request_id uuid,
    request_status text,
    pharmacy_name text,
    pharmacy_code text,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    review_note text,
    pharmacy_id uuid
)
language sql stable security definer
set search_path = public
as $$
    select r.id, r.status, r.requested_pharmacy_name,
           r.requested_pharmacy_code, r.submitted_at, r.reviewed_at,
           r.review_note, r.pharmacy_id
    from public.pharmacy_registration_requests r
    where r.applicant_user_id = auth.uid()
    order by r.submitted_at desc
    limit 1;
$$;

create or replace function public.claim_pharmacy_admin_assignment()
returns table(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, member_role text)
language plpgsql security definer
set search_path = public, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_assignment public.pharmacy_admin_assignments%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication required'; end if;

    select lower(u.email) into v_email from auth.users u where u.id = v_user_id;
    if v_email is null then raise exception 'Authenticated user email not found'; end if;

    select paa.* into v_assignment
    from public.pharmacy_admin_assignments paa
    where lower(paa.email) = v_email
      and (paa.status = 'pending' or (paa.status = 'claimed' and paa.claimed_by = v_user_id))
    order by paa.assigned_at desc
    limit 1
    for update;
    if not found then return; end if;

    if not exists (
        select 1 from public.pharmacies p
        where p.id = v_assignment.pharmacy_id and p.active = true and p.status = 'active'
    ) then raise exception 'Assigned pharmacy is not active'; end if;

    update public.pharmacy_members pm
    set active = false
    where pm.pharmacy_id = v_assignment.pharmacy_id
      and pm.role = 'admin' and pm.active = true and pm.user_id <> v_user_id
      and not exists (select 1 from public.system_owners so where so.user_id = pm.user_id);

    insert into public.profiles (user_id, email, display_name)
    values (
        v_user_id,
        v_email,
        coalesce((select u.raw_user_meta_data->>'display_name' from auth.users u where u.id = v_user_id),
                 split_part(v_email, '@', 1))
    )
    on conflict on constraint profiles_pkey do update
        set email = excluded.email,
            display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
            updated_at = now();

    insert into public.pharmacy_members (pharmacy_id, user_id, role, active)
    values (v_assignment.pharmacy_id, v_user_id, 'admin', true)
    on conflict (pharmacy_id, user_id) do update set role = 'admin', active = true;

    update public.pharmacy_admin_assignments
    set status = 'claimed', claimed_by = v_user_id, claimed_at = coalesce(claimed_at, now())
    where id = v_assignment.id;

    return query
    select p.id, p.code, p.name, 'admin'::text
    from public.pharmacies p where p.id = v_assignment.pharmacy_id;
end;
$$;

create or replace function public.get_pharmflow_workspace_generation(p_pharmacy_id uuid)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_generation bigint;
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    insert into public.pharmflow_workspace_generation_v1(pharmacy_id, generation)
    values (p_pharmacy_id, 0) on conflict (pharmacy_id) do nothing;
    select generation into v_generation
    from public.pharmflow_workspace_generation_v1 where pharmacy_id = p_pharmacy_id;
    return coalesce(v_generation, 0);
end;
$$;

create or replace function public.get_pharmflow_active_order_manifest_v3(p_pharmacy_id uuid)
returns table(
    manifest jsonb, revision bigint, updated_at timestamptz,
    order_files integer, order_items integer, workspace_generation bigint
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select m.manifest, m.revision, m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles', '[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData', '[]'::jsonb)),
           m.workspace_generation
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id = p_pharmacy_id;
end;
$$;

create or replace function public.get_pharmflow_active_order_manifest_meta_v1(p_pharmacy_id uuid)
returns table(
    manifest_present boolean, revision bigint, updated_at timestamptz,
    order_files integer, order_items integer, workspace_generation bigint
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select true, m.revision, m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles', '[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData', '[]'::jsonb)),
           m.workspace_generation
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id = p_pharmacy_id;
end;
$$;

create or replace function public.get_pharmflow_cloud_workspace(p_pharmacy_id uuid)
returns table(workspace jsonb, updated_at timestamptz, device_id text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select w.workspace, w.updated_at, w.device_id
    from public.pharmflow_cloud_workspaces w
    where w.pharmacy_id = p_pharmacy_id;
end;
$$;

create or replace function public.list_pharmflow_cloud_transactions_delta_v3(
    p_pharmacy_id uuid,
    p_after_created_at timestamptz default null,
    p_after_transaction_id text default null,
    p_limit integer default 500
)
returns table(
    transaction_id text, order_number text, item_code text, item_name text, gtin text,
    quantity integer, source text, device_id text, occurred_at timestamptz,
    payload jsonb, sync_created_at timestamptz
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select t.transaction_id, t.order_number, t.item_code, t.item_name, t.gtin,
           t.quantity, t.source, t.device_id, t.occurred_at, t.payload, t.created_at
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id = p_pharmacy_id
      and (p_after_created_at is null or t.created_at > p_after_created_at
           or (t.created_at = p_after_created_at and
               t.transaction_id > coalesce(p_after_transaction_id, '')))
    order by t.created_at asc, t.transaction_id asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000));
end;
$$;

-- Default-deny all RPCs, then grant only the roles used by the verified client.
revoke all on function public.get_public_setup_status() from public, anon, authenticated;
grant execute on function public.get_public_setup_status() to anon, authenticated;

revoke all on function public.get_my_pharmacy_registration() from public, anon, authenticated;
grant execute on function public.get_my_pharmacy_registration() to authenticated;
revoke all on function public.claim_pharmacy_admin_assignment() from public, anon, authenticated;
grant execute on function public.claim_pharmacy_admin_assignment() to authenticated;

revoke all on function public.pharmflow_manifest_member_v2(uuid) from public, anon, authenticated;
revoke all on function public.pharmflow_receiving_member_v2(uuid) from public, anon, authenticated;
revoke all on function public.pharmflow_can_access_pharmacy(uuid) from public, anon, authenticated;
grant execute on function public.pharmflow_manifest_member_v2(uuid) to authenticated;
grant execute on function public.pharmflow_receiving_member_v2(uuid) to authenticated;
grant execute on function public.pharmflow_can_access_pharmacy(uuid) to authenticated;

revoke all on function public.get_pharmflow_workspace_generation(uuid) from public, anon, authenticated;
revoke all on function public.get_pharmflow_active_order_manifest_v3(uuid) from public, anon, authenticated;
revoke all on function public.get_pharmflow_active_order_manifest_meta_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_pharmflow_cloud_workspace(uuid) from public, anon, authenticated;
revoke all on function public.list_pharmflow_cloud_transactions_delta_v3(uuid, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.get_pharmflow_workspace_generation(uuid) to authenticated;
grant execute on function public.get_pharmflow_active_order_manifest_v3(uuid) to authenticated;
grant execute on function public.get_pharmflow_active_order_manifest_meta_v1(uuid) to authenticated;
grant execute on function public.get_pharmflow_cloud_workspace(uuid) to authenticated;
grant execute on function public.list_pharmflow_cloud_transactions_delta_v3(uuid, timestamptz, text, integer) to authenticated;

notify pgrst, 'reload schema';
