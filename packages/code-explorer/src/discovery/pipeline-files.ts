import type { ProjectRoot } from "../semantic/api/public-api.js";
import {
  type ClassificationConfig,
  classifyProjectPath,
} from "./classification.js";
import {
  collectSourceFiles,
  hasGeneratedHeader,
} from "./source-file-collector.js";

export function collectPipelineFiles(
  root: ProjectRoot,
  config: ClassificationConfig,
) {
  return collectSourceFiles(root).map((path) => ({
    type: "file" as const,
    path,
    identity: `file:${path}`,
    classification: classifyProjectPath(
      path,
      config,
      hasGeneratedHeader(root, path),
    ),
  }));
}
