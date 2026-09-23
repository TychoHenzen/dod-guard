import process from "node:process";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, normalize, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/TychoHenzen/dod-guard.git";
const pluginRootFromScript = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const longPathPrefix = /^\\\\\?\\/;

function parseArguments(args) {
  const [client, ...options] = args;
  const requested = {};
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    let key;
    if (option === "--version") key = "version";
    if (option === "--skill-path") key = "path";
    const value = options[index + 1];
    if (!(key && value) || value.startsWith("--") || requested[key] !== undefined) {
      return { client, requested, error: `Invalid or duplicate argument: ${option}` };
    }
    requested[key] = value;
    index += 1;
  }
  if (client !== "codex" && client !== "claude") {
    return { client, requested, error: "Client must be codex or claude" };
  }
  return { client, requested };
}

function failure(client, requested, reason, observed = {}) {
  return {
    ok: false,
    client,
    requested,
    observed: {
      registry: "unavailable",
      pluginIdentity: "unavailable",
      version: "unavailable",
      pluginRoot: "unavailable",
      skillPath: "unavailable",
      ...observed,
    },
    reason,
    nextStep: "Refresh or correct this client installation and rerun /dod-guard:publish; do not use another cache or checkout.",
  };
}

function summary(client, entry) {
  if (client === "codex") {
    return {
      pluginId: entry?.pluginId,
      name: entry?.name,
      marketplaceName: entry?.marketplaceName,
      version: entry?.version,
      installed: entry?.installed,
      enabled: entry?.enabled,
      sourcePath: entry?.source?.path,
      marketplaceSource: entry?.marketplaceSource,
    };
  }
  return { id: entry?.id, version: entry?.version, enabled: entry?.enabled, installPath: entry?.installPath };
}

function isDodGuardEntry(client, entry) {
  if (client === "codex") {
    const id = typeof entry?.pluginId === "string" ? entry.pluginId : "";
    return entry?.name === "dod-guard" || id.split("@")[0] === "dod-guard";
  }
  const id = typeof entry?.id === "string" ? entry.id : "";
  return id.split("@")[0] === "dod-guard";
}

function identityIsExpected(client, entry) {
  if (client === "codex") {
    return entry.pluginId === "dod-guard@dod-guard-monorepo" &&
      entry.name === "dod-guard" &&
      entry.marketplaceName === "dod-guard-monorepo" &&
      entry.marketplaceSource?.sourceType === "git" &&
      entry.marketplaceSource?.source === repository;
  }
  return entry.id === "dod-guard@dod-guard";
}

function absoluteInstallPath(value) {
  return typeof value === "string" && isAbsolute(value) && (process.platform !== "win32" || parse(value).root.length > 1);
}

function normalizedPath(value) {
  const absolute = normalize(resolve(value)).replace(longPathPrefix, "");
  return process.platform === "win32" ? absolute.toLocaleLowerCase("en-US") : absolute;
}

function isInside(parent, child) {
  const remainder = relative(parent, child);
  return remainder === "" || (remainder !== ".." && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder));
}

async function readRegistry(client, requested) {
  let registry;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    registry = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    return failure(client, requested, `Registry input is missing or malformed: ${error.message}`);
  }
  const entries = client === "codex" ? registry?.installed : registry;
  if (!Array.isArray(entries)) {
    return failure(client, requested, `Registry does not contain the expected ${client} plugin list.`, {
      registry: "malformed",
    });
  }
  return entries;
}

function selectRegistration(client, requested, entries) {
  const candidates = entries.filter((entry) => isDodGuardEntry(client, entry));
  const active = candidates.filter((entry) => entry?.enabled === true && (client !== "codex" || entry?.installed === true));
  if (active.length !== 1) {
    return failure(client, requested, `Expected exactly one installed and enabled dod-guard registration; found ${active.length}.`, {
      registry: "parsed",
      registrations: candidates.map((entry) => summary(client, entry)),
    });
  }

  const [entry] = active;
  const identity = summary(client, entry);
  if (!identityIsExpected(client, entry)) {
    let expected = { id: "dod-guard@dod-guard" };
    if (client === "codex") {
      expected = {
        pluginId: "dod-guard@dod-guard-monorepo",
        name: "dod-guard",
        marketplaceName: "dod-guard-monorepo",
        marketplaceSource: { sourceType: "git", source: repository },
      };
    }
    return failure(client, requested, "The enabled dod-guard registration does not match the expected plugin and marketplace identity.", {
      registry: "parsed",
      pluginIdentity: identity,
      version: entry.version ?? "unavailable",
      expectedIdentity: expected,
    });
  }

  const pluginRoot = client === "codex" ? entry.source?.path : entry.installPath;
  if (typeof entry.version !== "string" || !entry.version || !absoluteInstallPath(pluginRoot)) {
    return failure(client, requested, "The enabled registration is missing an absolute install path or version.", {
      registry: "parsed",
      pluginIdentity: identity,
      version: entry.version ?? "unavailable",
      pluginRoot: pluginRoot ?? "unavailable",
    });
  }
  return { identity, version: entry.version, registeredRoot: pluginRoot };
}

