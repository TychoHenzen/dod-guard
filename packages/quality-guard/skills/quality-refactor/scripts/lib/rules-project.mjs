import { checkReachability as reachability } from "./rules-reachability.mjs";
import { checkDuplication } from "./rules-duplicate.mjs";

export function checkReachability(...args) {
  const [files, scans, config, manifests = []] = args;
  return reachability({ files, scans, config, manifests });
}

export { checkDuplication };
