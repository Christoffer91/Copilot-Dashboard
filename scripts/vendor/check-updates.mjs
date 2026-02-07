import { readFile } from "node:fs/promises";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function isNpmEntry(entry) {
  return entry && entry.source === "npm" && typeof entry.package === "string" && typeof entry.version === "string";
}

async function main() {
  const lock = JSON.parse(await readFile("vendor-lock.json", "utf8"));
  const entries = Array.isArray(lock?.entries) ? lock.entries : [];
  const npmEntries = entries.filter(isNpmEntry);

  const updates = [];
  for (const entry of npmEntries) {
    const pkg = entry.package;
    const current = entry.version;
    const data = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
    const latest = data?.["dist-tags"]?.latest;
    if (typeof latest === "string" && latest && latest !== current) {
      updates.push({ package: pkg, current, latest, path: entry.path });
    }
  }

  if (!updates.length) {
    console.log("No vendor updates found (npm dist-tag latest).");
    return;
  }

  console.log("Vendor updates available:");
  for (const u of updates) {
    console.log(`- ${u.package}: ${u.current} -> ${u.latest} (${u.path})`);
  }

  // Exit non-zero so CI can flag it.
  process.exit(2);
}

await main();

