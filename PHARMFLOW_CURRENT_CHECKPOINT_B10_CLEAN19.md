# B10 Clean19 — Canonical Sync Owner
Status: PLANNED — requires USER VERIFICATION.
Root cause: mobile GitHub upload flattened modified JS files to repo root while index continued loading the stale js/cloud-workspace.js. Browser therefore kept executing legacy 1s/3s polling. Clean19 makes the root deployment path canonical for cloud-workspace.js and cache-busts it.
