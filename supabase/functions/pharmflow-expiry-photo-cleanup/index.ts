import {
  MAX_BATCH,
  fetchWithTimeout,
  processCleanupJobs,
  REQUEST_TIMEOUT_MS,
} from "./cleanup-core.js";

const STORAGE_BUCKET = "pharmflow-needs-review";

type CleanupJob = {
  job_id: string;
  pharmacy_id: string;
  review_id: string;
  operation_id: string;
  object_path: string;
  attempts: number;
  claim_token: string;
};

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronToken = Deno.env.get("EXPIRY_CLEANUP_CRON_TOKEN");

function authorizedCron(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  return !!cronToken && !!bearer && constantTimeEqual(bearer, cronToken);
}

async function serviceRequest(path: string, init: RequestInit = {}) {
  if (!base || !serviceKey) throw new Error("cleanup_worker_not_configured");
  return await fetchWithTimeout(base + path, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
  }, REQUEST_TIMEOUT_MS);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await serviceRequest("/rest/v1/rpc/" + name, {
    method: "POST",
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error("cleanup_rpc_" + response.status);
  return await response.json();
}

async function fail(job: CleanupJob, errorCode: string) {
  return await rpc<boolean>("fail_photo_cleanup_job", {
    p_job_id: job.job_id,
    p_claim_token: job.claim_token,
    p_error_code: errorCode,
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });

  try {
    const jobs = await rpc<CleanupJob[]>("claim_photo_cleanup_jobs", { p_limit: MAX_BATCH });
    const result = await processCleanupJobs(jobs, {
      deleteObject: async (job: CleanupJob) => {
        const encodedPath = job.object_path.split("/").map(encodeURIComponent).join("/");
        return await serviceRequest(
          "/storage/v1/object/" + STORAGE_BUCKET + "/" + encodedPath,
          { method: "DELETE" },
        );
      },
      complete: (job: CleanupJob) => rpc<boolean>("complete_photo_cleanup_job", {
        p_job_id: job.job_id,
        p_object_path: job.object_path,
        p_claim_token: job.claim_token,
      }),
      fail: (job: CleanupJob, errorCode: string) => fail(job, errorCode),
    });
    return Response.json(
      result,
      { status: result.success ? 200 : 503 },
    );
  } catch (_) {
    // Claimed jobs remain durable and become eligible after their leases expire.
    return Response.json({ success: false, error: "cleanup_worker_unavailable" }, { status: 503 });
  }
});
