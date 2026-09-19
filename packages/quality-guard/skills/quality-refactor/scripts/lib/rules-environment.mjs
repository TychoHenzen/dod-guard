import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(root, name) {
  try {
    return readFileSync(join(root, name), "utf8");
  } catch {
    return null;
  }
}

function packageJson(root) {
  const text = read(root, "package.json");
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function dotnetProject(root) {
  try {
    return readdirSync(root).find((name) => /\.(?:sln|csproj)$/i.test(name)) ?? null;
  } catch {
    return null;
  }
}

export function resolveEntrypoints(root) {
  const node = packageJson(root);
  if (node !== null) {
    const scripts = node.scripts ?? {};
    return {
      file: "package.json",
      build: typeof scripts.build === "string" ? "npm run build" : null,
      test: typeof scripts.test === "string" ? "npm test" : null,
    };
  }
  if (existsSync(join(root, "Cargo.toml")))
    return { file: "Cargo.toml", build: "cargo build", test: "cargo test" };
  const dotnet = dotnetProject(root);
  if (dotnet !== null)
    return {
      file: dotnet,
      build: `dotnet build ${dotnet}`,
      test: `dotnet test ${dotnet}`,
    };
  const python = read(root, "pyproject.toml");
  if (python !== null && /\[build-system\]/.test(python) && /\[tool\.pytest(?:\.|\])/i.test(python))
    return { file: "pyproject.toml", build: "python -m build", test: "python -m pytest" };
  return null;
}

function nodeEntrypoints(root) {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  return resolveEntrypoints(root);
}

function finding(rule, severity, message) {
  return { file: "package.json", line: 1, rule, severity, message, metric: 1 };
}

export function checkEnvironment(root, config) {
  const manifest = nodeEntrypoints(root);
  if (manifest === null) return [];
  const found = [];
  if (manifest.build === null)
    found.push(
      finding(
        "build-entrypoint",
        config.presence["build-entrypoint"],
        "E1: package.json has no build script — add one root npm run build entry point",
      ),
    );
  if (manifest.test === null)
    found.push(
      finding(
        "test-entrypoint",
        config.presence["test-entrypoint"],
        "E2: package.json has no test script — add one root npm test entry point",
      ),
    );
  return found;
}
