import type { AdapterSelectionEvidence } from "./adapter-selection-evidence.js";
import type { AdapterSelectionRecord } from "./adapter-selection-record.js";

export function arraysEqual<T>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function versionProbeMatches(
  backend: AdapterSelectionRecord["runtime_backends"][number],
  run: AdapterSelectionEvidence["sentinel_runs"]["rust"],
): boolean {
  return (
    versionProbesEqual(
      backend.authorization.version_probe,
      run.version_probe,
    ) &&
    backend.authorization.version_probe.executable === run.executable &&
    arraysEqual(
      backend.authorization.version_probe.entrypoints,
      run.entrypoints,
    )
  );
}

function versionProbesEqual(
  left: AdapterSelectionRecord["runtime_backends"][number]["authorization"]["version_probe"],
  right: AdapterSelectionEvidence["sentinel_runs"]["rust"]["version_probe"],
): boolean {
  return [
    left.method === right.method,
    left.command_root === right.command_root,
    left.executable === right.executable,
    arraysEqual(left.entrypoints, right.entrypoints),
    arraysEqual(left.arguments, right.arguments),
    left.command_template === right.command_template,
  ].every(Boolean);
}
