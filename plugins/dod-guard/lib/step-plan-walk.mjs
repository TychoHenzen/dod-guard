// Lists the files a proxy check scope covers. A scope that leaves the checkout, a symlink, and an entry that
// cannot be read are reported as problems instead of thrown, so the refinement proof always gets an outcome.
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

// Directories that hold installed, generated, or report output rather than source a plan edits.
const SKIPPED = new Set([".git", "node_modules", "dist", ".quality", "coverage"]);

// Plan authors write "lib/", "./lib" or "lib\\x"; the File lines name files as "lib/x", so hits must match.
function normalizeScope(scope) {
  return path.posix.normalize(scope.replaceAll("\\", "/")).replace(/(.)\/+$/u, "$1");
}

function escapesRoot(root, scope) {
  if (scope === ".." || scope.startsWith("../") || path.posix.isAbsolute(scope) || path.win32.isAbsolute(scope)) {
    return true;
  }
  try {
    const inside = path.relative(realpathSync(root), realpathSync(path.join(root, scope)));
    return inside.startsWith("..") || path.isAbsolute(inside);
  } catch {
    return false;
  }
}

function walk(root, relative, out) {
  let entries;
  try {
    entries = readdirSync(path.join(root, relative), { withFileTypes: true });
  } catch (error) {
    out.problems.push(`cannot read directory ${relative || "."}: ${error.code ?? error.message}`);
    return;
  }
  for (const entry of entries) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (SKIPPED.has(entry.name)) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      out.problems.push(`${child} is a symlink and was not searched`);
    } else if (entry.isDirectory()) {
      walk(root, child, out);
    } else {
      out.files.push(child);
    }
  }
}

function filesUnder(root, rawScope) {
  const scope = normalizeScope(rawScope);
  const out = { scope, files: [], problems: [] };
  if (escapesRoot(root, scope)) {
    out.problems.push(`scope ${rawScope} resolves outside the checkout root`);
    return out;
  }
  let stat;
  try {
    stat = lstatSync(path.join(root, scope));
  } catch {
    return out;
  }
  if (stat.isSymbolicLink()) {
    out.problems.push(`scope ${scope} is a symlink and was not searched`);
  } else if (stat.isFile()) {
    out.files.push(scope);
  } else {
    walk(root, scope === "." ? "" : scope, out);
  }
  return out;
}

export { filesUnder };
