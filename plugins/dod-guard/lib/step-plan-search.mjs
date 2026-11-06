// Runs the proxy checks of parsed step plans over a checkout. Reading files is the only side effect.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Directories that hold installed, generated, or report output rather than source a plan edits.
const SKIPPED = new Set([".git", "node_modules", "dist", ".quality", "coverage"]);

function childPath(relative, name) {
  if (relative === "") {
    return name;
  }
  return `${relative}/${name}`;
}

function walk(root, relative) {
  const found = [];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (!SKIPPED.has(entry.name)) {
      const child = childPath(relative, entry.name);
      found.push(...(entry.isDirectory() ? walk(root, child) : [child]));
    }
  }
  return found;
}

function filesUnder(root, scope) {
  const start = path.join(root, scope);
  if (!existsSync(start)) {
    return [];
  }
  if (statSync(start).isFile()) {
    return [scope];
  }
  return walk(root, scope === "." ? "" : scope);
}

function searchOne(proxy, root) {
  const regex = new RegExp(proxy.pattern, "mu");
  const files = filesUnder(root, proxy.scope);
  // Sorted because directory order differs between file systems and the hits are compared as a list.
  const hits = files.filter((file) => regex.test(readFileSync(path.join(root, file), "utf8"))).sort();
  return { searched: files.length, hits };
}

function searchPlans(plans, root) {
  return plans.map((plan) => ({
    ...plan,
    proxies: plan.proxies.map((proxy) => ({ ...proxy, result: searchOne(proxy, root) })),
  }));
}

export { searchPlans };