async function resolvePluginRoot(client, requested, installation) {
  let loadedRoot;
  let registeredRoot;
  try {
    [loadedRoot, registeredRoot] = await Promise.all([
      realpath(pluginRootFromScript),
      realpath(installation.registeredRoot),
    ]);
  } catch (error) {
    return failure(client, requested, `The loaded or registered plugin path is unavailable: ${error.message}`, {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: pluginRootFromScript,
      registeredRoot: installation.registeredRoot,
    });
  }
  if (normalizedPath(loadedRoot) !== normalizedPath(registeredRoot)) {
    return failure(client, requested, "The loaded publish skill is not from the registered dod-guard installation.", {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: normalize(loadedRoot),
      registeredRoot: normalize(registeredRoot),
    });
  }
  return normalize(loadedRoot);
}

async function readManifest(client, requested, installation, pluginRoot) {
  let manifestPath;
  if (client === "codex") manifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");
  else manifestPath = resolve(pluginRoot, ".claude-plugin/plugin.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return failure(client, requested, `Installed plugin manifest could not be read as valid JSON: ${error.message}`, {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot,
      manifestPath,
    });
  }
  if (manifest?.name !== "dod-guard" || manifest?.version !== installation.version) {
    return failure(client, requested, "The installed plugin manifest name or version disagrees with the registration.", {
      pluginIdentity: installation.identity,
      version: installation.version,
      manifestName: manifest?.name ?? "unavailable",
      manifestVersion: manifest?.version ?? "unavailable",
      manifestPath,
    });
  }
  return { manifest };
}

async function resolveSkillPath(client, requested, installation, manifest) {
  const expectedPath = resolve(installation.pluginRoot, "skills/publish/SKILL.md");
  let skillPath;
  try {
    skillPath = normalize(await realpath(expectedPath));
  } catch (error) {
    return failure(client, requested, `The registered installation is missing its publish skill: ${error.message}`, {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: installation.pluginRoot,
      skillPath: expectedPath,
    });
  }
  if (!isInside(installation.pluginRoot, skillPath)) {
    return failure(client, requested, "The publish skill path resolves outside the registered plugin root.", {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: installation.pluginRoot,
      skillPath,
    });
  }
  if (requested.version !== undefined && requested.version !== installation.version) {
    return failure(client, requested, "The requested version does not exactly match the active registration and manifest.", {
      pluginIdentity: installation.identity,
      version: installation.version,
      manifestVersion: manifest.version,
      pluginRoot: installation.pluginRoot,
      skillPath,
    });
  }
  if (requested.path !== undefined && (!absoluteInstallPath(requested.path) || normalizedPath(requested.path) !== normalizedPath(skillPath))) {
    return failure(client, requested, "The requested path must exactly match the normalized absolute path of the loaded skills/publish/SKILL.md.", {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: installation.pluginRoot,
      skillPath,
    });
  }
  return { skillPath };
}

async function preflight(args) {
  const { client, requested } = args;
  if (args.error) return failure(client, requested, args.error);
  const entries = await readRegistry(client, requested);
  if (!Array.isArray(entries)) return entries;
  const installation = selectRegistration(client, requested, entries);
  if (installation.ok === false) return installation;
  const pluginRoot = await resolvePluginRoot(client, requested, installation);
  if (typeof pluginRoot !== "string") return pluginRoot;
  installation.pluginRoot = pluginRoot;
  const manifest = await readManifest(client, requested, installation, pluginRoot);
  if (manifest.ok === false) return manifest;
  const skill = await resolveSkillPath(client, requested, installation, manifest.manifest);
  if (skill.ok === false) return skill;
  return { ok: true, client, version: installation.version, pluginRoot, ...skill, identity: installation.identity, requested };
}

function writeResult(result) {
  if (result.ok) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  }
}

const args = parseArguments(process.argv.slice(2));
preflight(args).then(writeResult).catch((error) => {
  writeResult(failure(args.client, args.requested, `Unexpected preflight failure: ${error.message}`));
});
