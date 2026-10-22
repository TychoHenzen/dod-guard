import { rootEntrypoints } from "./environment-entrypoints.mjs";

const SUPPORTED_ROOT_EVIDENCE =
  "package.json, Cargo.toml, pyproject.toml, " + ".sln, or .csproj";

function finding(input) {
  const { file, rule, severity, message } = input;
  return { file, line: 1, rule, severity, message, metric: 1 };
}

export function resolveEntrypoints(root) {
  return rootEntrypoints(root)[0] ?? null;
}

export function checkEnvironment(root, config) {
  const manifests = rootEntrypoints(root);
  if (manifests.length === 0) {
    const reason =
      "no supported root entry point declaration found; inspected " +
      SUPPORTED_ROOT_EVIDENCE;
    return [
      ["build-entrypoint", "E1", "build"],
      ["test-entrypoint", "E2", "test"],
    ].map(([rule, prefix, kind]) =>
      finding({
        file: "<repository root>",
        rule,
        severity: config.presence[rule],
        message:
          `${prefix}: ${reason} - add one documented root ` +
          `${kind} entry point`,
      }),
    );
  }
  return manifests.flatMap((manifest) => {
    const found = [];
    const reason =
      manifest.reason || `no declared ${manifest.file} entry point`;
    const missing = (rule, prefix, kind) =>
      finding({
        file: manifest.file,
        rule,
        severity: config.presence[rule],
        message: `${prefix}: ${reason} - add one root ${kind} entry point`,
      });
    if (manifest.build === null) {
      found.push(missing("build-entrypoint", "E1", "build"));
    }
    if (manifest.test === null) {
      found.push(missing("test-entrypoint", "E2", "test"));
    }
    return found;
  });
}
