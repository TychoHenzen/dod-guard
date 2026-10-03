import { existsSync, readdirSync, realpathSync, statSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const SERVICE_DEFINITIONS = Object.freeze({
  "quality-guard": Object.freeze({
    packageName: "quality-guard",
    bundleEnvironment: "MCP_HOST_QUALITY_GUARD_BUNDLE",
    defaultPort: 21_720,
    defaultPath: "/servers/quality-guard/mcp",
    defaultHealthPath: "/servers/quality-guard/health",
    startExport: "startQualityGuardHttpServer",
  }),
  "knowledge-base": Object.freeze({
    packageName: "knowledge-base",
    bundleEnvironment: "MCP_HOST_KNOWLEDGE_BASE_BUNDLE",
    rootEnvironment: "DOD_GUARD_KNOWLEDGE_BASE_DIR",
    defaultPort: 21_721,
    defaultPath: "/servers/knowledge-base/mcp",
    defaultHealthPath: "/servers/knowledge-base/health",
    startExport: "startKnowledgeBaseHttpServer",
  }),
});

const systemFs = { existsSync, readdirSync, realpathSync, statSync, readFileSync };

function definition(service) {
  const result = SERVICE_DEFINITIONS[service];
  if (!result) throw new Error(`unsupported MCP host service: ${service}`);
  return result;
}

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(left, right) {
  const a = versionParts(left) ?? [-1, -1, -1];
  const b = versionParts(right) ?? [-1, -1, -1];
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index];
  }
  return left.localeCompare(right);
}

function packageVersion(packageRoot, fs) {
  try {
    const metadata = JSON.parse(String(fs.readFileSync(join(packageRoot, "package.json"), "utf8")));
    return typeof metadata.version === "string" ? metadata.version : "";
  } catch {
    return "";
  }
}

function candidate(file, version, fs) {
  try {
    const canonical = fs.realpathSync(file);
    if (!fs.statSync(canonical).isFile()) return null;
    return { path: canonical, version: version || packageVersion(dirname(dirname(canonical)), fs) || "" };
  } catch {
    return null;
  }
}

function addCandidate(candidates, file, version, fs) {
  const value = candidate(file, version, fs);
  if (value) candidates.push(value);
}

function versionDirectories(root, fs) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareVersions);
  } catch {
    return [];
  }
}

function candidatesForRoot(root, service, fs) {
  const { packageName } = definition(service);
  const candidates = [];
  const normalized = resolve(root);
  addCandidate(candidates, normalized, "", fs);
  addCandidate(candidates, join(normalized, "dist", "bundle.js"), "", fs);
  addCandidate(candidates, join(normalized, "packages", packageName, "dist", "bundle.js"), "", fs);

  const packageCache = join(normalized, packageName);
  for (const version of versionDirectories(packageCache, fs)) {
    addCandidate(candidates, join(packageCache, version, "dist", "bundle.js"), version, fs);
  }
  for (const version of versionDirectories(normalized, fs)) {
    addCandidate(candidates, join(normalized, version, "dist", "bundle.js"), version, fs);
  }
  return candidates;
}

function defaultRoots(env, service) {
  const roots = [];
  if (env.MCP_HOST_BUNDLE_ROOTS) roots.push(...env.MCP_HOST_BUNDLE_ROOTS.split(delimiter).filter(Boolean));
  const codexHome = env.CODEX_HOME ?? join(homedir(), ".codex");
  roots.push(join(codexHome, "plugins", "cache", "dod-guard-monorepo"));
  if (env.CLAUDE_PLUGIN_ROOT) roots.push(env.CLAUDE_PLUGIN_ROOT);
  if (env.MCP_HOST_REPO_ROOT) roots.push(join(env.MCP_HOST_REPO_ROOT, "packages", definition(service).packageName));
  return [...new Set(roots.map((root) => resolve(root)))];
}

