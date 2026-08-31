import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isClassificationConfigPath } from "../discovery/config-path.js";
import { isSensitiveProjectPath } from "../discovery/sensitive-paths.js";
import { createNativeProjectRoot, type ProjectRoot } from "./project-root.js";

export type FilteredWorkspace = {
  root: ProjectRoot<number>;
  sensitive_paths_excluded: number;
  sourcePaths(): readonly string[];
  dispose(): void;
};

/**
 * Produces the only tree a native source-reading backend receives. The source
 * root is never passed to the child, and denied names are counted but omitted.
 */
export function createFilteredWorkspace(sourceRoot: ProjectRoot): FilteredWorkspace {
  const serviceRoot = mkdtempSync(join(tmpdir(), "code-explorer-native-"));
  let excluded = 0;
  const sourcePaths: string[] = [];
  try {
    const copyDirectory = (absoluteDirectory: string, relativeDirectory: string) => {
      for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        const absolutePath = join(absoluteDirectory, entry.name);
        // Classification is service input, not backend input.  In particular a
        // native server must never receive the configuration that names files
        // the service intentionally denied.
        if (isSensitiveProjectPath(relativePath) || isClassificationConfigPath(relativePath)) {
          if (isSensitiveProjectPath(relativePath)) excluded += 1;
          continue;
        }
        if (isBackendIrrelevant(relativePath)) continue;
        if (lstatSync(absolutePath).isSymbolicLink()) continue;
        const target = join(serviceRoot, relativePath);
        if (entry.isDirectory()) {
          mkdirSync(target, { recursive: true });
          copyDirectory(absolutePath, relativePath);
        } else if (entry.isFile() && isBackendSourceFile(relativePath)) {
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, sourceRoot.protectedRead(relativePath).bytes, "utf8");
          sourcePaths.push(relativePath);
        }
      }
    };
    copyDirectory(sourceRoot.canonicalPath, "");
    const root = createNativeProjectRoot(serviceRoot);
    return {
      root,
      sensitive_paths_excluded: excluded,
      sourcePaths: () => [...sourcePaths],
      dispose: () => {
        if (existsSync(serviceRoot)) rmSync(serviceRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(serviceRoot, { recursive: true, force: true });
    throw error;
  }
}

function isBackendIrrelevant(path: string): boolean {
  return path
    .split("/")
    .some((part) =>
      /^(node_modules|dist|target|bin|obj|\.venv|coverage|docs|reports|\.serena|\.idea|\.claude|\.codex|\.github|\.data|\.evo|\.skill-migrate|\.tighten)$/iu.test(
        part,
      ),
    );
}

function isBackendSourceFile(path: string): boolean {
  return (
    /\.(rs|cs|csx|fs|vb|toml|json|sln|csproj|props|targets)$/iu.test(path) ||
    /(^|\/)(Cargo\.lock|Cargo\.toml|Directory\.Build\.props)$/iu.test(path)
  );
}
