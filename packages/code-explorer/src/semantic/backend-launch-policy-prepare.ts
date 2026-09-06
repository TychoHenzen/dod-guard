import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { BackendLaunchFailure } from "./backend-launch-failure.js";
import { sameIdentity } from "./backend-launch-identity.js";
import { inspect } from "./backend-launch-inspection.js";
import type * as launchOptions from "./backend-launch-policy-options.js";
import type { BackendLaunchPreparation } from "./backend-launch-preparation.js";
import {
  defaultPlatform,
  preparationFailure,
  unavailable,
} from "./backend-launch-preparation-result.js";
import { readyPreparation } from "./backend-launch-ready-preparation.js";
import { safeModeIsProven } from "./backend-launch-safety.js";
import type { Language } from "./contract.js";

export function prepareBackend(input: {
  language: Language;
  projectConfiguration: unknown;
  allowlist: readonly BackendAllowlistEntry[];
  options: launchOptions.BackendLaunchPolicyOptions;
  accepted: Map<
    Language,
    {
      entry: BackendAllowlistEntry;
      identity: Required<BackendIdentity>;
    }
  >;
  platform: "posix" | "win32";
}): BackendLaunchPreparation {
  const entry = input.allowlist.find(
    (candidate) => candidate.language === input.language,
  );
  if (!entry) return unavailable("backend_unavailable");
  const inspected = inspect(entry, input.options);
  if (inspected.status !== "accepted")
    return unavailable(preparationFailure(inspected.code));
  return prepareAccepted(input, entry, inspected.identity);
}

function prepareAccepted(
  input: {
    language: Language;
    projectConfiguration: unknown;
    platform: "posix" | "win32";
    accepted: Map<
      Language,
      {
        entry: BackendAllowlistEntry;
        identity: Required<BackendIdentity>;
      }
    >;
  },
  entry: BackendAllowlistEntry,
  identity: Required<BackendIdentity>,
): BackendLaunchPreparation {
  if (!(entry.sentinel_passed && safeModeIsProven(entry)))
    return unavailable("unsafe_backend_mode");
  const identityFailure = acceptIdentity(input, identity);
  if (identityFailure) return unavailable(identityFailure);
  input.accepted.set(input.language, { entry, identity });
  return readyPreparation(entry, identity, input.projectConfiguration);
}

function acceptIdentity(
  input: {
    language: Language;
    accepted: Map<
      Language,
      {
        entry: BackendAllowlistEntry;
        identity: Required<BackendIdentity>;
      }
    >;
    platform: "posix" | "win32";
  },
  identity: Required<BackendIdentity>,
): BackendLaunchFailure | undefined {
  const prior = input.accepted.get(input.language);
  if (!prior || sameIdentity(prior.identity, identity, input.platform))
    return undefined;
  input.accepted.delete(input.language);
  return "backend_identity_changed";
}
