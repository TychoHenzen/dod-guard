import { realpath } from "node:fs/promises";
import { normalize, resolve } from "node:path";
import { failure, installationObserved } from "./failure.mjs";
import { absoluteInstallPath, isInside, normalizedPath, readRegularFile } from "./paths.mjs";

async function findSkillPath(ctx, installation) {
  const expectedPath = resolve(installation.pluginRoot, "skills/publish/SKILL.md");
  try {
    return normalize(await realpath(expectedPath));
  } catch (error) {
    return failure(
      ctx,
      `The registered installation is missing its publish skill: ${error.message}`,
      installationObserved(installation, { pluginRoot: installation.pluginRoot, skillPath: expectedPath }),
    );
  }
}

// Returns undefined when the skill file is a readable regular file inside the registered root.
async function validateSkillFile(ctx, installation, skillPath) {
  const observed = installationObserved(installation, { pluginRoot: installation.pluginRoot, skillPath });
  if (!isInside(installation.pluginRoot, skillPath)) {
    return failure(ctx, "The publish skill path resolves outside the registered plugin root.", observed);
  }
  try {
    await readRegularFile(skillPath);
  } catch (error) {
    return failure(
      ctx,
      `The registered installation's publish skill is not a readable regular file: ${error.message}`,
      observed,
    );
  }
}

// The version pin compares against the registration; evidence carries the manifest and skill path.
function checkVersionPin(ctx, installation, evidence) {
  if (ctx.requested.version !== undefined && ctx.requested.version !== installation.version) {
    return failure(
      ctx,
      "The requested version does not exactly match the active registration and manifest.",
      installationObserved(installation, {
        manifestVersion: evidence.manifest.version,
        pluginRoot: installation.pluginRoot,
        skillPath: evidence.skillPath,
      }),
    );
  }
}

function checkPathPin(ctx, installation, skillPath) {
  const requestedPath = ctx.requested.path;
  if (
    requestedPath !== undefined &&
    (!absoluteInstallPath(requestedPath) || normalizedPath(requestedPath) !== normalizedPath(skillPath))
  ) {
    return failure(
      ctx,
      "The requested path must exactly match the normalized absolute path of the loaded skills/publish/SKILL.md.",
      installationObserved(installation, { pluginRoot: installation.pluginRoot, skillPath }),
    );
  }
}

function validateRequestedPins(ctx, installation, evidence) {
  return checkVersionPin(ctx, installation, evidence) ?? checkPathPin(ctx, installation, evidence.skillPath);
}

export async function resolveSkillPath(ctx, installation, manifest) {
  const skillPath = await findSkillPath(ctx, installation);
  if (typeof skillPath !== "string") return skillPath;
  const skillFailure = await validateSkillFile(ctx, installation, skillPath);
  if (skillFailure) return skillFailure;
  const pinFailure = validateRequestedPins(ctx, installation, { manifest, skillPath });
  if (pinFailure) return pinFailure;
  return { skillPath };
}
