-- PharmFlow Global V2 authenticated manual-search contract.
-- Root fix: SECURITY DEFINER search must not depend on auth.uid() visibility
-- inside the function body. Caller access remains restricted to authenticated.

create or replace function public.search_pharmflow_global_items_v2(
  p_query text,
  p_limit integer default 50
)
returns table(
  item_code text,
  item_name text,
  group_name text,
  category text,
  sub_category text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    i.item_code,
    i.item_name,
    i.group_name,
    i.category,
    i.sub_category
  from public.pharmflow_global_items_v2 i
  where
    btrim(coalesce(p_query,'')) = ''
    or i.item_code ilike '%' || btrim(p_query) || '%'
    or i.item_name ilike '%' || btrim(p_query) || '%'
  order by
    case
      when upper(i.item_code)=upper(btrim(p_query)) then 0
      when upper(i.item_name)=upper(btrim(p_query)) then 1
      when i.item_code ilike btrim(p_query)||'%' then 2
      when i.item_name ilike btrim(p_query)||'%' then 3
      else 4
    end,
    i.item_name,
    i.item_code
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.search_pharmflow_global_items_v2(text,integer) from public, anon;
grant execute on function public.search_pharmflow_global_items_v2(text,integer) to authenticated;
