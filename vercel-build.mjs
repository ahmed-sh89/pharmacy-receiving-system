import fs from "node:fs";
import path from "node:path";

const out = "dist";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of fs.readdirSync(".", { withFileTypes: true })) {
  const name = entry.name;
  if ([".git", ".github", "node_modules", "dist", "tests", "sql", "vercel-build.mjs", "vercel.json"].includes(name)) continue;
  const src = path.join(".", name);
  const dest = path.join(out, name);
  if (entry.isDirectory()) fs.cpSync(src, dest, { recursive: true });
  else fs.copyFileSync(src, dest);
}
