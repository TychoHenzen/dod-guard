import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, normalize, parse, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/TychoHenzen/dod-guard.git";
const pluginRootFromScript = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const longPathPrefix = /^\\\\\?\\/;

function parseArguments(args) {
  const [client, ...options] = args;
  const requested = {};
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--registered-root") {
      if (requested.registeredRoot) return { client, requested, error: `Invalid or duplicate argument: ${option}` };
      requested.registeredRoot = true;
      continue;
    }
    let key;
    if (option === "--version") key = "version";
    if (option === "--skill-path") key = "path";
    if (option === "--inventory-status") key = "inventoryStatus";
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
  if (requested.inventoryStatus !== undefined && !/^\d+$/.test(requested.inventoryStatus)) {
    return { client, requested, error: "Invalid --inventory-status: must be a non-negative integer" };
  }
  return { client, requested };
}

function failure(client, requested, reason, observed = {}) {
  return {
    ok: false,
    client,
    requested,
    observed: {
      registry: "parsed",
      pluginIdentity: "unavailable",
      version: "unavailable",
      pluginRoot: "unavailable",
      skillPath: "unavailable",
      ...observed,
    },
    reason,
    nextStep:
      "Refresh or correct this client installation and rerun /dod-guard:publish; do not use another cache or checkout.",
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
    return (
      entry.pluginId === "dod-guard@dod-guard-monorepo" &&
      entry.name === "dod-guard" &&
      entry.marketplaceName === "dod-guard-monorepo" &&
      entry.marketplaceSource?.sourceType === "git" &&
      entry.marketplaceSource?.source === repository
    );
  }
  return entry.id === "dod-guard@dod-guard";
}

function absoluteInstallPath(value) {
  return (
    typeof value === "string" && isAbsolute(value) && (process.platform !== "win32" || parse(value).root.length > 1)
  );
}

function normalizedPath(value) {
  const absolute = normalize(resolve(value)).replace(longPathPrefix, "");
  return process.platform === "win32" ? absolute.toLocaleLowerCase("en-US") : absolute;
}

function isInside(parent, child) {
  const remainder = relative(parent, child);
  return remainder === "" || (remainder !== ".." && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder));
}

async function readRegularFile(path) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await file.stat()).isFile()) throw new Error("path is not a regular file");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

async function readRegistry(client, requested) {
  let registry;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = Buffer.concat(chunks).toString("utf8");
    registry = JSON.parse(input.startsWith("\uFEFF") ? input.slice(1) : input);
  } catch (error) {
    return failure(client, requested, `Registry input is missing or malformed: ${error.message}`, {
      registry: "unavailable",
    });
  }
  const entries = client === "codex" ? registry?.installed : registry;
  if (!Array.isArray(entries)) {
    return failure(client, requested, `Registry does not contain the expected ${client} plugin list.`, {
      registry: "malformed",
    });
  }
  return entries;
}

function expectedIdentity(client) {
  if (client === "codex") {
    return {
      pluginId: "dod-guard@dod-guard-monorepo",
      name: "dod-guard",
      marketplaceName: "dod-guard-monorepo",
      marketplaceSource: { sourceType: "git", source: repository },
    };
  }
  return { id: "dod-guard@dod-guard" };
}

function selectActiveRegistration(client, requested, entries) {
  const candidates = entries.filter((entry) => isDodGuardEntry(client, entry));
  const active = candidates.filter(
    (entry) => entry?.enabled === true && (client !== "codex" || entry?.installed === true),
  );
  if (active.length !== 1) {
    return failure(
      client,
      requested,
      `Expected exactly one installed and enabled dod-guard registration; found ${active.length}.`,
      {
        registry: "parsed",
        registrations: candidates.map((entry) => summary(client, entry)),
      },
    );
  }
  return { entry: active[0] };
}

function validateRegistrationIdentity(client, requested, entry) {
  const identity = summary(client, entry);
  if (!identityIsExpected(client, entry)) {
    return failure(
      client,
      requested,
      "The enabled dod-guard registration does not match the expected plugin and marketplace identity.",
      {
        registry: "parsed",
        pluginIdentity: identity,
        version: entry.version ?? "unavailable",
        expectedIdentity: expectedIdentity(client),
      },
    );
  }
  return identity;
}

