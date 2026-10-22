import { failure } from "./failure.mjs";
import { readManifest } from "./manifest.mjs";
import { selectRegistration } from "./registration.mjs";
import { readRegistry } from "./registry-input.mjs";
import { resolvePluginRoot } from "./root.mjs";
import { resolveSkillPath } from "./skill.mjs";

async function locateInstallation(ctx) {
  const entries = await readRegistry(ctx);
  if (!Array.isArray(entries)) return entries;
  const installation = selectRegistration(ctx, entries);
  if (installation.ok === false) return installation;
  const pluginRoot = await resolvePluginRoot(ctx, installation);
  if (typeof pluginRoot !== "string") return pluginRoot;
  return { ...installation, pluginRoot };
}

async function resolvePreflight(args, scriptRoot) {
  const ctx = { client: args.client, requested: args.requested, scriptRoot };
  if (args.error) return failure(ctx, args.error, { registry: "unavailable" });
  const installation = await locateInstallation(ctx);
  if (installation.ok === false) return installation;
  const { pluginRoot } = installation;
  const manifest = await readManifest(ctx, installation, pluginRoot);
  if (manifest.ok === false) return manifest;
  const skill = await resolveSkillPath(ctx, installation, manifest.manifest);
  if (skill.ok === false) return skill;
  return {
    ok: true,
    client: ctx.client,
    version: installation.version,
    pluginRoot,
    ...skill,
    pluginIdentity: installation.identity,
    identity: installation.identity,
    requested: ctx.requested,
  };
}

// Adds the inventory status the caller reported; a non-zero status makes a failure's reason say so.
function applyInventoryStatus(result, status) {
  if (result.ok) return { ...result, inventoryStatus: status };
  if (status === 0) return { ...result, observed: { ...result.observed, inventoryStatus: 0 } };
  return {
    ...result,
    reason: `Inventory command exited with status ${status}; ${result.reason}`,
    observed: { ...result.observed, inventoryStatus: status },
  };
}

export async function preflight(args, scriptRoot) {
  const result = await resolvePreflight(args, scriptRoot);
  const raw = args.requested?.inventoryStatus;
  // ASSUMPTION: a parse error is reported alone; the inventory status is not applied to it.
  if (raw === undefined || args.error) return result;
  return applyInventoryStatus(result, Number(raw));
}
