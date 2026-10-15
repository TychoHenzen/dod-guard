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

/**
 * Turn `git diff --name-status -M` output into `{ path, basePath }` rows. `basePath` is where the file lived
 * at the merge base: the old name for a rename or copy, the same path for a modification, null for an added file.
 */
export function parseNameStatus(output) {
  const files = [];
  for (const line of output.split("\n")) {
    const [status, first, second] = line.trim().split("\t");
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) files.push({ path: second, basePath: first });
    else if (status.startsWith("A")) files.push({ path: first, basePath: null });
    else files.push({ path: first, basePath: first });
  }
  return files.map(({ path, basePath }) => ({
    path: normalizePath(path),
    basePath: basePath === null ? null : normalizePath(basePath),
  }));
}
