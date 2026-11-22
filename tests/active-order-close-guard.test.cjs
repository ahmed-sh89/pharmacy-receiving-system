const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("active order close checks the version, keeps other orders, and fences legacy clears", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    try {
        await db.exec(`
            CREATE ROLE anon;
            CREATE ROLE authenticated;
            CREATE SCHEMA pharmflow_auth_private;
            CREATE FUNCTION pharmflow_auth_private.require_access(uuid, text, boolean, text, text)
            RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;
            CREATE FUNCTION pharmflow_auth_private.require_receiving_compat(uuid, text, boolean, text)
            RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;
            CREATE FUNCTION public.pharmflow_manifest_member_v2(uuid)
            RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
            CREATE TABLE public.pharmflow_workspace_generation_v1 (
                pharmacy_id uuid PRIMARY KEY, generation bigint
            );
            CREATE TABLE public.pharmflow_active_order_manifest_v1 (
                pharmacy_id uuid PRIMARY KEY, manifest jsonb, revision bigint,
                updated_at timestamptz, workspace_generation bigint
            );
            CREATE TABLE public.pharmflow_orders (
                pharmacy_id uuid, order_number text, status text, received_at timestamptz
            );
            CREATE FUNCTION public.save_pharmflow_active_order_manifest_v4(uuid, jsonb, bigint, bigint)
            RETURNS void LANGUAGE sql AS $$
                UPDATE public.pharmflow_active_order_manifest_v1
                SET manifest=$2, revision=revision+1, updated_at=clock_timestamp()
                WHERE pharmacy_id=$1
            $$;
        `);
        await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261122223000_guard_active_order_close.sql"), "utf8"));

        const pharmacy = "00000000-0000-0000-0000-000000000084";
        const fileA = { id:"file-a", documentId:"TO-000555322" };
        const fileB = { id:"file-b", documentId:"TO-000555528" };
        const timestamp = "2026-11-22T04:13:57.123456Z";
        const manifest = { orderFiles:[fileA,fileB], orderData:[{itemCode:"123"}] };
        await db.query("INSERT INTO pharmflow_workspace_generation_v1 VALUES ($1, 45)", [pharmacy]);
        await db.query(
            "INSERT INTO pharmflow_active_order_manifest_v1 VALUES ($1, $2::jsonb, 19, $3, 45)",
            [pharmacy, JSON.stringify(manifest), timestamp]
        );
        await db.query("INSERT INTO pharmflow_orders VALUES ($1, $2, 'uploaded', NULL)", [pharmacy, fileB.documentId]);

        const close = (file, generation, revision, updatedAt, next) =>
            db.query("SELECT close_pharmflow_active_order_v1($1,$2,$3,$4,$5,$6,$7) AS closed",
                [pharmacy,file.id,file.documentId,generation,revision,updatedAt,next===null?null:JSON.stringify(next)]);
        const current = async () => (await db.query(
            "SELECT manifest, revision::int, updated_at::text FROM pharmflow_active_order_manifest_v1 WHERE pharmacy_id=$1", [pharmacy]
        )).rows[0];
        const legacyClear = () => db.query("SELECT clear_pharmflow_active_order_manifest_v2($1) AS cleared", [pharmacy]);

        await assert.rejects(close(fileA, 45, 18, timestamp, null), /STALE_ACTIVE_ORDER_CLOSE/);
        await assert.rejects(close(fileA, 44, 19, timestamp, null), /STALE_ACTIVE_ORDER_CLOSE/);
        await assert.rejects(close(fileA, 45, 19, "2026-11-21T04:13:57Z", null), /STALE_ACTIVE_ORDER_CLOSE/);
        await assert.rejects(close({...fileA,documentId:fileB.documentId}, 45, 19, timestamp, null), /STALE_ACTIVE_ORDER_CLOSE/);
        await assert.rejects(close(fileA, 45, 19, timestamp, null), /ACTIVE_ORDER_CLOSE_INVALID_REMAINDER/);
        await assert.rejects(legacyClear(), /ACTIVE_ORDERS_CHANGED_REFRESH_REQUIRED/);
        assert.deepEqual((await current()).manifest, manifest);

        const next = { ...manifest, orderFiles:[fileB] };
        assert.equal((await close(fileA, 45, 19, timestamp, next)).rows[0].closed, true);
        let row = await current();
        assert.deepEqual(row.manifest, next);
        assert.equal(row.revision, 20);
        await assert.rejects(close(fileB, 45, 19, timestamp, null), /STALE_ACTIVE_ORDER_CLOSE/);
        assert.equal((await close(fileB, 45, row.revision, row.updated_at, null)).rows[0].closed, true);
        assert.equal(await current(), undefined);

        await db.query("INSERT INTO pharmflow_active_order_manifest_v1 VALUES ($1, $2::jsonb, 1, $3, 45)",
            [pharmacy, JSON.stringify(next), timestamp]);
        await assert.rejects(legacyClear(), /ACTIVE_ORDERS_CHANGED_REFRESH_REQUIRED/);
        await db.query("UPDATE pharmflow_orders SET status='received',received_at=now() WHERE pharmacy_id=$1", [pharmacy]);
        assert.equal((await legacyClear()).rows[0].cleared, true);
        assert.equal(await current(), undefined);
        assert.equal((await legacyClear()).rows[0].cleared, true);
    } finally {
        await db.close();
    }
});
