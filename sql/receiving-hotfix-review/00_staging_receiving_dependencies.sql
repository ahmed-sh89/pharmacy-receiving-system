-- Staging-only Receiving dependency recovery; no operational data.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE SEQUENCE public.pharmflow_order_source_items_id_seq;
CREATE TABLE "public"."pharmflow_order_source_items" (
 "id" bigint DEFAULT nextval('pharmflow_order_source_items_id_seq'::regclass) NOT NULL,
 "pharmacy_id" uuid NOT NULL,
 "order_id" uuid NOT NULL,
 "order_number" text NOT NULL,
 "line_no" integer NOT NULL,
 "item_code" text NOT NULL,
 "item_name" text DEFAULT ''::text NOT NULL,
 "ordered_qty" numeric NOT NULL,
 "category" text DEFAULT ''::text NOT NULL,
 "source_sheet" text DEFAULT ''::text NOT NULL,
 "source_row" integer,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "group_name" text DEFAULT ''::text NOT NULL,
 "sub_category" text DEFAULT ''::text NOT NULL
);
ALTER SEQUENCE public.pharmflow_order_source_items_id_seq OWNED BY public.pharmflow_order_source_items.id;
ALTER TABLE "public"."pharmflow_order_source_items" ADD CONSTRAINT "pharmflow_order_source_items_order_id_line_no_key" UNIQUE (order_id, line_no);
ALTER TABLE "public"."pharmflow_order_source_items" ADD CONSTRAINT "pharmflow_order_source_items_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."pharmflow_order_source_items" ADD CONSTRAINT "pharmflow_order_source_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES pharmflow_orders(id) ON DELETE CASCADE;
ALTER TABLE "public"."pharmflow_order_source_items" ADD CONSTRAINT "pharmflow_order_source_items_pharmacy_id_fkey" FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE;
CREATE INDEX pharmflow_order_source_items_item_idx ON public.pharmflow_order_source_items USING btree (pharmacy_id, item_code);
CREATE INDEX pharmflow_order_source_items_pharmacy_order_idx ON public.pharmflow_order_source_items USING btree (pharmacy_id, order_number);
ALTER TABLE public.pharmflow_order_source_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmflow_order_source_items FROM PUBLIC,anon,authenticated,service_role;
GRANT TRIGGER,TRUNCATE,REFERENCES ON public.pharmflow_order_source_items TO service_role;
REVOKE ALL ON SEQUENCE public.pharmflow_order_source_items_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.append_pharmflow_receiving_action_v4(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb)
 RETURNS TABLE(acknowledged boolean, inserted boolean, authoritative_received bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
  v_inserted boolean:=false;
  v_intent_id uuid;
begin
 if auth.uid() is null or not public.pharmflow_receiving_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if nullif(trim(coalesce(p_transaction_id,'')),'') is null then raise exception 'Transaction ID required';end if;
 if nullif(trim(coalesce(p_item_code,'')),'') is null then raise exception 'Item Code required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||coalesce(trim(p_order_number),'')||'|'||trim(p_item_code),0));
 select * into v_existing from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id);
 if found then
  if coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(coalesce(p_order_number,'')),''),'') or v_existing.item_code<>trim(p_item_code) or v_existing.quantity<>coalesce(p_quantity,0) or coalesce(v_existing.gtin,'')<>coalesce(p_gtin,'') then raise exception 'Transaction ID content mismatch';end if;
 else
  insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
  values(p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),trim(p_item_code),coalesce(p_item_name,''),coalesce(p_gtin,''),coalesce(p_quantity,0),coalesce(p_source,'RECEIVING'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid());
  v_inserted:=true;
 end if;
 for v_intent_id in select id from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id) and status='PENDING' loop
   begin
     perform public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_intent_id);
   exception when others then
     begin
       update public.pharmflow_needs_review_resolution_intents_v1 set helper_failure_code=SQLSTATE,helper_failure_detail=SQLERRM,helper_failure_at=now(),helper_failure_count=helper_failure_count+1,updated_at=now() where id=v_intent_id and status='PENDING';
     exception when others then
       raise warning 'Needs Review intent helper failed after Receiving receipt %, and failure state could not be recorded: %',trim(p_transaction_id),SQLERRM;
     end;
     raise warning 'Needs Review intent helper failed after Receiving receipt %: %',trim(p_transaction_id),SQLERRM;
   end;
 end loop;
 return query select true,v_inserted,coalesce(sum(t.quantity),0)::bigint from public.pharmflow_receiving_transactions_v1 t where t.pharmacy_id=p_pharmacy_id and t.item_code=trim(p_item_code) and coalesce(t.order_number,'')=coalesce(nullif(trim(coalesce(p_order_number,'')),''),'');
end $function$
;
REVOKE ALL ON FUNCTION public.append_pharmflow_receiving_action_v4(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_receiving_action_v4(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb) TO authenticated;
create or replace function public.save_pharmflow_order_source_items_v2(p_pharmacy_id uuid,p_order_number text,p_items jsonb,p_replace boolean default false)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order_id uuid;v_count integer:=0;
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required'; end if;
 select id into v_order_id from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and upper(regexp_replace(order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g')) limit 1;
 if v_order_id is null then raise exception 'Order % is not registered',p_order_number; end if;
 if p_replace then
  if exists(select 1 from public.pharmflow_orders where id=v_order_id and status='received') then raise exception 'Received order source data is immutable'; end if;
  delete from public.pharmflow_order_source_items where order_id=v_order_id;
 end if;
 insert into public.pharmflow_order_source_items(pharmacy_id,order_id,order_number,line_no,item_code,item_name,ordered_qty,group_name,category,sub_category,source_sheet,source_row)
 select p_pharmacy_id,v_order_id,upper(regexp_replace(trim(p_order_number),'\\s','','g')),(x->>'line_no')::integer,trim(x->>'item_code'),coalesce(x->>'item_name',''),(x->>'ordered_qty')::numeric,coalesce(x->>'group_name',''),coalesce(x->>'category',''),coalesce(x->>'sub_category',''),coalesce(x->>'source_sheet',''),nullif(x->>'source_row','')::integer
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(trim(x->>'item_code'),'') is not null and coalesce((x->>'ordered_qty')::numeric,0)>0
 on conflict(order_id,line_no) do update set item_code=excluded.item_code,item_name=excluded.item_name,ordered_qty=excluded.ordered_qty,group_name=excluded.group_name,category=excluded.category,sub_category=excluded.sub_category,source_sheet=excluded.source_sheet,source_row=excluded.source_row;
 get diagnostics v_count=row_count;return v_count;
end $$;
revoke all on function public.save_pharmflow_order_source_items_v2(uuid,text,jsonb,boolean) from public,anon;
grant execute on function public.save_pharmflow_order_source_items_v2(uuid,text,jsonb,boolean) to authenticated;

create or replace function public.get_pharmflow_order_source_items_v2(p_pharmacy_id uuid,p_order_number text)
returns setof public.pharmflow_order_source_items language sql security definer set search_path=public,pg_temp as $$
 select i.* from public.pharmflow_order_source_items i where i.pharmacy_id=p_pharmacy_id
 and upper(regexp_replace(i.order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g'))
 and auth.uid() is not null and public.is_pharmacy_admin(p_pharmacy_id) order by i.line_no;
$$;
revoke all on function public.get_pharmflow_order_source_items_v2(uuid,text) from public,anon;
grant execute on function public.get_pharmflow_order_source_items_v2(uuid,text) to authenticated;

COMMIT;
