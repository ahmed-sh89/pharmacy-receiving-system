-- Read-only V2 compatibility projection for the numeric GTIN cache.
-- Full identifier recognition/search remains exclusively IdentifierService V2.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION public.get_pharmflow_master_cache_meta_v2()
RETURNS TABLE(version text,source_file text,item_count bigint,global_item_count bigint,identifier_count bigint,updated_at timestamptz,api_version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_items bigint;v_ids bigint;v_numeric bigint;v_updated timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required';END IF;
 SELECT count(*),max(g.updated_at) INTO v_items,v_updated FROM public.pharmflow_global_items_v2 g;
 SELECT count(*),count(*) FILTER(WHERE i.identifier_display ~ '^[0-9]+$'),greatest(v_updated,max(i.updated_at)) INTO v_ids,v_numeric,v_updated FROM public.pharmflow_global_item_identifiers_v2 i;
 RETURN QUERY SELECT 'GLOBAL_V2:'||v_items||':'||v_ids||':'||coalesce(v_updated::text,''),'Global Master V2'::text,v_numeric,v_items,v_ids,v_updated,2;
END $$;
REVOKE ALL ON FUNCTION public.get_pharmflow_master_cache_meta_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_master_cache_meta_v2() TO authenticated;
CREATE FUNCTION public.get_pharmflow_master_cache_page_v2(p_offset integer DEFAULT 0,p_limit integer DEFAULT 1000)
RETURNS TABLE(item_code text,gtin text,item_name text,group_name text,category text,sub_category text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required';END IF;
 RETURN QUERY SELECT g.item_code,i.identifier_display,g.item_name,g.group_name,g.category,g.sub_category
 FROM public.pharmflow_global_item_identifiers_v2 i JOIN public.pharmflow_global_items_v2 g ON g.item_code=i.item_code
 WHERE i.identifier_display ~ '^[0-9]+$' ORDER BY i.identifier_key,i.id
 OFFSET greatest(coalesce(p_offset,0),0) LIMIT least(greatest(coalesce(p_limit,1000),1),2000);
END $$;
REVOKE ALL ON FUNCTION public.get_pharmflow_master_cache_page_v2(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_master_cache_page_v2(integer,integer) TO authenticated;
COMMIT;
