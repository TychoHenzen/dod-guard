// Runs the proxy checks of parsed step plans over a checkout. Reading files is the only side effect.
import { readFileSync } from "node:fs";
import path from "node:path";
import { filesUnder } from "./step-plan-walk.mjs";

function readsAs(regex, root, file, problems) {
  try {
    return regex.test(readFileSync(path.join(root, file), "utf8"));
  } catch (error) {
    problems.push(`cannot read ${file}: ${error.code ?? error.message}`);
    return false;
  }
}

function searchOne(proxy, root) {
  const regex = new RegExp(proxy.pattern, "mu");
  const { files, problems } = filesUnder(root, proxy.scope);
  // Sorted because directory order differs between file systems and the hits are compared as a list.
  const hits = files.filter((file) => readsAs(regex, root, file, problems)).sort();
  return { searched: files.length, hits, problems };
}

function searchPlans(plans, root) {
  return plans.map((plan) => ({
    ...plan,
    proxies: plan.proxies.map((proxy) => ({ ...proxy, result: searchOne(proxy, root) })),
  }));
}

export { searchPlans };
