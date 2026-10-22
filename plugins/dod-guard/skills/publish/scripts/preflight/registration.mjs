import { failure, orUnavailable } from "./failure.mjs";
import { expectedIdentity, identityIsExpected, isDodGuardEntry, summary } from "./identity.mjs";
import { absoluteInstallPath } from "./paths.mjs";

// The install root sits in a different field per client.
const REGISTERED_ROOT = {
  codex: (entry) => entry.source?.path,
  claude: (entry) => entry.installPath,
};

// Codex also records whether the plugin is installed; Claude's enabled flag alone decides.
function isActive(client, entry) {
  return entry?.enabled === true && (client !== "codex" || entry?.installed === true);
}

function selectActiveRegistration(ctx, entries) {
  const candidates = entries.filter((entry) => isDodGuardEntry(ctx.client, entry));
  const active = candidates.filter((entry) => isActive(ctx.client, entry));
  if (active.length !== 1) {
    return failure(ctx, `Expected exactly one installed and enabled dod-guard registration; found ${active.length}.`, {
      registry: "parsed",
      registrations: candidates.map((entry) => summary(ctx.client, entry)),
    });
  }
  return { entry: active[0] };
}

function validateRegistrationIdentity(ctx, entry) {
  const identity = summary(ctx.client, entry);
  if (!identityIsExpected(ctx.client, entry)) {
    return failure(
      ctx,
      "The enabled dod-guard registration does not match the expected plugin and marketplace identity.",
      {
        registry: "parsed",
        pluginIdentity: identity,
        version: orUnavailable(entry.version),
        expectedIdentity: expectedIdentity(ctx.client),
      },
    );
  }
  return identity;
}

function hasUsableMetadata(entry, pluginRoot) {
  return typeof entry.version === "string" && entry.version !== "" && absoluteInstallPath(pluginRoot);
}

function validateRegistrationMetadata(ctx, entry, identity) {
  const pluginRoot = REGISTERED_ROOT[ctx.client](entry);
  if (!hasUsableMetadata(entry, pluginRoot)) {
    return failure(ctx, "The enabled registration is missing an absolute install path or version.", {
      registry: "parsed",
      pluginIdentity: identity,
      version: orUnavailable(entry.version),
      pluginRoot: orUnavailable(pluginRoot),
    });
  }
  return { identity, version: entry.version, registeredRoot: pluginRoot };
}

// Stages run in order (active, identity, metadata) and the first failure wins.
export function selectRegistration(ctx, entries) {
  const selected = selectActiveRegistration(ctx, entries);
  if (selected.ok === false) return selected;
  const { entry } = selected;
  const identity = validateRegistrationIdentity(ctx, entry);
  if (identity.ok === false) return identity;
  return validateRegistrationMetadata(ctx, entry, identity);
}
