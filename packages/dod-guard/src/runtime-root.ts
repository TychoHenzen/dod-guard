import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Package root for resources bundled with this installed runtime. */
export const runtimeRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
