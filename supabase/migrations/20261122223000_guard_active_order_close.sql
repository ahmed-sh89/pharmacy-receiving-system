CREATE FUNCTION public.close_pharmflow_active_order_v1(
    p_pharmacy_id uuid,
    p_file_id text,
    p_order_number text,
    p_expected_generation bigint,
    p_expected_revision bigint,
    p_expected_updated_at timestamptz,
    p_manifest jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_generation bigint;
    v_current public.pharmflow_active_order_manifest_v1%ROWTYPE;
    v_remaining_files jsonb;
    v_target_count integer;
BEGIN
    PERFORM pharmflow_auth_private.require_access(
        p_pharmacy_id, 'RECEIVING', true, 'close_pharmflow_active_order_v1', NULL
    );
    IF NOT public.pharmflow_manifest_member_v2(p_pharmacy_id) THEN
        RAISE EXCEPTION 'Pharmacy access required';
    END IF;

    SELECT g.generation INTO v_generation
      FROM public.pharmflow_workspace_generation_v1 g
     WHERE g.pharmacy_id = p_pharmacy_id
       FOR UPDATE;

    SELECT m.* INTO v_current
      FROM public.pharmflow_active_order_manifest_v1 m
     WHERE m.pharmacy_id = p_pharmacy_id
       FOR UPDATE;

    IF NOT FOUND
       OR v_generation IS DISTINCT FROM p_expected_generation
       OR v_current.workspace_generation IS DISTINCT FROM p_expected_generation
       OR v_current.revision IS DISTINCT FROM p_expected_revision
       OR v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
        RAISE EXCEPTION 'STALE_ACTIVE_ORDER_CLOSE';
    END IF;

    SELECT count(*) FILTER (WHERE f.value->>'id' = p_file_id
                   AND upper(regexp_replace(coalesce(nullif(f.value->>'documentId',''),
                       f.value->>'orderNumber', ''), '\s', '', 'g')) = p_order_number),
           coalesce(jsonb_agg(f.value ORDER BY f.ordinality)
               FILTER (WHERE f.value->>'id' IS DISTINCT FROM p_file_id), '[]'::jsonb)
      INTO v_target_count, v_remaining_files
      FROM jsonb_array_elements(v_current.manifest->'orderFiles') WITH ORDINALITY AS f;

    IF v_target_count <> 1 OR p_order_number IS NULL OR p_order_number = '' THEN
        RAISE EXCEPTION 'STALE_ACTIVE_ORDER_CLOSE';
    END IF;

    IF v_remaining_files = '[]'::jsonb AND p_manifest IS NULL THEN
        DELETE FROM public.pharmflow_active_order_manifest_v1
         WHERE pharmacy_id = p_pharmacy_id;
    ELSIF v_remaining_files <> '[]'::jsonb
          AND p_manifest->'orderFiles' = v_remaining_files THEN
        PERFORM public.save_pharmflow_active_order_manifest_v4(
            p_pharmacy_id, p_manifest, p_expected_generation, p_expected_revision
        );
    ELSE
        RAISE EXCEPTION 'ACTIVE_ORDER_CLOSE_INVALID_REMAINDER';
    END IF;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.close_pharmflow_active_order_v1(
    uuid, text, text, bigint, bigint, timestamptz, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.close_pharmflow_active_order_v1(
    uuid, text, text, bigint, bigint, timestamptz, jsonb
) TO authenticated;

-- The old endpoint is still used after Receive Order and Receive All.
-- It may clear a manifest only when each active order was already finalized.
CREATE OR REPLACE FUNCTION public.clear_pharmflow_active_order_manifest_v2(p_pharmacy_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_manifest jsonb;
BEGIN
    PERFORM pharmflow_auth_private.require_receiving_compat(
        p_pharmacy_id, 'RECEIVING', true, 'clear_pharmflow_active_order_manifest_v2'
    );
    IF NOT public.pharmflow_manifest_member_v2(p_pharmacy_id) THEN
        RAISE EXCEPTION 'Pharmacy access required';
    END IF;

    PERFORM 1 FROM public.pharmflow_workspace_generation_v1
     WHERE pharmacy_id = p_pharmacy_id FOR UPDATE;

    SELECT m.manifest INTO v_manifest
      FROM public.pharmflow_active_order_manifest_v1 m
     WHERE m.pharmacy_id = p_pharmacy_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN true;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_manifest->'orderFiles') AS f(value)
        WHERE NOT EXISTS (
            SELECT 1
              FROM public.pharmflow_orders o
             WHERE o.pharmacy_id = p_pharmacy_id
               AND o.order_number = upper(regexp_replace(coalesce(
                   nullif(f.value->>'documentId',''), f.value->>'orderNumber', ''
               ), '\s', '', 'g'))
               AND o.status = 'received'
               AND o.received_at IS NOT NULL
        )
    ) THEN
        RAISE EXCEPTION 'ACTIVE_ORDERS_CHANGED_REFRESH_REQUIRED';
    END IF;

    DELETE FROM public.pharmflow_active_order_manifest_v1
     WHERE pharmacy_id = p_pharmacy_id;
    RETURN true;
END;
$$;
