-- REVIEW DRAFT ONLY. Atomic Receiving capture; no backfill or legacy row changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.pharmflow_needs_review_v2 ADD COLUMN receiving_capture_request jsonb;
CREATE FUNCTION public.create_pharmflow_needs_review_v6(p_operation_id text, p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text, p_work_scope_order_numbers text[] DEFAULT NULL::text[], p_pending_quantity integer DEFAULT 1)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
declare v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');v_scope text[];v_id uuid;v_time timestamptz;v_qty integer;v_status text;v_request jsonb;v_existing_request jsonb;v_actor uuid;
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if v_operation is null then raise exception 'Operation ID is required';end if;
 if v_key='' then raise exception 'Identifier is required';end if;
 if upper(trim(coalesce(p_workflow,'RECEIVING')))<>'RECEIVING' then raise exception 'Invalid workflow';end if;
 if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;
 if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;

 select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
 if v_order is not null and not(v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order);end if;
 if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required';end if;
 if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1];end if;


 IF p_pending_quantity IS NULL OR p_pending_quantity<1 THEN RAISE EXCEPTION 'Positive integer quantity required'; END IF;
 v_request:=jsonb_build_object('workflow','RECEIVING','identifierDisplay',v_display,'rawBarcode',coalesce(p_raw_barcode,''),
   'sessionId',btrim(coalesce(p_session_id,'')),'orderNumber',v_order,'orderName',btrim(coalesce(p_order_name,'')),
   'reason',upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),'itemCodeHint',btrim(coalesce(p_master_item_code_hint,'')),
   'itemNameHint',btrim(coalesce(p_master_item_name_hint,'')),'source',upper(btrim(coalesce(p_source,'HANDHELD'))),
   'deviceId',btrim(coalesce(p_device_id,'')),'scope',to_jsonb(v_scope),'quantity',p_pending_quantity);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||v_operation,61021));
 SELECT r.id,r.pending_quantity,r.created_at,r.status,r.receiving_capture_request,r.created_by
 INTO v_id,v_qty,v_time,v_status,v_existing_request,v_actor FROM public.pharmflow_needs_review_v2 r
 WHERE r.pharmacy_id=p_pharmacy_id AND r.operation_id=v_operation FOR UPDATE;
 IF FOUND THEN
   IF v_existing_request IS DISTINCT FROM v_request OR v_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Operation ID was already used with different capture input or owner'; END IF;
   RETURN QUERY SELECT v_id,v_qty,v_time,v_status; RETURN;
 END IF;

 if exists(select 1 from unnest(v_scope) s where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')) then raise exception 'Receiving work scope contains an unavailable Order';end if;
 begin
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers,operation_id,receiving_capture_request)
  values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,p_pending_quantity,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope,v_operation,v_request)
  returning id,pharmflow_needs_review_v2.pending_quantity,pharmflow_needs_review_v2.created_at,pharmflow_needs_review_v2.status into v_id,v_qty,v_time,v_status;

 end;
 return query select v_id,v_qty,v_time,v_status;
end;$function$;

REVOKE ALL ON FUNCTION public.create_pharmflow_needs_review_v6(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pharmflow_needs_review_v6(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[],integer) TO authenticated;

-- Quantity edits to an already captured Handheld draft must not race resolution.
CREATE FUNCTION public.set_pharmflow_needs_review_qty_v3(p_pharmacy_id uuid,p_review_id uuid,p_pending_quantity integer)
RETURNS TABLE(review_id uuid,pending_quantity integer,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_pharmacy_member(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy access required'; END IF;
 IF p_pending_quantity IS NULL OR p_pending_quantity<1 THEN RAISE EXCEPTION 'Positive integer quantity required'; END IF;
 PERFORM 1 FROM public.pharmflow_needs_review_v2 r WHERE r.id=p_review_id AND r.pharmacy_id=p_pharmacy_id AND r.workflow='RECEIVING' AND r.status='PENDING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending Receiving review required'; END IF;
 IF EXISTS(SELECT 1 FROM public.pharmflow_needs_review_resolution_intents_v1 i WHERE i.pharmacy_id=p_pharmacy_id AND i.review_id=p_review_id) THEN RAISE EXCEPTION 'Quantity is locked after a resolution request'; END IF;
 RETURN QUERY UPDATE public.pharmflow_needs_review_v2 r SET pending_quantity=p_pending_quantity,updated_at=now()
 WHERE r.id=p_review_id AND r.pharmacy_id=p_pharmacy_id RETURNING r.id,r.pending_quantity,r.updated_at;
END $$;
REVOKE ALL ON FUNCTION public.set_pharmflow_needs_review_qty_v3(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_pharmflow_needs_review_qty_v3(uuid,uuid,integer) TO authenticated;
COMMIT;
