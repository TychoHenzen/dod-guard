import path from "node:path";

const MANIFEST_NAMES = new Set([
  "CMakeLists.txt",
  "Cargo.toml",
  "Gemfile",
  "Package.swift",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "go.mod",
  "package.json",
  "pom.xml",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
]);

const MANIFEST_EXTENSIONS = new Set([".csproj", ".fsproj", ".sln", ".vbproj"]);

const CONFIG_NAMES = new Set([
  ".actionlint.yaml",
  ".actionlint.yml",
  ".editorconfig",
  ".gitignore",
  ".markdownlint.json",
  ".markdownlint.yaml",
  ".markdownlint.yml",
  "biome.json",
  "biome.jsonc",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.ts",
  "jest.config.js",
  "jest.config.mjs",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "ruff.toml",
  "tsconfig.json",
  "uv.lock",
  "yarn.lock",
]);

const INSTRUCTION_NAMES = new Set(["AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md"]);

export function isManifest(file) {
  return MANIFEST_NAMES.has(path.basename(file)) || MANIFEST_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function isConfiguration(file) {
  return CONFIG_NAMES.has(path.basename(file)) || file.startsWith(".github/workflows/");
}

export function isInstruction(file) {
  return INSTRUCTION_NAMES.has(path.basename(file));
}
