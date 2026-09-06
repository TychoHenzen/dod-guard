import type { PythonMirrorInput } from "./python-mirror-input.js";
import type { PythonMirrorOptions } from "./python-mirror-options.js";
import type { PythonMirrorPlan } from "./python-mirror-plan.js";
import { readyPlan } from "./python-mirror-plan-ready.js";
import {
  containsUnsafePythonConfiguration,
  isSafePythonMirrorFile,
  unsafePath,
} from "./python-mirror-validation.js";

const DEFAULT_OPTIONS: PythonMirrorOptions = {
  generation: 0,
  mirror_uri_root: "file:///code-explorer-mirror",
  bundled_typeshed: [],
};

export function createPythonMirrorPlan(
  configuration: Record<string, unknown>,
  files: readonly PythonMirrorInput[],
  options: PythonMirrorOptions = DEFAULT_OPTIONS,
): PythonMirrorPlan {
  if (unsafeMirrorInput(configuration, files, options))
    return {
      status: "unavailable",
      code: "unsafe_backend_mode",
    };
  const manifest = Object.freeze(
    Object.fromEntries(files.map((file) => [file.path, file.sha256])),
  );
  const mirrored = Object.freeze(
    files.map(({ path, sha256, text }) =>
      Object.freeze({ path, sha256, text }),
    ),
  );
  writeMirror(options, mirrored);
  return readyPlan(manifest, mirrored, options);
}

function unsafeMirrorInput(
  configuration: Record<string, unknown>,
  files: readonly PythonMirrorInput[],
  options: PythonMirrorOptions,
): boolean {
  return (
    containsUnsafePythonConfiguration(configuration) ||
    files.some((file) => !isSafePythonMirrorFile(file)) ||
    options.bundled_typeshed.some(unsafePath)
  );
}

function writeMirror(
  options: PythonMirrorOptions,
  files: readonly Readonly<{
    path: string;
    text: string;
  }>[],
): void {
  if (!options.filesystem) return;
  options.filesystem.writeFile("pyrightconfig.json", "{}");
  for (const file of files) options.filesystem.writeFile(file.path, file.text);
  options.filesystem.makeReadOnly();
}
