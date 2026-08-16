-- ============================================================
-- PharmFlow Phase 2C.10.3.1
-- Pharmacy-wide receiving transaction synchronization
--
-- REQUIRED: run once in Supabase SQL Editor.
-- This is what makes receiving done on PC1 appear on PC2.
-- ============================================================

create table if not exists public.pharmflow_receiving_transactions_v1(
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
    primary key(pharmacy_id,transaction_id)
);

create index if not exists idx_pf_receiving_tx_pharmacy_time
on public.pharmflow_receiving_transactions_v1(pharmacy_id,occurred_at desc);

alter table public.pharmflow_receiving_transactions_v1 enable row level security;
revoke all on public.pharmflow_receiving_transactions_v1
from public,anon,authenticated;


create or replace function public.append_pharmflow_cloud_transaction(
    p_pharmacy_id uuid,
    p_transaction_id text,
    p_order_number text,
    p_item_code text,
    p_item_name text,
    p_gtin text,
    p_quantity integer,
    p_source text,
    p_device_id text,
    p_occurred_at timestamptz,
    p_payload jsonb
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

    if nullif(trim(coalesce(p_transaction_id,'')),'') is null then
        raise exception 'Transaction ID required';
    end if;

    insert into public.pharmflow_receiving_transactions_v1(
        pharmacy_id,transaction_id,order_number,item_code,item_name,
        gtin,quantity,source,device_id,occurred_at,payload,created_by
    )
    values(
        p_pharmacy_id,
        trim(p_transaction_id),
        nullif(trim(coalesce(p_order_number,'')),''),
        trim(coalesce(p_item_code,'')),
        coalesce(p_item_name,''),
        coalesce(p_gtin,''),
        coalesce(p_quantity,0),
        coalesce(p_source,'RECEIVING'),
        coalesce(p_device_id,''),
        coalesce(p_occurred_at,now()),
        coalesce(p_payload,'{}'::jsonb),
        auth.uid()
    )
    on conflict(pharmacy_id,transaction_id) do nothing;

    return true;
end;
$$;


create or replace function public.list_pharmflow_cloud_transactions(
    p_pharmacy_id uuid,
    p_limit integer default 1000
)
returns table(
    transaction_id text,
    order_number text,
    item_code text,
    item_name text,
    gtin text,
    quantity integer,
    source text,
    device_id text,
    occurred_at timestamptz,
    payload jsonb
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
    select
        t.transaction_id,
        t.order_number,
        t.item_code,
        t.item_name,
        t.gtin,
        t.quantity,
        t.source,
        t.device_id,
        t.occurred_at,
        t.payload
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id)
    order by t.occurred_at desc
    limit greatest(1,least(coalesce(p_limit,1000),5000));
$$;


create or replace function public.clear_pharmflow_receiving_transactions(
    p_pharmacy_id uuid
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

    delete from public.pharmflow_receiving_transactions_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$$;

revoke all on function public.append_pharmflow_cloud_transaction(
    uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb
) from public,anon;

revoke all on function public.list_pharmflow_cloud_transactions(uuid,integer)
from public,anon;

revoke all on function public.clear_pharmflow_receiving_transactions(uuid)
from public,anon;

grant execute on function public.append_pharmflow_cloud_transaction(
    uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb
) to authenticated;

grant execute on function public.list_pharmflow_cloud_transactions(uuid,integer)
to authenticated;

grant execute on function public.clear_pharmflow_receiving_transactions(uuid)
to authenticated;

select pg_notify('pgrst','reload schema');
