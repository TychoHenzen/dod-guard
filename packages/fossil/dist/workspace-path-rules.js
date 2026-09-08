const DEPENDENCY_STORE_SEGMENTS = new Set(["node_modules", "vendor", ".pnpm-store", ".yarn", ".cargo"]);
const SENSITIVE_DIRECTORY_SEGMENTS = new Set([".aws", ".ssh", ".gnupg", ".kube"]);
const SENSITIVE_BASENAMES = new Set([".env", ".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
const SENSITIVE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".kdbx"];
export function normalizeWorkspacePath(path) {
    return path.replaceAll("\\", "/");
}
export function isDependencyStorePath(path) {
    return normalizeWorkspacePath(path)
        .split("/")
        .some((segment) => DEPENDENCY_STORE_SEGMENTS.has(segment));
}
export function isSensitiveWorkspacePath(path) {
    const segments = normalizeWorkspacePath(path)
        .split("/")
        .map((segment) => segment.toLowerCase());
    const name = segments.at(-1) ?? "";
    return (segments.some((segment) => SENSITIVE_DIRECTORY_SEGMENTS.has(segment)) ||
        SENSITIVE_BASENAMES.has(name) ||
        name.startsWith(".env.") ||
        name.startsWith("credentials") ||
        SENSITIVE_EXTENSIONS.some((extension) => name.endsWith(extension)));
}
//# sourceMappingURL=workspace-path-rules.js.map