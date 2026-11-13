import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !serviceKey) return json({ error: "Sign in is unavailable." }, 503);

  const input = await request.json().catch(() => null);
  const code = typeof input?.code === "string" ? input.code.trim().toUpperCase() : "";
  const password = input?.password;
  const invalid = { error: "Invalid sign-in ID or password." };
  if (!/^[A-Z0-9_-]{3,24}$/.test(code) || typeof password !== "string" || !password || password.length > 1024) {
    return json(invalid, 400);
  }

  const auth = { persistSession: false, autoRefreshToken: false };
  const { data: email, error: lookupError } = await createClient(url, serviceKey, { auth })
    .rpc("pharmflow_admin_email_for_code_v1", { p_code: code });
  if (lookupError) return json({ error: "Sign in is unavailable." }, 503);

  // Use the same Auth grant for unknown codes so failures have the same
  // response and go through the provider's authentication rate limit.
  const { data, error } = await createClient(url, publicKey, { auth }).auth.signInWithPassword({
    email: email || "pharmflow-no-code-match@example.invalid",
    password,
  });
  if (error?.status === 429) return json({ error: "Too many sign-in attempts. Try again later." }, 429);
  if (!email || error || !data.session) return json(invalid, 400);
  return json(data.session, 200);
});