export function resolveNewestBundle({ service, roots, explicitBundle, fs = systemFs }) {
  const config = definition(service);
  if (explicitBundle !== undefined) {
    const selected = candidate(explicitBundle, "", fs);
    if (!selected) throw new Error(`${service} bundle does not exist or is not a file: ${explicitBundle}`);
    return selected.path;
  }
  const candidates = (roots ?? []).flatMap((root) => candidatesForRoot(root, service, fs));
  const unique = [...new Map(candidates.map((item) => [item.path, item])).values()];
  unique.sort((left, right) => compareVersions(left.version, right.version) || left.path.localeCompare(right.path));
  if (unique.length === 0) {
    throw new Error(`no installed ${config.packageName} bundle found; set ${config.bundleEnvironment} or MCP_HOST_BUNDLE_ROOTS`);
  }
  const [selected] = unique;
  const sameVersion = unique.filter((item) => item.version === selected.version);
  if (sameVersion.length > 1) {
    throw new Error(`ambiguous ${config.packageName} bundle version ${selected.version || "unknown"}: ${sameVersion.map((item) => item.path).join(", ")}`);
  }
  return selected.path;
}

function value(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

function integer(value_, name) {
  const valueNumber = Number(value_);
  if (!Number.isInteger(valueNumber) || valueNumber < 0 || valueNumber > 65_535) throw new Error(`${name} must be an integer between 0 and 65535: ${value_}`);
  return valueNumber;
}

export function parseLauncherOptions(args, env = process.env) {
  const service = value(args, "--service") ?? env.MCP_HOST_SERVICE;
  if (!service) throw new Error("MCP host service is required; pass --service quality-guard or --service knowledge-base");
  const config = definition(service);
  const prefix = service.toUpperCase().replaceAll("-", "_");
  const configuredPort = value(args, "--port") ?? env[`MCP_HOST_${prefix}_PORT`] ?? env.MCP_HOST_PORT ?? String(config.defaultPort);
  return {
    service,
    host: value(args, "--host") ?? env.MCP_HOST_BIND_HOST ?? "127.0.0.1",
    port: integer(configuredPort, "MCP host port"),
    path: value(args, "--path") ?? env[`MCP_HOST_${prefix}_PATH`] ?? env.MCP_HOST_PATH ?? config.defaultPath,
    healthPath: value(args, "--health-path") ?? env[`MCP_HOST_${prefix}_HEALTH_PATH`] ?? env.MCP_HOST_HEALTH_PATH ?? config.defaultHealthPath,
    bundle: env[config.bundleEnvironment],
    rootDir: config.rootEnvironment ? env[config.rootEnvironment] : undefined,
  };
}

export async function startService({ options, env = process.env, fs = systemFs, importModule = (url) => import(url) }) {
  const config = definition(options.service);
  if (config.rootEnvironment && !options.rootDir?.trim()) {
    throw new Error(`${config.rootEnvironment} must be set before starting ${options.service}`);
  }
  const bundle = resolveNewestBundle({
    service: options.service,
    roots: defaultRoots(env, options.service),
    explicitBundle: options.bundle,
    fs,
  });
  let module;
  try {
    module = await importModule(pathToFileURL(bundle).href);
  } catch (error) {
    throw new Error(`could not load ${options.service} bundle ${bundle}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const start = module?.[config.startExport];
  if (typeof start !== "function") throw new Error(`${bundle} does not export ${config.startExport}`);
  const running = await start({
    host: options.host,
    port: options.port,
    path: options.path,
    healthPath: options.healthPath,
    ...(config.rootEnvironment ? { rootDir: options.rootDir } : {}),
  });
  return { ...running, bundle, service: options.service };
}

async function main() {
  const options = parseLauncherOptions(process.argv.slice(2));
  const running = await startService({ options });
  process.stderr.write(`${JSON.stringify({ service: running.service, status: "ready", bundle: running.bundle, host: running.host, port: running.port, path: running.path, healthPath: running.healthPath })}\n`);
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void running.close().then(() => process.exit(0)).catch((error) => {
      process.stderr.write(`MCP host shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const entrypoint = resolve(process.argv[1] ?? "");
if (entrypoint === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`MCP host failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { SERVICE_DEFINITIONS, candidatesForRoot, defaultRoots, definition, versionParts };
