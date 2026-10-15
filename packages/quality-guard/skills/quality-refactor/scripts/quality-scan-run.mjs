import { resolve } from "node:path";
import { resultFor, writeResult } from "./quality-scan-output.mjs";
import { sortViolations, summarize } from "./lib/report.mjs";
import { createWidthResolver } from "./lib/formatter-width.mjs";
import { scanFile } from "./lib/rules-file.mjs";
import {
  checkDuplication,
  checkCommentReferences,
  checkEnvironment,
  checkReachability,
  checkWildcardImports,
} from "./lib/rules-project.mjs";
import { collectManifests } from "./lib/manifests.mjs";
import { collectFiles, loadFiles } from "./lib/walk.mjs";

// The width resolver is built per scan, so a Biome config fixed between runs
// is read fresh on the next one.
function scanEachFile(files, config, root) {
  const widthFor = createWidthResolver(root);
  const scans = new Map();
  let violations = [];
  for (const file of files) {
    const result = scanFile(file, config, widthFor);
    scans.set(file.rel, result);
    violations = violations.concat(result.violations);
  }
  return { scans, violations };
}

export function scan(options, config) {
  const { root } = options;
  const targets = options.paths.map((path) => resolve(root, path));
  const files = loadFiles(
    collectFiles(targets, root, options.excludes),
    options.testPaths,
  );
  // Collect manifests from the repository root because a narrowed source
  // target must still see scenes and project files that reference its
  // exported types.
  const manifests = collectManifests(root, options.excludes);
  const perFile = scanEachFile(files, config, root);
  const scans = perFile.scans;
  let violations = perFile.violations.concat(
    checkReachability({ files, scans, config, manifests }),
  );
  violations = violations.concat(
    checkWildcardImports({ files, scans, config }),
  );
  violations = violations.concat(
    checkCommentReferences({ root, files, scans, config }),
  );
  violations = violations.concat(checkDuplication(files, config));
  violations = violations.concat(checkEnvironment(root, config));
  if (options.rules)
    violations = violations.filter((violation) =>
      options.rules.includes(violation.rule),
    );
  return { files, violations };
}
export function run(options, config) {
  const { files, violations } = scan(options, config);
  const sorted = sortViolations(violations);
  const summary = summarize(sorted);
  const result = resultFor({
    options,
    files,
    sorted,
    summary,
  });
  writeResult(options, result);
  return 0;
}
