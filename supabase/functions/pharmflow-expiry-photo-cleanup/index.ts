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
  review_id: string | null;
  operation_id: string | null;
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
      ...(init.body == null ? {} : { "Content-Type": "application/json" }),
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
        const removed = await serviceRequest("/storage/v1/object/" + STORAGE_BUCKET, {
          method: "DELETE",
          body: JSON.stringify({ prefixes: [job.object_path] }),
        });
        if (!removed.ok && removed.status !== 404) {
          const detail = await removed.clone().json().catch(() => ({}));
          console.warn(JSON.stringify({ event: "expiry_photo_delete_failed", job_id: job.job_id,
            status: removed.status, code: String(detail.code ?? detail.error ?? "unknown").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 80) }));
          return removed;
        }
        // Do not acknowledge a queue job on metadata mutation alone.
        const read = await serviceRequest("/storage/v1/object/authenticated/" + STORAGE_BUCKET + "/" + encodedPath, {
          method: "GET", headers: { "Cache-Control": "no-cache, no-store", Range: "bytes=0-0" },
        });
        let absent = read.status === 404;
        let readCode = "";
        if (!absent && !read.ok) {
          const detail = await read.json().catch(() => ({}));
          readCode = String(detail.code ?? detail.error ?? "");
          absent = read.status === 400 && String(detail.statusCode) === "404" &&
            (detail.message === "Object not found" || detail.code === "NoSuchKey");
        } else {
          await read.body?.cancel();
        }
        console.info(JSON.stringify({ event: "expiry_photo_absence_check", job_id: job.job_id,
          delete_status: removed.status, read_status: read.status, absent,
          read_code: readCode.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 80) }));
        return absent ? new Response(null, { status: 200 }) : new Response(null, { status: 409 });
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
