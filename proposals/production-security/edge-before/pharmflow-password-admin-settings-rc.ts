import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const temporaryPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `Pf!${Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("")}`;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Server configuration error" }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  const caller = callerData.user;
  if (callerError || !caller) return json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  if (body.action === "reset") {
    const { data: isOwner, error: ownerError } = await callerClient.rpc("is_system_owner");
    if (ownerError || isOwner !== true) return json({ error: "System Owner permission required" }, 403);

    const targetUserId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";
    if (!targetUserId) return json({ error: "Target user is required" }, 400);

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    const target = targetData.user;
    if (targetError || !target) return json({ error: "Target user not found" }, 404);

    const password = temporaryPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
      password,
      app_metadata: { ...target.app_metadata, pharmflow_must_change_password: true },
    });
    if (updateError) return json({ error: "Unable to reset password" }, 500);

    return json({ temporary_password: password });
  }

  if (body.action === "complete") {
    if (caller.app_metadata?.pharmflow_must_change_password !== true) {
      return json({ error: "Temporary password change is not required" }, 403);
    }
    const newPassword = typeof body.new_password === "string" ? body.new_password : "";
    if (newPassword.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { error: updateError } = await admin.auth.admin.updateUserById(caller.id, {
      password: newPassword,
      app_metadata: { ...caller.app_metadata, pharmflow_must_change_password: false },
    });
    if (updateError) return json({ error: "Unable to update password" }, 500);
    return json({ success: true });
  }

  return json({ error: "Unsupported password operation" }, 400);
});
