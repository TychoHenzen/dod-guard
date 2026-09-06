import type { PythonMirrorOptions } from "./python-mirror-options.js";
import type { PythonMirrorPlan } from "./python-mirror-plan.js";
import { uriToMirrorPath } from "./python-mirror-validation.js";

export function readyPlan(
  manifest: Readonly<Record<string, string>>,
  files: readonly Readonly<{
    path: string;
    sha256: string;
    text: string;
  }>[],
  options: PythonMirrorOptions,
): PythonMirrorPlan {
  return {
    status: "ready",
    manifest,
    files,
    generation: options.generation,
    minimal_pyrightconfig: Object.freeze({}),
    bundled_typeshed: Object.freeze([...options.bundled_typeshed]),
    resolveUri: (uri, generation, sha256) =>
      resolvePlanUri({ uri, generation, sha256, options, manifest }),
    onProjectConfigurationChanged: projectConfigurationChanged,
  };
}

function resolvePlanUri(input: {
  uri: string;
  generation: number;
  sha256: string;
  options: PythonMirrorOptions;
  manifest: Readonly<Record<string, string>>;
}) {
  const path = uriToMirrorPath(input.uri, input.options.mirror_uri_root);
  return path &&
    input.generation === input.options.generation &&
    input.manifest[path] === input.sha256
    ? { status: "accepted" as const, original_path: path }
    : {
        status: "rejected" as const,
        code: "unsafe_backend_mode" as const,
      };
}

function projectConfigurationChanged() {
  return {
    status: "rebuild_required" as const,
    terminate_old_backend: true as const,
  };
}
