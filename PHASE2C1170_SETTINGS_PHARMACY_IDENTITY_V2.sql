-- PHASE2C1170 — Settings pharmacy identity + registration V2
-- Additive/versioned. Existing Production RPCs remain unchanged for backward compatibility.

create table if not exists public.pharmflow_pharmacy_identity_audit_v1 (
    id uuid primary key default gen_random_uuid(),
    pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
    old_code text not null,
    new_code text not null,
    old_name text not null,
    new_name text not null,
    changed_by uuid not null references auth.users(id),
    changed_at timestamptz not null default now()
);

alter table public.pharmflow_pharmacy_identity_audit_v1 enable row level security;

create or replace function public.submit_pharmacy_registration_v2(
    p_requested_pharmacy_code text
)
returns table(
    request_id uuid,
    request_status text,
    pharmacy_code text,
    submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_user uuid := auth.uid();
    v_email text;
    v_code text;
    v_request uuid;
    v_submitted timestamptz;
begin
    if v_user is null then raise exception 'Authentication required'; end if;
    if public.is_system_owner() then raise exception 'System Owner does not need public pharmacy registration'; end if;

    if exists (
        select 1 from public.pharmacy_members m
        join public.pharmacies p on p.id=m.pharmacy_id
        where m.user_id=v_user and m.active=true and p.status='active'
    ) then
        raise exception 'This account already belongs to an active pharmacy';
    end if;

    v_code := upper(regexp_replace(coalesce(p_requested_pharmacy_code,''),'[^A-Za-z0-9_-]+','','g'));
    if length(v_code) < 3 then raise exception 'Pharmacy code must be at least 3 characters'; end if;

    select lower(email) into v_email from auth.users where id=v_user;
    if v_email is null then raise exception 'Authenticated email was not found'; end if;

    if exists (
        select 1 from public.pharmacy_registration_requests r
        where r.applicant_user_id=v_user and r.status in ('pending','approved')
    ) then
        raise exception 'A registration request already exists for this account';
    end if;

    select r.id into v_request
    from public.pharmacy_registration_requests r
    where r.applicant_user_id=v_user and r.status='rejected'
    order by r.submitted_at desc limit 1;

    if v_request is not null then
        update public.pharmacy_registration_requests
        set applicant_email=v_email,
            applicant_name=null,
            requested_pharmacy_name='Pending owner assignment',
            requested_pharmacy_code=v_code,
            status='pending', submitted_at=now(),
            reviewed_at=null, reviewed_by=null, review_note=null, pharmacy_id=null
        where id=v_request
        returning pharmacy_registration_requests.submitted_at into v_submitted;
    else
        insert into public.pharmacy_registration_requests(
            applicant_user_id,applicant_email,applicant_name,requested_pharmacy_name,requested_pharmacy_code
        ) values (
            v_user,v_email,null,'Pending owner assignment',v_code
        ) returning id, pharmacy_registration_requests.submitted_at into v_request,v_submitted;
    end if;

    return query select v_request,'pending'::text,v_code,v_submitted;
end;
$$;

create or replace function public.owner_review_pharmacy_registration_v2(
    p_request_id uuid,
    p_decision text,
    p_official_pharmacy_name text default null,
    p_official_pharmacy_code text default null,
    p_note text default null
)
returns table(
    request_id uuid,
    request_status text,
    pharmacy_id uuid,
    pharmacy_code text,
    pharmacy_name text,
    admin_user_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_owner uuid := auth.uid();
    v_decision text := lower(trim(coalesce(p_decision,'')));
    v_req public.pharmacy_registration_requests%rowtype;
    v_pharmacy uuid;
    v_code text;
    v_name text;
begin
    if v_owner is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
    if v_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject'; end if;

    select r.* into v_req
    from public.pharmacy_registration_requests r
    where r.id=p_request_id for update;
    if not found then raise exception 'Registration request not found'; end if;
    if v_req.status <> 'pending' then raise exception 'Only pending requests can be reviewed'; end if;

    if v_decision='reject' then
        update public.pharmacy_registration_requests
        set status='rejected',reviewed_at=now(),reviewed_by=v_owner,review_note=nullif(trim(p_note),'')
        where id=p_request_id;
        return query select v_req.id,'rejected'::text,null::uuid,v_req.requested_pharmacy_code,null::text,v_req.applicant_user_id;
        return;
    end if;

    v_name := nullif(trim(p_official_pharmacy_name),'');
    v_code := upper(regexp_replace(coalesce(p_official_pharmacy_code,''),'[^A-Za-z0-9_-]+','','g'));
    if v_name is null then raise exception 'Official pharmacy name is required'; end if;
    if length(v_code)<3 then raise exception 'Official pharmacy code must be at least 3 characters'; end if;
    if exists(select 1 from public.pharmacies p where upper(p.code)=v_code) then
        raise exception 'Official pharmacy code is already in use';
    end if;

    insert into public.pharmacies(code,name,status,active,approved_at,approved_by)
    values(v_code,v_name,'active',true,now(),v_owner)
    returning id into v_pharmacy;

    insert into public.pharmacy_members(pharmacy_id,user_id,role,active)
    values(v_pharmacy,v_req.applicant_user_id,'admin',true)
    on conflict on constraint pharmacy_members_pharmacy_id_user_id_key
    do update set role='admin',active=true;

    update public.pharmacy_registration_requests
    set status='approved',reviewed_at=now(),reviewed_by=v_owner,
        review_note=nullif(trim(p_note),''),pharmacy_id=v_pharmacy,
        requested_pharmacy_name=v_name
    where id=p_request_id;

    return query select v_req.id,'approved'::text,v_pharmacy,v_code,v_name,v_req.applicant_user_id;
end;
$$;

create or replace function public.owner_update_pharmacy_identity_v1(
    p_pharmacy_id uuid,
    p_official_pharmacy_name text,
    p_official_pharmacy_code text
)
returns table(pharmacy_id uuid, pharmacy_code text, pharmacy_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_owner uuid := auth.uid();
    v_old public.pharmacies%rowtype;
    v_name text := nullif(trim(p_official_pharmacy_name),'');
    v_code text := upper(regexp_replace(coalesce(p_official_pharmacy_code,''),'[^A-Za-z0-9_-]+','','g'));
begin
    if v_owner is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
    if v_name is null then raise exception 'Pharmacy name is required'; end if;
    if length(v_code)<3 then raise exception 'Pharmacy code must be at least 3 characters'; end if;

    select * into v_old from public.pharmacies where id=p_pharmacy_id for update;
    if not found then raise exception 'Pharmacy not found'; end if;

    if exists(select 1 from public.pharmacies p where upper(p.code)=v_code and p.id<>p_pharmacy_id) then
        raise exception 'Pharmacy code is already in use';
    end if;

    update public.pharmacies
    set code=v_code,name=v_name,updated_at=now()
    where id=p_pharmacy_id;

    if v_old.code is distinct from v_code or v_old.name is distinct from v_name then
        insert into public.pharmflow_pharmacy_identity_audit_v1(
            pharmacy_id,old_code,new_code,old_name,new_name,changed_by
        ) values(p_pharmacy_id,v_old.code,v_code,v_old.name,v_name,v_owner);
    end if;

    return query select p_pharmacy_id,v_code,v_name;
end;
$$;

revoke all on function public.submit_pharmacy_registration_v2(text) from public, anon;
grant execute on function public.submit_pharmacy_registration_v2(text) to authenticated;
revoke all on function public.owner_review_pharmacy_registration_v2(uuid,text,text,text,text) from public, anon;
grant execute on function public.owner_review_pharmacy_registration_v2(uuid,text,text,text,text) to authenticated;
revoke all on function public.owner_update_pharmacy_identity_v1(uuid,text,text) from public, anon;
grant execute on function public.owner_update_pharmacy_identity_v1(uuid,text,text) to authenticated;
