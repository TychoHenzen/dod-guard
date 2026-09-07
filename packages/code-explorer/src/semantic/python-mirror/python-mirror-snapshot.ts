import type { ProjectRoot } from "../project-root/project-root.js";
import { readProjectPythonConfiguration } from "./python-mirror-config.js";
import { collectPythonFiles } from "./python-mirror-inputs.js";
import { sha256 } from "./python-mirror-path.js";

export type PythonMirrorSnapshot = {
  configuration: Record<string, unknown>;
  inputs: readonly {
    path: string;
    text: string;
    sha256: string;
  }[];
  fingerprint: string;
};

export function snapshotPythonProject(root: ProjectRoot): PythonMirrorSnapshot {
  const configuration = readProjectPythonConfiguration(root);
  const inputs = collectPythonFiles(root).map((path) => {
    const text = root.protectedRead(path).bytes;
    return { path, text, sha256: sha256(text) };
  });
  return {
    configuration,
    inputs,
    fingerprint: sha256(
      [
        JSON.stringify(configuration),
        inputs.map((input) => `${input.path}:${input.sha256}`).join("\n"),
      ].join("\n"),
    ),
  };
}