function validateRegistrationMetadata(client, requested, entry, identity) {
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

function selectRegistration(client, requested, entries) {
  const selected = selectActiveRegistration(client, requested, entries);
  if (selected.ok === false) return selected;
  const { entry } = selected;
  const identity = validateRegistrationIdentity(client, requested, entry);
  if (identity?.ok === false) return identity;
  return validateRegistrationMetadata(client, requested, entry, identity);
}

async function resolveLoadedRoot(client, requested, installation) {
  try {
    return normalize(await realpath(pluginRootFromScript));
  } catch (error) {
    return failure(client, requested, `The loaded plugin path is unavailable: ${error.message}`, {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: pluginRootFromScript,
      registeredRoot: installation.registeredRoot,
    });
  }
}

async function resolveRegisteredRoot(client, requested, installation, loadedRoot) {
  try {
    return normalize(await realpath(installation.registeredRoot));
  } catch (error) {
    return failure(client, requested, `The registered plugin path is unavailable: ${error.message}`, {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: loadedRoot,
      registeredRoot: installation.registeredRoot,
    });
  }
}

async function resolvePluginRoot(client, requested, installation) {
  // Post-release verification judges the registration the client now reports, not the root this
  // helper was loaded from, which still holds the previous release until the session reloads.
  if (requested.registeredRoot) {
    return resolveRegisteredRoot(client, requested, installation, installation.registeredRoot);
  }

  const loadedRoot = await resolveLoadedRoot(client, requested, installation);
  if (typeof loadedRoot !== "string") return loadedRoot;

  if (client === "codex") return loadedRoot;

  const registeredRoot = await resolveRegisteredRoot(client, requested, installation, loadedRoot);
  if (typeof registeredRoot !== "string") return registeredRoot;

  if (normalizedPath(loadedRoot) !== normalizedPath(registeredRoot)) {
    return failure(client, requested, "The loaded publish skill is not from the registered dod-guard installation.", {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: loadedRoot,
      registeredRoot,
    });
  }
  return loadedRoot;
}

async function loadManifest(client, requested, installation, pluginRoot) {
  const manifestPath = resolve(
    pluginRoot,
    client === "codex" ? ".codex-plugin/plugin.json" : ".claude-plugin/plugin.json",
  );
  let resolvedManifestPath;
  let manifest;
  try {
    resolvedManifestPath = normalize(await realpath(manifestPath));
    if (!isInside(pluginRoot, resolvedManifestPath)) {
      return failure(client, requested, "Installed plugin manifest path resolves outside the registered plugin root.", {
        pluginIdentity: installation.identity,
        version: installation.version,
        pluginRoot,
        manifestPath: resolvedManifestPath,
      });
    }
    manifest = JSON.parse(await readRegularFile(resolvedManifestPath));
  } catch (error) {
    return failure(client, requested, `Installed plugin manifest could not be read as valid JSON: ${error.message}`, {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot,
      manifestPath: resolvedManifestPath ?? manifestPath,
    });
  }
  return { manifest, resolvedManifestPath };
}

function validateManifest(client, requested, installation, loadedManifest) {
  const { manifest, resolvedManifestPath } = loadedManifest;
  if (manifest?.name !== "dod-guard" || manifest?.version !== installation.version) {
    return failure(
      client,
      requested,
      "The installed plugin manifest name or version disagrees with the registration.",
      {
        pluginIdentity: installation.identity,
        version: installation.version,
        manifestName: manifest?.name ?? "unavailable",
        manifestVersion: manifest?.version ?? "unavailable",
        manifestPath: resolvedManifestPath,
      },
    );
  }
  return { manifest };
}

async function readManifest(client, requested, installation, pluginRoot) {
  const loadedManifest = await loadManifest(client, requested, installation, pluginRoot);
  if (loadedManifest.ok === false) return loadedManifest;
  return validateManifest(client, requested, installation, loadedManifest);
}

async function findSkillPath(client, requested, installation) {
  const expectedPath = resolve(installation.pluginRoot, "skills/publish/SKILL.md");
  try {
    return normalize(await realpath(expectedPath));
  } catch (error) {
    return failure(client, requested, `The registered installation is missing its publish skill: ${error.message}`, {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: installation.pluginRoot,
      skillPath: expectedPath,
    });
  }
}

async function validateSkillFile(client, requested, installation, skillPath) {
  if (!isInside(installation.pluginRoot, skillPath)) {
    return failure(client, requested, "The publish skill path resolves outside the registered plugin root.", {
      pluginIdentity: installation.identity,
      version: installation.version,
      pluginRoot: installation.pluginRoot,
      skillPath,
    });
  }
  try {
    await readRegularFile(skillPath);
  } catch (error) {
    return failure(
      client,
      requested,
      `The registered installation's publish skill is not a readable regular file: ${error.message}`,
      {
        pluginIdentity: installation.identity,
        version: installation.version,
        pluginRoot: installation.pluginRoot,
        skillPath,
      },
    );
  }
}

function validateRequestedPins(client, requested, installation, manifest, skillPath) {
  if (requested.version !== undefined && requested.version !== installation.version) {
    return failure(
      client,
      requested,
      "The requested version does not exactly match the active registration and manifest.",
      {
        pluginIdentity: installation.identity,
        version: installation.version,
        manifestVersion: manifest.version,
        pluginRoot: installation.pluginRoot,
        skillPath,
      },
    );
  }
  if (
    requested.path !== undefined &&
    (!absoluteInstallPath(requested.path) || normalizedPath(requested.path) !== normalizedPath(skillPath))
  ) {
    return failure(
      client,
      requested,
      "The requested path must exactly match the normalized absolute path of the loaded skills/publish/SKILL.md.",
      {
        pluginIdentity: installation.identity,
        version: installation.version,
        pluginRoot: installation.pluginRoot,
        skillPath,
      },
    );
  }
}

async function resolveSkillPath(client, requested, installation, manifest) {
  const skillPath = await findSkillPath(client, requested, installation);
  if (typeof skillPath !== "string") return skillPath;
  const skillFailure = await validateSkillFile(client, requested, installation, skillPath);
  if (skillFailure) return skillFailure;
  const pinFailure = validateRequestedPins(client, requested, installation, manifest, skillPath);
  if (pinFailure) return pinFailure;
  return { skillPath };
}

async function locateInstallation(client, requested) {
  const entries = await readRegistry(client, requested);
  if (!Array.isArray(entries)) return entries;
  const installation = selectRegistration(client, requested, entries);
  if (installation.ok === false) return installation;
  const pluginRoot = await resolvePluginRoot(client, requested, installation);
  if (typeof pluginRoot !== "string") return pluginRoot;
  return { ...installation, pluginRoot };
}

async function resolvePreflight(args) {
  const { client, requested } = args;
  if (args.error) return failure(client, requested, args.error, { registry: "unavailable" });
  const installation = await locateInstallation(client, requested);
  if (installation.ok === false) return installation;
  const { pluginRoot } = installation;
  const manifest = await readManifest(client, requested, installation, pluginRoot);
  if (manifest.ok === false) return manifest;
  const skill = await resolveSkillPath(client, requested, installation, manifest.manifest);
  if (skill.ok === false) return skill;
  return {
    ok: true,
    client,
    version: installation.version,
    pluginRoot,
    ...skill,
    pluginIdentity: installation.identity,
    identity: installation.identity,
    requested,
  };
}

async function preflight(args) {
  const result = await resolvePreflight(args);
  const raw = args.requested?.inventoryStatus;
  // ASSUMPTION: a parse error is reported alone; the inventory status is not applied to it.
  if (raw === undefined || args.error) return result;
  const status = Number(raw);
  if (result.ok) return { ...result, inventoryStatus: status };
  if (status === 0) return { ...result, observed: { ...result.observed, inventoryStatus: 0 } };
  return {
    ...result,
    reason: `Inventory command exited with status ${status}; ${result.reason}`,
    observed: { ...result.observed, inventoryStatus: status },
  };
}

function writeResult(result) {
  if (result.ok) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  }
}

const args = parseArguments(process.argv.slice(2));
preflight(args)
  .then(writeResult)
  .catch((error) => {
    writeResult(failure(args.client, args.requested, `Unexpected preflight failure: ${error.message}`));
  });
