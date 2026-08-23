/**
 * fossil CLI entry point. CLI-only - there is no MCP server here, unlike the
 * sibling dod-guard and quality-guard packages. The isMainModule() guard
 * still matters: it lets tests import this module without triggering
 * process.exit.
 */
import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
export * from "./types.js";
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
function isMainModule() {
    const arg = process.argv[1];
    if (!arg)
        return false;
    try {
        return realpathSync(arg) === realpathSync(_filename);
    }
    catch {
        return arg === _filename;
    }
}
function readVersion() {
    const pkgPath = path.join(_dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version;
}
async function main() {
    process.stdout.write(`fossil ${readVersion()}\n`);
}
if (isMainModule()) {
    main().catch((err) => {
        process.stderr.write(`fossil CLI failed: ${err}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map