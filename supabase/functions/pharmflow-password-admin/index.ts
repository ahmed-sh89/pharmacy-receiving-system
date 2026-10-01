import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = "PF-";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 5 || i === 11) out += "-";
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  const caller = callerData?.user;
  if (callerError || !caller) return json({ error: "Invalid session" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "reset") {
    const { data: isOwner, error: ownerError } = await callerClient.rpc("is_system_owner");
    if (ownerError || isOwner !== true) return json({ error: "System Owner permission required" }, 403);

    const targetUserId = String(body?.target_user_id || "");
    if (!targetUserId) return json({ error: "Target user is required" }, 400);

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    if (targetError || !targetData?.user) return json({ error: "Admin account not found" }, 404);

    const password = temporaryPassword();
    const metadata = { ...(targetData.user.app_metadata || {}), pharmflow_must_change_password: true };
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password, app_metadata: metadata });
    if (updateError) return json({ error: updateError.message }, 400);

    return json({ temporary_password: password });
  }

  if (action === "complete") {
    const password = String(body?.new_password || "");
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const metadata = { ...(caller.app_metadata || {}), pharmflow_must_change_password: false };
    const { error: updateError } = await admin.auth.admin.updateUserById(caller.id, { password, app_metadata: metadata });
    if (updateError) return json({ error: updateError.message }, 400);

    return json({ success: true });
  }

  return json({ error: "Invalid action" }, 400);
});
