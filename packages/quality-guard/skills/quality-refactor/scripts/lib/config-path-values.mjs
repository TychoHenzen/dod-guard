export const MANIFEST_EXTS = new Set([
  ".tscn",
  ".tres",
  ".godot",
  ".gd",
  ".gdshader",
  ".csproj",
  ".fsproj",
  ".vbproj",
  ".sln",
  ".gradle",
  ".razor",
  ".cshtml",
  ".vue",
  ".svelte",
  ".plist",
  ".storyboard",
  ".xib",
]);

export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  "vendor",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".quality",
]);

export const IGNORED_FILE_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.d\.ts$/,
  /\.generated\./,
  /\.designer\.cs$/i,
  /_pb2?\.py$/,
  /\.pb\.go$/,
];

export const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /(^|[\\/])tests?[\\/]/i,
  /(^|[\\/])__tests__[\\/]/,
  /_test\.(go|py|rs)$/,
  /Tests?\.cs$/,
  /(^|[\\/])(testing|fixtures|harness|mocks|stubs)[\\/]/i,
];

export const ENTRY_PATTERNS = [
  new RegExp(
    "(^|[\\\\/])(index|main|mod|lib|cli|program|app|server|setup|" +
      "conftest)\\.[\\w]+$",
    "i",
  ),
  /(^|[\\/])__init__\.py$/,
];
