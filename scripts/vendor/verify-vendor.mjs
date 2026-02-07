import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const lockPath = path.join(repoRoot, "vendor-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const entries = Array.isArray(lock?.entries) ? lock.entries : [];
  if (!entries.length) {
    throw new Error("vendor-lock.json has no entries");
  }

  const problems = [];
  for (const entry of entries) {
    const relPath = entry?.path;
    if (typeof relPath !== "string" || !relPath.length) {
      problems.push(`Invalid entry path: ${JSON.stringify(entry)}`);
      continue;
    }
    const fullPath = path.join(repoRoot, relPath);
    let bytes;
    try {
      bytes = await readFile(fullPath);
    } catch (err) {
      problems.push(`${relPath}: missing (${err?.code || err?.message || "read error"})`);
      continue;
    }
    const actualSize = bytes.length;
    const actualSha = sha256(bytes);
    const expectedSize = entry?.bytes;
    const expectedSha = entry?.sha256;
    if (typeof expectedSize === "number" && actualSize !== expectedSize) {
      problems.push(`${relPath}: size mismatch (expected ${expectedSize}, got ${actualSize})`);
    }
    if (typeof expectedSha === "string" && actualSha !== expectedSha) {
      problems.push(`${relPath}: sha256 mismatch (expected ${expectedSha}, got ${actualSha})`);
    }
  }

  if (problems.length) {
    console.error("Vendor verification failed:");
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }

  console.log(`Vendor verification OK (${entries.length} files).`);
}

await main();

