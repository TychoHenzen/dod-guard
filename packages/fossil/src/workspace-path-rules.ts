const DEPENDENCY_STORE_SEGMENTS = new Set(["node_modules", "vendor", ".pnpm-store", ".yarn", ".cargo"]);
const SENSITIVE_DIRECTORY_SEGMENTS = new Set([".aws", ".ssh", ".gnupg", ".kube"]);
const SENSITIVE_BASENAMES = new Set([".env", ".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
const SENSITIVE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".kdbx"] as const;

export function normalizeWorkspacePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function isDependencyStorePath(path: string): boolean {
  return normalizeWorkspacePath(path)
    .split("/")
    .some((segment) => DEPENDENCY_STORE_SEGMENTS.has(segment));
}

function hasSensitiveDirectory(segments: readonly string[]): boolean {
  return segments.some((segment) => SENSITIVE_DIRECTORY_SEGMENTS.has(segment));
}

function isSensitiveBasename(name: string): boolean {
  if (SENSITIVE_BASENAMES.has(name)) return true;
  if (name.startsWith(".env.")) return true;
  if (name.startsWith("credentials")) return true;
  return SENSITIVE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function isSensitiveWorkspacePath(path: string): boolean {
  const segments = normalizeWorkspacePath(path)
    .split("/")
    .map((segment) => segment.toLowerCase());
  const name = segments.at(-1) ?? "";
  return hasSensitiveDirectory(segments) || isSensitiveBasename(name);
}
