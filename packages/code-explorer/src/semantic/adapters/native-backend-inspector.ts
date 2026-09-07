import { isAbsolute } from "node:path";
import type { BackendIdentity } from "../backend-launch/backend-identity.js";
import type { Language } from "../contracts/contract.js";
import { inspectBackendCandidate } from "./native-backend-candidate.js";
import { isWithin } from "./native-backend-file.js";

/**
 * Inspects fixed server-owned roots. Ambient PATH cannot authorize a backend.
 */
export function createNativeBackendInspector(
  commandRoots: readonly string[],
  projectRoot?: string,
): (
  language: Language,
  executableBasename: string,
  entrypointBasenames?: readonly string[],
) => BackendIdentity | undefined {
  const roots = commandRoots.filter(
    (root) => isAbsolute(root) && !(projectRoot && isWithin(projectRoot, root)),
  );
  return (language, executableBasename, entrypointBasenames = []) => {
    for (const root of roots) {
      const candidate = inspectBackendCandidate({
        language,
        root,
        projectRoot,
        executableBasename,
        entrypointBasenames,
        roots,
      });
      if (candidate) return candidate;
    }
    return undefined;
  };
}
