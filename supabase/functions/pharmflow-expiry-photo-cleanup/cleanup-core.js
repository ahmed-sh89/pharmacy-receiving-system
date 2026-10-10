export const REQUEST_TIMEOUT_MS = 10_000;
export const INVOCATION_BUDGET_MS = 110_000;
export const MAX_BATCH = 4;

export function validCleanupJob(job) {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const path = new RegExp("^(" + uuid + ")/expiry-v1/(" + uuid + ")/(product|expiry)/(" + uuid + ")\\.(jpg|png|webp)$", "i");
  const match = path.exec(job?.object_path ?? "");
  return !!match &&
    match[1].toLowerCase() === job.pharmacy_id?.toLowerCase() &&
    match[2].toLowerCase() === job.operation_id?.toLowerCase() &&
    !!job.claim_token && !!job.job_id;
}

export function fetchWithTimeout(input, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export async function processCleanupJobs(jobs, {
  deleteObject,
  complete,
  fail,
  now = () => Date.now(),
  startedAt = now(),
  budgetMs = INVOCATION_BUDGET_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  maxBatch = MAX_BATCH,
}) {
  let completed = 0;
  let failed = 0;
  let claimLost = 0;
  let deferred = 0;
  const batch = Array.isArray(jobs) ? jobs.slice(0, maxBatch) : [];
  if (Array.isArray(jobs) && jobs.length > batch.length) deferred += jobs.length - batch.length;

  for (let index = 0; index < batch.length; index++) {
    const job = batch[index];
    if (now() - startedAt + 2 * requestTimeoutMs + 1_000 > budgetMs) {
      deferred += batch.length - index;
      break;
    }

    if (!validCleanupJob(job)) {
      try {
        if (await fail(job, "invalid_job_scope")) failed++;
        else claimLost++;
      } catch (_) {
        failed++;
      }
      continue;
    }

    let response = null;
    try {
      response = await deleteObject(job);
      if (response.ok || response.status === 404) {
        if (await complete(job)) completed++;
        else claimLost++;
        continue;
      }
    } catch (_) {
      // The binary may have been removed while its response was lost.
      // A later 404 is an idempotent success.
    }

    try {
      if (await fail(job, response ? "storage_" + response.status : "storage_unavailable")) failed++;
      else claimLost++;
    } catch (_) {
      // The durable lease expires and a later claim receives a fresh token.
      failed++;
    }
  }

  return {
    claimed: batch.length,
    completed,
    failed,
    claim_lost: claimLost,
    deferred,
    success: failed === 0 && claimLost === 0 && deferred === 0,
  };
}
