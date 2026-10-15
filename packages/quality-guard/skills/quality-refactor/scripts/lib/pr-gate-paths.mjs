// Path handling for the pull-request gate: normalizing scanner and git paths, skipping generated output,
// and reading `git diff --name-status` rows.

// The scanner's --exclude does not remove generated output, so the gate filters these paths itself.
export const GENERATED_PATHS = ["/dist/", "/dist-test/", "/node_modules/"];

export function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isGenerated(path, excludes = GENERATED_PATHS) {
  const normalized = `/${normalizePath(path)}`;
  return excludes.some((fragment) => normalized.includes(fragment));
}

// Where the file lived at the merge base: the old name for a rename or copy, null for an added file.
function toRow(line) {
  const [status, first, second] = line.split("\t");
  if (status.startsWith("R") || status.startsWith("C")) return { path: second, basePath: first };
  if (status.startsWith("A")) return { path: first, basePath: null };
  return { path: first, basePath: first };
}

const normalizeRow = ({ path, basePath }) => ({
  path: normalizePath(path),
  basePath: basePath === null ? null : normalizePath(basePath),
});

// Where a root that did not exist at the merge base used to live, read from the old paths of the files renamed into it.
function renamedFrom(root, files) {
  const prefix = `${normalizePath(root).replace(/\/$/, "")}/`;
  const depth = prefix.split("/").length - 1;
  return files
    .filter((file) => file.basePath && file.path.startsWith(prefix) && !file.basePath.startsWith(prefix))
    .map((file) => file.basePath.split("/").slice(0, depth).join("/"));
}

/**
 * The roots to scan at the merge base. A root that exists there is scanned as is; one that does not (the pull request
 * renamed the source directory) is scanned through the old directories its files came from, so their findings still
 * count as pre-existing instead of new.
 */
export function baseRoots(roots, files, existsAtBase) {
  const found = roots.flatMap((root) => (existsAtBase(root) ? [root] : renamedFrom(root, files)));
  return [...new Set(found)];
}

/** Turn `git diff --name-status -M` output into `{ path, basePath }` rows. */
export function parseNameStatus(output) {
  const lines = output.split("\n").map((line) => line.trim());
  return lines.filter(Boolean).map(toRow).map(normalizeRow);
}
